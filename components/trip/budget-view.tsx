"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/features/trips/trip-provider";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/types";
import { equalShares, formatMoney, settleBalances } from "@/lib/money";

type FormValues = {
  title: string;
  amount: number;
  plannedAmount: number;
  category: ExpenseCategory;
  paidBy: string;
  split: "equal" | "personal";
};

export function BudgetView() {
  const { bundle, canEdit, actions } = useTrip();
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({ defaultValues: { title: "", amount: 0, plannedAmount: 0, category: "Food", paidBy: "", split: "equal" } });
  if (!bundle) return null;
  const spent = bundle.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const remaining = bundle.trip.budgetAmount - spent;
  const names = Object.fromEntries(bundle.members.map((member) => [member.userId, member.user.name]));
  const lines = settleBalances(
    bundle.expenses.map((expense) => ({
      amount: expense.amount,
      paidBy: expense.paidBy,
      shares: bundle.shares.filter((share) => share.expenseId === expense.id),
    })),
    names,
    bundle.trip.currency,
  );

  return (
    <div className="h-full overflow-auto px-5 py-6">
      <p className="text-xs tracking-[0.16em] text-muted uppercase">Trip budget</p>
      <p className="mt-2 font-mono text-5xl tabular">{formatMoney(bundle.trip.budgetAmount, bundle.trip.currency)}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border p-3"><p className="text-xs text-muted">Spent</p><p className="font-mono text-xl tabular">{formatMoney(spent, bundle.trip.currency)}</p></div>
        <div className="rounded-2xl border border-border p-3"><p className="text-xs text-muted">Remaining</p><p className="font-mono text-xl tabular">{formatMoney(remaining, bundle.trip.currency)}</p></div>
      </div>
      <div className="mt-6 space-y-3">
        {EXPENSE_CATEGORIES.map((category) => {
          const amount = bundle.expenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + expense.amount, 0);
          const width = spent ? Math.max(4, (amount / spent) * 100) : 0;
          return (
            <div key={category}>
              <div className="flex justify-between text-sm"><span>{category}</span><span className="font-mono tabular">{formatMoney(amount, bundle.trip.currency)}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-foreground/10"><div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} /></div>
            </div>
          );
        })}
      </div>
      <div className="mt-8 space-y-3">
        {bundle.expenses.map((expense) => {
          const saved = expense.plannedAmount - expense.amount;
          const payer = names[expense.paidBy] ?? "Someone";
          const shares = bundle.shares.filter((share) => share.expenseId === expense.id);
          return (
            <article key={expense.id} className="rounded-[16px] border border-border p-3">
              <div className="flex justify-between gap-3">
                <p className="font-medium">{expense.title}</p>
                <p className="font-mono tabular">{formatMoney(expense.amount, bundle.trip.currency)}</p>
              </div>
              <p className="mt-1 text-sm text-muted">Paid by {payer}</p>
              <p className="mt-1 font-mono text-xs text-muted tabular">Planned {formatMoney(expense.plannedAmount, bundle.trip.currency)} · Actual {formatMoney(expense.amount, bundle.trip.currency)}</p>
              {saved > 0 && <p className="text-sm text-secondary">Saved {formatMoney(saved, bundle.trip.currency)}</p>}
              {shares.length > 1 && (
                <div className="mt-2 text-sm">
                  {shares.map((share) => <p key={share.id}>{names[share.userId] ?? "Someone"} {formatMoney(share.amount, bundle.trip.currency)}</p>)}
                </div>
              )}
              {canEdit && <button type="button" className="mt-2 text-xs text-muted" onClick={() => actions.deleteExpense(expense.id)}>Remove</button>}
            </article>
          );
        })}
      </div>
      <section className="mt-8">
        <h2 className="font-serif text-2xl font-semibold">Balances</h2>
        <div className="mt-3 space-y-2">
          {lines.map((line) => <p key={line.text}>{line.text}</p>)}
          {!lines.length && <p className="text-sm text-muted">Everyone is settled.</p>}
        </div>
      </section>
      {canEdit && (
        <form
          className="mt-8 space-y-3 rounded-[18px] border border-border p-4"
          onSubmit={form.handleSubmit(async (values) => {
            const members = bundle.members.map((member) => member.userId);
            const shares = values.split === "equal" ? equalShares(Number(values.amount), members) : [{ userId: values.paidBy || bundle.trip.ownerId, amount: Number(values.amount) }];
            await actions.createExpense({
              title: values.title,
              amount: Number(values.amount),
              plannedAmount: Number(values.plannedAmount || values.amount),
              category: values.category,
              paidBy: values.paidBy || bundle.trip.ownerId,
              shares,
            });
            form.reset();
            setOpen(false);
          })}
        >
          <button type="button" className="text-sm" onClick={() => setOpen((value) => !value)}>{open ? "Close" : "Add expense"}</button>
          {open && (
            <>
              <input {...form.register("title", { required: true })} placeholder="Dinner" className="h-10 w-full rounded-xl bg-background px-3" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="0.01" {...form.register("plannedAmount", { valueAsNumber: true })} placeholder="Planned" className="h-10 rounded-xl bg-background px-3" />
                <input type="number" step="0.01" {...form.register("amount", { valueAsNumber: true, required: true })} placeholder="Actual" className="h-10 rounded-xl bg-background px-3" />
              </div>
              <select {...form.register("category")} className="h-10 w-full rounded-xl bg-background px-3">{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
              <select {...form.register("paidBy")} className="h-10 w-full rounded-xl bg-background px-3">
                {bundle.members.map((member) => <option key={member.userId} value={member.userId}>{member.user.name}</option>)}
              </select>
              <select {...form.register("split")} className="h-10 w-full rounded-xl bg-background px-3">
                <option value="equal">Split equally</option>
                <option value="personal">Just the payer</option>
              </select>
              <Button type="submit">Save expense</Button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
