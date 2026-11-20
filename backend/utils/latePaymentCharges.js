const LATE_FINE_RATE = 0.02;
const MONTHLY_INTEREST_RATE = 0.01;
const DAYS_PER_INTEREST_MONTH = 30;

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function dateOrdinal(value) {
  const normalized = dateOnly(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== normalized) return null;
  return Math.floor(date.getTime() / 86400000);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateLatePaymentCharges({ dueDate, paymentDate, expectedAmount, priorPayments = [] }) {
  const due = dateOrdinal(dueDate);
  const payment = dateOrdinal(paymentDate);
  const expected = Number(expectedAmount);
  if (due === null || payment === null || !Number.isFinite(expected) || expected < 0) {
    return { lateDays: 0, fine: 0, interest: 0, total: 0, principalAtDue: 0 };
  }
  const lateDays = Math.max(payment - due, 0);
  if (!lateDays || !expected) {
    return { lateDays, fine: 0, interest: 0, total: 0, principalAtDue: expected };
  }

  const receipts = priorPayments
    .map((item) => ({
      date: dateOrdinal(item.paid_at ?? item.closed_at),
      principal: Math.max(Number(item.principal_amount ?? item.amount) || 0, 0),
    }))
    .filter((item) => item.date !== null && item.date < payment && item.principal > 0)
    .sort((left, right) => left.date - right.date);

  const principalPaidByDueDate = receipts
    .filter((item) => item.date <= due)
    .reduce((total, item) => total + item.principal, 0);
  const principalAtDue = Math.max(roundMoney(expected - principalPaidByDueDate), 0);
  const fine = roundMoney(principalAtDue * LATE_FINE_RATE);

  let outstanding = principalAtDue;
  let cursor = due;
  let interestAmount = 0;
  for (const receipt of receipts.filter((item) => item.date > due)) {
    const end = Math.min(receipt.date, payment);
    if (end > cursor && outstanding > 0) {
      interestAmount += outstanding * MONTHLY_INTEREST_RATE
        * ((end - cursor) / DAYS_PER_INTEREST_MONTH);
      cursor = end;
    }
    if (receipt.date < payment) outstanding = Math.max(outstanding - receipt.principal, 0);
  }
  if (payment > cursor && outstanding > 0) {
    interestAmount += outstanding * MONTHLY_INTEREST_RATE
      * ((payment - cursor) / DAYS_PER_INTEREST_MONTH);
  }

  const interest = roundMoney(interestAmount);
  return { lateDays, fine, interest, total: roundMoney(fine + interest), principalAtDue };
}

module.exports = {
  LATE_FINE_RATE,
  MONTHLY_INTEREST_RATE,
  DAYS_PER_INTEREST_MONTH,
  calculateLatePaymentCharges,
};
