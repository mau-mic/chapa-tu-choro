import type { FeatureCollection, Point } from "geojson";
export const policeStationSource = {
  service:
    "https://geomininter.mininter.gob.pe/arcgis/rest/services/ogc/lineabase/MapServer/2",
  catalogue:
    "https://geoportal.mininter.gob.pe/index.php/servicios/catalogo-de-servicios",
  discovery:
    "https://www.geoidep.gob.pe/catalogo-nacional-de-servicios-web?id_institucion=81",
  terms: "https://www.geoidep.gob.pe/static/docs/terminos_condiciones.pdf",
  attribution: "MININTER / PNP · GEOIDEP–GEOPERÚ",
};
export interface StationProperties {
  id: string;
  name: string;
  department: string;
  province: string;
  district: string;
}
export type StationCollection = FeatureCollection<Point, StationProperties>;
export interface StationSnapshot {
  data: StationCollection;
  fetchedAt: string;
}
let cached: { snapshot: StationSnapshot; expires: number } | null = null;
const pageSize = 1000;
const maxPages = 5;
function parsePage(raw: unknown): StationCollection["features"] {
  const collection = raw as {
    type?: string;
    features?: unknown[];
    exceededTransferLimit?: boolean;
  };
  if (
    !collection ||
    collection.type !== "FeatureCollection" ||
    !Array.isArray(collection.features) ||
    collection.features.length > pageSize
  )
    throw new Error("La fuente no devolvió una colección GeoJSON válida.");
  return collection.features.map((item) => {
    const feature = item as {
      type?: string;
      geometry?: { type?: string; coordinates?: unknown[] };
      properties?: Record<string, unknown>;
    };
    const p = feature?.properties,
      coordinates = feature?.geometry?.coordinates;
    if (
      feature?.type !== "Feature" ||
      feature.geometry?.type !== "Point" ||
      !Array.isArray(coordinates) ||
      coordinates.length !== 2 ||
      !coordinates.every(
        (value) => typeof value === "number" && Number.isFinite(value),
      ) ||
      Math.abs(coordinates[0] as number) > 180 ||
      Math.abs(coordinates[1] as number) > 90 ||
      !p ||
      !Number.isSafeInteger(p.objectid) ||
      typeof p.comisaria !== "string" ||
      !p.comisaria.trim() ||
      typeof p.id_dpto !== "string" ||
      !/^[0-9]{2}$/.test(p.id_dpto) ||
      typeof p.id_prov !== "string" ||
      !/^[0-9]{4}$/.test(p.id_prov) ||
      typeof p.id_dist !== "string" ||
      !/^[0-9]{6}$/.test(p.id_dist) ||
      !p.id_dist.startsWith(p.id_prov) ||
      !p.id_prov.startsWith(p.id_dpto)
    )
      throw new Error(
        "La fuente contiene ubicaciones o identificadores incompatibles.",
      );
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: coordinates as number[] },
      properties: {
        id: String(p.objectid),
        name: p.comisaria.trim(),
        department: p.id_dpto,
        province: p.id_prov,
        district: p.id_dist,
      },
    };
  });
}
export async function loadPoliceStations(
  signal: AbortSignal,
): Promise<StationSnapshot> {
  if (cached && cached.expires > Date.now()) return cached.snapshot;
  const features: StationCollection["features"] = [],
    ids = new Set<string>();
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const query = new URLSearchParams({
      f: "geojson",
      where: "1=1",
      outFields: "objectid,comisaria,id_dpto,id_prov,id_dist",
      outSR: "4326",
      returnGeometry: "true",
      orderByFields: "objectid",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    });
    const response = await fetch(
      `${policeStationSource.service}/query?${query}`,
      { signal, credentials: "omit", referrerPolicy: "no-referrer" },
    );
    if (!response.ok)
      throw new Error("El servicio oficial de comisarías no está disponible.");
    const body = await response.text();
    if (body.length > 2_000_000)
      throw new Error("La respuesta de comisarías supera el límite permitido.");
    const raw = JSON.parse(body) as {
      exceededTransferLimit?: boolean;
      properties?: { exceededTransferLimit?: boolean };
    };
    const records = parsePage(raw);
    for (const record of records) {
      if (ids.has(record.properties.id))
        throw new Error("La fuente repitió registros durante la paginación.");
      ids.add(record.properties.id);
      features.push(record);
    }
    const more =
      raw.exceededTransferLimit === true ||
      raw.properties?.exceededTransferLimit === true;
    if (records.length < pageSize && !more) {
      const snapshot: StationSnapshot = {
        data: { type: "FeatureCollection", features },
        fetchedAt: new Date().toISOString(),
      };
      if (!signal.aborted)
        cached = { snapshot, expires: Date.now() + 15 * 60_000 };
      return snapshot;
    }
    if (records.length === 0)
      throw new Error("La fuente no pudo completar la paginación.");
    offset += records.length;
  }
  throw new Error(
    "La capa supera el límite de esta prueba; no se muestran datos parciales.",
  );
}
export function scopeStations(
  data: StationCollection,
  department: string,
  province: string,
  district: string,
): StationCollection {
  const prefix = district || province || department;
  return {
    type: "FeatureCollection",
    features: data.features.filter((feature) =>
      feature.properties.district.startsWith(prefix),
    ),
  };
}
