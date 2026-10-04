"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useTrip } from "@/features/trips/trip-provider";
import type { Role } from "@/types";

type Values = {
  title: string;
  budgetAmount: number;
  travelerCount: number;
  currency: string;
  startDate: string;
  endDate: string;
  isPublic: boolean;
};

export function SettingsView() {
  const { bundle, role, actions } = useTrip();
  const router = useRouter();
  const form = useForm<Values>({
    values: bundle
      ? {
          title: bundle.trip.title,
          budgetAmount: bundle.trip.budgetAmount,
          travelerCount: bundle.trip.travelerCount,
          currency: bundle.trip.currency,
          startDate: bundle.trip.startDate,
          endDate: bundle.trip.endDate,
          isPublic: bundle.trip.isPublic,
        }
      : undefined,
  });
  if (!bundle) return null;
  const owner = role === "owner";
  const field = "h-10 w-full rounded-xl border border-border bg-card px-3";
  return (
    <div className="h-full overflow-auto px-5 py-6">
      <h1 className="font-serif text-4xl font-semibold">Trip settings</h1>
      <form
        className="mt-6 max-w-lg space-y-3"
        onSubmit={form.handleSubmit(async (values) => {
          await actions.updateTrip({
            title: values.title,
            budgetAmount: Number(values.budgetAmount),
            travelerCount: Number(values.travelerCount),
            currency: values.currency,
            startDate: values.startDate,
            endDate: values.endDate,
            isPublic: values.isPublic,
          });
        })}
      >
        <Field label="Title"><input {...form.register("title")} className={field} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start"><input type="date" {...form.register("startDate")} className={field} /></Field>
          <Field label="End"><input type="date" {...form.register("endDate")} className={field} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Budget"><input type="number" {...form.register("budgetAmount", { valueAsNumber: true })} className={field} /></Field>
          <Field label="Travelers"><input type="number" min={1} max={12} {...form.register("travelerCount", { valueAsNumber: true })} className={field} /></Field>
        </div>
        <Field label="Currency"><input {...form.register("currency")} className={field} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...form.register("isPublic")} disabled={!owner} /> Public trip</label>
        <Button type="submit">Save changes</Button>
      </form>
      <section className="mt-8 max-w-lg">
        <h2 className="font-serif text-2xl font-semibold">People</h2>
        <div className="mt-3 space-y-2">
          {bundle.members.map((member) => (
            <div key={member.userId} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2">
              <p>{member.user.name}</p>
              {owner && member.role !== "owner" ? (
                <select value={member.role} onChange={(event) => actions.setRole(member.userId, event.target.value as Role)} className="rounded-xl bg-background px-2 py-1 text-sm">
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span className="text-sm text-muted capitalize">{member.role}</span>
              )}
            </div>
          ))}
        </div>
      </section>
      {owner && (
        <Button
          className="mt-8"
          variant="outline"
          onClick={async () => {
            if (!confirm("Delete this trip?")) return;
            await actions.deleteTrip();
            router.push("/trips");
          }}
        >
          Delete trip
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
