import { haversine, optimizeNearestNeighbor, routeKm } from "@/lib/geo";
import type { Place, PlaceCategory, PlacePriority } from "@/types";

export type PlanIntent = {
  categories: PlaceCategory[];
  maxKm: number | null;
  lessBusy: boolean;
};

const WORDS: { category: PlaceCategory; pattern: RegExp }[] = [
  { category: "cafe", pattern: /coffee|cafe|cafés|espresso/i },
  { category: "museum", pattern: /art|museum|gallery/i },
  { category: "food", pattern: /ramen|sushi|food|dinner|lunch|restaurant/i },
  { category: "park", pattern: /park|garden/i },
  { category: "shopping", pattern: /shop|market/i },
  { category: "shrine", pattern: /shrine|temple/i },
  { category: "sight", pattern: /view|tower|crossing/i },
];

export function parsePlanPrompt(input: string): PlanIntent {
  const categories: PlaceCategory[] = [];
  for (const word of WORDS) {
    if (word.pattern.test(input) && !categories.includes(word.category)) categories.push(word.category);
  }
  const km = input.match(/(\d+(?:\.\d+)?)\s*km/i);
  return {
    categories,
    maxKm: km ? Number(km[1]) : null,
    lessBusy: /less busy|lighter|too busy|not so busy|slow(er)? day/i.test(input),
  };
}

export function planPlaces(options: {
  prompt: string;
  saved: Place[];
  anchor: { lat: number; lng: number };
}) {
  const intent = parsePlanPrompt(options.prompt);
  if (intent.lessBusy && intent.categories.length === 0) {
    return { intent, ordered: [] as Place[] };
  }
  let pool = options.saved.filter((place) => place.category !== "hotel");
  if (intent.categories.length) {
    const picked: Place[] = [];
    for (const category of intent.categories) {
      const matches = pool
        .filter((place) => place.category === category && !picked.some((item) => item.id === place.id))
        .sort((a, b) => haversine(options.anchor, a) - haversine(options.anchor, b));
      if (matches[0]) picked.push(matches[0]);
    }
    pool = picked;
  }
  if (!pool.length) return { intent, ordered: [] as Place[] };

  const orderedIds = optimizeNearestNeighbor([
    { id: "__anchor", lat: options.anchor.lat, lng: options.anchor.lng },
    ...pool,
  ])
    .map((point) => point.id)
    .filter((id) => id !== "__anchor");
  const byId = new Map(pool.map((place) => [place.id, place]));
  const ordered = orderedIds.map((id) => byId.get(id)!).filter(Boolean);
  const chosen: Place[] = [];
  let walked = 0;
  let cursor = options.anchor;
  for (const place of ordered) {
    const leg = routeKm([cursor, place]);
    if (intent.maxKm != null && chosen.length && walked + leg > intent.maxKm) continue;
    if (intent.maxKm != null && !chosen.length && leg > intent.maxKm) continue;
    chosen.push(place);
    walked += leg;
    cursor = place;
    if (chosen.length >= 4) break;
  }
  return { intent, ordered: chosen };
}

export type PlannerInput = {
  places: (Place & { priority?: PlacePriority; cost?: number })[];
  anchor: { lat: number; lng: number };
  dayStart?: number;
  dayEnd?: number;
  maxWalkKm?: number | null;
  budget?: number | null;
  rainAfterMin?: number | null;
  blocked?: { start: number; end: number; title: string }[];
  legKm?: (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => number;
};

/** Orders saved places against opening hours, fixed bookings, weather, walking, and budget. */
export function planWithConstraints(input: PlannerInput) {
  const notes: string[] = [];
  const legKm = input.legKm ?? ((from, to) => haversine(from, to));
  const start = input.dayStart ?? 9 * 60;
  const end = input.dayEnd ?? 21 * 60;
  const pool = input.places.filter((place) => place.priority !== "skip" && place.category !== "hotel");
  const ranked = [...pool].sort((a, b) => rank(a.priority) - rank(b.priority) || haversine(input.anchor, a) - haversine(input.anchor, b));
  const chosen: Place[] = [];
  let cursor = input.anchor;
  let clock = start;
  let walked = 0;
  let spent = 0;
  const blocked = [...(input.blocked ?? [])].sort((a, b) => a.start - b.start);

  for (const place of ranked) {
    const km = legKm(cursor, place);
    const travel = walkMinutes(km);
    let arrival = clock + travel;
    const block = blocked.find((item) => arrival < item.end && arrival + place.durationMin > item.start);
    if (block) arrival = block.end + travel;
    const open = place.openHour * 60;
    const close = place.closeHour * 60;
    if (arrival < open) arrival = open;
    if (arrival + Math.min(place.durationMin, 60) > close) {
      notes.push(`${place.name} closes at ${String(place.closeHour).padStart(2, "0")}:00.`);
      continue;
    }
    if (input.rainAfterMin != null && !place.indoor && arrival >= input.rainAfterMin) {
      notes.push(`${place.name} is outdoor after the rain starts.`);
      if (place.priority !== "must") continue;
    }
    if (input.maxWalkKm != null && walked + km > input.maxWalkKm && chosen.length) {
      notes.push(`Walking would pass ${input.maxWalkKm} km.`);
      continue;
    }
    const cost = place.cost ?? 0;
    if (input.budget != null && spent + cost > input.budget && cost > 0) {
      notes.push(`${place.name} is over the remaining budget.`);
      continue;
    }
    if (arrival + place.durationMin > end) {
      notes.push(`${place.name} does not fit before the day ends.`);
      continue;
    }
    chosen.push(place);
    walked += km;
    spent += cost;
    clock = arrival + place.durationMin + 15;
    cursor = place;
    if (chosen.length >= 6) break;
  }
  if (!chosen.length) notes.push("Nothing saved fits these constraints.");
  return { ordered: chosen, notes, walkedKm: walked };
}

function rank(priority: PlacePriority | undefined) {
  if (priority === "must") return 0;
  if (priority === "skip") return 2;
  return 1;
}

function walkMinutes(km: number) {
  return Math.max(1, Math.round((km / 4.5) * 60));
}
