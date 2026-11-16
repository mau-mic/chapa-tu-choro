using ChapaTuChoro.Application.Concentration;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Domain.Reports;
using Npgsql;
using NpgsqlTypes;

namespace ChapaTuChoro.Infrastructure.Persistence;

public sealed class ConcentrationReadRepository(NpgsqlDataSource source) : IConcentrationReadRepository
{
    // Never union archives and active-year features or manufacture an all-archive total.
    internal const string Authority = "((i.year=2026 AND i.source_key='active-2026') OR (i.year=2025 AND s.category<>'all' AND i.source_key='archive-2025-'||s.category))";
    public async Task<ConcentrationMetadata> MetadataAsync(CancellationToken ct)
    {
        await using var db = await source.OpenConnectionAsync(ct);
        await using (var ready = new NpgsqlCommand("SELECT to_regclass('concentration_imports') IS NOT NULL", db))
            if (!(bool)(await ready.ExecuteScalarAsync(ct))!) return new(true, []);
        var result = new List<ConcentrationOption>();
        await using var command = new NpgsqlCommand($"SELECT i.year,i.month,s.category,i.source_url,i.imported_at FROM concentration_imports i JOIN concentration_series s ON s.import_id=i.id WHERE {Authority} ORDER BY i.year DESC,i.month DESC,s.category", db) { CommandTimeout = 20 };
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            if (ConcentrationPolicy.Categories.TryGetValue(reader.GetString(2), out var label)) result.Add(new(reader.GetInt16(0), reader.GetInt16(1), reader.GetString(2), label, reader.GetString(3), reader.GetFieldValue<DateTimeOffset>(4)));
        return new(false, result);
    }
    public async Task<ConcentrationSnapshot?> GetAsync(ConcentrationQuery q, CancellationToken ct)
    {
        await using var db = await source.OpenConnectionAsync(ct);
        await using var tx = await db.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        long importId = 0;
        NpgsqlCommand Query(string sql)
        {
            var cmd = new NpgsqlCommand(sql, db, tx) { CommandTimeout = 30 };
            cmd.Parameters.AddWithValue("importId", importId);
            cmd.Parameters.AddWithValue("year", q.Year); cmd.Parameters.AddWithValue("month", q.Month); cmd.Parameters.AddWithValue("category", q.Category);
            cmd.Parameters.AddWithValue("prefix", q.District ?? q.Province ?? q.Department ?? "");
            cmd.Parameters.Add("department", NpgsqlDbType.Text).Value = (object?)q.Department ?? DBNull.Value;
            cmd.Parameters.Add("province", NpgsqlDbType.Text).Value = (object?)q.Province ?? DBNull.Value;
            return cmd;
        }
        var options = await GeographicOptionsReader.ReadAsync(Query, q.Department, ct);
        if (GeographicFilter.ValidateAvailable(q.Department, q.Province, q.District, options.Departments, options.Provinces, options.Districts) is not null) return null;
        string url; DateTimeOffset imported; SnapshotQuality quality;
        await using (var cmd = Query($"SELECT i.id,i.source_url,i.imported_at,i.source_rows,i.distinct_source_ids,i.quality::text FROM concentration_imports i JOIN concentration_series s ON s.import_id=i.id WHERE {Authority} AND i.year=@year AND i.month=@month AND s.category=@category"))
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
        { if (!await reader.ReadAsync(ct)) return null; importId = reader.GetInt64(0); url = reader.GetString(1); imported = reader.GetFieldValue<DateTimeOffset>(2); using var checks = System.Text.Json.JsonDocument.Parse(reader.GetString(5)); quality = new(reader.GetInt64(3), reader.IsDBNull(4) ? null : reader.GetInt64(4), checks.RootElement.Clone()); }
        var areas = new List<ConcentrationArea>(); long total = 0, mapped = 0;
        // Join only aggregate territory/period context; no identity joins or denominator claims.
        var code = q.Department is null ? "LEFT(a.ubigeo,2)" : q.Province is null && q.District is null ? "LEFT(a.ubigeo,4)" : "a.ubigeo";
        await using (var cmd = Query($"""
          WITH geo AS (SELECT {code} code,SUM(a.source_records)::bigint source_records,SUM(a.mapped_records)::bigint mapped_records
            FROM concentration_areas a WHERE a.import_id=@importId AND a.category=@category AND a.ubigeo LIKE @prefix||'%' GROUP BY {code}),
          counts AS (SELECT {code.Replace("a.ubigeo", "r.ubigeo")} code,SUM(r.reports)::bigint reports FROM monthly_reports r
            WHERE r.year=@year AND r.month=@month AND r.ubigeo LIKE @prefix||'%' GROUP BY {code.Replace("a.ubigeo", "r.ubigeo")})
          SELECT geo.code,COALESCE(d.department,b.district,geo.code),source_records,mapped_records,counts.reports
          FROM geo LEFT JOIN department_boundaries d ON d.ubigeo=geo.code LEFT JOIN district_boundaries b ON b.ubigeo=geo.code
          LEFT JOIN counts USING(code) ORDER BY mapped_records DESC,geo.code
          """))
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) { var a = new ConcentrationArea(reader.GetString(0), reader.GetString(1), reader.GetInt64(2), reader.GetInt64(3), reader.IsDBNull(4) ? null : reader.GetInt64(4)); areas.Add(a); total += a.SourceRecords; mapped += a.MappedRecords; }
        var cells = new List<DensityCell>();
        var spatial = quality.IngestionChecks.TryGetProperty("locationStorageVersion", out var version) && version.GetInt32() == 1;
        var gridMetres = q.Department is null ? 10000 : spatial ? 500 : 1000;
        var factor = q.Department is null ? 10 : 1;
        var cellSql = spatial ? $"""
          WITH points AS (SELECT longitude,latitude,records,ST_Transform(position::geometry,3857) p
            FROM concentration_locations WHERE import_id=@importId AND category=@category AND ubigeo LIKE @prefix||'%'),
          groups AS (SELECT FLOOR(ST_X(p)/{gridMetres})::int gx,FLOOR(ST_Y(p)/{gridMetres})::int gy,
            SUM(records)::bigint n,SUM(ST_X(p)*records)/SUM(records) x,SUM(ST_Y(p)*records)/SUM(records) y
            FROM points GROUP BY gx,gy HAVING SUM(records)>={ConcentrationPolicy.MinimumCellRecords})
          SELECT gx,gy,n,ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(ROUND(x/100)*100,ROUND(y/100)*100),3857),4326)),
            ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(ROUND(x/100)*100,ROUND(y/100)*100),3857),4326))
          FROM groups ORDER BY gx,gy
          """ : $"""

          SELECT gx,gy,SUM(records)::bigint,ST_X(ST_Transform(ST_SetSRID(ST_MakePoint((gx+0.5)*{factor * 1000},(gy+0.5)*{factor * 1000}),3857),4326)),
            ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint((gx+0.5)*{factor * 1000},(gy+0.5)*{factor * 1000}),3857),4326))
          FROM (SELECT FLOOR(grid_x::numeric/{factor})::int gx,FLOOR(grid_y::numeric/{factor})::int gy,records
           FROM concentration_cells WHERE import_id=@importId AND category=@category AND ubigeo LIKE @prefix||'%') x
          GROUP BY gx,gy HAVING SUM(records)>={ConcentrationPolicy.MinimumCellRecords} ORDER BY gx,gy
          """;
        await using (var cmd = Query(cellSql))
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) cells.Add(new($"{reader.GetInt32(0)}/{reader.GetInt32(1)}", reader.GetDouble(3), reader.GetDouble(4), reader.GetInt64(2)));
        var monthly = new List<MonthlyTrendDto>();
        await using (var cmd = Query($"""
          SELECT i.month,SUM(a.mapped_records)::bigint FROM concentration_imports i JOIN concentration_series s ON s.import_id=i.id
          LEFT JOIN concentration_areas a ON a.import_id=i.id AND a.category=s.category AND a.ubigeo LIKE @prefix||'%'
          WHERE {Authority} AND i.year=@year AND s.category=@category GROUP BY i.month ORDER BY i.month
          """))
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) monthly.Add(new(new(q.Year, reader.GetInt16(0)), reader.IsDBNull(1) ? 0 : reader.GetInt64(1)));
        await tx.CommitAsync(ct);
        return new(new(q.Year, q.Month, q.Category, ConcentrationPolicy.Categories[q.Category], url, imported), total, mapped, cells.Sum(c => c.Records), cells, areas, monthly,
            gridMetres, ConcentrationPolicy.MinimumCellRecords, "source-classification-rows",
            "SIDPOL se une solo por territorio y mes, sumando todas sus modalidades. Es contexto independiente: no se suma a la concentración ni se calcula una tasa de cobertura, causalidad o riesgo. Las fuentes pueden representar fechas y clasificaciones diferentes.", quality, spatial);
    }
}
