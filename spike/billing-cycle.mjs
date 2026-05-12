// Spike: dry-run of one recurring billing cycle for Zaploop.
//
// Goal: validate the *shape* of the code before we have real NWC creds /
// Wapupay sandbox account. We model both rails:
//   - "self" rail:    invoice generated via merchant's own NWC (make_invoice)
//   - "wapupay" rail: invoice generated via POST /wallet/deposit_lightning
// Then the subscriber's NWC pays the invoice (pay_invoice).
//
// Run: node spike/billing-cycle.mjs

// ---------------------------------------------------------------------------
// NWC contract — matches @getalby/sdk NWCClient surface we'll use.
// Errors per NIP-47: { code, message } where code ∈ { INSUFFICIENT_BALANCE,
// QUOTA_EXCEEDED, UNAUTHORIZED, INTERNAL, NOT_IMPLEMENTED, OTHER }.
// ---------------------------------------------------------------------------

class NwcError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

class MockNwc {
  constructor({ label, balanceSat = Infinity, budgetSat = Infinity, supports = ['pay_invoice','make_invoice'] }) {
    this.label = label;
    this.balanceSat = balanceSat;
    this.budgetSat = budgetSat;
    this.spentSat = 0;
    this.supports = supports;
    this.invoiceSeq = 0;
  }
  async getInfo() { return { methods: this.supports }; }
  async makeInvoice({ amount, description }) {
    if (!this.supports.includes('make_invoice')) throw new NwcError('NOT_IMPLEMENTED', 'make_invoice not granted');
    this.invoiceSeq++;
    const id = `${this.label}-inv-${this.invoiceSeq}`;
    return { invoice: `lnbcMOCK${amount}_${id}`, payment_hash: id, amount, description };
  }
  async payInvoice({ invoice }) {
    if (!this.supports.includes('pay_invoice')) throw new NwcError('NOT_IMPLEMENTED', 'pay_invoice not granted');
    const m = invoice.match(/^lnbcMOCK(\d+)_/);
    if (!m) throw new NwcError('OTHER', 'cannot parse mock invoice');
    const amount = Number(m[1]);
    if (amount > this.balanceSat) throw new NwcError('INSUFFICIENT_BALANCE', `need ${amount}, have ${this.balanceSat}`);
    if (this.spentSat + amount > this.budgetSat) throw new NwcError('QUOTA_EXCEEDED', `budget ${this.budgetSat} would be exceeded`);
    this.balanceSat -= amount;
    this.spentSat += amount;
    return { preimage: `preimage-${invoice}`, fees_paid: 0 };
  }
}

// ---------------------------------------------------------------------------
// Wapupay client — stub that mimics the real REST contract we mapped from
// the OpenAPI spec at https://wapu.shiafu.com/openapi.en.json.
// ---------------------------------------------------------------------------

class MockWapupay {
  constructor({ apiToken, currentRate = 683.1 /* sat per USDT */, autopay = false }) {
    this.apiToken = apiToken;
    this.currentRate = currentRate;
    this.balanceUsdt = 0;
    this.autopay = autopay;
    this.txSeq = 0;
    this.txs = new Map();
  }
  async depositLightning({ amount }) {
    this.txSeq++;
    const id = `wapu-tx-${this.txSeq}`;
    const tx = {
      transaction_id: id,
      type: 'deposit',
      status: 'Pending',
      currency_taken: 'SAT',
      total_amount_taken: amount,
      payment_currency: 'USDT',
      payment_amount: +(amount / this.currentRate).toFixed(2),
      current_rate: this.currentRate,
      lnurl_pr_invoice: `lnbcMOCK${amount}_${id}`,
    };
    this.txs.set(id, tx);
    return tx;
  }
  async getTransaction(id) { return this.txs.get(id); }
  // Test helper — simulate the LN side paying the invoice.
  _simulatePaid(id) {
    const tx = this.txs.get(id);
    if (!tx || tx.status !== 'Pending') return;
    tx.status = 'Completed';
    this.balanceUsdt += tx.payment_amount;
  }
  async createTransaction({ type, payment_amount, alias, receiver_name }) {
    if (this.balanceUsdt * this.currentRate * 1 < 0) throw new Error('impossible'); // satisfy lint
    if (payment_amount > this.balanceUsdt * 1430 /* rough ARS/USDT */ ) {
      const err = new Error('insufficient funds');
      err.response = { status: 400 };
      throw err;
    }
    this.txSeq++;
    const id = `wapu-tx-${this.txSeq}`;
    const tx = { transaction_id: id, type, status: 'Pending', payment_amount, payment_currency: 'ARS', alias, receiver_name };
    this.txs.set(id, tx);
    // Real API: this stays Pending until Wapu processes the bank transfer.
    return tx;
  }
}

// ---------------------------------------------------------------------------
// Billing cycle — the heart of Zaploop. Given a subscription, run one charge.
// ---------------------------------------------------------------------------

const SubState = {
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
};

const ChargeState = {
  SCHEDULED: 'scheduled',
  INVOICING: 'invoicing',
  AWAITING_PAYMENT: 'awaiting_payment',
  PAID: 'paid',
  PAYOUT_PENDING: 'payout_pending',
  PAYOUT_COMPLETE: 'payout_complete',
  FAILED_INVOICE: 'failed_invoice',
  FAILED_PAYMENT: 'failed_payment',
  FAILED_PAYOUT: 'failed_payout',
};

