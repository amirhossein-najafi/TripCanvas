"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { PlaceExplorer } from "@/components/places/place-explorer";
import { TripMap, type MapMarker, type MapRoute } from "@/components/map/trip-map";
import { useTripParams } from "@/features/trips/use-trip-params";
import { useTrip } from "@/features/trips/trip-provider";
import { activitiesForDay } from "@/lib/itinerary";
import { placeById } from "@/lib/catalog";
import { clusterMarkers } from "@/lib/cluster";
import { routeBetween, routeCoordinates } from "@/lib/routing";
import { useUi } from "@/store/ui-store";
import { DAY_COLORS, type PlaceCategory } from "@/types";

const LAYER_CATEGORIES: { id: string; label: string; category?: PlaceCategory }[] = [
  { id: "planned", label: "Planned" },
  { id: "saved", label: "Saved" },
  { id: "food", label: "Food", category: "food" },
  { id: "coffee", label: "Coffee", category: "cafe" },
  { id: "museums", label: "Museums", category: "museum" },
  { id: "visited", label: "Visited" },
];

export function MapStage() {
  const { bundle } = useTrip();
  const { day, patch } = useTripParams();
  const hovered = useUi((state) => state.hoveredPlaceId);
  const setHovered = useUi((state) => state.setHoveredPlaceId);
  const draggingId = useUi((state) => state.draggingActivityId);
  const focusPlaceId = useUi((state) => state.focusPlaceId);
  const explorerOpen = useUi((state) => state.explorerOpen);
  const setExplorerOpen = useUi((state) => state.setExplorerOpen);
  const [zoom, setZoom] = useState(12);
  const [layers, setLayers] = useState<Record<string, boolean>>({ planned: true, saved: true, food: true, coffee: true, museums: true, visited: true });
  const [fetchedRoutes, setFetchedRoutes] = useState<{ key: string; routes: MapRoute[] } | null>(null);

  const selected = bundle?.days[Math.min(bundle.days.length, day) - 1] ?? bundle?.days[0];
  const routeKey = selected ? `${selected.id}:${activitiesForDay(bundle?.activities ?? [], selected.id).map((activity) => activity.placeId).join(",")}` : "";
  useEffect(() => {
    if (!bundle || !selected || !routeKey) return;
    let stop = false;
    const acts = activitiesForDay(bundle.activities, selected.id);
    const points = acts.map((activity) => placeById(activity.placeId)).filter((place): place is NonNullable<typeof place> => Boolean(place));
    const color = DAY_COLORS[bundle.days.findIndex((item) => item.id === selected.id) % DAY_COLORS.length];
    Promise.all(points.slice(1).map((place, index) => routeBetween(points[index], place))).then((routes) => {
      if (stop) return;
      setFetchedRoutes({
        key: routeKey,
        routes: [{
          id: selected.id,
          color,
          active: true,
          coordinates: routes.flatMap(routeCoordinates),
          segments: routes.flatMap((route) => route.legs.map((leg) => ({ coordinates: leg.geometry, mode: leg.mode }))),
        }],
      });
    }).catch(() => undefined);
    return () => { stop = true; };
  }, [bundle, selected, routeKey]);

  if (!bundle || !selected) return <div className="h-full w-full skeleton" />;

  const dragging = bundle.activities.find((activity) => activity.id === draggingId);
  const highlight = dragging?.placeId || hovered;

  const scheduledIds = new Set(bundle.activities.map((activity) => activity.placeId).filter(Boolean));
  const ups = new Map<string, number>();
  for (const vote of bundle.votes) {
    if (vote.vote === "up") ups.set(vote.placeId, (ups.get(vote.placeId) ?? 0) + 1);
  }
  const markers: MapMarker[] = bundle.days.flatMap((item, index) =>
    activitiesForDay(bundle.activities, item.id).flatMap((activity, activityIndex) => {
      const place = placeById(activity.placeId);
      if (!place) return [];
      if (!layers.planned) return [];
      if (!layers.visited && activity.status === "done") return [];
      if (!categoryOn(layers, place.category)) return [];
      return [{
        id: activity.id,
        placeId: place.id,
        lat: place.lat,
        lng: place.lng,
        number: activityIndex + 1,
        color: DAY_COLORS[index % DAY_COLORS.length],
        title: activity.title,
        dim: item.id !== selected?.id && highlight !== place.id,
        kind: "scheduled" as const,
        weight: ups.get(place.id) ?? 0,
      }];
    }),
  );
  if (explorerOpen || layers.saved) {
    for (const place of bundle.places) {
      if (scheduledIds.has(place.id)) continue;
      const saved = bundle.saved.some((item) => item.placeId === place.id);
      if (!explorerOpen && !saved) continue;
      if (saved && !layers.saved && !explorerOpen) continue;
      if (!categoryOn(layers, place.category)) continue;
      markers.push({
        id: `poi:${place.id}`,
        placeId: place.id,
        lat: place.lat,
        lng: place.lng,
        number: 0,
        color: "#3d6f8c",
        title: place.name,
        kind: highlight === place.id ? "selected" : "suggested",
        weight: ups.get(place.id) ?? 0,
      });
    }
  }
  const shown = clusterMarkers(markers, zoom);

  const routes = bundle.days.map((item, index) => {
    const live = fetchedRoutes?.key === routeKey ? fetchedRoutes.routes.find((route) => route.id === item.id) : undefined;
    if (live) return live;
    return {
      id: item.id,
      color: DAY_COLORS[index % DAY_COLORS.length],
      active: item.id === selected?.id,
      coordinates: activitiesForDay(bundle.activities, item.id)
        .map((activity) => placeById(activity.placeId))
        .filter((place): place is NonNullable<typeof place> => Boolean(place))
        .map((place) => [place.lng, place.lat] as [number, number]),
    };
  });

  return (
    <div className="relative h-full w-full">
      <TripMap
        markers={shown}
        routes={routes}
        highlightId={highlight}
        focusId={focusPlaceId}
        fitKey={selected?.id}
        onZoom={setZoom}
        onMarkerHover={setHovered}
        onMarkerClick={(placeId) => patch({ place: placeId })}
      />
      <div className="absolute bottom-4 left-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap gap-1">
        {LAYER_CATEGORIES.map((layer) => (
          <button key={layer.id} type="button" onClick={() => setLayers((current) => ({ ...current, [layer.id]: !current[layer.id] }))} className={`rounded-full px-2 py-1 text-xs ${layers[layer.id] ? "bg-foreground text-background" : "bg-card text-muted"}`}>
            {layer.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="add-place"
        onClick={() => setExplorerOpen(!explorerOpen)}
        className="absolute top-4 left-4 z-20 inline-flex h-10 items-center gap-2 rounded-2xl bg-foreground px-3 text-sm font-medium text-background shadow-[var(--shadow)]"
      >
        <Plus size={16} /> Add place
      </button>
      <PlaceExplorer trip={bundle.trip} places={bundle.places} onOpen={(placeId) => patch({ place: placeId })} />
    </div>
  );
}

function categoryOn(layers: Record<string, boolean>, category: PlaceCategory) {
  if (category === "food" && layers.food === false) return false;
  if (category === "cafe" && layers.coffee === false) return false;
  if (category === "museum" && layers.museums === false) return false;
  return true;
}
