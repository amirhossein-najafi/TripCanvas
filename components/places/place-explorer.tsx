"use client";

import { useState } from "react";
import { categoryMeta } from "@/lib/categories";
import { formatDistance, haversine } from "@/lib/geo";
import { useTrip } from "@/features/trips/trip-provider";
import { useUi } from "@/store/ui-store";
import type { Place, PlacePriority, Trip } from "@/types";

export function PlaceExplorer({
  trip,
  places,
  onOpen,
}: {
  trip: Trip;
  places: Place[];
  onOpen: (placeId: string) => void;
}) {
  const open = useUi((state) => state.explorerOpen);
  const hovered = useUi((state) => state.hoveredPlaceId);
  const setHovered = useUi((state) => state.setHoveredPlaceId);
  const [text, setText] = useState("");
  const tripState = useTrip();
  const saved = tripState.bundle?.saved ?? [];
  const votes = tripState.bundle?.votes ?? [];
  if (!open) return null;

  const filtered = places
    .filter((place) => `${place.name} ${place.category} ${place.id}`.toLowerCase().includes(text.trim().toLowerCase()))
    .map((place) => ({ place, distance: haversine(place, { lat: trip.centerLat, lng: trip.centerLng }) }))
    .sort((a, b) => a.distance - b.distance);

  return (
    <aside className="absolute top-16 left-4 z-20 flex max-h-[min(640px,calc(100%-5rem))] w-[min(340px,calc(100%-2rem))] flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-[var(--shadow)]">
      <div className="shrink-0 border-b border-border p-3">
        <input
          data-testid="place-search"
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search places..."
          className="h-11 w-full rounded-2xl bg-background px-3 outline-none"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <p className="px-2 py-2 text-xs tracking-[0.14em] text-muted uppercase">Suggested</p>
        {!places.length && (
          <div className="space-y-2 p-2">
            <div className="skeleton h-14" />
            <div className="skeleton h-14" />
            <div className="skeleton h-14" />
          </div>
        )}
        {filtered
          .map((item) => {
            const score = votes.filter((vote) => vote.placeId === item.place.id && vote.vote === "up").length
              - votes.filter((vote) => vote.placeId === item.place.id && vote.vote === "down").length;
            const savedEntry = saved.find((entry) => entry.placeId === item.place.id);
            const priority = savedEntry?.priority ?? "nice";
            return { ...item, score, priority, savedEntry };
          })
          .sort((a, b) => b.score - a.score || a.distance - b.distance)
          .map(({ place, distance, score, priority, savedEntry }) => {
          const meta = categoryMeta(place.category);
          const active = hovered === place.id;
          return (
            <div
              key={place.id}
              onMouseEnter={() => setHovered(place.id)}
              onMouseLeave={() => setHovered(null)}
              className={`flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left ${active ? "bg-foreground/5" : "hover:bg-foreground/5"}`}
            >
              <button type="button" data-testid={`place-${place.id}`} onClick={() => onOpen(place.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-background text-lg">{meta.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{place.name}</span>
                  <span className="font-mono text-xs text-muted tabular">
                    {place.rating.toFixed(1)} ★ · {formatDistance(distance)} · {score} votes
                  </span>
                </span>
              </button>
              <span className="flex flex-col gap-1">
                <button type="button" className="text-xs" aria-label={`Interested in ${place.name}`} onClick={() => tripState.actions.votePlace(place.id, "up")}>♥</button>
                <button type="button" className="text-xs" aria-label={`Skip ${place.name}`} onClick={() => tripState.actions.votePlace(place.id, "down")}>↓</button>
                {savedEntry && (
                  <select className="text-xs" aria-label={`Priority for ${place.name}`} value={priority} onChange={(event) => tripState.actions.setPlacePriority(place.id, event.target.value as PlacePriority)}>
                    <option value="must">Must</option>
                    <option value="nice">Nice</option>
                    <option value="skip">Skip</option>
                  </select>
                )}
              </span>
            </div>
          );
        })}
        {places.length > 0 && !filtered.length && <p className="px-2 py-6 text-sm text-muted">Nothing matches that search.</p>}
      </div>
    </aside>
  );
}
