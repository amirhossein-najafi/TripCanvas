import { describe, expect, it } from "vitest";
import { freeMinutes, suggestPlace } from "@/lib/fit";
import { parsePlanPrompt } from "@/lib/plan-day";
import { moveActivity } from "@/lib/itinerary";
import type { Activity, Place } from "@/types";

const place = (id: string, lat: number, durationMin: number): Place => ({
  id,
  destinationId: "tokyo",
  name: id,
  lat,
  lng: 139.7,
  address: "",
  category: "museum",
  image: "",
  rating: 4,
  durationMin,
  indoor: true,
  about: "",
  openHour: 9,
  closeHour: 18,
});

describe("free time", () => {
  it("suggests a nearby place that fits the gap", () => {
    const free = freeMinutes([60, 60, 60]);
    expect(free).toBeGreaterThan(90);
    const suggestion = suggestPlace({
      freeMin: 120,
      anchor: { lat: 35.66, lng: 139.7 },
      places: [place("mori", 35.661, 90), place("far", 36.2, 90), place("long", 35.662, 400)],
    });
    expect(suggestion?.id).toBe("mori");
  });
});

describe("plan prompt", () => {
  it("reads categories and a walking cap", () => {
    expect(parsePlanPrompt("I want coffee, art and ramen, no more than 6km walking.")).toMatchObject({
      categories: ["cafe", "museum", "food"],
      maxKm: 6,
      lessBusy: false,
    });
    expect(parsePlanPrompt("Make this day less busy.").lessBusy).toBe(true);
  });
});

describe("move activity", () => {
  it("moves a card onto another day", () => {
    const activities: Activity[] = [
      { id: "a", tripId: "t", dayId: "d1", placeId: "meiji", title: "Meiji", startTime: "11:00", duration: 90, position: 0, note: "", plannedCost: 0, actualCost: null, status: "planned" },
      { id: "b", tripId: "t", dayId: "d1", placeId: "shibuya", title: "Shibuya", startTime: "14:00", duration: 60, position: 1, note: "", plannedCost: 0, actualCost: null, status: "planned" },
    ];
    const next = moveActivity(activities, "a", "day:d2");
    expect(next.find((item) => item.id === "a")?.dayId).toBe("d2");
    expect(next.find((item) => item.id === "b")?.position).toBe(0);
  });
});
