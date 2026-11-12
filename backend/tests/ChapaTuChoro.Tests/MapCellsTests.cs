using ChapaTuChoro.Application.Concentration;
using ChapaTuChoro.Infrastructure.Persistence;
using Npgsql;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class MapCellsTests
{
    [PostgisFact]
    public async Task CameraDetailWithoutDepartmentUsesWholeCellsAndKeepsScopeAndSuppression()
    {
        var schema="viewport_"+Guid.NewGuid().ToString("N");var original=Environment.GetEnvironmentVariable("CTC_TEST_CONNECTIONSTRING");
        await using var admin=new NpgsqlConnection(original);await admin.OpenAsync();
        await new NpgsqlCommand("CREATE SCHEMA "+schema,admin).ExecuteNonQueryAsync();
        try
        {
            var cs=new NpgsqlConnectionStringBuilder(original){SearchPath=schema+",public,extensions"};
            await using var source=new NpgsqlDataSourceBuilder(cs.ConnectionString).UseNetTopologySuite().Build();
            await using var db=await source.OpenConnectionAsync();
            var schemaSql=(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory,"schema.sql"))).Replace("SET search_path TO public, extensions;","SET search_path TO "+schema+",public,extensions;");
            await new NpgsqlCommand(schemaSql,db).ExecuteNonQueryAsync();
            // Explicitly synthetic projected-position fixtures, never app data.
            await new NpgsqlCommand("""
              INSERT INTO concentration_imports(source_key,year,month,source_url,sha256,source_rows,distinct_source_ids,quality) VALUES
                ('active-2026',2026,10,'https://example.test/source',repeat('a',64),35,35,'{"locationStorageVersion":1}'),
                ('active-2026',2026,9,'https://example.test/source',repeat('b',64),100,100,'{"locationStorageVersion":1}'),
                ('active-2026',2026,8,'https://example.test/source',repeat('c',64),0,0,'{}');
              INSERT INTO concentration_series VALUES(1,'all'),(1,'robbery'),(2,'all'),(3,'all');
              INSERT INTO concentration_areas VALUES(1,'all','150101',35,35),(1,'robbery','150101',4,4),(2,'all','150101',100,100);
              CREATE TEMP TABLE origin AS SELECT FLOOR(ST_X(p)/500)*500 x,FLOOR(ST_Y(p)/500)*500+250 y
                FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(-77.05,-12.05),4326),3857) p) base;
              INSERT INTO concentration_locations(import_id,category,ubigeo,longitude,latitude,records)
                SELECT id,category,'150101',ST_X(p),ST_Y(p),n FROM
                (SELECT id,category,n,ST_Transform(ST_SetSRID(ST_MakePoint(o.x+d.dx,o.y),3857),4326) p
                  FROM origin o CROSS JOIN (VALUES (1,'all',50,6),(1,'all',450,7),(1,'all',550,9),
                    (1,'all',1050,3),(1,'all',5050,10),(1,'robbery',50,4),(2,'all',50,100)) d(id,category,dx,n)) points;
              """,db).ExecuteNonQueryAsync();
            async Task<MapBounds> Bounds(double left,double right)
            {
                await using var cmd=new NpgsqlCommand("SELECT ST_X(lo),ST_Y(lo),ST_X(hi),ST_Y(hi) FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(x+@left,y-5),3857),4326) lo,ST_Transform(ST_SetSRID(ST_MakePoint(x+@right,y+5),3857),4326) hi FROM origin) b",db);
                cmd.Parameters.AddWithValue("left",left);cmd.Parameters.AddWithValue("right",right);
                await using var reader=await cmd.ExecuteReaderAsync();await reader.ReadAsync();
                return new(reader.GetDouble(0),reader.GetDouble(1),reader.GetDouble(2),reader.GetDouble(3));
            }
            var handler=new GetMapCellsHandler(new ConcentrationReadRepository(source),new ConcentrationCellsRepository(source));
            var narrow=await Bounds(40,60);
            var one=(await handler.HandleAsync(new(new(2026,10,"all",null,null,null),500,narrow),default)).Value!;
            Assert.Equal(500,one.GridMetres);Assert.Equal(13,Assert.Single(one.Cells).Records);
            Assert.True(one.Coverage.West<narrow.West);Assert.True(one.Coverage.East>narrow.East);
            var shifted=(await handler.HandleAsync(new(new(2026,10,"all",null,null,null),500,await Bounds(430,470)),default)).Value!;
            Assert.Equal(one.Cells,shifted.Cells);
            var expanded=(await handler.HandleAsync(new(new(2026,10,"all",null,null,null),500,await Bounds(40,1100)),default)).Value!;
            Assert.Equal(2,expanded.Cells.Count);Assert.Equal(22,expanded.VisibleRecords);Assert.Equal(1,expanded.SuppressedCells);
            Assert.DoesNotContain(expanded.Cells,c=>c.Records<5||c.Records==100);
            var category=(await handler.HandleAsync(new(new(2026,10,"robbery",null,null,null),500,narrow),default)).Value!;
            Assert.Empty(category.Cells);Assert.Equal(1,category.SuppressedCells);Assert.Equal(0,category.VisibleRecords);
            var old=await handler.HandleAsync(new(new(2026,8,"all",null,null,null),500,narrow),default);
            Assert.Equal("concentration.locations_unavailable",old.Error!.Code);
            var coarse=(await handler.HandleAsync(new(new(2026,10,"all",null,null,null),10000,await Bounds(40,1100)),default)).Value!;
            Assert.True(coarse.Cells.Count<expanded.Cells.Count);
            Assert.Equal(35,(long)(await new NpgsqlCommand("SELECT SUM(mapped_records)::bigint FROM concentration_areas WHERE import_id=1 AND category='all'",db).ExecuteScalarAsync())!);
        }
        finally{await new NpgsqlCommand("DROP SCHEMA "+schema+" CASCADE",admin).ExecuteNonQueryAsync();}
    }
}
