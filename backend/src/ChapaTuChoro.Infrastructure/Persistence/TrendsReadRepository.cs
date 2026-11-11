using ChapaTuChoro.Application.Statistics;
using Npgsql;
using NpgsqlTypes;

namespace ChapaTuChoro.Infrastructure.Persistence;

public sealed class TrendsReadRepository(NpgsqlDataSource dataSource) : ITrendsReadRepository
{
    public async Task<TrendsSnapshot> GetAsync(TrendsQuery query, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var from = new DateOnly(query.FromYear, query.FromMonth, 1);
        var comparisonStart = new DateOnly(query.ToYear, query.ToMonth, 1).AddYears(-1);
        var readFrom = from < comparisonStart ? from : comparisonStart;
        NpgsqlCommand Query(string sql)
        {
            var command = new NpgsqlCommand(sql, connection, transaction) { CommandTimeout = 30 };
            command.Parameters.AddWithValue("fromYear", query.FromYear);
            command.Parameters.AddWithValue("fromMonth", query.FromMonth);
            command.Parameters.AddWithValue("toYear", query.ToYear);
            command.Parameters.AddWithValue("toMonth", query.ToMonth);
            command.Parameters.AddWithValue("readYear", readFrom.Year);
            command.Parameters.AddWithValue("readMonth", readFrom.Month);
            command.Parameters.Add("category", NpgsqlDbType.Text).Value = (object?)query.Category ?? DBNull.Value;
            command.Parameters.Add("department", NpgsqlDbType.Text).Value = (object?)query.Department ?? DBNull.Value;
            command.Parameters.Add("province", NpgsqlDbType.Text).Value = (object?)query.Province ?? DBNull.Value;
            command.Parameters.Add("district", NpgsqlDbType.Text).Value = (object?)query.District ?? DBNull.Value;
            return command;
        }
        var options = await GeographicOptionsReader.ReadAsync(Query, query.Department, ct);
        const string scope = "(@category IS NULL OR category = @category) AND (@department IS NULL OR ubigeo LIKE @department || '%') AND (@province IS NULL OR ubigeo LIKE @province || '%') AND (@district IS NULL OR ubigeo = @district)";
        const string range = "(year,month) >= (@fromYear,@fromMonth) AND (year,month) <= (@toYear,@toMonth)";
        var observations = new List<MonthlyTrendDto>();
        await using (var command = Query($"""
            SELECT year,month,SUM(reports)::bigint FROM monthly_reports
            WHERE (year,month) >= (@readYear,@readMonth) AND (year,month) <= (@toYear,@toMonth)
              AND {scope} GROUP BY year,month ORDER BY year,month
            """))
        await using (var reader = await command.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) observations.Add(new(new(reader.GetInt16(0), reader.GetInt16(1)), reader.GetInt64(2)));
        var categories = new List<CategoryTotalDto>();
        await using (var command = Query($"""
            SELECT category,SUM(reports)::bigint FROM monthly_reports
            WHERE {range} AND {scope} GROUP BY category ORDER BY SUM(reports) DESC,category
            """))
        await using (var reader = await command.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) categories.Add(new(reader.GetString(0), reader.GetInt64(1)));
        var categoryObservations = new List<CategoryObservationDto>();
        await using (var command = Query($"""
            SELECT year,month,category,SUM(reports)::bigint FROM monthly_reports
            WHERE {range} AND {scope} GROUP BY year,month,category ORDER BY year,month,category
            """))
        await using (var reader = await command.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) categoryObservations.Add(new(new(reader.GetInt16(0), reader.GetInt16(1)), reader.GetString(2), reader.GetInt64(3)));
        // Identifiers are selected exclusively by server code, never interpolated input.
        var code = query.Department is null ? "LEFT(ubigeo,2)"
            : query.Province is null && query.District is null ? "LEFT(ubigeo,4)" : "ubigeo";
        var name = query.Department is null ? "department"
            : query.Province is null && query.District is null ? "province" : "district";
        var territories = new List<AreaStatisticDto>();
        var aggregate = $"""
            SELECT {code} AS code,MAX({name}) AS name,SUM(reports)::bigint AS reports FROM monthly_reports
            WHERE {range} AND {scope} GROUP BY {code}
            """;
        // Prefer the official boundary label (e.g. all Lima under code 15), with
        // source labels retained as a fallback for districts lacking geometry.
        var territorySql = name == "province" ? $"SELECT code,name,reports FROM ({aggregate}) r ORDER BY reports DESC,code"
            : $"SELECT r.code,COALESCE(d.{name},r.name),r.reports FROM ({aggregate}) r LEFT JOIN {(name == "department" ? "department_boundaries" : "district_boundaries")} d ON d.ubigeo=r.code ORDER BY r.reports DESC,r.code";
        await using (var command = Query(territorySql))
        await using (var reader = await command.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) territories.Add(new(reader.GetString(0), reader.GetString(1), reader.GetInt64(2)));
        await transaction.CommitAsync(ct);
        return new(observations, categories, territories, options.Departments, options.Provinces, options.Districts, categoryObservations);
    }
}
