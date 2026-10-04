const EARTH_KM = 6371;

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function formatDistance(km: number) {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.max(50, Math.round(km * 1000 / 10) * 10)} m`;
  return `${km.toFixed(1)} km`;
}

export function walkMinutes(km: number, kmh = 4.5) {
  if (km <= 0) return 0;
  return Math.max(1, Math.round((km / kmh) * 60));
}

export type GeoPoint = { id: string; lat: number; lng: number };

export function routeKm(points: { lat: number; lng: number }[]) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += haversine(points[i - 1], points[i]);
  return total;
}

export function routeMinutes(points: { lat: number; lng: number }[]) {
  return walkMinutes(routeKm(points));
}

/** Nearest-neighbour order. The first point stays the start of the day. */
export function optimizeNearestNeighbor<T extends GeoPoint>(points: T[]): T[] {
  if (points.length <= 2) return [...points];
  const remaining = points.slice(1);
  const ordered: T[] = [points[0]];
  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    let best = 0;
    let bestDistance = Infinity;
    remaining.forEach((point, index) => {
      const distance = haversine(current, point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    ordered.push(remaining.splice(best, 1)[0]);
  }
  return ordered;
}
