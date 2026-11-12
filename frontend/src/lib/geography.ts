import type { AreaFeatureCollection } from "./api";

// Geographic envelope of a north-up, unpitched Mercator camera. This reproduces
// the initial national framing without moving the user's current camera.
export function cameraBounds(
  center: { lng: number; lat: number },
  zoom: number,
  width: number,
  height: number,
): [[number, number], [number, number]] {
  const world = 512 * 2 ** zoom;
  const y =
    0.5 -
    Math.log(Math.tan(Math.PI / 4 + (center.lat * Math.PI) / 360)) /
      (2 * Math.PI);
  const latitude = (value: number) =>
    (Math.atan(Math.sinh(Math.PI * (1 - 2 * Math.max(0, Math.min(1, value))))) *
      180) /
    Math.PI;
  const halfLongitude = (width * 180) / world;
  return [
    [
      Math.max(-180, center.lng - halfLongitude),
      latitude(y + height / 2 / world),
    ],
    [
      Math.min(180, center.lng + halfLongitude),
      latitude(y - height / 2 / world),
    ],
  ];
}

export function areaBounds(
  data: AreaFeatureCollection,
): [[number, number], [number, number]] | null {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  const visit = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return;
    if (
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number"
    ) {
      const [lng, lat] = coordinates as number[];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      west = Math.min(west, lng);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      north = Math.max(north, lat);
    } else coordinates.forEach(visit);
  };
  data.features.forEach((feature) => visit(feature.geometry.coordinates));
  return Number.isFinite(west)
    ? [
        [west, south],
        [east, north],
      ]
    : null;
}
