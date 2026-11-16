using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Concentration;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Domain.Reports;
using Npgsql;
using NpgsqlTypes;

namespace ChapaTuChoro.Infrastructure.Persistence;

public sealed class ConcentrationCellsRepository(NpgsqlDataSource source) : IConcentrationCellsRepository
{
    public async Task<Result<MapCellsSnapshot>> GetAsync(MapCellsQuery query, CancellationToken ct)
    {
        var q = query.Selection;
        await using var db = await source.OpenConnectionAsync(ct);
        await using var tx = await db.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead,ct);
        NpgsqlCommand Command(string sql)
        {
            var cmd = new NpgsqlCommand(sql,db,tx) { CommandTimeout = 20 };
            cmd.Parameters.AddWithValue("year",q.Year); cmd.Parameters.AddWithValue("month",q.Month); cmd.Parameters.AddWithValue("category",q.Category);
            cmd.Parameters.AddWithValue("prefix",q.District ?? q.Province ?? q.Department ?? "");
            cmd.Parameters.Add("department",NpgsqlDbType.Text).Value = (object?)q.Department ?? DBNull.Value;
            cmd.Parameters.Add("province",NpgsqlDbType.Text).Value = (object?)q.Province ?? DBNull.Value;
            return cmd;
        }
        if (q.Department is not null)
        {
            var options = await GeographicOptionsReader.ReadAsync(Command,q.Department,ct);
            var error = GeographicFilter.ValidateAvailable(q.Department,q.Province,q.District,options.Departments,options.Provinces,options.Districts);
            if (error is not null) return Result<MapCellsSnapshot>.Failure(error);
        }
        await using (var cmd = Command("SELECT to_regclass('concentration_locations') IS NOT NULL"))
            if (!(bool)(await cmd.ExecuteScalarAsync(ct))!) return Missing();
        long id; string url; DateTimeOffset imported;
        await using (var cmd = Command($"SELECT i.id,i.source_url,i.imported_at,COALESCE(i.quality->>'locationStorageVersion','') FROM concentration_imports i JOIN concentration_series s ON s.import_id=i.id WHERE {ConcentrationReadRepository.Authority} AND i.year=@year AND i.month=@month AND s.category=@category"))
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
        {
            if (!await reader.ReadAsync(ct) || reader.GetString(3) != "1") return Missing();
            id = reader.GetInt64(0); url = reader.GetString(1); imported = reader.GetFieldValue<DateTimeOffset>(2);
        }
        var cells = new List<DensityCell>(); long suppressed = 0; MapBounds? coverage = null;
        await using (var cmd = Command("""
          WITH projected AS (
            SELECT ST_Transform(ST_SetSRID(ST_MakePoint(@west,@south),4326),3857) lo,
                   ST_Transform(ST_SetSRID(ST_MakePoint(@east,@north),4326),3857) hi),
          snapped AS (
            SELECT ST_Transform(ST_SetSRID(ST_MakePoint(FLOOR(ST_X(lo)/@grid)*@grid,FLOOR(ST_Y(lo)/@grid)*@grid),3857),4326) lo,
                   ST_Transform(ST_SetSRID(ST_MakePoint(CEIL(ST_X(hi)/@grid)*@grid,CEIL(ST_Y(hi)/@grid)*@grid),3857),4326) hi FROM projected),
          points AS (
            SELECT l.records,ST_Transform(l.position::geometry,3857) p FROM concentration_locations l CROSS JOIN snapped b
            WHERE l.import_id=@id AND l.category=@category AND l.ubigeo LIKE @prefix||'%'
              AND l.longitude>=ST_X(b.lo) AND l.longitude<ST_X(b.hi) AND l.latitude>=ST_Y(b.lo) AND l.latitude<ST_Y(b.hi)),
          groups AS (
            SELECT FLOOR(ST_X(p)/@grid)::int gx,FLOOR(ST_Y(p)/@grid)::int gy,SUM(records)::bigint n,
              SUM(ST_X(p)*records)/SUM(records) x,SUM(ST_Y(p)*records)/SUM(records) y
            FROM points GROUP BY gx,gy),
          summary AS (SELECT COUNT(*) FILTER(WHERE n<@minimum) suppressed,COUNT(*) FILTER(WHERE n>=@minimum) visible FROM groups),
          visible AS (SELECT * FROM groups WHERE n>=@minimum ORDER BY gx,gy LIMIT @limit)
          SELECT ST_X(b.lo),ST_Y(b.lo),ST_X(b.hi),ST_Y(b.hi),s.suppressed,s.visible,v.gx,v.gy,v.n,
            ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(ROUND(v.x/100)*100,ROUND(v.y/100)*100),3857),4326)),
            ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(ROUND(v.x/100)*100,ROUND(v.y/100)*100),3857),4326))
          FROM snapped b CROSS JOIN summary s LEFT JOIN visible v ON true ORDER BY v.gx,v.gy
          """))
        {
            cmd.Parameters.AddWithValue("id",id); cmd.Parameters.AddWithValue("grid",(double)query.GridMetres);
            cmd.Parameters.AddWithValue("west",query.Bounds.West); cmd.Parameters.AddWithValue("south",query.Bounds.South);
            cmd.Parameters.AddWithValue("east",query.Bounds.East); cmd.Parameters.AddWithValue("north",query.Bounds.North);
            cmd.Parameters.AddWithValue("minimum",ConcentrationPolicy.MinimumCellRecords); cmd.Parameters.AddWithValue("limit",ConcentrationPolicy.MaximumMapCells+1);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                if (reader.GetInt64(5)>ConcentrationPolicy.MaximumMapCells)
                    return Result<MapCellsSnapshot>.Failure(AppError.Validation("concentration.map_view_too_large", "Acerca el mapa o elige una agrupación mayor para cargar esta vista."));
                coverage ??= new(reader.GetDouble(0),reader.GetDouble(1),reader.GetDouble(2),reader.GetDouble(3));
                suppressed = reader.GetInt64(4);
                if (!reader.IsDBNull(6)) cells.Add(new($"{reader.GetInt32(6)}/{reader.GetInt32(7)}",reader.GetDouble(9),reader.GetDouble(10),reader.GetInt64(8)));
            }
        }
        await tx.CommitAsync(ct);
        return Result<MapCellsSnapshot>.Success(new(new(q.Year,q.Month,q.Category,ConcentrationPolicy.Categories[q.Category],url,imported),
            query.GridMetres,ConcentrationPolicy.MinimumCellRecords,cells,cells.Sum(c=>c.Records),suppressed,coverage!));
    }
    private static Result<MapCellsSnapshot> Missing() => Result<MapCellsSnapshot>.Failure(AppError.DependencyUnavailable(
        "concentration.locations_unavailable","Reimporta las ubicaciones de este período para habilitar el detalle del mapa."));
}
