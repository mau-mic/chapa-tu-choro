using ChapaTuChoro.Application.Concentration;
using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Domain.Reports;
using Npgsql;
using NpgsqlTypes;

namespace ChapaTuChoro.Infrastructure.Persistence;

public sealed class ConcentrationTrendsReadRepository(NpgsqlDataSource source) : IConcentrationTrendsReadRepository
{
    public async Task<Result<ConcentrationTrendsSnapshot>> GetAsync(TrendsQuery query, CancellationToken ct)
    {
        await using var connection = await source.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        NpgsqlCommand Query(string sql)
        {
            var command = new NpgsqlCommand(sql, connection, transaction) { CommandTimeout = 20 };
            command.Parameters.AddWithValue("year", query.FromYear);
            command.Parameters.AddWithValue("source", query.FromYear == 2026 ? "active-2026" : "archive-2025-" + query.Category);
            command.Parameters.AddWithValue("category", query.Category!);
            command.Parameters.AddWithValue("from", Math.Min(query.FromMonth, Math.Max(1, query.ToMonth - 1)));
            command.Parameters.AddWithValue("to", query.ToMonth);
            command.Parameters.AddWithValue("prefix", query.District ?? query.Province ?? query.Department ?? "");
            command.Parameters.Add("department", NpgsqlDbType.Text).Value = (object?)query.Department ?? DBNull.Value;
            command.Parameters.Add("province", NpgsqlDbType.Text).Value = (object?)query.Province ?? DBNull.Value;
            return command;
        }
        await using (var ready = Query("SELECT to_regclass('concentration_imports') IS NOT NULL AND to_regclass('concentration_areas') IS NOT NULL AND to_regclass('concentration_series') IS NOT NULL"))
        {
            if (!(bool)(await ready.ExecuteScalarAsync(ct))!)
            {
                return Result<ConcentrationTrendsSnapshot>.Failure(AppError.DependencyUnavailable(
                    "concentration.setup_required", "Importa los agregados geográficos oficiales para consultar estas tendencias."));
            }
        }
        var available = new List<ConcentrationOption>();
        await using (var command = Query("""
            SELECT i.month,i.source_url,i.imported_at FROM concentration_imports i JOIN concentration_series s ON s.import_id=i.id
            WHERE i.year=@year AND i.source_key=@source AND s.category=@category ORDER BY i.month
            """))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                available.Add(new(query.FromYear, reader.GetInt16(0), query.Category!,
                    ConcentrationPolicy.Categories[query.Category!], reader.GetString(1), reader.GetFieldValue<DateTimeOffset>(2)));
            }
        }
        if (available.Count == 0)
        {
            return Result<ConcentrationTrendsSnapshot>.Failure(AppError.NotFound(
                "concentration.series_unavailable", "Esta serie geográfica no está importada."));
        }
        var options = await GeographicOptionsReader.ReadAsync(Query, query.Department, ct);
        // Geography may exist without any statistical CSV. Use official names when
        // present, retaining UBIGEO as a fallback rather than inventing place names.
        var places = new Dictionary<string, string>();
        await using (var command = Query("""
            SELECT code,COALESCE(d.district,code) FROM (
              SELECT ubigeo code FROM district_boundaries UNION SELECT DISTINCT ubigeo FROM concentration_areas
            ) g LEFT JOIN district_boundaries d ON d.ubigeo=g.code
            """))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                places[reader.GetString(0)] = reader.GetString(1);
            }
        }
        var readFromMonth = Math.Min(query.FromMonth, Math.Max(1, query.ToMonth - 1));
        var months = available.Where(option => option.Month >= readFromMonth && option.Month <= query.ToMonth)
            .Select(option => option.Month).ToArray();
        // SQL identifiers come exclusively from these server-selected constants.
        var code = query.Department is null ? "LEFT(a.ubigeo,2)"
            : query.Province is null && query.District is null ? "LEFT(a.ubigeo,4)" : "a.ubigeo";
        var rows = new List<ConcentrationTrendRow>();
        await using (var command = Query($"""
            SELECT i.month,a.category,{code},SUM(a.source_records)::bigint
            FROM concentration_imports i JOIN concentration_areas a ON a.import_id=i.id
            WHERE i.year=@year AND i.source_key=@source AND i.month BETWEEN @from AND @to
              AND a.ubigeo LIKE @prefix||'%' AND (@category='all' OR a.category=@category)
            GROUP BY i.month,a.category,{code}
            """))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                rows.Add(new(reader.GetInt16(0), reader.GetString(1), reader.GetString(2), reader.GetInt64(3)));
            }
        }
        await transaction.CommitAsync(ct);
        return Result<ConcentrationTrendsSnapshot>.Success(ConcentrationTrendsProjection.Project(
            query, available, months, rows, options.Departments, options.Provinces, places));
    }
}
