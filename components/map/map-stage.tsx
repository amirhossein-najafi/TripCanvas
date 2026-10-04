"use client";

import { Plus } from "lucide-react";
import { PlaceExplorer } from "@/components/places/place-explorer";
import { TripMap } from "@/components/map/trip-map";
import { useTripParams } from "@/features/trips/use-trip-params";
import { useTrip } from "@/features/trips/trip-provider";
import { activitiesForDay } from "@/lib/itinerary";
import { placeById } from "@/lib/catalog";
import { useUi } from "@/store/ui-store";
import { DAY_COLORS } from "@/types";

export function MapStage() {
  const { bundle } = useTrip();
  const { day, patch } = useTripParams();
  const hovered = useUi((state) => state.hoveredPlaceId);
  const setHovered = useUi((state) => state.setHoveredPlaceId);
  const draggingId = useUi((state) => state.draggingActivityId);
  const focusPlaceId = useUi((state) => state.focusPlaceId);
  const explorerOpen = useUi((state) => state.explorerOpen);
  const setExplorerOpen = useUi((state) => state.setExplorerOpen);

  if (!bundle) return <div className="h-full w-full skeleton" />;

  const selected = bundle.days[Math.min(bundle.days.length, day) - 1] ?? bundle.days[0];
  const dragging = bundle.activities.find((activity) => activity.id === draggingId);
  const highlight = dragging?.placeId || hovered;

  const markers = bundle.days.flatMap((item, index) =>
    activitiesForDay(bundle.activities, item.id).flatMap((activity, activityIndex) => {
      const place = placeById(activity.placeId);
      if (!place) return [];
      return [{
        id: activity.id,
        placeId: place.id,
        lat: place.lat,
        lng: place.lng,
        number: activityIndex + 1,
        color: DAY_COLORS[index % DAY_COLORS.length],
        title: activity.title,
        dim: item.id !== selected?.id && highlight !== place.id,
      }];
    }),
  );

  const routes = bundle.days.map((item, index) => ({
    id: item.id,
    color: DAY_COLORS[index % DAY_COLORS.length],
    active: item.id === selected?.id,
    coordinates: activitiesForDay(bundle.activities, item.id)
      .map((activity) => placeById(activity.placeId))
      .filter((place): place is NonNullable<typeof place> => Boolean(place))
      .map((place) => [place.lng, place.lat] as [number, number]),
  }));

  return (
    <div className="relative h-full w-full">
      <TripMap
        markers={markers}
        routes={routes}
        highlightId={highlight}
        focusId={focusPlaceId}
        fitKey={selected?.id}
        onMarkerHover={setHovered}
        onMarkerClick={(placeId) => patch({ place: placeId })}
      />
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
