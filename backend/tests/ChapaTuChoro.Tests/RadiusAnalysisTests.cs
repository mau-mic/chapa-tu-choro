using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Concentration;
using ChapaTuChoro.Infrastructure.Persistence;
using Npgsql;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class RadiusAnalysisTests
{
    private sealed class NoQueries : IConcentrationReadRepository, IConcentrationRadiusRepository
    {
        public Task<ConcentrationMetadata> MetadataAsync(CancellationToken ct) => throw new Exception("Invalid requests must not query");
        public Task<ConcentrationSnapshot?> GetAsync(ConcentrationQuery query, CancellationToken ct) => throw new Exception();
        public Task<Result<RadiusSnapshot>> CountAsync(RadiusQuery query, CancellationToken ct) => throw new Exception();
    }
    [Theory]
    [InlineData(-77,-12,10)] [InlineData(-77,-12,10000)] [InlineData(0,-12,500)]
    [InlineData(-77,double.NaN,500)] [InlineData(double.PositiveInfinity,-12,500)]
    public async Task RejectsInvalidSpatialInputsBeforeAccessingData(double lon, double lat, int radius)
    {
        var repository = new NoQueries();
        var result = await new GetRadiusAnalysisHandler(repository,repository).HandleAsync(new(new(2026,10,"all",null,null,null),lon,lat,radius),default);
        Assert.Equal(ErrorKind.Validation,result.Error!.Kind);
    }
    [PostgisFact]
    public async Task CountsWeightedSourceLocationsByGeodesicMetresAndKeepsScopeAndSuppression()
    {
        var schema="radius_"+Guid.NewGuid().ToString("N");
        var original=Environment.GetEnvironmentVariable("CTC_TEST_CONNECTIONSTRING");
        await using var admin=new NpgsqlConnection(original);await admin.OpenAsync();
        await new NpgsqlCommand("CREATE SCHEMA "+schema,admin).ExecuteNonQueryAsync();
        try
        {
            var cs=new NpgsqlConnectionStringBuilder(original){SearchPath=schema+",public,extensions"};
            await using var source=new NpgsqlDataSourceBuilder(cs.ConnectionString).UseNetTopologySuite().Build();
            await using var db=await source.OpenConnectionAsync();
            var sql=(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory,"schema.sql"))).Replace("SET search_path TO public, extensions;","SET search_path TO "+schema+",public,extensions;");
            await new NpgsqlCommand(sql,db).ExecuteNonQueryAsync();
            await new NpgsqlCommand("""
              INSERT INTO department_boundaries VALUES('15','TEST',ST_Multi(ST_GeomFromText('POLYGON((-77.1 -12.1,-77 -12.1,-77 -12,-77.1 -12,-77.1 -12.1))',4326)));
              INSERT INTO district_boundaries VALUES('150101','TEST',ST_Multi(ST_GeomFromText('POLYGON((-77.1 -12.1,-77 -12.1,-77 -12,-77.1 -12,-77.1 -12.1))',4326)));
              INSERT INTO monthly_reports VALUES(2026,10,'150101','TEST','TEST','TEST','A',123);
              INSERT INTO concentration_imports(source_key,year,month,source_url,sha256,source_rows,distinct_source_ids,quality) VALUES
                ('active-2026',2026,10,'https://example.test/source',repeat('a',64),17,12,'{"locationStorageVersion":1}'),
                ('active-2026',2026,9,'https://example.test/source',repeat('b',64),100,100,'{}');
              INSERT INTO concentration_series VALUES(1,'all'),(1,'robbery'),(2,'all');
              INSERT INTO concentration_areas VALUES(1,'all','150101',14,14),(1,'all','150102',3,3),(1,'robbery','150101',4,4);
              INSERT INTO concentration_locations(import_id,category,ubigeo,longitude,latitude,records)
                SELECT 1,'all','150101',ST_X(p),ST_Y(p),n FROM
                (SELECT ST_Project(ST_SetSRID(ST_MakePoint(-77.05,-12.05),4326)::geography,d,0)::geometry p,n
                   FROM (VALUES (0.0,5),(499.0,2),(501.0,7)) distances(d,n)) points;
              INSERT INTO concentration_locations(import_id,category,ubigeo,longitude,latitude,records) VALUES
                (1,'all','150102',-77.05,-12.05,3),(1,'robbery','150101',-77.05,-12.05,4),(2,'all','150101',-77.05,-12.05,100);
              """,db).ExecuteNonQueryAsync();
            var handler=new GetRadiusAnalysisHandler(new ConcentrationReadRepository(source),new ConcentrationRadiusRepository(source));
            Task<Result<RadiusSnapshot>> Count(int radius=500,string category="all",string? district=null,double lon=-77.05) => handler.HandleAsync(new(new(2026,10,category,district is null?null:"15",null,district),lon,-12.05,radius),default);
            var within500=(await Count()).Value!;Assert.Equal(10,within500.Records);Assert.Equal("Polygon",within500.Area.GetProperty("type").GetString());
            Assert.Equal(17,(await Count(1000)).Value!.Records);
            Assert.Equal(7,(await Count(district:"150101")).Value!.Records);
            var suppressed=(await Count(category:"robbery")).Value!;Assert.True(suppressed.Suppressed);Assert.Null(suppressed.Records);
            var empty=(await Count(lon:-76)).Value!;Assert.Equal(0,empty.Records);Assert.False(empty.Suppressed);
            Assert.Equal(ErrorKind.NotFound,(await Count(district:"159999")).Error!.Kind);
            var old=await handler.HandleAsync(new(new(2026,9,"all",null,null,null),-77.05,-12.05,500),default);
            Assert.Equal("concentration.locations_unavailable",old.Error!.Code);
            var heatmap=(await new GetConcentrationHandler(new ConcentrationReadRepository(source)).HandleAsync(new(2026,10,"all","15",null,null),default)).Value!;
            Assert.True(heatmap.SpatialDetailAvailable);Assert.Equal(500,heatmap.GridMetres);
            Assert.All(heatmap.Cells,c=>Assert.True(c.Records>=5));Assert.Equal(17,heatmap.MappedRecords);
            Assert.Equal(123,(long)(await new NpgsqlCommand("SELECT SUM(reports)::bigint FROM monthly_reports",db).ExecuteScalarAsync())!);
        }
        finally { await new NpgsqlCommand("DROP SCHEMA "+schema+" CASCADE",admin).ExecuteNonQueryAsync(); }
    }
}
