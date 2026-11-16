using ChapaTuChoro.Application.Population;
using ChapaTuChoro.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using System.Data.Common;
using Npgsql;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class PostgisPopulationTests
{
    [PostgisFact]
    public async Task FiltersAggregatesAndSuppressesUnmatchedRatesInPostgres()
    {
        var schema = "population_test_" + Guid.NewGuid().ToString("N");
        var cs = Environment.GetEnvironmentVariable("CTC_TEST_CONNECTIONSTRING")!;
        await using var admin = new NpgsqlConnection(cs);
        await admin.OpenAsync();
        await new NpgsqlCommand($"CREATE SCHEMA {schema}", admin).ExecuteNonQueryAsync();
        try
        {
            var builder = new NpgsqlConnectionStringBuilder(cs) { SearchPath = $"{schema},public,extensions" };
            await using var source = new NpgsqlDataSourceBuilder(builder.ConnectionString).UseNetTopologySuite().Build();
            await using var connection = await source.OpenConnectionAsync();
            var sql = (await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "schema.sql"))) +
                (await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "population.sql")));
            await new NpgsqlCommand(sql.Replace("SET search_path TO public, extensions;", $"SET search_path TO {schema},public,extensions;"), connection).ExecuteNonQueryAsync();
            await new NpgsqlCommand("""
                INSERT INTO population_releases(sha256,source_url,active) VALUES(repeat('a',64),'https://www.gob.pe/inei',true);
                INSERT INTO population_observations(release_sha256,year,ubigeo,name,people) VALUES
                (repeat('a',64),2024,'000000','Perú',3000),
                (repeat('a',64),2024,'150000','Lima',2000),
                (repeat('a',64),2024,'150100','Lima province',2000),
                (repeat('a',64),2024,'150101','District A',1000),
                (repeat('a',64),2024,'150102','District B',1000),
                (repeat('a',64),2024,'070000','Callao',1000),
                (repeat('a',64),2024,'070101','Callao district',1000);
                INSERT INTO monthly_reports VALUES
                (2024,1,'150101','Lima','Lima','A','A',10),
                (2024,1,'150101','Lima','Lima','A','B',5),
                (2024,1,'150102','Lima','Lima','B','A',20),
                (2024,1,'070101','Callao','Callao','C','A',30),
                (2024,2,'150101','Lima','Lima','A','A',0);
                """, connection).ExecuteNonQueryAsync();
            var commands = new CommandCounter();
            await using var db = new CrimeWatchDbContext(new DbContextOptionsBuilder<CrimeWatchDbContext>()
                .UseNpgsql(source, pg => pg.UseNetTopologySuite()).AddInterceptors(commands).Options);
            var repo = new PopulationReadRepository(db);
            var query = new PopulationQuery(2024, 1, null, null, null, null);
            var national = (await repo.ReadAsync(query, default))!;
            Assert.Equal(3, commands.Sql.Count);
            Assert.Contains("GROUP BY", commands.Sql[^1]);
            Assert.Equal(65L, national.Monthly[0].Reports);
            Assert.Equal(2166.67m, national.Monthly[0].RatePer100k);
            Assert.Equal(0m, national.Monthly[1].RatePer100k);
            Assert.Null(national.Monthly[2].RatePer100k);
            Assert.Equal(2, national.Ranking.Count);
            Assert.Equal("070000", national.Ranking[0].Ubigeo);
            var department = (await repo.ReadAsync(query with { Department = "15", Category = "A" }, default))!;
            Assert.Equal("province", department.Level);
            Assert.Equal(1500m, department.Ranking.Single().RatePer100k);
            var district = (await repo.ReadAsync(query with { Department = "15", Province = "1501", District = "150101", Category = "B" }, default))!;
            Assert.Equal(5L, district.Monthly[0].Reports);
            Assert.Equal(500m, district.Monthly[0].RatePer100k);
            Assert.Null(await repo.ReadAsync(query with { Year = 2010 }, default));
            Assert.Null(await repo.ReadAsync(query with { Department = "99" }, default));
            await new NpgsqlCommand("""
                INSERT INTO population_observations(release_sha256,year,ubigeo,name,people)
                SELECT release_sha256,2025,ubigeo,name,people*2 FROM population_observations WHERE year=2024;
                INSERT INTO monthly_reports VALUES(2025,1,'150101','Lima','Lima','A','A',60);
                """,connection).ExecuteNonQueryAsync();
            var historyRepo=new PopulationHistoryReadRepository(db);
            commands.Sql.Clear();
            var history=(await historyRepo.ReadAsync(new(2024,1,2025,1,null,null,null,null,"150000,070000"),default))!;
            Assert.Equal(3,commands.Sql.Count);
            Assert.Contains("GROUP BY",commands.Sql[^1]);
            Assert.Equal(2166.67m,history.Monthly[0].RatePer100k);
            Assert.Equal(1000m,history.Monthly[^1].RatePer100k);
            Assert.Equal(6000L,history.Monthly[^1].Population);
            Assert.Equal(2,history.Series.Count);
            Assert.Equal(13,history.Series[0].Points.Count);
            Assert.Null(history.Series[1].Points[^1].Reports);
            Assert.Equal(3,history.Quality.ExpectedDistricts);
            Assert.Equal(1,history.Quality.DistrictsWithReports);
            Assert.Equal(1,history.Quality.MissingGeometryDistricts);
            var filtered=(await historyRepo.ReadAsync(new(2024,1,2024,1,"B","15","1501",null,"150101"),default))!;
            Assert.Equal(500m,filtered.Series.Single().Points.Single().RatePer100k);
            var insightRepo = new PopulationInsightsReadRepository(db);
            commands.Sql.Clear();
            var insight = (await insightRepo.ReadAsync(new(2024,1,2024,1,null,"15",null,null,null),default))!;
            Assert.Equal(3,commands.Sql.Count);
            Assert.Contains("GROUP BY",commands.Sql[^1]);
            Assert.Contains("Population insights",commands.Sql[^1]);
            Assert.Equal(35L,insight.Monthly.Single().Scope.Reports);
            Assert.Equal(65L,insight.Monthly.Single().National.Reports);
            Assert.Equal(2166.67m,insight.Monthly.Single().National.RatePer100k);
            Assert.Equal(-19.23m,insight.Monthly.Single().NationalDifferencePercent);
            var insightFiltered = (await insightRepo.ReadAsync(new(2024,1,2024,1,"B","15","1501","150101",null),default))!;
            Assert.Equal(500m,insightFiltered.Monthly.Single().Scope.RatePer100k);
            Assert.Equal(5L,insightFiltered.Monthly.Single().National.Reports);
            var gap = (await insightRepo.ReadAsync(new(2025,1,2025,1,null,"07",null,null,null),default))!;
            Assert.Null(gap.Monthly.Single().Scope.Reports);
            Assert.Equal(60L,gap.Monthly.Single().National.Reports);
            Assert.Equal(1000m,gap.Monthly.Single().National.RatePer100k);
            var explicitZero = (await insightRepo.ReadAsync(new(2024,2,2024,2,null,"15","1501","150101",null),default))!;
            Assert.Equal(0L,explicitZero.Monthly.Single().Scope.Reports);
            Assert.Equal(0m,explicitZero.Monthly.Single().Scope.RatePer100k);
            Assert.Null(explicitZero.Monthly.Single().NationalDifferencePercent);
            await new NpgsqlCommand("INSERT INTO monthly_reports VALUES(2024,1,'150199','Lima','Lima','Unknown','A',2)", connection).ExecuteNonQueryAsync();
            var nationalMismatch = (await insightRepo.ReadAsync(new(2024,1,2024,1,null,"07",null,null,null),default))!;
            Assert.Equal(3000m,nationalMismatch.Monthly.Single().Scope.RatePer100k);
            Assert.Null(nationalMismatch.Monthly.Single().National.RatePer100k);
            Assert.Equal(67L,nationalMismatch.Monthly.Single().National.Reports);
            var unmatched = (await repo.ReadAsync(query, default))!;
            Assert.Equal(67L, unmatched.Monthly[0].Reports);
            Assert.Null(unmatched.Monthly[0].RatePer100k);
            Assert.Equal(1, unmatched.Monthly[0].RowsWithoutPopulation);
            Assert.Null(unmatched.Ranking.Single(x => x.Ubigeo == "150000").RatePer100k);
            await new NpgsqlCommand("""
                INSERT INTO department_boundaries SELECT code,name,ST_Multi(ST_GeomFromText('POLYGON((-77 -12,-77.1 -12,-77.1 -12.1,-77 -12))',4326))
                FROM (VALUES('15','Lima'),('07','Callao')) AS t(code,name);
                """,connection).ExecuteNonQueryAsync();
            var mapHandler=new GetRateExplorationHandler(new(new StatisticsReadRepository(db,source)),new(historyRepo));
            var rateMap=(await mapHandler.HandleAsync(new(2024,1,null),null,null,null,default)).Value!;
            Assert.Equal(67L,rateMap.Summary.Reports);
            Assert.Equal(2,rateMap.Map.Features.Count);
            Assert.Null(rateMap.Map.Features.Single(x=>x.Properties.Code=="15").Properties.RatePer100k);
            Assert.Equal(3000m,rateMap.Map.Features.Single(x=>x.Properties.Code=="07").Properties.RatePer100k);
            Assert.Equal(30L,rateMap.Map.Features.Single(x=>x.Properties.Code=="07").Properties.Reports);
        }
        finally
        {
            await new NpgsqlCommand($"DROP SCHEMA {schema} CASCADE", admin).ExecuteNonQueryAsync();
        }
    }

    private sealed class CommandCounter : DbCommandInterceptor
    {
        public List<string> Sql { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Sql.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }
    }
}
