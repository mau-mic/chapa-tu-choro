using ChapaTuChoro.Application.Population;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class PopulationHistoryTests
{
    [Fact]
    public void UsesEachYearsPopulationAndPreservesGapsAndExplicitZero()
    {
        var query = new PopulationHistoryQuery(2024,12,2025,3,null,null,null,null,null);
        var result = PopulationHistoryProjection.Create(query, new("test","https://www.gob.pe/inei",DateTimeOffset.UnixEpoch),
            [new(2024,"000000","Perú",1000,false),new(2025,"000000","Perú",2000,false),
             new(2024,"150000","Lima",1000,false),new(2025,"150000","Lima",2000,false),
             new(2025,"150101","Lima",2000,true)],
            [new(2024,12,"150000",10,0,1,0),new(2025,2,"150000",20,0,1,0),new(2025,3,"150000",0,0,1,0)]);
        Assert.Equal(1000m,result.Monthly[0].RatePer100k);
        Assert.Null(result.Monthly[1].Reports);
        Assert.Null(result.Monthly[1].RatePer100k);
        Assert.Equal(1000m,result.Monthly[2].RatePer100k);
        Assert.Equal(0m,result.Monthly[3].RatePer100k);
        Assert.Equal(2000L,result.Monthly[2].Population);
        Assert.Equal(3,result.Quality.MonthsWithReports);
        Assert.Equal(4,result.Quality.RequestedMonths);
    }

    [Fact]
    public void MissingPopulationSuppressesRateAndKeepsQualityAndCounts()
    {
        var query = new PopulationHistoryQuery(2025,1,2025,1,null,null,null,null,"150000");
        var result = PopulationHistoryProjection.Create(query,new("test","https://www.gob.pe/inei",DateTimeOffset.UnixEpoch),
            [new(2025,"000000","Perú",1000,false),new(2025,"150000","Lima",1000,false),new(2025,"150101","Lima",1000,false)],
            [new(2025,1,"150000",10,1,2,1)]);
        Assert.Equal(10L,result.Monthly.Single().Reports);
        Assert.Null(result.Monthly.Single().RatePer100k);
        Assert.Null(result.Series.Single().Points.Single().RatePer100k);
        Assert.Equal(1,result.Quality.MissingPopulationDistricts);
        Assert.Equal(1,result.Quality.MissingGeometryDistricts);
        Assert.Equal(1,result.Quality.PopulationDistrictsWithoutGeometry);
    }

    [Theory]
    [InlineData(2025,2,2025,1,null)]
    [InlineData(2010,1,2025,1,null)]
    [InlineData(2025,1,2025,1,"150000,150000")]
    [InlineData(2025,1,2025,1,"150101")]
    [InlineData(2025,1,2025,1,"010000,020000,030000,040000,050000")]
    public async Task RejectsInvalidRangesAndSelectionsBeforeReading(int fy,int fm,int ty,int tm,string? compare)
    {
        var handler=new GetPopulationHistoryHandler(new NeverRead());
        var result=await handler.HandleAsync(new(fy,fm,ty,tm,null,null,null,null,compare),default);
        Assert.False(result.IsSuccess);
    }
    private sealed class NeverRead:IPopulationHistoryReadRepository
    {
        public Task<PopulationHistoryDto?> ReadAsync(PopulationHistoryQuery query,CancellationToken ct)=>throw new InvalidOperationException("Invalid query reached database");
    }
}
