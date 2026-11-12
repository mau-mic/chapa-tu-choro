"""Read official ArcGIS snapshots and persist only district totals and 1km grid counts.

One authoritative source per year/category. No union of 2026 archives, no public
incident storage, no inferred coordinate replacements. CLI and Lambda share run().
"""

import argparse
from collections import Counter
from dataclasses import dataclass
from datetime import date
import hashlib
import json
import logging
import os
import math
import time
import urllib.error
import urllib.parse
import urllib.request

from .tracking import TrackingRun, TrackingError
from .common import connect, ubigeo

BASE = "https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/"
# The codes are the public viewer's predicates, not inferred CSV label mappings.
CATEGORIES = {
    "homicide": (
        "Homicidio",
        {
            1010124,
            1010108,
            1010123,
            1010125,
            1010101,
            1010126,
            1010129,
            1010103,
            1010102,
            1010128,
        },
    ),
    "extortion": ("Extorsión", {1050803, 1050804}),
    "theft": (
        "Hurto",
        {
            1050107,
            1050101,
            1050119,
            1050122,
            1050121,
            1050103,
            1050104,
            1050109,
            1050106,
        },
    ),
    "robbery": (
        "Robo",
        {1050201, 1050215, 1050204, 1050209, 1050203, 1050205, 1050207, 1050217},
    ),
    "fraud": ("Estafa", {1050601, 1050609, 1050602}),
    "violence": (
        "Violencia contra la mujer",
        {5040202, 5040201, 5040204, 5040205, 5040124, 5040125},
    ),
    "gangs": (
        "Pandillaje",
        {4010101, 4010102, 4010103, 4010104, 4010105, 4010106, 4010107},
    ),
    "drugs": ("Microcomercialización de drogas", {1120341, 5070112, 5070122}),
}
ARCHIVES = {
    "homicide": ("HOMICIDIO_IDMODALIDAD_1010102_AL_1010130", 2),
    "extortion": ("EXTORSION_IDSUBTIPO_10508", 1),
    "theft": ("HURTO_IDSUBTIPO_10501", 2),
    "robbery": ("ROBO_IDSUBTIPO_10502", 3),
    "fraud": ("ESTAFA_IDSUBTIPO_10506", 4),
    "violence": ("VCM_IDTIPO_504", 0),
    "gangs": ("PANDILLAJE_IDSUBTIPO_40101", 6),
    "drugs": ("MICROCOMERCIALIZACION_IDMODALIDAD_1120341_5070112_5070122", 1),
}
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Source:
    key: str
    url: str
    year: int
    category: str | None

    @property
    def allows_missing_business_id(self):
        # A reviewed schema exception, never an OBJECTID-to-case-ID substitution.
        return self == Source(
            "archive-2025-extortion",
            BASE + "EXTORSION_IDSUBTIPO_10508/FeatureServer/1",
            2025,
            "extortion",
        )


class SourceValidationError(ValueError):
    """Only fixed, safe validation messages may be exposed in job output."""


class ConcentrationImportError(RuntimeError):
    def __init__(self, source, month, stage, cause, run_id=None):
        self.details = {
            "status": "failed",
            "source": source.key,
            "year": source.year,
            "month": month,
            "stage": stage,
            "errorType": type(cause).__name__,
            "reason": (
                str(cause)
                if isinstance(cause, (SourceValidationError, TrackingError))
                else (
                    "Source request failed; retry later"
                    if stage == "extract"
                    else "Database load failed; check schema migrations and connectivity"
                )
            ),
        }
        if run_id is not None:
            self.details["run_id"] = run_id
        super().__init__(json.dumps(self.details))


