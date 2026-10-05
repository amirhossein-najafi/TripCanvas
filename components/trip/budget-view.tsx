"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/features/trips/trip-provider";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/types";
import { equalShares, formatMoney, settleBalances } from "@/lib/money";
import { splitByWeights, toBase } from "@/lib/fx";

type FormValues = {
  title: string;
  amount: number;
  plannedAmount: number;
  category: ExpenseCategory;
  paidBy: string;
  split: "equal" | "personal" | "shares";
  currency: string;
  weights: string;
};

export function BudgetView() {
  const { bundle, canEdit, actions } = useTrip();
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState("");
  const form = useForm<FormValues>({ defaultValues: { title: "", amount: 0, plannedAmount: 0, category: "Food", paidBy: "", split: "equal", currency: "USD", weights: "" } });
  if (!bundle) return null;
  const people = bundle.participants.length
    ? bundle.participants
    : bundle.members.map((member) => ({ id: member.userId, tripId: bundle.trip.id, name: member.user.name, userId: member.userId }));
  const names = Object.fromEntries([
    ...bundle.members.map((member) => [member.userId, member.user.name] as const),
    ...people.map((person) => [person.id, person.name] as const),
  ]);
  const spent = bundle.expenses.reduce((sum, expense) => sum + toBase(expense.amount, expense.currency || bundle.trip.currency, bundle.trip.currency, bundle.trip.fxRates), 0);
  const remaining = bundle.trip.budgetAmount - spent;
  const lines = settleBalances(
    bundle.expenses.map((expense) => ({
      amount: toBase(expense.amount, expense.currency || bundle.trip.currency, bundle.trip.currency, bundle.trip.fxRates),
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
        <h2 className="font-serif text-2xl font-semibold">People</h2>
        <p className="mt-1 text-sm text-muted">Travelers can exist without an account.</p>
        <div className="mt-2 space-y-1">
          {people.map((person) => <p key={person.id}>{person.name}{person.userId ? "" : " · no account"}</p>)}
        </div>
        {canEdit && (
          <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!person.trim()) return; actions.addParticipant(person); setPerson(""); }}>
            <input value={person} onChange={(event) => setPerson(event.target.value)} placeholder="Name" className="h-10 flex-1 rounded-xl bg-background px-3" />
            <Button type="submit" size="sm">Add</Button>
          </form>
        )}
        {canEdit && (
          <label className="mt-3 block text-sm">JPY per 1 {bundle.trip.currency} is inverted: units of {bundle.trip.currency} for 1 foreign unit
            <input className="mt-1 h-10 w-full rounded-xl bg-background px-3" placeholder="JPY rate" onBlur={(event) => {
              const rate = Number(event.target.value);
              if (rate > 0) actions.setFxRate("JPY", rate);
            }} />
          </label>
        )}
      </section>
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
            const ids = people.map((person) => person.id);
            const payer = values.paidBy || ids[0] || bundle.trip.ownerId;
            const amount = toBase(Number(values.amount), values.currency || bundle.trip.currency, bundle.trip.currency, bundle.trip.fxRates);
            const weights = values.weights.split(",").map((part) => Number(part.trim())).filter((part) => part > 0);
            const shares = values.split === "shares" && weights.length === ids.length
              ? splitByWeights(amount, ids.map((id, index) => ({ id, weight: weights[index] }))).map((share) => ({ userId: share.id, participantId: share.id, amount: share.amount }))
              : values.split === "equal"
                ? equalShares(amount, ids).map((share) => ({ ...share, participantId: share.userId }))
                : [{ userId: payer, participantId: payer, amount }];
            await actions.createExpense({
              title: values.title,
              amount: Number(values.amount),
              plannedAmount: Number(values.plannedAmount || values.amount),
              category: values.category,
              paidBy: payer,
              currency: values.currency || bundle.trip.currency,
              participantId: payer,
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
                {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
              <select {...form.register("currency")} className="h-10 w-full rounded-xl bg-background px-3">
                {[bundle.trip.currency, "USD", "EUR", "JPY"].filter((code, index, list) => list.indexOf(code) === index).map((code) => <option key={code}>{code}</option>)}
              </select>
              <select {...form.register("split")} className="h-10 w-full rounded-xl bg-background px-3">
                <option value="equal">Split equally</option>
                <option value="shares">Custom shares</option>
                <option value="personal">Just the payer</option>
              </select>
              <input {...form.register("weights")} placeholder="Share weights, comma separated" className="h-10 w-full rounded-xl bg-background px-3" />
              <Button type="submit">Save expense</Button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
