import type { Activity, SavedPlace } from "@/types";

export function moveSavedPlaceToDay(input: {
  activities: Activity[];
  saved: SavedPlace[];
  tripId: string;
  placeId: string;
  activity: Activity;
}): { activities: Activity[]; saved: SavedPlace[] } | null {
  const exists = input.saved.some((item) => item.tripId === input.tripId && item.placeId === input.placeId);
  if (!exists) return null;
  return {
    activities: [...input.activities, input.activity],
    saved: input.saved.filter((item) => !(item.tripId === input.tripId && item.placeId === input.placeId)),
  };
}

export function moveActivityToIdeas(input: {
  activities: Activity[];
  saved: SavedPlace[];
  tripId: string;
  activityId: string;
  savedId: string;
}): { activities: Activity[]; saved: SavedPlace[] } | null {
  const activity = input.activities.find((item) => item.id === input.activityId && item.tripId === input.tripId);
  if (!activity) return null;
  const saved = [...input.saved];
  if (activity.placeId && !saved.some((item) => item.tripId === input.tripId && item.placeId === activity.placeId)) {
    saved.push({ id: input.savedId, tripId: input.tripId, placeId: activity.placeId, note: "", priority: "nice" });
  }
  return {
    activities: input.activities.filter((item) => item.id !== input.activityId),
    saved,
  };
}
