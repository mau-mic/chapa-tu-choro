using ChapaTuChoro.Application.Concentration;
using ChapaTuChoro.Domain.Reports;
using Xunit;
using Npgsql;

namespace ChapaTuChoro.Tests;

public sealed class ConcentrationTests
{
    [Fact]
    public void SourcePolicyNeverCombinesAnnualArchives()
    {
        Assert.True(ConcentrationPolicy.IsAuthoritative(2026, "all", "active-2026"));
        Assert.True(ConcentrationPolicy.IsAuthoritative(2025, "robbery", "archive-2025-robbery"));
        Assert.False(ConcentrationPolicy.IsAuthoritative(2026, "robbery", "archive-2025-robbery"));
        Assert.False(ConcentrationPolicy.IsAuthoritative(2025, "all", "archive-2025-all"));
    }
    private sealed class EmptyRepository : IConcentrationReadRepository
    {
        public Task<ConcentrationMetadata> MetadataAsync(CancellationToken ct) => Task.FromResult(new ConcentrationMetadata(false, []));
        public Task<ConcentrationSnapshot?> GetAsync(ConcentrationQuery q, CancellationToken ct) => throw new InvalidOperationException("Must not query unavailable snapshot");
    }
    [Theory]
    [InlineData(2025, 1, "all", null)]
    [InlineData(2024, 1, "all", null)]
    [InlineData(2026, 13, "all", null)]
    [InlineData(2026, 1, "unknown", null)]
    [InlineData(2026, 1, "all", "150101")]
    public async Task InvalidSelectionsAreExpectedErrors(int year, int month, string category, string? department)
    {
        var result = await new GetConcentrationHandler(new EmptyRepository()).HandleAsync(new(year, month, category, department, null, null), default);
        Assert.False(result.IsSuccess); Assert.Equal(ChapaTuChoro.Application.Common.ErrorKind.Validation, result.Error!.Kind);
    }
    [Fact]
    public async Task MissingPeriodsNeverFallbackToAnotherYear()
    {
        var result = await new GetConcentrationHandler(new EmptyRepository()).HandleAsync(new(2026, 1, "all", null, null, null), default);
        Assert.Equal("concentration.period_unavailable", result.Error!.Code);
    }
    [PostgisFact]
    public async Task QueriesUseOneSourceAndJoinOnlyAggregateContext()
    {
        var schema = "density_" + Guid.NewGuid().ToString("N"); await using var admin = new NpgsqlConnection(Environment.GetEnvironmentVariable("CTC_TEST_CONNECTIONSTRING")); await admin.OpenAsync();
        await new NpgsqlCommand("CREATE SCHEMA " + schema, admin).ExecuteNonQueryAsync();
        try
        {
            var cs = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("CTC_TEST_CONNECTIONSTRING")) { SearchPath = schema + ",public,extensions" };
            await using var source = new NpgsqlDataSourceBuilder(cs.ConnectionString).UseNetTopologySuite().Build(); await using var db = await source.OpenConnectionAsync();
            var sql = (await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "schema.sql"))).Replace("SET search_path TO public, extensions;", "SET search_path TO " + schema + ",public,extensions;");
            await new NpgsqlCommand(sql, db).ExecuteNonQueryAsync();
            await new NpgsqlCommand("""
             INSERT INTO department_boundaries VALUES('15','TEST',ST_Multi(ST_GeomFromText('POLYGON((-77 -12,-77.1 -12,-77.1 -12.1,-77 -12))',4326)));
             INSERT INTO monthly_reports VALUES(2026,1,'150101','TEST','TEST','TEST','A',10);
             INSERT INTO concentration_imports(source_key,year,month,source_url,sha256,source_rows,distinct_source_ids,quality) VALUES
               ('active-2026',2026,1,'https://example.test/official',repeat('a',64),9,7,'{}'),
               ('archive-2025-robbery',2026,1,'https://example.test/archive',repeat('b',64),100,100,'{}');
             INSERT INTO concentration_series VALUES(1,'all'),(2,'all');
             INSERT INTO concentration_areas VALUES(1,'all','150101',9,7),(2,'all','150101',100,100);
             INSERT INTO concentration_cells VALUES(1,'all','150101',-8575,-1350,5),(1,'all','150101',-8585,-1350,2);
             INSERT INTO concentration_imports(source_key,year,month,source_url,sha256,source_rows,distinct_source_ids,quality) VALUES
               ('archive-2025-extortion',2025,1,'https://example.test/extortion',repeat('c',64),6,NULL,'{"businessIdentifierField":null}');
             INSERT INTO concentration_series VALUES(3,'extortion');
             INSERT INTO concentration_areas VALUES(3,'extortion','150101',6,6);
             INSERT INTO concentration_cells VALUES(3,'extortion','150101',-8575,-1350,6);
             """, db).ExecuteNonQueryAsync();
            var repo = new ChapaTuChoro.Infrastructure.Persistence.ConcentrationReadRepository(source);
            Assert.Equal(2, (await repo.MetadataAsync(default)).Available.Count);
            var result = (await new GetConcentrationHandler(repo).HandleAsync(new(2026, 1, "all", "15", null, null), default)).Value!;
            Assert.Equal(9, result.SourceRecords); Assert.Equal(7, result.MappedRecords); Assert.Equal(5, result.VisibleRecords);
            Assert.Equal(10, Assert.Single(result.Ranking).SidpolReports); Assert.Single(result.Cells);
            Assert.Equal(1000, result.GridMetres); Assert.Equal(7, Assert.Single(result.Monthly).Reports);
            Assert.Equal(7, result.Quality.DistinctSourceIdentifiers);
            var archive = (await new GetConcentrationHandler(repo).HandleAsync(new(2025, 1, "extortion", "15", null, null), default)).Value!;
            Assert.Null(archive.Quality.DistinctSourceIdentifiers);
            Assert.Equal(6, archive.SourceRecords); Assert.Equal(6, archive.VisibleRecords);
            var json = System.Text.Json.JsonSerializer.Serialize(archive.Quality, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
            Assert.Contains("\"distinctSourceIdentifiers\":null", json);
        }
        finally { await new NpgsqlCommand("DROP SCHEMA " + schema + " CASCADE", admin).ExecuteNonQueryAsync(); }
    }
}
