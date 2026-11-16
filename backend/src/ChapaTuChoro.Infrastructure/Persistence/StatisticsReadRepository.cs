using System.Text.Json;
using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using ChapaTuChoro.Application.Statistics;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace ChapaTuChoro.Infrastructure.Persistence;

public sealed class StatisticsReadRepository(CrimeWatchDbContext context, NpgsqlDataSource dataSource,
    ILogger<StatisticsReadRepository>? logger = null)
    : IStatisticsReadRepository
{
    public async Task<MetadataDto> GetMetadataAsync(CancellationToken ct)
    {
        var log = logger ?? NullLogger<StatisticsReadRepository>.Instance;
        var operation = Guid.NewGuid().ToString("N");
        using var scope = log.BeginScope(new Dictionary<string, object> { ["MetadataOperationId"] = operation });
        var totalStart = Stopwatch.GetTimestamp();
        log.LogInformation("Metadata operation started");

        async Task<T> Stage<T>(string name, Func<Task<T>> action)
        {
            var start = Stopwatch.GetTimestamp();
            log.LogInformation("Metadata stage {MetadataStage} started", name);
            try
            {
                var value = await action();
                log.LogInformation("Metadata stage {MetadataStage} completed in {ElapsedMs} ms",
                    name, Stopwatch.GetElapsedTime(start).TotalMilliseconds);
                return value;
            }
            catch (Exception error)
            {
                // Do not duplicate exception messages/SQL/connection details here.
                // Unexpected errors still reach the central exception handler.
                log.LogWarning("Metadata stage {MetadataStage} failed after {ElapsedMs} ms ({FailureType})",
                    name, Stopwatch.GetElapsedTime(start).TotalMilliseconds, error.GetType().Name);
                throw;
            }
        }

        var periods = await Stage("periods.read", () => ReportsInScope()
            .Select(x => new { x.Year, x.Month }).Distinct()
            .OrderByDescending(x => x.Year).ThenByDescending(x => x.Month)
            .Select(x => new PeriodDto(x.Year, x.Month)).ToListAsync(ct));
        var count = await Stage("reports.count", () => ReportsInScope().LongCountAsync(ct));
        var imports = new List<SourceDto>();
        await using (var connection = await Stage("imports.acquire_connection", async () => await dataSource.OpenConnectionAsync(ct)))
        {
            await using var command = new NpgsqlCommand(
                "SELECT source_kind, source_name, sha256, imported_at FROM import_runs ORDER BY imported_at DESC, id DESC", connection);
            await using (var reader = await Stage("imports.execute", () => command.ExecuteReaderAsync(ct)))
            {
                await Stage("imports.read", async () =>
                {
                    while (await reader.ReadAsync(ct))
                        imports.Add(new SourceDto(reader.GetString(0), reader.GetString(1), reader.GetString(2),
                            reader.GetFieldValue<DateTimeOffset>(3)));
                    return imports.Count;
                });
            }
            log.LogInformation("Metadata imports reader disposed; releasing connection");
        }
        log.LogInformation("Metadata operation completed in {ElapsedMs} ms; {PeriodCount} periods, {ReportRows} rows, {ImportCount} imports",
            Stopwatch.GetElapsedTime(totalStart).TotalMilliseconds, periods.Count, count, imports.Count);
        return new MetadataDto(periods.FirstOrDefault(), count, periods, imports,
            "https://www.datosabiertos.gob.pe/dataset/denuncias-policiales-registradas-nivel-nacional-mininter",
            "https://ide.inei.gob.pe/");
    }

    private IQueryable<ChapaTuChoro.Domain.Reports.MonthlyCrimeReport> ReportsInScope() =>
        context.MonthlyReports.AsNoTracking();

    private IQueryable<ChapaTuChoro.Domain.Reports.MonthlyCrimeReport> Filtered(
        int year, int month, string? category) => ReportsInScope()
        .Where(x => x.Year == year && x.Month == month && (category == null || x.Category == category));

    public async Task<StatisticsSummaryDto> GetSummaryAsync(
        int year, int month, string? category, CancellationToken ct)
    {
        var query = Filtered(year, month, category);
        var reports = await query.SumAsync(x => (long)x.Reports, ct);
        var districts = await query.Select(x => x.Ubigeo).Distinct().CountAsync(ct);
        var unmatched = await query.Where(x => !context.DistrictBoundaries.Any(d => d.Ubigeo == x.Ubigeo))
            .Select(x => x.Ubigeo).Distinct().CountAsync(ct);
        return new StatisticsSummaryDto(new PeriodDto(year, month), category, reports, districts, unmatched);
    }

    public async Task<IReadOnlyList<string>> GetCategoriesAsync(CancellationToken ct) =>
        await ReportsInScope()
            .Select(x => x.Category).Distinct().OrderBy(x => x).ToListAsync(ct);

    public async Task<IReadOnlyList<DistrictStatisticDto>> GetTopDistrictsAsync(
        int year, int month, string? category, CancellationToken ct) =>
        await Filtered(year, month, category)
            .GroupBy(x => x.Ubigeo)
            .Select(group => new { Ubigeo = group.Key, District = group.Max(x => x.District)!,
                Reports = group.Sum(x => (long)x.Reports) })
            .OrderByDescending(x => x.Reports).ThenBy(x => x.Ubigeo)
            .Select(x => new DistrictStatisticDto(x.Ubigeo, x.District, x.Reports)).ToListAsync(ct);

    public async Task<GeoFeatureCollectionDto> GetDistrictMapAsync(
        int year, int month, string? category, string department, string? province, string? district, CancellationToken ct)
    {
        // PostGIS SQL stays behind the Infrastructure boundary; the API receives GeoJSON DTOs.
        const string sql = """
            SELECT d.ubigeo, d.district, ST_AsGeoJSON(ST_SimplifyPreserveTopology(d.geom,0.0005),6) AS geometry,
                   r.reports AS reports
            FROM district_boundaries d
            LEFT JOIN (
                SELECT ubigeo, SUM(reports)::bigint AS reports
                FROM monthly_reports
                WHERE year = @year AND month = @month
                  AND (@category IS NULL OR category = @category)
                  AND ubigeo LIKE @department || '%'
                  AND (@province IS NULL OR ubigeo LIKE @province || '%')
                  AND (@district IS NULL OR ubigeo = @district)
                GROUP BY ubigeo
            ) r ON r.ubigeo = d.ubigeo
            WHERE d.ubigeo LIKE @department || '%'
              AND (@province IS NULL OR d.ubigeo LIKE @province || '%')
              AND (@district IS NULL OR d.ubigeo = @district)
            ORDER BY d.ubigeo
            """;

        var features = new List<GeoFeatureDto>();
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("year", year);
        command.Parameters.AddWithValue("month", month);
        command.Parameters.Add("category", NpgsqlTypes.NpgsqlDbType.Text).Value =
            category is null ? DBNull.Value : category;
        command.Parameters.AddWithValue("department", department);
        command.Parameters.Add("province", NpgsqlTypes.NpgsqlDbType.Text).Value = province is null ? DBNull.Value : province;
        command.Parameters.Add("district", NpgsqlTypes.NpgsqlDbType.Text).Value = district is null ? DBNull.Value : district;
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            using var document = JsonDocument.Parse(reader.GetString(2));
            features.Add(new GeoFeatureDto("Feature", document.RootElement.Clone(),
                new DistrictMapProperties(reader.GetString(0), reader.GetString(1), reader.IsDBNull(3) ? null : reader.GetInt64(3))));
        }
        return new GeoFeatureCollectionDto("FeatureCollection", features);
    }

    public async Task<ExplorationDto> GetExplorationAsync(
        int year, int month, string? category, string? department, string? province, string? district, CancellationToken ct)
    {
        // One repeatable-read snapshot keeps totals, ranking and polygons consistent
        // if an ETL run commits while this request is being served.
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        NpgsqlCommand Query(string sql)
        {
            var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue("year", year);
            command.Parameters.AddWithValue("month", month);
            command.Parameters.Add("category", NpgsqlTypes.NpgsqlDbType.Text).Value = category is null ? DBNull.Value : category;
            command.Parameters.Add("department", NpgsqlTypes.NpgsqlDbType.Text).Value = department is null ? DBNull.Value : department;
            command.Parameters.Add("province", NpgsqlTypes.NpgsqlDbType.Text).Value = province is null ? DBNull.Value : province;
            command.Parameters.Add("district", NpgsqlTypes.NpgsqlDbType.Text).Value = district is null ? DBNull.Value : district;
            return command;
        }
        const string predicate = "year = @year AND month = @month AND (@category IS NULL OR category = @category) AND (@department IS NULL OR ubigeo LIKE @department || '%') AND (@province IS NULL OR ubigeo LIKE @province || '%') AND (@district IS NULL OR ubigeo = @district)";
        var (options, provinces, districts) = await GeographicOptionsReader.ReadAsync(Query, department, ct);

        StatisticsSummaryDto summary;
        await using (var command = Query($"""
            SELECT COALESCE(SUM(reports),0)::bigint, COUNT(DISTINCT ubigeo)::integer,
                COUNT(DISTINCT ubigeo) FILTER (WHERE NOT EXISTS
                    (SELECT 1 FROM district_boundaries d WHERE d.ubigeo = r.ubigeo))::integer
            FROM monthly_reports r WHERE {predicate}
            """))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            await reader.ReadAsync(ct);
            summary = new(new(year, month), category, reader.GetInt64(0), reader.GetInt32(1), reader.GetInt32(2));
        }
        var level = department is null ? "department" : "district";
        // Identifiers are fixed server-selected constants, never client input.
        var code = department is null ? "LEFT(ubigeo,2)" : "ubigeo";
        var name = department is null ? "department" : "district";
        var table = department is null ? "department_boundaries" : "district_boundaries";
        var ranking = new List<AreaStatisticDto>();
        await using (var command = Query($"""
            SELECT r.code, COALESCE(d.{name},r.name), r.reports FROM (
                SELECT {code} AS code, MAX({name}) AS name, SUM(reports)::bigint AS reports
                FROM monthly_reports WHERE {predicate} GROUP BY {code}
            ) r LEFT JOIN {table} d ON d.ubigeo = r.code ORDER BY r.reports DESC, r.code
            """))
        await using (var reader = await command.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) ranking.Add(new(reader.GetString(0), reader.GetString(1), reader.GetInt64(2)));

        var features = new List<AreaFeatureDto>();
        await using (var command = Query($"""
            SELECT d.ubigeo,d.{name},ST_AsGeoJSON(ST_SimplifyPreserveTopology(d.geom,0.0005),6),r.reports
            FROM {table} d LEFT JOIN (
                SELECT {code} AS code, SUM(reports)::bigint AS reports FROM monthly_reports
                WHERE {predicate} GROUP BY {code}
            ) r ON r.code = d.ubigeo
            WHERE (@department IS NULL OR d.ubigeo LIKE @department || '%')
              AND (@province IS NULL OR d.ubigeo LIKE @province || '%')
              AND (@district IS NULL OR d.ubigeo = @district) ORDER BY d.ubigeo
            """))
        await using (var reader = await command.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct))
            {
                using var geometry = JsonDocument.Parse(reader.GetString(2));
                features.Add(new("Feature", geometry.RootElement.Clone(), new(reader.GetString(0), reader.GetString(1), level,
                    reader.IsDBNull(3) ? null : reader.GetInt64(3))));
            }
        await transaction.CommitAsync(ct);
        return new(new(year, month), category, department, province, district, level, options, provinces, districts, summary, ranking,
            new("FeatureCollection", features));
    }
}
