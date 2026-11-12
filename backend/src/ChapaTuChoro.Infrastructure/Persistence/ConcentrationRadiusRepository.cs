using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Concentration;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Domain.Reports;
using Npgsql;
using NpgsqlTypes;
using System.Text.Json;

namespace ChapaTuChoro.Infrastructure.Persistence;

public sealed class ConcentrationRadiusRepository(NpgsqlDataSource source) : IConcentrationRadiusRepository
{
    public async Task<Result<RadiusSnapshot>> CountAsync(RadiusQuery query, CancellationToken ct)
    {
        var q = query.Selection;
        await using var db = await source.OpenConnectionAsync(ct);
        await using var tx = await db.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        NpgsqlCommand Command(string sql)
        {
            var cmd = new NpgsqlCommand(sql, db, tx) { CommandTimeout = 20 };
            cmd.Parameters.AddWithValue("year", q.Year); cmd.Parameters.AddWithValue("month", q.Month);
            cmd.Parameters.AddWithValue("category", q.Category);
            cmd.Parameters.AddWithValue("prefix", q.District ?? q.Province ?? q.Department ?? "");
            cmd.Parameters.Add("department", NpgsqlDbType.Text).Value = (object?)q.Department ?? DBNull.Value;
            cmd.Parameters.Add("province", NpgsqlDbType.Text).Value = (object?)q.Province ?? DBNull.Value;
            cmd.Parameters.AddWithValue("lon", query.Longitude); cmd.Parameters.AddWithValue("lat", query.Latitude);
            cmd.Parameters.AddWithValue("radius", query.RadiusMetres);
            return cmd;
        }
        var options = await GeographicOptionsReader.ReadAsync(Command, q.Department, ct);
        var error = GeographicFilter.ValidateAvailable(q.Department, q.Province, q.District, options.Departments, options.Provinces, options.Districts);
        if (error is not null) return Result<RadiusSnapshot>.Failure(error);
        await using (var ready = Command("SELECT to_regclass('concentration_locations') IS NOT NULL"))
            if (!(bool)(await ready.ExecuteScalarAsync(ct))!) return Missing();
        long importId; string url; DateTimeOffset imported;
        await using (var cmd = Command($"SELECT i.id,i.source_url,i.imported_at,COALESCE(i.quality->>'locationStorageVersion','') FROM concentration_imports i JOIN concentration_series s ON s.import_id=i.id WHERE {ConcentrationReadRepository.Authority} AND i.year=@year AND i.month=@month AND s.category=@category"))
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
        {
            if (!await reader.ReadAsync(ct) || reader.GetString(3) != "1") return Missing();
            importId = reader.GetInt64(0); url = reader.GetString(1); imported = reader.GetFieldValue<DateTimeOffset>(2);
        }
        long count; JsonElement area;
        await using (var cmd = Command("""
          WITH center AS (SELECT ST_SetSRID(ST_MakePoint(@lon,@lat),4326)::geography AS p)
          SELECT (SELECT COALESCE(SUM(l.records),0)::bigint FROM concentration_locations l
              WHERE l.import_id=@id AND l.category=@category AND l.ubigeo LIKE @prefix||'%'
                AND ST_DWithin(l.position,center.p,@radius)),
            ST_AsGeoJSON(ST_Buffer(center.p,@radius)::geometry)
          FROM center
          """))
        {
            cmd.Parameters.AddWithValue("id", importId);
            await using var reader = await cmd.ExecuteReaderAsync(ct); await reader.ReadAsync(ct);
            count = reader.GetInt64(0); using var geometry = JsonDocument.Parse(reader.GetString(1)); area = geometry.RootElement.Clone();
        }
        await tx.CommitAsync(ct);
        var suppressed = count is > 0 and < ConcentrationPolicy.MinimumCellRecords;
        return Result<RadiusSnapshot>.Success(new(new(q.Year,q.Month,q.Category,ConcentrationPolicy.Categories[q.Category],url,imported),
            query.Longitude,query.Latitude,query.RadiusMetres,suppressed ? null : count,suppressed,ConcentrationPolicy.MinimumCellRecords,area,
            "source-classification-rows", "Conteo geodésico de registros con ubicación apta publicada por MININTER, respetando período, categoría y territorio. La precisión de origen no está declarada; no son necesariamente delitos únicos ni ubicaciones de calle certificadas."));
    }
    private static Result<RadiusSnapshot> Missing() => Result<RadiusSnapshot>.Failure(AppError.DependencyUnavailable(
        "concentration.locations_unavailable", "La consulta por radio requiere actualizar la base de datos y reimportar este período."));
}