def select_sources(year, category=None, today=None):
    today = today or date.today()
    if year not in (today.year - 1, today.year):
        raise SourceValidationError("Only current and previous years can be imported")
    # Explicit verified snapshots: never relabel a future provider release automatically.
    if year == 2026:
        if category not in (None, "all"):
            raise SourceValidationError(
                "The 2026 snapshot derives all category filters together"
            )
        return [
            Source(
                "active-2026",
                BASE + "SIDPOL_DELITOS_TOTAL/FeatureServer/25",
                2026,
                None,
            )
        ]
    if year == 2025:
        if category == "all":
            raise SourceValidationError(
                "2025 has category archives, not a verified combined total"
            )
        keys = [category] if category else list(ARCHIVES)
        if any(key not in ARCHIVES for key in keys):
            raise SourceValidationError("Unknown category")
        return [
            Source(
                "archive-2025-" + key,
                BASE + ARCHIVES[key][0] + "/FeatureServer/" + str(ARCHIVES[key][1]),
                2025,
                key,
            )
            for key in keys
        ]
    raise SourceValidationError(
        "No verified source registry for requested year; review provider publication"
    )


def request(url, params):
    # Fixed trusted tenant and source paths only; disable redirects, no arbitrary URLs.
    if not url.startswith(BASE) or not any(
        url == s.url for year in (2025, 2026) for s in registry_sources(year)
    ):
        raise SourceValidationError("Untrusted concentration source")
    query_url = url + ("/query" if params.get("_query") else "")
    params = {k: v for k, v in params.items() if k != "_query"}

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            raise SourceValidationError("Source redirect refused")

    for attempt in range(3):
        try:
            req = urllib.request.Request(
                query_url + "?" + urllib.parse.urlencode({"f": "json", **params}),
                headers={"User-Agent": "ChapaTuChoro-source-import/1.0"},
            )
            with urllib.request.build_opener(NoRedirect).open(
                req, timeout=30
            ) as response:
                body = response.read(4_000_001)
            if len(body) > 4_000_000:
                raise SourceValidationError("Source response exceeds size limit")
            value = json.loads(body)
            if not isinstance(value, dict) or "error" in value:
                raise SourceValidationError("Official source query failed")
            return value
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2:
                raise
        time.sleep(2**attempt)


def registry_sources(year):
    if year == 2026:
        return [
            Source(
                "active-2026",
                BASE + "SIDPOL_DELITOS_TOTAL/FeatureServer/25",
                2026,
                None,
            )
        ]
    return [
        Source(
            "archive-2025-" + k, BASE + v[0] + "/FeatureServer/" + str(v[1]), 2025, k
        )
        for k, v in ARCHIVES.items()
    ]


def integer(value):
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or int(value) != value
    ):
        raise SourceValidationError("Invalid numeric source identifier")
    return int(value)


def normalize(feature, fields, source, month):
    p = feature.get("properties")
    if feature.get("type") != "Feature" or not isinstance(p, dict):
        raise SourceValidationError("Invalid source feature")

    def attr(key):
        return p.get(fields.get(key, ""))

    oid = integer(attr("objectid"))
    if "id_dgc" not in fields and source.allows_missing_business_id:
        business = None
    else:
        business = integer(attr("id_dgc"))
    if integer(attr("año_hecho")) != source.year or integer(attr("mes_hecho")) != month:
        raise SourceValidationError("Source returned a different requested period")
    categories = (
        (
            [source.category]
            if attr("id_modalidad_hecho") in CATEGORIES[source.category][1]
            else []
        )
        if source.category
        else ["all"]
        + [
            k
            for k, (_, codes) in CATEGORIES.items()
            if attr("id_modalidad_hecho") in codes
        ]
    )
    reason = None if categories else "outside_category_predicate"
    code = None
    try:
        code = ubigeo(attr("id_dist_hecho") or attr("ubigeo_hecho_delito"))
        other = attr("ubigeo_hecho_delito")
        if (
            code[:2] == "00"
            or code[2:4] == "00"
            or code[4:] == "00"
            or other not in (None, "", 0)
            and ubigeo(other) != code
        ):
            raise SourceValidationError("Inconsistent UBIGEO")
    except ValueError:
        reason = "invalid_ubigeo"
        code = None
    g = feature.get("geometry") or {}
    coords = g.get("coordinates")
    lon = lat = 0.0
    if (
        g.get("type") != "Point"
        or not isinstance(coords, list)
        or len(coords) != 2
        or any(
            isinstance(v, bool)
            or not isinstance(v, (int, float))
            or not math.isfinite(v)
            for v in coords
        )
    ):
        reason = reason or "missing_or_invalid_geometry"
    else:
        lon, lat = coords
        if not (-82 <= lon <= -68 and -19 <= lat <= 1) or lon == 0 or lat == 0:
            reason = reason or "invalid_coordinates"
        elif (
            any(
                not isinstance(attr(k), (int, float)) or not math.isfinite(attr(k))
                for k in ("long_hecho", "lat_hecho")
            )
            or abs(lon - attr("long_hecho")) > 1e-5
            or abs(lat - attr("lat_hecho")) > 1e-5
        ):
            reason = reason or "coordinate_mismatch"
    status = attr("estado_coord")
    if "estado_coord" in fields and status != "CON COORDENADA":
        reason = reason or "unlocated_or_unknown_status"
    # Unknown numeric estado is preserved as a quality count, never interpreted as precise.
    return (
        (oid, business, code, lon, lat, reason is None, categories),
        reason,
        str(attr("estado") if "estado" in fields else status),
    )


