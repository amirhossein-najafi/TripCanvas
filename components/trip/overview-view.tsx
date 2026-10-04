"use client";

import Link from "next/link";
import { useTrip } from "@/features/trips/trip-provider";
import { placeById } from "@/lib/catalog";
import { categoryMeta } from "@/lib/categories";
import { formatMonthDay, formatRange, tripLengthLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { useUi } from "@/store/ui-store";

export function OverviewView() {
  const { bundle, weather, tripId } = useTrip();
  const setExplorer = useUi((state) => state.setExplorerOpen);
  if (!bundle) return null;
  const spent = bundle.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const saved = bundle.saved.map((item) => placeById(item.placeId)).filter(Boolean);
  return (
    <div className="h-full overflow-auto px-5 py-6">
      <p className="text-sm text-muted">{formatRange(bundle.trip.startDate, bundle.trip.endDate)} · {bundle.trip.travelerCount} travelers</p>
      <h1 className="mt-2 font-serif text-5xl font-semibold">{bundle.trip.destination}</h1>
      <p className="mt-2 text-muted">{tripLengthLabel(bundle.trip.startDate, bundle.trip.endDate)}</p>
      {!bundle.activities.length && (
        <div className="mt-8 max-w-md">
          <p className="font-serif text-3xl font-semibold">Your trip starts here ✈️</p>
          <p className="mt-2 text-muted">Add your first place or explore things to do in {bundle.trip.destination}.</p>
          <Button className="mt-4" onClick={() => setExplorer(true)}>Explore places</Button>
        </div>
      )}
      <div className="mt-6 flex gap-2 overflow-auto">
        {bundle.days.map((day, index) => {
          const forecast = weather.data?.find((item) => item.date === day.date);
          return (
            <Link key={day.id} href={`/trips/${tripId}/itinerary?day=${index + 1}`} className="min-w-28 rounded-2xl border border-border bg-card p-3">
              <p className="font-mono text-xs tabular">{formatMonthDay(day.date)}</p>
              <p className="mt-2 text-sm">{day.note || "Open day"}</p>
              {forecast && <p className="mt-2 font-mono text-xs tabular">{forecast.emoji} {forecast.temp}°</p>}
            </Link>
          );
        })}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Budget" value={formatMoney(bundle.trip.budgetAmount, bundle.trip.currency)} />
        <Stat label="Spent" value={formatMoney(spent, bundle.trip.currency)} />
        <Stat label="Remaining" value={formatMoney(bundle.trip.budgetAmount - spent, bundle.trip.currency)} />
      </div>
      <section className="mt-8">
        <h2 className="font-serif text-2xl font-semibold">Saved for later</h2>
        <div className="mt-3 space-y-2">
          {saved.map((place) => place && (
            <p key={place.id} className="rounded-2xl border border-border px-3 py-2">{categoryMeta(place.category).emoji} {place.name}</p>
          ))}
          {!saved.length && <p className="text-sm text-muted">Save a place from the map and it will wait here.</p>}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="font-serif text-2xl font-semibold">Latest</h2>
        <div className="mt-3 space-y-2">
          {bundle.events.slice(0, 4).map((event) => <p key={event.id} className="text-sm">{event.body}</p>)}
          {!bundle.events.length && <p className="text-sm text-muted">Moves and plans will show up here.</p>}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-border bg-card p-4">
      <p className="text-xs tracking-[0.14em] text-muted uppercase">{label}</p>
      <p className="mt-2 font-mono text-2xl tabular">{value}</p>
    </div>
  );
}
