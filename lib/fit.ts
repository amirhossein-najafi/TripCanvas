import { haversine } from "@/lib/geo";
import type { Place } from "@/types";

const DAY_START = 8 * 60;
const DAY_END = 21 * 60;

export function freeMinutes(durations: number[]) {
  const occupied = durations.reduce((sum, duration) => sum + duration, 0);
  return Math.max(0, DAY_END - DAY_START - occupied);
}

export function suggestPlace(options: {
  freeMin: number;
  anchor: { lat: number; lng: number } | null;
  places: Place[];
  maxKm?: number;
}) {
  const maxKm = options.maxKm ?? 5;
  const fits = options.places.filter((place) => place.durationMin >= 30 && place.durationMin <= options.freeMin);
  if (!fits.length || options.freeMin < 60) return null;
  if (!options.anchor) return [...fits].sort((a, b) => a.durationMin - b.durationMin)[0] ?? null;
  const near = fits
    .map((place) => ({ place, distance: haversine(options.anchor!, place) }))
    .filter((item) => item.distance <= maxKm)
    .sort((a, b) => a.distance - b.distance);
  return near[0]?.place ?? null;
}
