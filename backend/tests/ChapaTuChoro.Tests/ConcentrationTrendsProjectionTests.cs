using ChapaTuChoro.Application.Concentration;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Domain.Reports;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class ConcentrationTrendsProjectionTests
{
    private static ConcentrationTrendsSnapshot Project(TrendsQuery query, int[] months, params ConcentrationTrendRow[] rows) =>
        ConcentrationTrendsProjection.Project(query, [], months, rows, [new("15", "Lima")],
            [new("1501", "Lima province")], new Dictionary<string, string> { ["150101"] = "Lima district", ["070101"] = "Callao district" });

    [Fact]
    public void AuthoritativeTotalsReconcileCategoriesIncludingResidualAndRetainImportedZeros()
    {
        var query = new TrendsQuery(2026, 1, 2026, 3, "all", null, null, null);
        var snapshot = Project(query, [1, 3], new ConcentrationTrendRow(1, "all", "15", 10), new ConcentrationTrendRow(1, "robbery", "15", 4),
            new ConcentrationTrendRow(1, "theft", "15", 2), new ConcentrationTrendRow(1, "unrecognized", "15", 2));
        var result = GetTrendsHandler.Project(query, snapshot.Data).Value!;
        Assert.Equal(new long?[] { 10, null, 0 }, result.Monthly.Select(month => month.Reports));
        Assert.Equal(10, result.Metrics.TotalReports);
        Assert.Equal(10, result.Categories.Sum(category => category.Reports));
        Assert.Equal(4, result.Categories.Single(category => category.Category == "Otras modalidades de la fuente").Reports);
        Assert.Equal(10, Assert.Single(result.Territories).Reports);
        Assert.Equal("Lima", Assert.Single(result.Territories).Name);
        Assert.All(result.CategorySeries, category => Assert.Equal(0, category.Monthly.Single(month => month.Period.Month == 3).Reports));
        Assert.All(result.CategorySeries, category => Assert.Null(category.Monthly.Single(month => month.Period.Month == 2).Reports));
        Assert.Null(result.Metrics.YearlyChangePercent);
    }

    [Fact]
    public void ComparisonMonthDoesNotEnterCategoryOrTerritoryRangeAndUnknownPlacesKeepCodes()
    {
        var snapshot = Project(new(2026, 3, 2026, 3, "all", null, null, null), [2, 3],
            new ConcentrationTrendRow(2, "all", "15", 100), new ConcentrationTrendRow(3, "all", "07", 2), new ConcentrationTrendRow(3, "robbery", "07", 2));
        Assert.Equal(new long?[] { 100, 2 }, snapshot.Data.Observations.Select(observation => observation.Reports));
        Assert.Equal(2, snapshot.Data.Categories.Sum(category => category.Reports));
        Assert.Equal("07", Assert.Single(snapshot.Data.Territories).Name);
        Assert.Equal(2, Assert.Single(snapshot.Data.Territories).Reports);
        Assert.Contains(snapshot.Data.Departments, department => department.Code == "07" && department.Name == "07");
        Assert.All(snapshot.Data.CategoryObservations!, observation => Assert.Equal(3, observation.Period.Month));
    }

    [Theory]
    [InlineData(null, "1501", "Lima province")]
    [InlineData("1501", "150101", "Lima district")]
    public void GeographicNamesFollowSelectedAggregationLevel(string? province, string code, string expectedName)
    {
        var snapshot = Project(new(2026, 1, 2026, 1, "robbery", "15", province, null), [1], new ConcentrationTrendRow(1, "robbery", code, 3));
        Assert.Equal(expectedName, Assert.Single(snapshot.Data.Territories).Name);
        Assert.Equal("Robo", Assert.Single(snapshot.Data.Categories).Category);
        Assert.Equal(3, Assert.Single(snapshot.Data.Categories).Reports);
        Assert.DoesNotContain(snapshot.Data.Districts, district => district.Code.StartsWith("07"));
    }

    [Fact]
    public void EmptyImportedSingleCategoryRemainsZeroAndNegativeResidualIsRejected()
    {
        var empty = Project(new(2025, 1, 2025, 1, "robbery", null, null, null), [1]);
        Assert.Equal(0, Assert.Single(empty.Data.Observations).Reports);
        Assert.Equal("Robo", Assert.Single(empty.Data.Categories).Category);
        Assert.Equal(0, Assert.Single(empty.Data.Categories).Reports);
        Assert.Throws<InvalidOperationException>(() => Project(new(2026, 1, 2026, 1, "all", null, null, null), [1],
            new ConcentrationTrendRow(1, "all", "15", 1), new ConcentrationTrendRow(1, "robbery", "15", 2)));
    }
}
