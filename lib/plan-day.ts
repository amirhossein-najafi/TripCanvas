import { haversine, optimizeNearestNeighbor, routeKm } from "@/lib/geo";
import type { Place, PlaceCategory } from "@/types";

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
