"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TripMap } from "@/components/map/trip-map";
import { useTrip } from "@/features/trips/trip-provider";
import { placeById } from "@/lib/catalog";
import { fromMinutes, toMinutes } from "@/lib/dates";
import { activitiesForDay, dayLabel } from "@/lib/itinerary";
import { replayFrame, type ReplayStop } from "@/lib/replay";
import { DAY_COLORS } from "@/types";

export function StoryMode() {
  const { bundle, tripId } = useTrip();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [minute, setMinute] = useState(8 * 60);
  const [scrubbing, setScrubbing] = useState(false);
  const stops = bundle
    ? bundle.days.flatMap((day, dayIndex) => activitiesForDay(bundle.activities, day.id).map((activity) => ({ activity, day, dayIndex })))
    : [];
  const stop = stops[index];
  const place = placeById(stop?.activity.placeId);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") router.push(`/trips/${tripId}/itinerary`);
      if (event.key === "ArrowRight") setIndex((value) => Math.min(stops.length - 1, value + 1));
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, stops.length, tripId]);

  useEffect(() => {
    if (!stops.length || scrubbing) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % stops.length), 3200);
    return () => window.clearInterval(timer);
  }, [stops.length, scrubbing]);
  const replayStops: ReplayStop[] = stops.flatMap((item) => {
    const located = placeById(item.activity.placeId);
    if (!located) return [];
    const startMin = toMinutes(item.activity.startTime);
    return [{ startMin, endMin: startMin + item.activity.duration, lat: located.lat, lng: located.lng, title: item.activity.title, dayId: item.day.id }];
  });
  const frame = scrubbing ? replayFrame(replayStops, minute) : null;

  if (!bundle || !stop) return null;
  const color = DAY_COLORS[stop.dayIndex % DAY_COLORS.length];
  return (
    <div className="relative h-dvh overflow-hidden bg-black text-white">
      <div className="absolute inset-0 opacity-80">
        <TripMap
          markers={place ? [{ id: stop.activity.id, placeId: place.id, lat: frame?.lat ?? place.lat, lng: frame?.lng ?? place.lng, number: (frame?.index ?? index) + 1, color, title: stop.activity.title }] : []}
          routes={frame ? [{ id: "replay", color, active: true, coordinates: replayStops.slice(0, frame.index + 1).map((item) => [item.lng, item.lat]) }] : []}
          focusId={place?.id}
          fitKey={stop.activity.id}
          interactive={false}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/30" />
      <button type="button" className="absolute top-4 right-4 z-10 text-sm" onClick={() => router.push(`/trips/${tripId}/itinerary`)}>Close</button>
      <div className="absolute bottom-0 left-0 z-10 p-8 md:p-14">
        <p className="text-sm tracking-[0.28em] uppercase">{bundle.trip.destination}</p>
        <p className="mt-4 text-sm tracking-[0.2em] uppercase">{dayLabel(bundle.days, stop.day.id)}</p>
        <h1 className="mt-3 font-serif text-6xl font-semibold md:text-8xl">{stop.activity.title}</h1>
        <p className="mt-4 font-mono tabular">{scrubbing ? fromMinutes(minute) : stop.activity.startTime}</p>
        {frame?.next && <p className="mt-2 text-sm">On the way to {frame.next.title}</p>}
      </div>
      <label className="absolute bottom-4 left-8 right-8 z-20 text-xs">
        08:00
        <input className="mx-3 w-[calc(100%-8rem)]" type="range" min={8 * 60} max={22 * 60} value={minute} onChange={(event) => { setScrubbing(true); setMinute(Number(event.target.value)); }} />
        22:00
      </label>
      <button type="button" className="absolute inset-y-0 left-0 z-10 w-1/3" aria-label="Previous" onClick={() => setIndex((value) => Math.max(0, value - 1))} />
      <button type="button" className="absolute inset-y-0 right-0 z-10 w-1/3" aria-label="Next" onClick={() => setIndex((value) => Math.min(stops.length - 1, value + 1))} />
    </div>
  );
}
