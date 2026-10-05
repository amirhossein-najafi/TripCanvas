import { describe, expect, it } from "vitest";
import { moveActivityToIdeas, moveSavedPlaceToDay } from "@/lib/board";
import { parseBookingText } from "@/lib/booking-parse";
import { minutesInZone, zonedDateISO } from "@/lib/dates";
import { resolveJoin } from "@/lib/invites";
import { planWithConstraints } from "@/lib/plan-day";
import { toPublicBundle } from "@/lib/public-trip";
import { decodePolyline, legsFromOsrm, legsFromTransitous, orderByEta } from "@/lib/routing";
import { hasConflict, pendingCount, queueChange } from "@/lib/sync";
import { firstRainHour } from "@/lib/weather";
import type { Activity, SavedPlace, TripBundle } from "@/types";

const activity = (id: string, placeId: string | null = "cafe"): Activity => ({
  id, tripId: "t", dayId: "d", placeId, title: id, startTime: "10:00", duration: 60, position: 0, note: "secret", plannedCost: 12, actualCost: 9, status: "planned",
});

describe("public bundle", () => {
  it("drops private fields", () => {
    const bundle = {
      trip: { id: "t", title: "Tokyo", destination: "Tokyo", destinationId: "tokyo", startDate: "2027-03-12", endDate: "2027-03-13", coverImage: "", timezone: "Asia/Tokyo", slug: "tokyo", centerLat: 1, centerLng: 2, ownerId: "u", currency: "USD", isPublic: true, budgetAmount: 1500, travelerCount: 2, revision: 1, fxRates: {} },
      members: [{ tripId: "t", userId: "u", role: "owner" as const, user: { id: "u", name: "Ali", email: "ali@tripcanvas.app", avatar: "A" } }],
      days: [{ id: "d", tripId: "t", date: "2027-03-12", note: "private note" }],
      activities: [activity("a")],
      saved: [], bookings: [], expenses: [], shares: [], comments: [], events: [], places: [], invites: [], participants: [], votes: [], snapshots: [],
    } satisfies TripBundle;
    const pub = toPublicBundle(bundle);
    expect(pub.owner).toEqual({ name: "Ali", avatar: "A" });
    expect(JSON.stringify(pub)).not.toContain("ali@tripcanvas.app");
    expect(JSON.stringify(pub)).not.toContain("1500");
    expect(pub.activities[0]).not.toHaveProperty("note");
    expect(pub.days[0].note).toBe("");
  });
});

describe("invites", () => {
  const trips = [{ id: "t", slug: "tokyo", isPublic: false }, { id: "p", slug: "public", isPublic: true }];
  const invites = [{ token: "tok", tripId: "t", role: "editor" as const, expiresAt: "2027-01-02T00:00:00.000Z", maxUses: 2, usedCount: 0 }];
  it("accepts a live token and refuses a private slug", () => {
    expect(resolveJoin({ tokenOrSlug: "tok", userId: "sara", now: "2027-01-01T00:00:00.000Z", invites, trips, members: [] }).ok).toBe(true);
    const slug = resolveJoin({ tokenOrSlug: "tokyo", userId: "sara", now: "2027-01-01T00:00:00.000Z", invites, trips, members: [] });
    expect(slug.ok).toBe(false);
  });
  it("lets a public slug join as viewer", () => {
    const result = resolveJoin({ tokenOrSlug: "public", userId: "sara", now: "2027-01-01T00:00:00.000Z", invites, trips, members: [] });
    expect(result).toMatchObject({ ok: true, tripId: "p", role: "viewer" });
  });
});

describe("board moves", () => {
  const saved: SavedPlace[] = [{ id: "s", tripId: "t", placeId: "cafe", note: "", priority: "nice" }];
  it("moves a saved place and an activity together", () => {
    const onto = moveSavedPlaceToDay({ activities: [], saved, tripId: "t", placeId: "cafe", activity: activity("a") });
    expect(onto?.saved).toHaveLength(0);
    expect(onto?.activities).toHaveLength(1);
    const back = moveActivityToIdeas({ activities: onto!.activities, saved: onto!.saved, tripId: "t", activityId: "a", savedId: "s2" });
    expect(back?.saved[0].placeId).toBe("cafe");
    expect(back?.activities).toHaveLength(0);
  });
  it("does nothing when the place is not saved", () => {
    expect(moveSavedPlaceToDay({ activities: [], saved: [], tripId: "t", placeId: "cafe", activity: activity("a") })).toBeNull();
  });
});

describe("weather hour", () => {
  it("returns the first hour at or above 50%", () => {
    expect(firstRainHour([{ time: "2027-03-12T13:00", probability: 20 }, { time: "2027-03-12T16:00", probability: 60 }])).toBe("16:00");
    expect(firstRainHour([{ time: "09:00", probability: 10 }])).toBeNull();
  });
});

describe("routing parse", () => {
  it("reads a transit itinerary and an OSRM line", () => {
    const transit = legsFromTransitous({ itineraries: [{ duration: 900, legs: [{ mode: "WALK", duration: 180, distance: 200, legGeometry: { points: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" } }, { mode: "SUBWAY", duration: 720, distance: 4000, routeShortName: "G" }] }] });
    expect(transit?.legs.map((leg) => leg.mode)).toEqual(["walk", "transit"]);
    expect(transit?.minutes).toBe(15);
    const osrm = legsFromOsrm({ routes: [{ duration: 600, distance: 800, geometry: { coordinates: [[139.7, 35.6], [139.8, 35.7]] } }] });
    expect(osrm?.source).toBe("osrm");
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@").length).toBeGreaterThan(1);
  });
  it("orders stops by ETA and keeps the start", () => {
    expect(orderByEta(["a", "b", "c"], (from, to) => from === "a" && to === "c" ? 1 : 10)).toEqual(["a", "c", "b"]);
  });
});

describe("booking parser", () => {
  it("reads a flight confirmation", () => {
    const parsed = parseBookingText("Flight JL 42\nConfirmation ABC123\nTerminal 3\n2027-03-12 08:10");
    expect(parsed.type).toBe("flight");
    expect(parsed.reference).toBe("ABC123");
    expect(parsed.startAt).toBe("2027-03-12T08:10");
    expect(parsed.notes).toContain("Terminal 3");
  });
});

describe("constraint planner", () => {
  it("skips a place that closes before arrival", () => {
    const place = { id: "m", destinationId: "tokyo", name: "Museum", lat: 35.7, lng: 139.7, address: "", category: "museum" as const, image: "", rating: 4, durationMin: 120, indoor: true, about: "", openHour: 9, closeHour: 10, priority: "nice" as const };
    const result = planWithConstraints({ places: [place], anchor: { lat: 35.6, lng: 139.6 }, dayStart: 12 * 60 });
    expect(result.ordered).toHaveLength(0);
    expect(result.notes.some((note) => note.includes("closes"))).toBe(true);
  });
});

describe("sync queue", () => {
  it("counts conflicts and pending changes", () => {
    const queued = queueChange([], { id: "1", tripId: "t", baseRevision: 2, label: "edit" });
    expect(pendingCount(queued, "t")).toBe(1);
    expect(hasConflict(2, 3)).toBe(true);
    expect(hasConflict(3, 3)).toBe(false);
  });
});

describe("trip timezone", () => {
  it("formats a date in the trip zone rather than UTC", () => {
    const instant = new Date("2027-03-12T15:30:00.000Z");
    expect(zonedDateISO("Asia/Tokyo", instant)).toBe("2027-03-13");
    expect(minutesInZone("Asia/Tokyo", instant)).toBe(30);
  });
});
