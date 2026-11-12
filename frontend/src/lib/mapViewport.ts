export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};
export type MapViewport = MapBounds & { zoom: number };
export type MapGridSetting = "auto" | "500" | "1000" | "10000";
export const formatMapDistance = (metres: number) =>
  metres < 1000 ? `${metres} m` : `${metres / 1000} km`;
export const mapGridSize = (zoom: number, setting: MapGridSetting) =>
  setting === "auto"
    ? zoom >= 9
      ? 500
      : zoom >= 7
        ? 1000
        : 10000
    : Number(setting);
export function peruBounds(view: MapBounds, padding = 0): MapBounds | null {
  if (
    ![view.west, view.south, view.east, view.north].every(Number.isFinite) ||
    view.west >= view.east ||
    view.south >= view.north
  )
    return null;
  const dx = (view.east - view.west) * padding,
    dy = (view.north - view.south) * padding;
  const bounds = {
    west: Math.max(-82, view.west - dx),
    east: Math.min(-68, view.east + dx),
    south: Math.max(-19, view.south - dy),
    north: Math.min(1, view.north + dy),
  };
  return bounds.west < bounds.east && bounds.south < bounds.north
    ? bounds
    : null;
}
export const containsViewport = (outer: MapBounds, inner: MapBounds) =>
  outer.west <= inner.west &&
  outer.east >= inner.east &&
  outer.south <= inner.south &&
  outer.north >= inner.north;
