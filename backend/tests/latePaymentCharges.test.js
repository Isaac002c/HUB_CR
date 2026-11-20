const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateLatePaymentCharges } = require('../utils/latePaymentCharges');

test('does not charge before or on the contractual due date', () => {
  const input = { dueDate: '2026-11-06', expectedAmount: 800 };
  assert.deepEqual(calculateLatePaymentCharges({ ...input, paymentDate: '2026-11-06' }), {
    lateDays: 0, fine: 0, interest: 0, total: 0, principalAtDue: 800,
  });
  assert.equal(calculateLatePaymentCharges({ ...input, paymentDate: '2026-11-05' }).total, 0);
});

test('calculates the contract fine and pro-rated monthly interest on the remaining balance', () => {
  const result = calculateLatePaymentCharges({
    dueDate: '2026-11-06',
    paymentDate: '2026-11-20',
    expectedAmount: 800,
    priorPayments: [{ paid_at: '2026-11-18', principal_amount: 500 }],
  });
  assert.deepEqual(result, {
    lateDays: 14,
    fine: 16,
    interest: 3.4,
    total: 19.4,
    principalAtDue: 800,
  });
});

test('uses the original unpaid balance when a partial payment was received before the due date', () => {
  const result = calculateLatePaymentCharges({
    dueDate: '2026-11-06',
    paymentDate: '2026-11-18',
    expectedAmount: 800,
    priorPayments: [{ paid_at: '2026-11-01', principal_amount: 500 }],
  });
  assert.deepEqual(result, {
    lateDays: 12,
    fine: 6,
    interest: 1.2,
    total: 7.2,
    principalAtDue: 300,
  });
});

test('does not compound interest and ignores receipts dated after the settlement date', () => {
  const result = calculateLatePaymentCharges({
    dueDate: '2026-11-06',
    paymentDate: '2026-11-20',
    expectedAmount: 800,
    priorPayments: [
      { paid_at: '2026-11-18', principal_amount: 500 },
      { paid_at: '2026-11-21', principal_amount: 200 },
    ],
  });
  assert.equal(result.total, 19.4);
});
