export function toBase(amount: number, currency: string, base: string, rates: Record<string, number>) {
  if (!currency || currency === base) return round2(amount);
  const rate = rates[currency];
  if (!rate) return round2(amount);
  return round2(amount * rate);
}

export function splitByWeights(amount: number, parts: { id: string; weight: number }[]) {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.weight), 0);
  if (!parts.length || total <= 0) return [];
  const shares = parts.map((part) => ({
    id: part.id,
    amount: round2((amount * Math.max(0, part.weight)) / total),
  }));
  const drift = round2(amount - shares.reduce((sum, share) => sum + share.amount, 0));
  if (shares[0]) shares[0].amount = round2(shares[0].amount + drift);
  return shares;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
