function amountMagnitude(amount: number): number {
  return Math.abs(amount);
}

function decreaseEffect(amount: number): number {
  const magnitude = amountMagnitude(amount);
  return magnitude === 0 ? 0 : -magnitude;
}

export function expenseEffect(amount: number): number {
  return decreaseEffect(amount);
}

export function incomeEffect(amount: number): number {
  return amountMagnitude(amount);
}

export function creditCardExpenseEffect(amount: number): number {
  return amountMagnitude(amount);
}

export function creditCardRefundEffect(amount: number): number {
  return decreaseEffect(amount);
}

export function transferOutEffect(amount: number): number {
  return decreaseEffect(amount);
}

export function transferInEffect(amount: number): number {
  return amountMagnitude(amount);
}
