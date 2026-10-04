export function formatMoney(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${Math.round(amount)}`;
  }
}

export type ShareLike = { userId: string; amount: number };
export type ExpenseLike = { amount: number; paidBy: string; shares: ShareLike[] };

export type BalanceLine = { fromId: string; toId: string; amount: number; text: string };

/** Greedy settlement. Positive net means the person is owed money. */
export function settleBalances(expenses: ExpenseLike[], names: Record<string, string>, currency = "USD"): BalanceLine[] {
  const net = new Map<string, number>();
  for (const expense of expenses) {
    net.set(expense.paidBy, round2((net.get(expense.paidBy) ?? 0) + expense.amount));
    for (const share of expense.shares) {
      net.set(share.userId, round2((net.get(share.userId) ?? 0) - share.amount));
    }
  }

  const creditors = [...net.entries()]
    .filter(([, value]) => value > 0.009)
    .map(([id, value]) => ({ id, cents: Math.round(value * 100) }))
    .sort((a, b) => b.cents - a.cents);
  const debtors = [...net.entries()]
    .filter(([, value]) => value < -0.009)
    .map(([id, value]) => ({ id, cents: Math.round(Math.abs(value) * 100) }))
    .sort((a, b) => b.cents - a.cents);

  const lines: BalanceLine[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const pay = Math.min(debtors[debtorIndex].cents, creditors[creditorIndex].cents);
    const amount = pay / 100;
    const fromId = debtors[debtorIndex].id;
    const toId = creditors[creditorIndex].id;
    const from = names[fromId] ?? "Someone";
    const to = names[toId] ?? "Someone";
    lines.push({
      fromId,
      toId,
      amount,
      text: `${from} owes ${to} ${formatMoney(amount, currency)}`,
    });
    debtors[debtorIndex].cents -= pay;
    creditors[creditorIndex].cents -= pay;
    if (debtors[debtorIndex].cents === 0) debtorIndex += 1;
    if (creditors[creditorIndex].cents === 0) creditorIndex += 1;
  }
  return lines;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function equalShares(amount: number, userIds: string[]): { userId: string; amount: number }[] {
  if (!userIds.length) return [];
  const base = Math.floor((amount / userIds.length) * 100) / 100;
  const shares = userIds.map((userId) => ({ userId, amount: base }));
  const drift = round2(amount - base * userIds.length);
  shares[0].amount = round2(shares[0].amount + drift);
  return shares;
}
