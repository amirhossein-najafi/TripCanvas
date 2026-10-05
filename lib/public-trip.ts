import type { PublicTripBundle, TripBundle } from "@/types";

/** Itinerary a stranger is allowed to see. Costs, notes, bookings, and emails stay out. */
export function toPublicBundle(bundle: TripBundle): PublicTripBundle {
  const owner = bundle.members.find((member) => member.role === "owner")?.user;
  return {
    trip: {
      id: bundle.trip.id,
      title: bundle.trip.title,
      destination: bundle.trip.destination,
      destinationId: bundle.trip.destinationId,
      startDate: bundle.trip.startDate,
      endDate: bundle.trip.endDate,
      coverImage: bundle.trip.coverImage,
      timezone: bundle.trip.timezone,
      slug: bundle.trip.slug,
      centerLat: bundle.trip.centerLat,
      centerLng: bundle.trip.centerLng,
    },
    days: bundle.days.map((day) => ({ ...day, note: "" })),
    activities: bundle.activities.map((activity) => ({
      id: activity.id,
      dayId: activity.dayId,
      placeId: activity.placeId,
      title: activity.title,
      startTime: activity.startTime,
      duration: activity.duration,
      position: activity.position,
    })),
    places: bundle.places,
    owner: { name: owner?.name || "Someone", avatar: owner?.avatar || "" },
  };
}
