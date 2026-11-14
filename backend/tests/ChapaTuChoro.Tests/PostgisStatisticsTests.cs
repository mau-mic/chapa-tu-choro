using ChapaTuChoro.Infrastructure.Persistence;
using ChapaTuChoro.Application.Statistics;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Text.Json;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class PostgisFactAttribute : FactAttribute
{
    public PostgisFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("CTC_TEST_CONNECTIONSTRING")))
            Skip = "Set CTC_TEST_CONNECTIONSTRING to run real PostgreSQL/PostGIS integration tests.";
    }
}

public sealed class PostgisStatisticsTests
{
    [PostgisFact]
    public async Task ScopedMapPreservesCountsAndStoredGeometryWhileReducingPayload()
    {
        var schema = "ctc_map_" + Guid.NewGuid().ToString("N");
        var connectionString = Environment.GetEnvironmentVariable("CTC_TEST_CONNECTIONSTRING")!;
        await using var admin = new NpgsqlConnection(connectionString);
        await admin.OpenAsync();
        await new NpgsqlCommand($"CREATE SCHEMA {schema}", admin).ExecuteNonQueryAsync();
        try
        {
            var cs = new NpgsqlConnectionStringBuilder(connectionString) { SearchPath = $"{schema},public,extensions" };
            await using var source = new NpgsqlDataSourceBuilder(cs.ConnectionString).UseNetTopologySuite().Build();
            await using var connection = await source.OpenConnectionAsync();
            var sql = (await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "schema.sql")))
                .Replace("SET search_path TO public, extensions;", $"SET search_path TO {schema}, public, extensions;");
            await new NpgsqlCommand(sql, connection).ExecuteNonQueryAsync();
            // Deliberately dense synthetic geometry, only in this disposable schema.
            await new NpgsqlCommand("""
                INSERT INTO district_boundaries
                SELECT code, 'TEST ' || code, ST_Multi(ST_Buffer(ST_SetSRID(ST_Point(-77,-12),4326),0.1,2048))
                FROM (VALUES ('150101'),('150102'),('150103'),('150201'),('040101')) t(code);
                INSERT INTO monthly_reports VALUES
                (2024,1,'150101','TEST','TEST','TEST','A',7),
                (2024,1,'150101','TEST','TEST','TEST','B',3),
                (2024,1,'150102','TEST','TEST','TEST','B',0),
                (2024,1,'150201','TEST','TEST','TEST','A',9),
                (2024,1,'040101','TEST','TEST','TEST','A',50),
                (2024,2,'150101','TEST','TEST','TEST','A',99);
                """, connection).ExecuteNonQueryAsync();
            const string geometrySql = "SELECT ST_AsGeoJSON(geom,6) FROM district_boundaries WHERE ubigeo='150101'";
            var original = (string)(await new NpgsqlCommand(geometrySql, connection).ExecuteScalarAsync())!;
            await using var context = new CrimeWatchDbContext(new DbContextOptionsBuilder<CrimeWatchDbContext>()
                .UseNpgsql(source, pg => pg.UseNetTopologySuite()).Options);
            var repository = new StatisticsReadRepository(context, source);

