import { hourInZone } from "@/lib/dates";
import type { Place } from "@/types";

export function hoursLabel(place: Place, timeZone: string, date = new Date()) {
  if (place.openHour <= 0 && place.closeHour >= 24) return "Open all day";
  const hour = hourInZone(timeZone, date);
  const overnight = place.closeHour < place.openHour;
  const openNow = overnight ? hour >= place.openHour || hour < place.closeHour : hour >= place.openHour && hour < place.closeHour;
  if (openNow) return `Open now · Closes ${formatHour(place.closeHour)}`;
  return `Closed · Opens ${formatHour(place.openHour)}`;
}

function formatHour(hour: number) {
  if (hour === 0 || hour === 24) return "12 AM";
  const suffix = hour >= 12 && hour < 24 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${suffix}`;
}
