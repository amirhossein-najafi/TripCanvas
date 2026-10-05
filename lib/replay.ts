export type ReplayStop = {
  startMin: number;
  endMin: number;
  lat: number;
  lng: number;
  title: string;
  dayId: string;
};

export function replayFrame(stops: ReplayStop[], minute: number) {
  if (!stops.length) return null;
  const index = Math.max(0, stops.findLastIndex((stop) => stop.startMin <= minute));
  const current = stops[index];
  const next = stops[index + 1];
  const span = next ? Math.max(1, next.startMin - current.endMin) : 1;
  const into = Math.min(1, Math.max(0, (minute - current.endMin) / span));
  const traveling = Boolean(next) && minute >= current.endMin && minute < next.startMin;
  const lat = traveling && next ? current.lat + (next.lat - current.lat) * into : current.lat;
  const lng = traveling && next ? current.lng + (next.lng - current.lng) * into : current.lng;
  return { index, current, next: traveling ? next : null, lat, lng, progress: into };
}
