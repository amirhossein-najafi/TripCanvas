import { haversine, walkMinutes } from "@/lib/geo";

export type TravelModeKind = "walk" | "transit" | "drive" | "estimate";

export type RouteLeg = {
  mode: TravelModeKind;
  minutes: number;
  meters: number;
  label: string;
  geometry: [number, number][];
};

export type PlaceRoute = {
  legs: RouteLeg[];
  minutes: number;
  meters: number;
  source: "transitous" | "osrm" | "estimate";
};

const cache = new Map<string, PlaceRoute>();

export function estimateRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): PlaceRoute {
  const km = haversine(from, to);
  const minutes = walkMinutes(km);
  return {
    source: "estimate",
    minutes,
    meters: Math.round(km * 1000),
    legs: [{
      mode: "estimate",
      minutes,
      meters: Math.round(km * 1000),
      label: "Straight-line estimate",
      geometry: [[from.lng, from.lat], [to.lng, to.lat]],
    }],
  };
}

export function legSummary(route: PlaceRoute) {
  return route.legs.map((leg) => `${modeWord(leg.mode)} ${leg.minutes} min`).join(" → ");
}

export function modeWord(mode: TravelModeKind) {
  if (mode === "walk") return "Walk";
  if (mode === "transit") return "Metro";
  if (mode === "drive") return "Drive";
  return "About";
}

export function decodePolyline(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const nextLat = decodeChunk(encoded, index);
    index = nextLat.index;
    lat += nextLat.value;
    const nextLng = decodeChunk(encoded, index);
    index = nextLng.index;
    lng += nextLng.value;
    coordinates.push([lng / 1e5, lat / 1e5]);
  }
  return coordinates;
}

function decodeChunk(encoded: string, start: number) {
  let result = 0;
  let shift = 0;
  let index = start;
  let byte = 0;
  do {
    byte = encoded.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < encoded.length);
  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { value, index };
}

function modeOf(raw: string): TravelModeKind {
  const value = raw.toUpperCase();
  if (value === "WALK") return "walk";
  if (value === "CAR" || value === "DRIVE" || value === "BUS") return value === "BUS" ? "transit" : "drive";
  if (value === "TRANSIT" || value.includes("RAIL") || value.includes("SUBWAY") || value.includes("METRO") || value === "TRAM") return "transit";
  return "transit";
}

export function legsFromTransitous(body: unknown): PlaceRoute | null {
  const itinerary = (body as { itineraries?: { duration?: number; legs?: Record<string, unknown>[] }[] } | null)?.itineraries?.[0];
  if (!itinerary?.legs?.length) return null;
  const legs: RouteLeg[] = itinerary.legs.map((leg) => {
    const mode = modeOf(String(leg.mode ?? "WALK"));
    const minutes = Math.max(1, Math.round(Number(leg.duration ?? 0) / 60));
    const meters = Math.round(Number(leg.distance ?? 0));
    const geometry = leg.legGeometry && typeof (leg.legGeometry as { points?: string }).points === "string"
      ? decodePolyline((leg.legGeometry as { points: string }).points)
      : [];
    const name = String(leg.routeShortName || leg.routeLongName || "");
    return {
      mode,
      minutes,
      meters,
      label: name ? `${modeWord(mode)} ${name}` : modeWord(mode),
      geometry,
    };
  });
  return {
    source: "transitous",
    minutes: Math.max(1, Math.round(Number(itinerary.duration ?? 0) / 60)) || legs.reduce((sum, leg) => sum + leg.minutes, 0),
    meters: legs.reduce((sum, leg) => sum + leg.meters, 0),
    legs,
  };
}

export function legsFromOsrm(body: unknown): PlaceRoute | null {
  const route = (body as { routes?: { duration?: number; distance?: number; geometry?: { coordinates?: [number, number][] } }[] } | null)?.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!route || !coordinates?.length) return null;
  const minutes = Math.max(1, Math.round(Number(route.duration) / 60));
  return {
    source: "osrm",
    minutes,
    meters: Math.round(Number(route.distance ?? 0)),
    legs: [{ mode: "walk", minutes, meters: Math.round(Number(route.distance ?? 0)), label: "Walk", geometry: coordinates }],
  };
}

export async function routeBetween(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<PlaceRoute> {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const route = await fetchRoute(from, to);
  cache.set(key, route);
  return route;
}

async function fetchRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<PlaceRoute> {
  try {
    const transit = new URL("https://api.transitous.org/api/v1/plan");
    transit.searchParams.set("fromPlace", `${from.lat},${from.lng}`);
    transit.searchParams.set("toPlace", `${to.lat},${to.lng}`);
    transit.searchParams.set("numItineraries", "1");
    const response = await fetch(transit, { signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const parsed = legsFromTransitous(await response.json());
      if (parsed) return parsed;
    }
  } catch {
    // Fall through to walking geometry.
  }
  try {
    const osrm = `https://router.project-osrm.org/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const response = await fetch(osrm, { signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const parsed = legsFromOsrm(await response.json());
      if (parsed) return parsed;
    }
  } catch {
    // Straight-line estimate remains.
  }
  return estimateRoute(from, to);
}

/** Nearest-neighbour using a minute cost. The first id stays put. */
export function orderByEta(ids: string[], minutes: (from: string, to: string) => number) {
  if (ids.length <= 2) return [...ids];
  const remaining = ids.slice(1);
  const ordered = [ids[0]];
  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    let best = 0;
    let bestCost = Infinity;
    remaining.forEach((id, index) => {
      const cost = minutes(current, id);
      if (cost < bestCost) {
        bestCost = cost;
        best = index;
      }
    });
    ordered.push(remaining.splice(best, 1)[0]);
  }
  return ordered;
}

export function routeCoordinates(route: PlaceRoute): [number, number][] {
  return route.legs.flatMap((leg) => leg.geometry);
}
