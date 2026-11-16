using ChapaTuChoro.Application.Concentration;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Infrastructure.Persistence;
using Npgsql;
using Xunit;

namespace ChapaTuChoro.Tests;
public sealed class ConcentrationTrendsTests
{
 [PostgisFact]
 public async Task IndependentAnnualSourceReconcilesChartsAndDistinguishesMissingMonthsFromZero()
 {
  var schema="geo_trends_"+Guid.NewGuid().ToString("N");var original=Environment.GetEnvironmentVariable("CTC_TEST_CONNECTIONSTRING");
  await using var admin=new NpgsqlConnection(original);await admin.OpenAsync();
  await new NpgsqlCommand("CREATE SCHEMA "+schema,admin).ExecuteNonQueryAsync();
  try{
   var cs=new NpgsqlConnectionStringBuilder(original){SearchPath=schema+",public,extensions"};
   await using var source=new NpgsqlDataSourceBuilder(cs.ConnectionString).UseNetTopologySuite().Build();
   await using var db=await source.OpenConnectionAsync();
   var sql=(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory,"schema.sql"))).Replace("SET search_path TO public, extensions;","SET search_path TO "+schema+",public,extensions;");
   await new NpgsqlCommand(sql,db).ExecuteNonQueryAsync();
   // Synthetic source aggregates only, never user-facing official data.
   await new NpgsqlCommand("""
    INSERT INTO concentration_imports(source_key,year,month,source_url,sha256,source_rows,distinct_source_ids,quality) VALUES
     ('active-2026',2026,1,'https://example.test/active',repeat('a',64),10,8,'{}'),
     ('active-2026',2026,3,'https://example.test/active',repeat('b',64),0,0,'{}'),
     ('archive-2025-robbery',2025,1,'https://example.test/robbery',repeat('c',64),3,3,'{}'),
     ('archive-2025-theft',2025,1,'https://example.test/theft',repeat('d',64),90,90,'{}');
    INSERT INTO concentration_series VALUES(1,'all'),(1,'robbery'),(1,'theft'),(2,'all'),(1,'unrecognized'),(3,'robbery'),(4,'theft');
    INSERT INTO concentration_areas VALUES(1,'all','150101',7,5),(1,'all','150201',3,2),
     (1,'robbery','150101',3,2),(1,'robbery','150201',1,1),(1,'theft','150101',2,2),(1,'unrecognized','150101',2,2),
     (3,'robbery','150101',3,1),(4,'theft','150101',90,50);
    INSERT INTO monthly_reports VALUES(2026,1,'150101','TEST DEP','TEST PROV','TEST DIST','Test CSV',999999);
    """,db).ExecuteNonQueryAsync();
   var repo=new ConcentrationTrendsReadRepository(source);var handler=new GetConcentrationTrendsHandler(repo);
   var result=await handler.HandleAsync(new(2026,1,2026,3,"all",null,null,null),default);Assert.True(result.IsSuccess,result.Error?.Description);
   var d=result.Value!;Assert.Equal("source-classification-rows",d.CountingUnit);
   Assert.Equal(new long?[]{10,null,0},d.Data.Monthly.Select(x=>x.Reports));
   Assert.Equal(10,d.Data.Metrics.TotalReports);Assert.Equal(2,d.Data.Metrics.MonthsWithData);Assert.Null(d.Data.Metrics.YearlyChangePercent);
   Assert.Equal(10,d.Data.Categories.Sum(x=>x.Reports));Assert.Equal(10,d.Data.Territories.Sum(x=>x.Reports));
   Assert.Equal(4,d.Data.Categories.Single(x=>x.Category=="Otras modalidades de la fuente").Reports);
   Assert.Equal(2,d.Imports.Count);Assert.Equal(new PeriodDto(2026,3),d.LatestPeriod);
   foreach(var point in d.Data.Monthly.Where(x=>x.Reports.HasValue))Assert.Equal(point.Reports,d.Data.CategorySeries.Sum(x=>x.Monthly.Single(m=>m.Period==point.Period).Reports));
   var province=(await handler.HandleAsync(new(2026,1,2026,3,"all","15","1501",null),default)).Value!.Data;
   Assert.Equal(7,province.Metrics.TotalReports);Assert.Single(province.Territories);Assert.Equal("150101",province.Territories[0].Code);
   var crime=(await handler.HandleAsync(new(2026,1,2026,1,"robbery",null,null,null),default)).Value!.Data;
   Assert.Equal(4,crime.Metrics.TotalReports);Assert.Equal("Robo",Assert.Single(crime.Categories).Category);
   var archive=(await handler.HandleAsync(new(2025,1,2025,1,"robbery",null,null,null),default)).Value!.Data;
   Assert.Equal(3,archive.Metrics.TotalReports);Assert.Null(archive.Metrics.YearlyChangePercent);
   Assert.False((await handler.HandleAsync(new(2025,1,2026,1,"robbery",null,null,null),default)).IsSuccess);
   Assert.False((await handler.HandleAsync(new(2025,1,2025,1,"all",null,null,null),default)).IsSuccess);
   Assert.Equal(999999,(int)(await new NpgsqlCommand("SELECT reports FROM monthly_reports",db).ExecuteScalarAsync())!);
   // The geographic series works without a statistical CSV or a public point table.
   await new NpgsqlCommand("DELETE FROM monthly_reports",db).ExecuteNonQueryAsync();
   var independent=await handler.HandleAsync(new(2026,1,2026,1,"all","15","1501","150101"),default);
   Assert.True(independent.IsSuccess,independent.Error?.Description);Assert.Equal(7,independent.Value!.Data.Metrics.TotalReports);
  }finally{await new NpgsqlCommand("DROP SCHEMA "+schema+" CASCADE",admin).ExecuteNonQueryAsync();}
 }
}