def extract(source, month):
    metadata = request(source.url, {})
    if metadata.get("geometryType") != "esriGeometryPoint":
        raise SourceValidationError("Source geometry schema changed")
    names = {f["name"].lower(): f["name"] for f in metadata.get("fields", [])}
    required = {
        "objectid",
        "id_dgc",
        "año_hecho",
        "mes_hecho",
        "lat_hecho",
        "long_hecho",
        "id_modalidad_hecho",
    }
    if source.allows_missing_business_id:
        required.remove("id_dgc")
    if (
        not required <= names.keys()
        or not {"id_dist_hecho", "ubigeo_hecho_delito"} & names.keys()
        or not source.category
        and "id_modalidad_hecho" not in names
    ):
        missing = sorted(required - names.keys())
        raise SourceValidationError(
            "Source field schema changed; missing: "
            + (", ".join(missing) if missing else "district UBIGEO field")
        )
    where = f"{names['año_hecho']} = {source.year} AND {names['mes_hecho']} = {month}"
    params = {"_query": True, "where": where}
    count = request(source.url, {**params, "returnCountOnly": "true"})["count"]
    # Distinguish source-wide missing period from a real selected-category zero.
    if count == 0:
        return None
    if count > 250000:
        raise SourceValidationError("Monthly source exceeds bounded import limit")
    selected = [
        names[k]
        for k in names
        if k
        in required
        | {
            "id_dgc",
            "id_dist_hecho",
            "ubigeo_hecho_delito",
            "id_modalidad_hecho",
            "estado",
            "estado_coord",
        }
    ]
    rows = []
    seen = set()
    rejected = Counter()
    states = Counter()
    offset = 0
    for _ in range(300):
        page = request(
            source.url,
            {
                **params,
                "f": "geojson",
                "outFields": ",".join(selected),
                "returnGeometry": "true",
                "outSR": "4326",
                "orderByFields": names["objectid"],
                "resultOffset": offset,
                "resultRecordCount": 1000,
            },
        )
        if page.get("type") != "FeatureCollection" or not isinstance(
            page.get("features"), list
        ):
            raise SourceValidationError("Invalid source collection")
        features = page["features"]
        for feature in features:
            row, reason, state = normalize(feature, names, source, month)
            if row[0] in seen:
                raise SourceValidationError(
                    "Repeated row ID while paging; incomplete snapshot refused"
                )
            seen.add(row[0])
            rows.append(row)
            states[state] += 1
            if reason:
                rejected[reason] += 1
        offset += len(features)
        more = (
            page.get("exceededTransferLimit") is True
            or page.get("properties", {}).get("exceededTransferLimit") is True
        )
        if not more:
            break
        if not features:
            raise SourceValidationError("Non-advancing source page")
    else:
        raise SourceValidationError("Pagination limit exceeded")
    after = request(source.url, {})
    after_count = request(source.url, {**params, "returnCountOnly": "true"})["count"]
    if (
        len(rows) != count
        or after_count != count
        or metadata.get("editingInfo") != after.get("editingInfo")
    ):
        raise SourceValidationError("Source changed or was truncated during extraction")
    quality = {
        "rejected": dict(rejected),
        "providerStates": dict(states),
        "coordinatePrecision": "undeclared",
        "sourceEditInfo": metadata.get("editingInfo"),
        "normalizationVersion": "concentration-v1",
    }
    if "id_dgc" not in names:
        quality["businessIdentifierField"] = None
        quality["distinctBusinessIdentifiersAvailable"] = False
    digest = hashlib.sha256(
        json.dumps(
            {"rows": rows, "quality": quality},
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode()
    ).hexdigest()
    return rows, digest, quality


def load(source, month, extracted, tracking=None):
    rows, digest, quality = extracted
    categories = [source.category] if source.category else ["all", *CATEGORIES]
    with connect() as db:
        with db.transaction():
            db.execute("SET LOCAL statement_timeout='180s'")
            db.execute("SET LOCAL lock_timeout='15s'")
            db.execute("SELECT pg_advisory_xact_lock(17294002)")
            if not db.execute(
                "SELECT EXISTS(SELECT 1 FROM district_boundaries)"
            ).fetchone()[0]:
                raise SourceValidationError(
                    "Import INEI districts before concentration data"
                )
            boundaries = db.execute(
                "SELECT COALESCE(string_agg(sha256,',' ORDER BY id),'manual-boundaries') FROM import_runs WHERE source_kind IN ('inei','inei-departments')"
            ).fetchone()[0]
            digest = hashlib.sha256(
                (digest + "|" + boundaries + "|locations-v1").encode()
            ).hexdigest()
            previous = db.execute(
                "SELECT sha256 FROM concentration_imports WHERE source_key=%s AND year=%s AND month=%s",
                (source.key, source.year, month),
            ).fetchone()
            if previous and previous[0] == digest:
                result = {
                    "status": "unchanged",
                    "sha256": digest,
                    "source": source.key,
                    "year": source.year,
                    "month": month,
                }
                if tracking:
                    tracking.complete(db, {source.key: result})
                return result
            db.execute(
                "CREATE TEMP TABLE concentration_stage(oid bigint PRIMARY KEY,business bigint,ubigeo text,lon double precision,lat double precision,eligible boolean,categories text[]) ON COMMIT DROP"
            )
            with db.cursor().copy("COPY concentration_stage FROM STDIN") as copy:
                for row in rows:
                    copy.write_row(row)
            db.execute("""CREATE TEMP TABLE concentration_checked ON COMMIT DROP AS
    SELECT s.*, d.ubigeo IS NOT NULL AS has_boundary,
      CASE WHEN s.eligible AND d.ubigeo IS NOT NULL THEN ST_Covers(d.geom,ST_SetSRID(ST_MakePoint(s.lon,s.lat),4326)) ELSE false END AS mapped
    FROM concentration_stage s LEFT JOIN district_boundaries d ON d.ubigeo=s.ubigeo""")
            missing, outside = db.execute(
                "SELECT COUNT(*) FILTER(WHERE eligible AND NOT has_boundary),COUNT(*) FILTER(WHERE eligible AND has_boundary AND NOT mapped) FROM concentration_checked"
            ).fetchone()
            quality = {
                **quality,
                "missingBoundary": missing,
                "outsideDeclaredDistrict": outside,
                "gridSizeMetres": 1000,
                "locationStorageVersion": 1,
            }
            record_id = db.execute(
                """INSERT INTO concentration_imports(source_key,year,month,source_url,sha256,source_rows,distinct_source_ids,quality)
    VALUES(%s,%s,%s,%s,%s,%s,%s,%s::jsonb) ON CONFLICT(source_key,year,month) DO UPDATE SET source_url=EXCLUDED.source_url,sha256=EXCLUDED.sha256,source_rows=EXCLUDED.source_rows,distinct_source_ids=EXCLUDED.distinct_source_ids,quality=EXCLUDED.quality,imported_at=NOW() RETURNING id""",
                (
                    source.key,
                    source.year,
                    month,
                    source.url,
                    digest,
                    len(rows),
                    (
                        len({r[1] for r in rows})
                        if all(r[1] is not None for r in rows)
                        else None
                    ),
                    json.dumps(quality),
                ),
            ).fetchone()[0]
            # Replace only this source/month's aggregates atomically, never statistical tables.
            db.execute(
                "DELETE FROM concentration_series WHERE import_id=%s", (record_id,)
            )
            for category in categories:
                db.execute(
                    "INSERT INTO concentration_series VALUES(%s,%s)",
                    (record_id, category),
                )
            db.execute(
                """INSERT INTO concentration_areas
    SELECT %s,c.category,s.ubigeo,COUNT(*),COUNT(*) FILTER(WHERE mapped)
    FROM concentration_checked s CROSS JOIN LATERAL unnest(s.categories) c(category)
    WHERE s.ubigeo IS NOT NULL GROUP BY c.category,s.ubigeo""",
                (record_id,),
            )
            db.execute(
                """INSERT INTO concentration_cells
    SELECT %s,category,ubigeo,gx,gy,COUNT(*) FROM (
     SELECT c.category,s.ubigeo,FLOOR(ST_X(p.geom)/1000)::int gx,FLOOR(ST_Y(p.geom)/1000)::int gy
     FROM concentration_checked s CROSS JOIN LATERAL unnest(s.categories) c(category)
     CROSS JOIN LATERAL (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(s.lon,s.lat),4326),3857) geom) p
     WHERE s.mapped) cells GROUP BY category,ubigeo,gx,gy""",
                (record_id,),
            )
            db.execute(
                """INSERT INTO concentration_locations(import_id,category,ubigeo,longitude,latitude,records)
    SELECT %s,c.category,s.ubigeo,s.lon,s.lat,COUNT(*)
    FROM concentration_checked s CROSS JOIN LATERAL unnest(s.categories) c(category)
    WHERE s.mapped GROUP BY c.category,s.ubigeo,s.lon,s.lat""",
                (record_id,),
            )
            mapped = db.execute(
                "SELECT COUNT(*) FROM concentration_checked WHERE mapped AND cardinality(categories)>0"
            ).fetchone()[0]
            result = {
                "status": "imported",
                "sha256": digest,
                "source": source.key,
                "year": source.year,
                "month": month,
                "sourceRows": len(rows),
                "mappedRows": mapped,
                "quality": quality,
            }
            if tracking:
                tracking.complete(db, {source.key: result})
    return result


def run(year=None, month=None, category=None, *, today=None):
    today = today or date.today()
    year = year or today.year
    if month is not None and month not in range(1, 13):
        raise SourceValidationError("Invalid month")
    results = []
    for source in select_sources(year, category, today=today):
        for selected_month in ([month] if month else range(1, 13)):
            stage = "extract"
            tracking = TrackingRun("concentration", [source.key], year, selected_month)
            try:
                with tracking as tracking:
                    tracking.stage("extract")
                    extracted = extract(source, selected_month)
                    if extracted:
                        stage = "load"
                        tracking.stage("load")
                        result = load(source, selected_month, extracted, tracking=tracking)
                    else:
                        result = {"status": "unavailable", "source": source.key,
                                  "year": year, "month": selected_month}
                        tracking.finish({source.key: result})
                    result["run_id"] = tracking.id
            except Exception as exc:
                raise ConcentrationImportError(
                    source, selected_month, stage, exc,
                    tracking.id if isinstance(tracking.id, str) else None
                ) from None
            results.append(result)
            logger.info(json.dumps({"event": "concentration_import", **result}))
    return {"results": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--year",
        type=int,
        default=int(os.getenv("CONCENTRATION_YEAR") or date.today().year),
    )
    parser.add_argument(
        "--month", type=int, default=int(os.getenv("CONCENTRATION_MONTH") or 0) or None
    )
    parser.add_argument(
        "--category",
        choices=["all", *CATEGORIES],
        default=os.getenv("CONCENTRATION_CATEGORY") or None,
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        print(json.dumps(run(args.year, args.month, args.category)))
    except Exception as exc:
        parser.exit(
            1,
            json.dumps(
                exc.details
                if isinstance(exc, ConcentrationImportError)
                else {
                    "status": "failed",
                    "errorType": type(exc).__name__,
                    "reason": (
                        str(exc)
                        if isinstance(exc, SourceValidationError)
                        else "Check import configuration"
                    ),
                }
            )
            + "\n",
        )


if __name__ == "__main__":
    main()
