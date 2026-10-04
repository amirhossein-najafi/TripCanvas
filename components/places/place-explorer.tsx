"use client";

import { useState } from "react";
import { categoryMeta } from "@/lib/categories";
import { formatDistance, haversine } from "@/lib/geo";
import { useUi } from "@/store/ui-store";
import type { Place, Trip } from "@/types";

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
  if (!open) return null;

  const filtered = places
    .filter((place) => `${place.name} ${place.category}`.toLowerCase().includes(text.trim().toLowerCase()))
    .map((place) => ({ place, distance: haversine(place, { lat: trip.centerLat, lng: trip.centerLng }) }))
    .sort((a, b) => a.distance - b.distance);

  return (
    <aside className="absolute top-16 left-4 z-20 flex max-h-[min(640px,calc(100%-5rem))] w-[min(340px,calc(100%-2rem))] flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-[var(--shadow)]">
      <div className="border-b border-border p-3">
        <input
          data-testid="place-search"
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search places..."
          className="h-11 w-full rounded-2xl bg-background px-3 outline-none"
        />
      </div>
      <div className="overflow-auto p-2">
        <p className="px-2 py-2 text-xs tracking-[0.14em] text-muted uppercase">Suggested</p>
        {!places.length && (
          <div className="space-y-2 p-2">
            <div className="skeleton h-14" />
            <div className="skeleton h-14" />
            <div className="skeleton h-14" />
          </div>
        )}
        {filtered.map(({ place, distance }) => {
          const meta = categoryMeta(place.category);
          const active = hovered === place.id;
          return (
            <button
              key={place.id}
              type="button"
              data-testid={`place-${place.id}`}
              onMouseEnter={() => setHovered(place.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onOpen(place.id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left ${active ? "bg-foreground/5" : "hover:bg-foreground/5"}`}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-background text-lg">{meta.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{place.name}</span>
                <span className="font-mono text-xs text-muted tabular">
                  {place.rating.toFixed(1)} ★ · {formatDistance(distance)}
                </span>
              </span>
            </button>
          );
        })}
        {places.length > 0 && !filtered.length && <p className="px-2 py-6 text-sm text-muted">Nothing matches that search.</p>}
      </div>
    </aside>
  );
}
