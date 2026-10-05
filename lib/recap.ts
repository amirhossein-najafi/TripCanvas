import { haversine } from "@/lib/geo";
import type { Activity, Expense, Place } from "@/types";

export function recapStats(input: {
  activities: Activity[];
  places: Place[];
  expenses: Expense[];
}) {
  const placed = input.activities
    .map((activity) => input.places.find((place) => place.id === activity.placeId))
    .filter((place): place is Place => Boolean(place));
  let km = 0;
  for (let index = 1; index < placed.length; index += 1) km += haversine(placed[index - 1], placed[index]);
  const restaurants = placed.filter((place) => place.category === "food").length;
  const spent = input.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  return {
    km: Math.round(km),
    places: new Set(placed.map((place) => place.id)).size,
    restaurants,
    spent,
  };
}
