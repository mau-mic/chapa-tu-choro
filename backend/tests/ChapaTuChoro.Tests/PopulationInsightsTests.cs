using ChapaTuChoro.Application.Population;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class PopulationInsightsTests
{
    private static readonly PopulationRelease Source = new("test", "https://www.gob.pe/inei", DateTimeOffset.UnixEpoch);
    private static PopulationHistoryQuery Query(int year = 2025) => new(year, 1, year, 1, null, "15", null, null, null);

    [Fact]
    public void RollingMeansRequireCalendarWindowsAndPreserveZero()
    {
        var facts = Enumerable.Range(1,12).Select(m => new PopulationInsightFact(2024,m,m,m*3,0,0))
            .Append(new(2025,1,0,0,0,0)).ToArray();
        var areas = new[] { new PopulationDenominator(2024,"150000",1000), new(2025,"150000",1000),
            new(2024,"000000",3000), new(2025,"000000",3000) };
        var point = PopulationInsightsProjection.Create(Query(),Source,areas,facts).Monthly.Single();
        Assert.Equal(0L, point.Scope.Reports);
        Assert.Equal(0m, point.Scope.RatePer100k);
        Assert.Equal(7.67m, point.Scope.Rolling3.Reports);
        Assert.Equal(6.42m, point.Scope.Rolling12.Reports);
        Assert.Equal(3, point.Scope.Rolling3.ReportObservations);
        var missing = facts.Select(x => x.Month == 12 ? x with { ScopeReports = null } : x).ToArray();
        point = PopulationInsightsProjection.Create(Query(),Source,areas,missing).Monthly.Single();
        Assert.Null(point.Scope.Rolling3.Reports);
        Assert.Equal(2,point.Scope.Rolling3.ReportObservations);
        Assert.Equal(3,point.Scope.Rolling3.RequiredObservations);
        Assert.NotNull(point.National.Rolling3.Reports);
    }

    [Fact]
    public void BaselinesUseOnlyEarlierMonthsAndEachYearsPopulation()
    {
        var facts = Enumerable.Range(0,36).Select(i => {
            var date = new DateOnly(2022,1,1).AddMonths(i);
            long count = (date.Year-2021)*10;
            return new PopulationInsightFact(date.Year,date.Month,count,count*3,0,0);
        }).Append(new(2025,1,100,300,0,0)).ToArray();
        var areas = Enumerable.Range(2022,4).SelectMany(year => new[] {
            new PopulationDenominator(year,"150000",year==2025?10000:(year-2021)*1000),
            new PopulationDenominator(year,"000000",year==2025?30000:(year-2021)*3000)
        }).ToArray();
        var data = PopulationInsightsProjection.Create(Query(),Source,areas,facts);
        var point = data.Monthly.Single();
        Assert.Equal(20m,point.Scope.HistoricalBaseline.Reports);
        Assert.Equal(20m,point.Scope.SeasonalBaseline.Reports);
        Assert.Equal(1000m,point.Scope.SeasonalBaseline.RatePer100k);
        Assert.Equal(400m,point.Scope.SeasonalChange.ReportsPercent);
        Assert.Equal(0m,point.Scope.SeasonalChange.RatePercent);
        Assert.Equal(36,point.Scope.HistoricalBaseline.RequiredObservations);
        Assert.Equal(3,point.Scope.SeasonalBaseline.RequiredObservations);
        var incomplete = facts.Where(x => x.Year!=2023 || x.Month!=1).ToArray();
        point = PopulationInsightsProjection.Create(Query(),Source,areas,incomplete).Monthly.Single();
        Assert.Null(point.Scope.HistoricalBaseline.Reports);
        Assert.Null(point.Scope.SeasonalBaseline.Reports);
        Assert.Equal(35,point.Scope.HistoricalBaseline.ReportObservations);
        Assert.Equal(2,point.Scope.SeasonalBaseline.ReportObservations);
    }

    [Fact]
    public void NationalReferenceUsesWeightedTotalsAndDoesNotHideLocalDenominatorFailures()
    {
        var areas = new[] {new PopulationDenominator(2025,"150000",2000),new PopulationDenominator(2025,"000000",3000)};
        var fact = new PopulationInsightFact(2025,1,35,65,0,0);
        var point = PopulationInsightsProjection.Create(Query(),Source,areas,[fact]).Monthly.Single();
        Assert.Equal(1750m,point.Scope.RatePer100k);
        Assert.Equal(2166.67m,point.National.RatePer100k);
        Assert.Equal(-416.67m,point.NationalDifferencePer100k);
        Assert.Equal(-19.23m,point.NationalDifferencePercent);
        point = PopulationInsightsProjection.Create(Query(),Source,areas,[fact with {NationalMissingPopulation=1}]).Monthly.Single();
        Assert.NotNull(point.Scope.RatePer100k);
        Assert.Null(point.National.RatePer100k);
        Assert.Null(point.NationalDifferencePercent);
        point = PopulationInsightsProjection.Create(Query(),Source,areas,[fact with {ScopeReports=0,NationalReports=0}]).Monthly.Single();
        Assert.Equal(0m,point.NationalDifferencePer100k);
        Assert.Null(point.NationalDifferencePercent);
    }

    [Theory]
    [InlineData(2025,13,2025,1)]
    [InlineData(2025,2,2025,1)]
    [InlineData(2010,1,2025,1)]
    public async Task InvalidInsightRangesNeverReachPersistence(int fy,int fm,int ty,int tm)
    {
        var result = await new GetPopulationInsightsHandler(new NeverRead()).HandleAsync(new(fy,fm,ty,tm,null,null,null,null,null),default);
        Assert.False(result.IsSuccess);
    }
    [Fact]
    public async Task CallerCancellationIsPropagatedAndCategoryIsNormalized()
    {
        using var caller = new CancellationTokenSource();
        var capture = new Capture();
        var handler = new GetPopulationInsightsHandler(capture);
        var result = await handler.HandleAsync(Query() with { Category = " A " }, caller.Token);
        Assert.False(result.IsSuccess);
        Assert.Equal("A",capture.Category);
        Assert.True(capture.Cancellable);
        caller.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => handler.HandleAsync(Query(),caller.Token));
    }
    private sealed class Capture : IPopulationInsightsReadRepository
    {
        public string? Category { get; private set; }
        public bool Cancellable { get; private set; }
        public Task<PopulationInsightsDto?> ReadAsync(PopulationHistoryQuery query,CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            Category=query.Category;
            Cancellable=ct.CanBeCanceled;
            return Task.FromResult<PopulationInsightsDto?>(null);
        }
    }

    private sealed class NeverRead : IPopulationInsightsReadRepository
    {
        public Task<PopulationInsightsDto?> ReadAsync(PopulationHistoryQuery query,CancellationToken ct) => throw new InvalidOperationException("Invalid input reached persistence");
    }
}
