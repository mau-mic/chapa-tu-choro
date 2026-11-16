using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Statistics;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class TrendsHandlerTests
{
    [Fact]
    public async Task GapsAreNullExplicitZeroIsPreservedAndComparisonsMayBeOutsideTheRange()
    {
        var repo = new StubTrendsRepository();
        var result = await new GetTrendsHandler(repo).HandleAsync(new(2024, 1, 2024, 4, " A ", "04", "0401", "040101"), default);
        Assert.True(result.IsSuccess);
        var data = result.Value!;
        Assert.Equal("A", repo.LastQuery!.Category);
        Assert.Equal("040101", repo.LastQuery.District);
        Assert.Equal(new long?[] { 10, 0, null, 20 }, data.Monthly.Select(p => p.Reports));
        Assert.Equal(30, data.Metrics.TotalReports);
        Assert.Equal(new long?[] { 10, 0, null, 20 }, Assert.Single(data.CategorySeries).Monthly.Select(x => x.Reports));
        Assert.Equal(3, data.Metrics.MonthsWithData);
        Assert.Equal(4, data.Metrics.RequestedMonths);
        Assert.Null(data.Metrics.MonthlyChangePercent);
        Assert.Equal(100m, data.Metrics.YearlyChangePercent);
        Assert.Equal(10, data.Metrics.PreviousYearMonthReports);
    }

    [Fact]
    public async Task ZeroReferenceCannotProduceAnInfinitePercentageAndReportedZeroIsNotMissing()
    {
        var handler = new GetTrendsHandler(new StubTrendsRepository());
        var result = (await handler.HandleAsync(new(2024, 2, 2024, 2, null, null, null, null), default)).Value!;
        Assert.Equal(0, result.Metrics.TotalReports);
        Assert.Equal(-100m, result.Metrics.MonthlyChangePercent);
        Assert.Null(result.Metrics.YearlyChangePercent);
        var empty = (await handler.HandleAsync(new(2024, 3, 2024, 3, null, null, null, null), default)).Value!;
        Assert.Null(empty.Metrics.TotalReports);
        Assert.Null(Assert.Single(empty.Monthly).Reports);
        Assert.Equal(0, empty.Metrics.MonthsWithData);
    }

    [Theory]
    [InlineData(2024, 0, 2024, 1)]
    [InlineData(1999, 1, 2024, 1)]
    [InlineData(2024, 1, 2024, 13)]
    [InlineData(2024, 2, 2024, 1)]
    [InlineData(2014, 1, 2024, 1)]
    public async Task InvalidRangesNeverReachPersistence(int fy, int fm, int ty, int tm)
    {
        var repo = new StubTrendsRepository();
        var result = await new GetTrendsHandler(repo).HandleAsync(new(fy, fm, ty, tm, null, null, null, null), default);
        Assert.Equal(ErrorKind.Validation, result.Error!.Kind);
        Assert.Null(repo.LastQuery);
    }

    [Fact]
    public async Task ParentValidationAndUnknownGeographyAreSharedWithTheMap()
    {
        var repo = new StubTrendsRepository();
        var handler = new GetTrendsHandler(repo);
        var invalid = await handler.HandleAsync(new(2024, 1, 2024, 1, null, "04", "0501", null), default);
        Assert.Equal(ErrorKind.Validation, invalid.Error!.Kind);
        Assert.Null(repo.LastQuery);
        var unknown = await handler.HandleAsync(new(2024, 1, 2024, 1, null, "04", "0401", "040199"), default);
        Assert.Equal(ErrorKind.NotFound, unknown.Error!.Kind);
    }
}

internal sealed class StubTrendsRepository : ITrendsReadRepository
{
    public TrendsQuery? LastQuery { get; private set; }
    public Task<TrendsSnapshot> GetAsync(TrendsQuery query, CancellationToken ct)
    {
        LastQuery = query;
        return Task.FromResult(new TrendsSnapshot(
            [new(new(2023, 2), 0), new(new(2023, 4), 10), new(new(2024, 1), 10), new(new(2024, 2), 0), new(new(2024, 4), 20)],
            [new("TEST A", 30)], [new("040101", "TEST DISTRICT", 30)],
            [new("04", "TEST DEPARTMENT")], [new("0401", "TEST PROVINCE")], [new("040101", "TEST DISTRICT")],
            [new(new(2024, 1), "TEST A", 10), new(new(2024, 2), "TEST A", 0), new(new(2024, 4), "TEST A", 20)]));
    }
}
