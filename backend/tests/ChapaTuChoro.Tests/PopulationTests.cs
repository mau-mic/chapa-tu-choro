using ChapaTuChoro.Application.Population;
using ChapaTuChoro.Application.Statistics;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class PopulationTests
{
    private static readonly PopulationRelease Release = new("test", "https://www.gob.pe/inei", DateTimeOffset.UnixEpoch);
    private static readonly PopulationQuery Query = new(2024, 1, null, null, null, null);

    [Fact]
    public void UsesAnnualPopulationAndKeepsMissingMonthsNull()
    {
        var result = PopulationComparison.Create(Query, Release,
            [new("000000", "Perú", 2000), new("150000", "Lima", 1000), new("070000", "Callao", 1000)],
            [new(1, "150000", 10, 0), new(1, "070000", 20, 0), new(2, "150000", 0, 0)]);
        Assert.Equal(1500m, result.Monthly[0].RatePer100k);
        Assert.Equal(0m, result.Monthly[1].RatePer100k);
        Assert.Null(result.Monthly[2].Reports);
        Assert.Null(result.Monthly[2].RatePer100k);
        Assert.Equal("070000", result.Ranking[0].Ubigeo);
        Assert.Equal(2000m, result.Ranking[0].RatePer100k);
        Assert.Equal(2000L, result.Population);
    }

    [Fact]
    public void MissingPopulationSuppressesRatesAndPreservesReports()
    {
        var result = PopulationComparison.Create(Query, Release,
            [new("000000", "Perú", 2000)], [new(1, "150000", 10, 1)]);
        Assert.Equal(10L, result.Monthly[0].Reports);
        Assert.Null(result.Monthly[0].RatePer100k);
        Assert.Null(result.Ranking[0].RatePer100k);
        Assert.Equal(1, result.Monthly[0].RowsWithoutPopulation);
    }

    [Fact]
    public async Task RejectsInvalidFiltersWithoutDatabaseCalls()
    {
        var repository = new NeverRead();
        var handler = new GetPopulationComparisonHandler(repository);
        foreach (var query in new[] { Query with { Month = 13 }, Query with { Year = 1999 },
            Query with { Department = "15", Province = "0701" }, Query with { Category = new string('x',201) } })
            Assert.False((await handler.HandleAsync(query, default)).IsSuccess);
    }

    private sealed class NeverRead : IPopulationReadRepository
    {
        public Task<PopulationComparison?> ReadAsync(PopulationQuery query, CancellationToken ct) =>
            throw new InvalidOperationException("Invalid filters reached database");
    }

    [Fact]
    public async Task UnavailableDenominatorReturnsExpectedErrorAndCallerCancellationPropagates()
    {
        var handler = new GetPopulationComparisonHandler(new EmptyRead());
        var result = await handler.HandleAsync(Query, default);
        Assert.Equal("population.unavailable", result.Error?.Code);
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => handler.HandleAsync(Query, cancelled.Token));
    }

    private sealed class EmptyRead : IPopulationReadRepository
    {
        public Task<PopulationComparison?> ReadAsync(PopulationQuery query, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            return Task.FromResult<PopulationComparison?>(null);
        }
    }
}
