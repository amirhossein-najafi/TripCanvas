import { describe, expect, it } from "vitest";
import { settleBalances } from "@/lib/money";

const names = { ali: "Ali", sara: "Sara", reza: "Reza" };

describe("balances", () => {
  it("splits a dinner evenly", () => {
    const lines = settleBalances(
      [{ amount: 72, paidBy: "ali", shares: [
        { userId: "ali", amount: 24 },
        { userId: "sara", amount: 24 },
        { userId: "reza", amount: 24 },
      ] }],
      names,
    );
    expect(lines.map((line) => line.text)).toEqual(["Sara owes Ali $24", "Reza owes Ali $24"]);
  });

  it("matches a mixed trip ledger", () => {
    const lines = settleBalances(
      [
        { amount: 72, paidBy: "ali", shares: [
          { userId: "ali", amount: 24 },
          { userId: "sara", amount: 24 },
          { userId: "reza", amount: 24 },
        ] },
        { amount: 90, paidBy: "ali", shares: [
          { userId: "ali", amount: 53 },
          { userId: "sara", amount: 30 },
          { userId: "reza", amount: 7 },
        ] },
      ],
      names,
    );
    expect(lines.map((line) => line.text)).toEqual(["Sara owes Ali $54", "Reza owes Ali $31"]);
  });
});