async function runBillingCycle({ subscription, plan, merchant, log = console.log }) {
  const charge = { id: crypto.randomUUID(), state: ChargeState.SCHEDULED, events: [] };
  const track = (state, extra = {}) => { charge.state = state; charge.events.push({ at: new Date().toISOString(), state, ...extra }); log(`  [${state}]`, extra); };

  track(ChargeState.INVOICING);
  let invoice, invoiceRef;
  try {
    if (merchant.rail === 'self') {
      const r = await merchant.nwc.makeInvoice({ amount: plan.amountSat, description: `${plan.name} — ${subscription.subscriberNpub.slice(0,12)}…` });
      invoice = r.invoice; invoiceRef = { kind: 'self', payment_hash: r.payment_hash };
    } else if (merchant.rail === 'wapupay') {
      const r = await merchant.wapu.depositLightning({ amount: plan.amountSat });
      invoice = r.lnurl_pr_invoice; invoiceRef = { kind: 'wapupay', transaction_id: r.transaction_id };
    }
  } catch (e) {
    track(ChargeState.FAILED_INVOICE, { error: e.code || e.message });
    return charge;
  }

  track(ChargeState.AWAITING_PAYMENT, invoiceRef);
  try {
    await subscription.nwc.payInvoice({ invoice });
  } catch (e) {
    track(ChargeState.FAILED_PAYMENT, { error: e.code || e.message });
    // Subscriber-side failure → past_due, retry policy kicks in.
    return charge;
  }

  // For "self" rail, payInvoice succeeding is enough confirmation — preimage
  // is proof. For "wapupay" rail, we still need to poll the Wapu API.
  if (invoiceRef.kind === 'wapupay') {
    merchant.wapu._simulatePaid(invoiceRef.transaction_id); // would be: ln settlement event
    let tx; let tries = 0;
    while (tries++ < 5) {
      tx = await merchant.wapu.getTransaction(invoiceRef.transaction_id);
      if (tx.status === 'Completed') break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (tx.status !== 'Completed') { track(ChargeState.FAILED_PAYMENT, { error: 'wapu_timeout' }); return charge; }
  }

  track(ChargeState.PAID);

  // Optional payout leg — only meaningful on the Wapupay rail.
  if (invoiceRef.kind === 'wapupay' && merchant.payoutPct > 0) {
    track(ChargeState.PAYOUT_PENDING);
    try {
      // payout_pct of received USDT → equivalent ARS via fiat_transfer.
      const arsEquivalent = +((merchant.wapu.balanceUsdt * merchant.wapu.currentRate * (1430/683.1)) * (merchant.payoutPct/100)).toFixed(2);
      // Crude estimate — in real impl we compute ARS from /exchange_rates rate.
      await merchant.wapu.createTransaction({
        type: 'fiat_transfer',
        payment_amount: arsEquivalent,
        alias: merchant.payoutAlias,
        receiver_name: merchant.legalName,
      });
      track(ChargeState.PAYOUT_COMPLETE, { ars: arsEquivalent });
    } catch (e) {
      track(ChargeState.FAILED_PAYOUT, { error: e.message });
    }
  }

  return charge;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function run() {
  const cases = [
    {
      title: 'La Crypta — self rail (sats stay sats)',
      plan: { name: 'Cowork Tuesday', amountSat: 5000, intervalDays: 30 },
      merchant: {
        rail: 'self',
        nwc: new MockNwc({ label: 'lacrypta', supports: ['make_invoice'] }),
      },
      subscription: {
        subscriberNpub: 'npub1aliceXXXXXXXXXXXXX',
        nwc: new MockNwc({ label: 'alice', balanceSat: 50000, budgetSat: 10000 }),
      },
    },
    {
      title: 'Coffee shop — wapupay rail, 100% ARS payout',
      plan: { name: 'Café del mes', amountSat: 3000, intervalDays: 30 },
      merchant: {
        rail: 'wapupay',
        wapu: new MockWapupay({ apiToken: 'fake' }),
        payoutPct: 100,
        payoutAlias: 'cafetin.mp',
        legalName: 'Café del Centro SRL',
      },
      subscription: {
        subscriberNpub: 'npub1bobXXXXXXXXXXXXX',
        nwc: new MockNwc({ label: 'bob', balanceSat: 50000, budgetSat: 10000 }),
      },
    },
    {
      title: 'Failure — subscriber budget exceeded',
      plan: { name: 'Pro', amountSat: 15000, intervalDays: 30 },
      merchant: {
        rail: 'self',
        nwc: new MockNwc({ label: 'merchantC', supports: ['make_invoice'] }),
      },
      subscription: {
        subscriberNpub: 'npub1carolXXXXXXXXXXX',
        nwc: new MockNwc({ label: 'carol', balanceSat: 50000, budgetSat: 10000 }),
      },
    },
    {
      title: 'Failure — merchant NWC missing make_invoice permission',
      plan: { name: 'Tier1', amountSat: 1000, intervalDays: 30 },
      merchant: {
        rail: 'self',
        nwc: new MockNwc({ label: 'merchantD', supports: ['pay_invoice'] /* oops */ }),
      },
      subscription: {
        subscriberNpub: 'npub1daveXXXXXXXXXXXX',
        nwc: new MockNwc({ label: 'dave', balanceSat: 50000, budgetSat: 10000 }),
      },
    },
  ];

  for (const c of cases) {
    console.log('\n--- ' + c.title + ' ---');
    const out = await runBillingCycle(c);
    console.log('  FINAL:', out.state, '(' + out.events.length + ' events)');
  }
}

run();