            var department = await repository.GetDistrictMapAsync(2024, 1, null, "15", null, null, default);
            Assert.Equal(new[] { "150101", "150102", "150103", "150201" }, department.Features.Select(f => f.Properties.Ubigeo));
            Assert.Equal(new long?[] { 10, 0, null, 9 }, department.Features.Select(f => f.Properties.Reports));
            var province = await repository.GetDistrictMapAsync(2024, 1, null, "15", "1501", null, default);
            Assert.Equal(new[] { "150101", "150102", "150103" }, province.Features.Select(f => f.Properties.Ubigeo));
            Assert.Equal(new long?[] { 10, 0, null }, province.Features.Select(f => f.Properties.Reports));
            var district = await repository.GetDistrictMapAsync(2024, 1, "A", "15", "1501", "150101", default);
            var feature = Assert.Single(district.Features);
            Assert.Equal("150101", feature.Properties.Ubigeo);
            Assert.Equal(7, feature.Properties.Reports);
            // PostGIS may unwrap a single-component MultiPolygon during simplification.
            Assert.Equal("Polygon", feature.Geometry.GetProperty("type").GetString());
            var json = JsonSerializer.SerializeToUtf8Bytes(district, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            Assert.True(json.Length < original.Length / 10, $"Expected reduced geometry: {json.Length} bytes versus {original.Length} original bytes.");
            await using (var valid = new NpgsqlCommand("SELECT ST_IsValid(ST_GeomFromGeoJSON(@json)) AND NOT ST_IsEmpty(ST_GeomFromGeoJSON(@json))", connection))
            {
                valid.Parameters.AddWithValue("json", feature.Geometry.GetRawText());
                Assert.True((bool)(await valid.ExecuteScalarAsync())!);
            }
            Assert.Equal(original, await new NpgsqlCommand(geometrySql, connection).ExecuteScalarAsync());
            Assert.Equal(69L, (await repository.GetSummaryAsync(2024, 1, null, default)).Reports);
            Assert.All((await repository.GetDistrictMapAsync(2023, 1, null, "15", "1501", null, default)).Features,
                f => Assert.Null(f.Properties.Reports));
            Assert.Empty((await repository.GetDistrictMapAsync(2024, 1, null, "99", null, null, default)).Features);
        }
        finally { await new NpgsqlCommand($"DROP SCHEMA {schema} CASCADE", admin).ExecuteNonQueryAsync(); }
    }

    [PostgisFact]
    public async Task AggregationFiltersMissingGeometryAndAbsentDataStayConsistent()
    {
        var schema = "ctc_test_" + Guid.NewGuid().ToString("N");
        var connectionString = Environment.GetEnvironmentVariable("CTC_TEST_CONNECTIONSTRING")!;
        await using var admin = new NpgsqlConnection(connectionString);
        await admin.OpenAsync();
        await new NpgsqlCommand("CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public", admin).ExecuteNonQueryAsync();
        await new NpgsqlCommand($"CREATE SCHEMA {schema}", admin).ExecuteNonQueryAsync();
        try
        {
            var cs = new NpgsqlConnectionStringBuilder(connectionString) { SearchPath = $"{schema},public,extensions" };
            await using var source = new NpgsqlDataSourceBuilder(cs.ConnectionString).UseNetTopologySuite().Build();
            await using var connection = await source.OpenConnectionAsync();
            var sql = (await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "schema.sql")))
                .Replace("SET search_path TO public, extensions;", $"SET search_path TO {schema}, public, extensions;");
            await new NpgsqlCommand(sql, connection).ExecuteNonQueryAsync();
            // Synthetic fixtures live only inside a disposable test schema.
            await new NpgsqlCommand("""
                INSERT INTO monthly_reports VALUES
                (2024,1,'150101','TEST','TEST','TEST A','A',7),
                (2024,1,'150101','TEST','TEST','TEST A','B',3),
                (2024,1,'070101','TEST','TEST','TEST B','A',4),
                (2024,2,'150101','TEST','TEST','TEST A','A',99);
                INSERT INTO district_boundaries VALUES
                ('150101','TEST A',ST_Multi(ST_GeomFromText('POLYGON((-77 -12,-77.1 -12,-77.1 -12.1,-77 -12))',4326))),
                ('150102','TEST C',ST_Multi(ST_GeomFromText('POLYGON((-77 -12,-77.1 -12,-77.1 -12.1,-77 -12))',4326)));
                """, connection).ExecuteNonQueryAsync();
            await using var context = new CrimeWatchDbContext(new DbContextOptionsBuilder<CrimeWatchDbContext>()
                .UseNpgsql(source, pg => pg.UseNetTopologySuite()).Options);
            var repo = new StatisticsReadRepository(context, source);
            var summary = await repo.GetSummaryAsync(2024, 1, null, default);
            Assert.Equal(14, summary.Reports);
            Assert.Equal(2, summary.DistrictsWithData);
            Assert.Equal(1, summary.DistrictsWithoutGeometry);
            var ranking = await repo.GetTopDistrictsAsync(2024, 1, "A", default);
            Assert.Equal(new long[] { 7, 4 }, ranking.Select(x => x.Reports));
            var map = await repo.GetDistrictMapAsync(2024, 1, null, "15", null, null, default);
            Assert.Equal(10L, map.Features.Single(x => x.Properties.Ubigeo == "150101").Properties.Reports);
            Assert.Null(map.Features.Single(x => x.Properties.Ubigeo == "150102").Properties.Reports);
            Assert.All((await repo.GetDistrictMapAsync(2023, 1, null, "15", null, null, default)).Features,
                feature => Assert.Null(feature.Properties.Reports));
            Assert.Equal(new PeriodDto(2024, 2), (await repo.GetMetadataAsync(default)).LatestPeriod);
            await new NpgsqlCommand("""
                INSERT INTO monthly_reports VALUES
                (2024,1,'040101','TEST AREQUIPA','TEST','TEST D','A',2),
                (2024,1,'040102','TEST AREQUIPA','TEST','TEST E','B',0);
                INSERT INTO department_boundaries
                SELECT code,name,ST_Multi(ST_GeomFromText('POLYGON((-77 -12,-77.1 -12,-77.1 -12.1,-77 -12))',4326))
                FROM (VALUES ('04','TEST AREQUIPA'),('07','TEST CALLAO'),('15','TEST LIMA'),('08','TEST NO DATA')) AS t(code,name);
                INSERT INTO district_boundaries
                SELECT code,name,ST_Multi(ST_GeomFromText('POLYGON((-77 -12,-77.1 -12,-77.1 -12.1,-77 -12))',4326))
                FROM (VALUES ('040101','TEST D'),('040103','TEST NO DATA')) AS t(code,name);
                """, connection).ExecuteNonQueryAsync();
            var national = await repo.GetExplorationAsync(2024, 1, null, null, null, null, default);
            Assert.Equal("department", national.Level);
            Assert.Equal(16, national.Summary.Reports);
            Assert.Equal(4, national.Departments.Count);
            Assert.Equal(new long[] { 10, 4, 2 }, national.Ranking.Select(x => x.Reports));
            Assert.Equal(2L, national.Map.Features.Single(x => x.Properties.Code == "04").Properties.Reports);
            Assert.Null(national.Map.Features.Single(x => x.Properties.Code == "08").Properties.Reports);
            var focus = await repo.GetExplorationAsync(2024, 1, null, "04", null, null, default);
            Assert.Equal("district", focus.Level);
            Assert.Equal(2, focus.Summary.Reports);
            Assert.Equal(1, focus.Summary.DistrictsWithoutGeometry);
            Assert.All(focus.Ranking, area => Assert.StartsWith("04", area.Code));
            Assert.All(focus.Map.Features, feature => Assert.StartsWith("04", feature.Properties.Code));
            Assert.Null(focus.Map.Features.Single(x => x.Properties.Code == "040103").Properties.Reports);
            var category = await repo.GetExplorationAsync(2024, 1, "B", null, null, null, default);
            Assert.Equal(0L, category.Map.Features.Single(x => x.Properties.Code == "04").Properties.Reports);
            Assert.Null(category.Map.Features.Single(x => x.Properties.Code == "07").Properties.Reports);
            var empty = await repo.GetExplorationAsync(2023, 1, null, "04", null, null, default);
            Assert.Equal(0, empty.Summary.Reports);
            Assert.Empty(empty.Ranking);
            Assert.All(empty.Map.Features, feature => Assert.Null(feature.Properties.Reports));
            await new NpgsqlCommand("""
                INSERT INTO monthly_reports VALUES (2024,1,'040201','TEST AREQUIPA','TEST PROVINCE TWO','TEST F','A',5);
                INSERT INTO district_boundaries
                SELECT code,name,ST_Multi(ST_GeomFromText('POLYGON((-77 -12,-77.1 -12,-77.1 -12.1,-77 -12))',4326))
                FROM (VALUES ('040201','TEST F'),('040202','TEST NO DATA')) AS t(code,name);
                """, connection).ExecuteNonQueryAsync();
            var provinceOne = await repo.GetExplorationAsync(2024, 1, null, "04", "0401", null, default);
            var provinceTwo = await repo.GetExplorationAsync(2024, 1, null, "04", "0402", null, default);
            Assert.Equal(2, provinceOne.Summary.Reports);
            Assert.Equal(5, provinceTwo.Summary.Reports);
            Assert.Equal(2, provinceTwo.Provinces.Count);
            Assert.All(provinceTwo.Ranking, area => Assert.StartsWith("0402", area.Code));
            Assert.All(provinceTwo.Map.Features, feature => Assert.StartsWith("0402", feature.Properties.Code));
            Assert.Null(provinceTwo.Map.Features.Single(x => x.Properties.Code == "040202").Properties.Reports);
            var provinceEmpty = await repo.GetExplorationAsync(2023, 1, "A", "04", "0402", null, default);
            Assert.Equal(0, provinceEmpty.Summary.Reports);
            Assert.Equal(2, provinceEmpty.Provinces.Count); // Options survive empty period/category filters.
            Assert.Empty(provinceEmpty.Ranking);
            var district = await repo.GetExplorationAsync(2024, 1, null, "04", null, "040201", default);
            Assert.Equal(5, district.Summary.Reports);
            Assert.Equal("040201", Assert.Single(district.Ranking).Code);
            Assert.Equal("040201", Assert.Single(district.Map.Features).Properties.Code);
            Assert.Contains(district.Districts, d => d.Code == "040102"); // Missing geometry remains selectable.
            var noReports = await repo.GetExplorationAsync(2023, 1, "A", "04", "0402", "040202", default);
            Assert.Equal(0, noReports.Summary.Reports);
            Assert.Null(Assert.Single(noReports.Map.Features).Properties.Reports);
            Assert.Equal(2, noReports.Districts.Count); // Options do not collapse to selected district.
            var missing = await repo.GetExplorationAsync(2024, 1, null, "04", "0401", "040102", default);
            Assert.Equal(1, missing.Summary.DistrictsWithoutGeometry);
            Assert.Empty(missing.Map.Features);
            Assert.Single(missing.Ranking);
            var trendRepo = new TrendsReadRepository(source);
            var nationalTrends = await trendRepo.GetAsync(new(2024, 1, 2024, 2, null, null, null, null), default);
            Assert.Equal("TEST LIMA", nationalTrends.Territories.Single(x => x.Code == "15").Name);
            var trendsHandler = new GetTrendsHandler(trendRepo);
            var trends = (await trendsHandler.HandleAsync(new(2023, 12, 2024, 2, null, "04", null, null), default)).Value!;
            Assert.Equal(new long?[] { null, 7, null }, trends.Monthly.Select(x => x.Reports));
            Assert.Equal(7, trends.Metrics.TotalReports);
            Assert.Equal("province", trends.ComparisonLevel);
            Assert.Equal(2, trends.Territories.Count);
            Assert.Equal(7, trends.Categories.Sum(x => x.Reports));
            Assert.Equal(new long?[] { null, 7, null }, trends.CategorySeries.Single(x => x.Category == "A").Monthly.Select(x => x.Reports));
            Assert.Equal(new long?[] { null, 0, null }, trends.CategorySeries.Single(x => x.Category == "B").Monthly.Select(x => x.Reports));
            var districtTrends = (await trendsHandler.HandleAsync(new(2024, 1, 2024, 1, "B", "04", "0401", "040102"), default)).Value!;
            Assert.Equal(0, districtTrends.Metrics.TotalReports);
            Assert.Equal(1, districtTrends.Metrics.MonthsWithData);
            Assert.Equal("040102", Assert.Single(districtTrends.Territories).Code);
            Assert.Equal(0, Assert.Single(districtTrends.Categories).Reports);
            Assert.Equal("B", Assert.Single(districtTrends.CategorySeries).Category);
            Assert.Equal(0, Assert.Single(districtTrends.CategorySeries[0].Monthly).Reports);
            var noTrendData = (await trendsHandler.HandleAsync(new(2024, 1, 2024, 2, "absent", "04", null, null), default)).Value!;
            Assert.Null(noTrendData.Metrics.TotalReports);
            Assert.Empty(noTrendData.CategorySeries);
            Assert.All(noTrendData.Monthly, x => Assert.Null(x.Reports));
            Assert.NotEmpty(noTrendData.Districts);


        }
        finally { await new NpgsqlCommand($"DROP SCHEMA {schema} CASCADE", admin).ExecuteNonQueryAsync(); }
    }
}
