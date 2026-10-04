import { describe, expect, it } from "vitest";
import { haversine, optimizeNearestNeighbor, routeMinutes } from "@/lib/geo";

describe("nearest neighbour", () => {
  it("keeps the start and visits the closer stop first", () => {
    const points = [
      { id: "hotel", lat: 0, lng: 0 },
      { id: "far", lat: 0, lng: 2 },
      { id: "near", lat: 0, lng: 0.2 },
    ];
    expect(optimizeNearestNeighbor(points).map((point) => point.id)).toEqual(["hotel", "near", "far"]);
  });

  it("reports a shorter walk after optimizing", () => {
    const messy = [
      { id: "a", lat: 35.68, lng: 139.69 },
      { id: "c", lat: 35.71, lng: 139.81 },
      { id: "b", lat: 35.685, lng: 139.7 },
    ];
    const optimized = optimizeNearestNeighbor(messy);
    expect(routeMinutes(optimized)).toBeLessThan(routeMinutes(messy));
    expect(haversine(messy[0], messy[1])).toBeGreaterThan(haversine(messy[0], messy[2]));
  });
});
