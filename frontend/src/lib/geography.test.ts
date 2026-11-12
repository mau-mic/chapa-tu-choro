import { describe, it, expect } from "vitest";
import { areaBounds, cameraBounds } from "./geography";
import type { AreaFeatureCollection } from "./api";
describe("map focus bounds", () => {
  it("computes the national camera envelope without masking neighboring countries", () => {
    const world = cameraBounds({ lng: 0, lat: 0 }, 0, 512, 512);
    expect(world[0][0]).toBe(-180);
    expect(world[1][0]).toBe(180);
    expect(world[0][1]).toBeCloseTo(-85.05112878);
    expect(world[1][1]).toBeCloseTo(85.05112878);
    const wide = cameraBounds({ lng: -75, lat: -9 }, 5, 1000, 500),
      narrow = cameraBounds({ lng: -75, lat: -9 }, 5, 500, 500);
    expect(wide[0][0]).toBeLessThan(narrow[0][0]);
    expect(wide[0][1]).toBe(narrow[0][1]);
  });
  it("includes disconnected polygons without invented positions", () => {
    const data: AreaFeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            code: "04",
            name: "TEST",
            level: "department",
            reports: 0,
          },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [-77, -12],
                  [-76, -12],
                  [-76, -11],
                  [-77, -12],
                ],
              ],
              [
                [
                  [-75, -10],
                  [-74, -10],
                  [-74, -9],
                  [-75, -10],
                ],
              ],
            ],
          },
        },
      ],
    };
    expect(areaBounds(data)).toEqual([
      [-77, -12],
      [-74, -9],
    ]);
  });
  it("has no focus without geometry", () => {
    expect(areaBounds({ type: "FeatureCollection", features: [] })).toBeNull();
  });
});
