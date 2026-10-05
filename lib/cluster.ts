export type ClusterPoint = {
  id: string;
  placeId: string;
  lat: number;
  lng: number;
  number: number;
  color: string;
  title: string;
  dim?: boolean;
  kind?: "scheduled" | "suggested" | "selected" | "cluster";
  weight?: number;
};

/** Groups nearby markers when the camera is zoomed out. */
export function clusterMarkers<T extends ClusterPoint>(markers: T[], zoom: number): T[] {
  if (zoom >= 12 || markers.length < 2) return markers;
  const cell = zoom < 8 ? 0.4 : zoom < 10 ? 0.12 : 0.05;
  const groups = new Map<string, T[]>();
  for (const marker of markers) {
    const key = `${Math.round(marker.lat / cell)}:${Math.round(marker.lng / cell)}`;
    const list = groups.get(key) ?? [];
    list.push(marker);
    groups.set(key, list);
  }
  const clustered: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      clustered.push(group[0]);
      continue;
    }
    const lat = group.reduce((sum, item) => sum + item.lat, 0) / group.length;
    const lng = group.reduce((sum, item) => sum + item.lng, 0) / group.length;
    clustered.push({
      ...group[0],
      id: `cluster:${group.map((item) => item.id).join(",")}`,
      lat,
      lng,
      number: group.length,
      title: `${group.length} places`,
      kind: "cluster",
    });
  }
  return clustered;
}
