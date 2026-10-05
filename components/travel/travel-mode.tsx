"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MapStage } from "@/components/map/map-stage";
import { BookingsView } from "@/components/trip/bookings-view";
import { useTripParams } from "@/features/trips/use-trip-params";
import { useTrip } from "@/features/trips/trip-provider";
import { placeById } from "@/lib/catalog";
import { formatDayChip, fromMinutes, greetingInZone, minutesInZone, toMinutes, zonedDateISO } from "@/lib/dates";
import { activitiesForDay } from "@/lib/itinerary";
import { estimateRoute, routeBetween } from "@/lib/routing";

function canEditTravel(activity: { id: string } | undefined) {
  return Boolean(activity);
}

export function TravelMode() {
  const { bundle, weather, tripId, actions } = useTrip();
  const { day, patch } = useTripParams();
  const [tab, setTab] = useState<"today" | "map" | "bookings" | "more">("today");
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [eta, setEta] = useState<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (position) => setHere({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const model = useMemo(() => {
    if (!bundle) return null;
    const today = zonedDateISO(bundle.trip.timezone);
    const match = bundle.days.findIndex((item) => item.date === today);
    const index = match >= 0 ? match : Math.min(bundle.days.length, day) - 1;
    const selected = bundle.days[Math.max(0, index)];
    const acts = selected ? activitiesForDay(bundle.activities, selected.id) : [];
    const minutes = minutesInZone(bundle.trip.timezone);
    const upcoming = match >= 0 ? acts.filter((activity) => {
      const [h, m] = activity.startTime.split(":").map(Number);
      return h * 60 + m >= minutes - 30;
    }) : acts;
    return { selected, acts, upcoming, preview: match < 0, index };
  }, [bundle, day]);

  const next = model?.upcoming[0] ?? model?.acts[0];
  const place = placeById(next?.placeId);
  const from = here ?? { lat: bundle?.trip.centerLat ?? 0, lng: bundle?.trip.centerLng ?? 0 };
  useEffect(() => {
    if (!place) return;
    let stop = false;
    routeBetween(from, place).then((route) => {
      if (!stop) setEta(route.minutes);
    }).catch(() => {
      if (!stop) setEta(estimateRoute(from, place).minutes);
    });
    return () => { stop = true; };
  }, [place, from.lat, from.lng]);

  if (!bundle || !model?.selected) return null;
  const after = (model.upcoming[0] ? model.upcoming.slice(1) : model.acts.slice(1)).slice(0, 4);
  const forecast = weather.data?.find((item) => item.date === model.selected?.date);
  const away = eta;
  const minutes = minutesInZone(bundle.trip.timezone);
  const behind = next && !model.preview ? minutes - toMinutes(next.startTime) : 0;
  const ended = zonedDateISO(bundle.trip.timezone) > bundle.trip.endDate;
  const tomorrow = bundle.days[model.index + 1];

  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "today" && (
          <div className="px-5 py-8">
            <p className="text-lg">{greetingInZone(bundle.trip.timezone)} 👋</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold">{bundle.trip.destination} · Day {model.index + 1}</h1>
            {forecast && <p className="mt-2 font-mono tabular">{forecast.temp}°C · {forecast.label}</p>}
            {model.preview && <p className="mt-2 text-sm text-muted">Previewing {formatDayChip(model.selected.date)} · not today</p>}
            {next && (
              <section className="mt-8">
                <p className="text-xs tracking-[0.16em] text-muted uppercase">Next</p>
                <div className="mt-3 rounded-[22px] border border-border bg-card p-5">
                  <p className="font-mono text-sm tabular">{next.startTime}</p>
                  <h2 className="mt-2 font-serif text-4xl font-semibold">{next.title}</h2>
                  {away != null && <p className="mt-2 text-muted">{away} min away</p>}
                  {behind > 10 && <p className="mt-2 text-accent">You&apos;re {behind} min behind schedule.</p>}
                  {behind > 10 && canEditTravel(next) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="rounded-full border border-border px-3 py-1 text-sm" onClick={() => actions.updateActivity(next.id, { status: "skipped" })}>Skip</button>
                      {tomorrow && <button type="button" className="rounded-full border border-border px-3 py-1 text-sm" onClick={() => actions.move(next.id, `day:${tomorrow.id}`)}>Move to tomorrow</button>}
                      <button type="button" className="rounded-full border border-border px-3 py-1 text-sm" onClick={() => actions.updateActivity(next.id, { startTime: fromMinutes(toMinutes(next.startTime) + 60) })}>Push an hour</button>
                    </div>
                  )}
                  {place && (
                    <a className="mt-5 inline-flex h-11 items-center rounded-2xl bg-accent px-4 text-white" href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`} target="_blank" rel="noreferrer">
                      Start navigation
                    </a>
                  )}
                </div>
              </section>
            )}
            <section className="mt-8">
              <p className="text-xs tracking-[0.16em] text-muted uppercase">After that</p>
              <div className="mt-3 space-y-2">
                {after.map((activity) => (
                  <p key={activity.id} className="font-mono text-sm tabular">{activity.startTime} {activity.title}</p>
                ))}
              </div>
            </section>
          </div>
        )}
        {tab === "map" && <div className="h-full"><MapStage /></div>}
        {tab === "bookings" && <BookingsView />}
        {tab === "more" && (
          <div className="space-y-3 px-5 py-8">
            <Link className="block rounded-2xl border border-border px-4 py-3" href={`/trips/${tripId}/itinerary`}>Back to planner</Link>
            <Link className="block rounded-2xl border border-border px-4 py-3" href={`/trips/${tripId}/story`}>Present trip</Link>
            {ended && <Link className="block rounded-2xl border border-border px-4 py-3" href={`/trips/${tripId}/recap`}>Trip recap</Link>}
            <div className="flex gap-2">
              {bundle.days.map((item, index) => (
                <button key={item.id} type="button" className="rounded-full border border-border px-3 py-1 text-sm" onClick={() => { patch({ day: String(index + 1) }); setTab("today"); }}>{formatDayChip(item.date)}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <nav className="grid grid-cols-4 border-t border-border py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-sm">
        {(["today", "map", "bookings", "more"] as const).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={tab === item ? "font-medium" : "text-muted"}>{item[0].toUpperCase() + item.slice(1)}</button>
        ))}
      </nav>
    </div>
  );
}
