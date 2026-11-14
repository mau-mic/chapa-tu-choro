using ChapaTuChoro.Application.Statistics;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class StatisticsHandlerTests
{
    [Theory]
    [InlineData(null, null, null)]
    [InlineData("", null, null)]
    [InlineData("00", null, null)]
    [InlineData("１５", null, null)]
    [InlineData("15", "0701", null)]
    [InlineData("15", null, "070101")]
    [InlineData("15", "1502", "150101")]
    public async Task MapRejectsUnboundedOrInvalidScopesBeforePersistence(string? department, string? province, string? district)
    {
        var repository = new StubStatisticsRepository();
        var result = await new GetCrimeMapHandler(repository).HandleAsync(new(2024, 1, null), department, province, district, default);
        Assert.False(result.IsSuccess);
        Assert.Equal(ChapaTuChoro.Application.Common.ErrorKind.Validation, result.Error!.Kind);
        Assert.Equal(0, repository.Calls);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("1501", null)]
    [InlineData(null, "150101")]
    [InlineData("1501", "150101")]
    public async Task MapPassesExactScopeCategoryAndCancellationToSingleRead(string? province, string? district)
    {
        var repository = new StubStatisticsRepository();
        using var cancellation = new CancellationTokenSource();
        var result = await new GetCrimeMapHandler(repository).HandleAsync(new(2024, 1, " A "), "15", province, district, cancellation.Token);
        Assert.True(result.IsSuccess);
        Assert.Equal("FeatureCollection", result.Value!.Type);
        Assert.Equal(1, repository.Calls);
        Assert.Equal("A", repository.LastCategory);
        Assert.Equal("15", repository.LastDepartment);
        Assert.Equal(province, repository.LastProvince);
        Assert.Equal(district, repository.LastDistrict);
        Assert.Equal(cancellation.Token, repository.LastMapCancellation);
    }

    [Theory]
    [InlineData(1999, 1)]
    [InlineData(2101, 1)]
    [InlineData(2024, 0)]
    [InlineData(2024, 13)]
    public async Task InvalidFilterNeverReachesPersistence(int year, int month)
    {
        var repo = new StubStatisticsRepository();
        Assert.False((await new GetCrimeMapHandler(repo).HandleAsync(new(year, month, null), "15", null, null, default)).IsSuccess);
        Assert.False((await new GetTopDistrictsHandler(repo).HandleAsync(new(year, month, null), default)).IsSuccess);
        Assert.False((await new GetStatisticsSummaryHandler(repo).HandleAsync(new(year, month, null), default)).IsSuccess);
        Assert.Equal(0, repo.Calls);
    }

    [Fact]
    public async Task OversizedCategoryIsRejectedBeforePersistence()
    {
        var repo = new StubStatisticsRepository();
        var result = await new GetCrimeMapHandler(repo).HandleAsync(new(2024, 1, new string('x', 201)), "15", null, null, default);
        Assert.False(result.IsSuccess);
        Assert.Equal(0, repo.Calls);
    }

    [Theory]
    [InlineData("  TEST  ", "TEST")]
    [InlineData("   ", null)]
    [InlineData(null, null)]
    public async Task AllFilteredUseCasesNormalizeCategories(string? input, string? expected)
    {
        var repo = new StubStatisticsRepository();
        Assert.True((await new GetCrimeMapHandler(repo).HandleAsync(new(2024, 1, input), "15", null, null, default)).IsSuccess);
        Assert.Equal(expected, repo.LastCategory);
        Assert.True((await new GetTopDistrictsHandler(repo).HandleAsync(new(2024, 1, input), default)).IsSuccess);
        Assert.Equal(expected, repo.LastCategory);
        Assert.True((await new GetStatisticsSummaryHandler(repo).HandleAsync(new(2024, 1, input), default)).IsSuccess);
        Assert.Equal(expected, repo.LastCategory);
        Assert.Equal(3, repo.Calls);
    }
    [Theory]
    [InlineData("")]
    [InlineData("00")]
    [InlineData("4")]
    [InlineData("0401")]
    [InlineData("xx")]
    [InlineData("０４")]
    public async Task InvalidDepartmentNeverReachesPersistence(string department)
    {
        var repo = new StubStatisticsRepository();
        var result = await new GetExplorationHandler(repo).HandleAsync(new(2024, 1, null), department, null, null, default);
        Assert.False(result.IsSuccess);
        Assert.Equal(0, repo.Calls);
    }

    [Fact]
    public async Task ExplorerPreservesDepartmentWhenChangingCategory()
    {
        var repo = new StubStatisticsRepository();
        var result = await new GetExplorationHandler(repo).HandleAsync(new(2024, 1, " TEST "), "04", null, null, default);
        Assert.True(result.IsSuccess);
        Assert.Equal("TEST", repo.LastCategory);
        Assert.Equal("04", repo.LastDepartment);
        Assert.Equal("district", result.Value!.Level);
        Assert.False((await new GetExplorationHandler(repo).HandleAsync(new(2024, 1, null), "99", null, null, default)).IsSuccess);
    }

    [Theory]
    [InlineData(null, "0401")]
    [InlineData("04", "")]
    [InlineData("04", "04")]
    [InlineData("04", "040101")]
    [InlineData("04", "0501")]
    [InlineData("04", "0400")]
    [InlineData("04", "04ab")]
    [InlineData("04", "０４０１")]
    public async Task InvalidProvinceNeverReachesPersistence(string? department, string province)
    {
        var repo = new StubStatisticsRepository();
        var result = await new GetExplorationHandler(repo).HandleAsync(new(2024, 1, null), department, province, null, default);
        Assert.False(result.IsSuccess);
        Assert.Equal(0, repo.Calls);
    }

    [Fact]
    public async Task ProvinceFilterIsPassedToPersistenceAndUnknownProvinceReturnsNotFound()
    {
        var repo = new StubStatisticsRepository();
        var handler = new GetExplorationHandler(repo);
        var result = await handler.HandleAsync(new(2024, 1, null), "04", "0401", null, default);
        Assert.True(result.IsSuccess);
        Assert.Equal("0401", repo.LastProvince);
        Assert.Equal("0401", result.Value!.Province);
        var unknown = await handler.HandleAsync(new(2024, 1, null), "04", "0499", null, default);
        Assert.False(unknown.IsSuccess);
        Assert.Equal(ChapaTuChoro.Application.Common.ErrorKind.NotFound, unknown.Error!.Kind);
    }

    [Theory]
    [InlineData(null, null, "040101")]
    [InlineData("04", null, "0401")]
    [InlineData("04", null, "050101")]
    [InlineData("04", "0402", "040101")]
    [InlineData("04", null, "040100")]
    [InlineData("04", null, "040001")]
    [InlineData("04", null, "０４０１０１")]
    public async Task InvalidDistrictNeverReachesPersistence(string? department, string? province, string district)
    {
        var repo = new StubStatisticsRepository();
        var result = await new GetExplorationHandler(repo).HandleAsync(new(2024, 1, null), department, province, district, default);
        Assert.False(result.IsSuccess);
        Assert.Equal(0, repo.Calls);
    }

    [Fact]
    public async Task DistrictMayBeSelectedAcrossAllProvincesAndUnknownDistrictReturnsNotFound()
    {
        var handler = new GetExplorationHandler(new StubStatisticsRepository());
        var result = await handler.HandleAsync(new(2024, 1, null), "04", null, "040101", default);
        Assert.True(result.IsSuccess);
        Assert.Equal("040101", result.Value!.District);
        var unknown = await handler.HandleAsync(new(2024, 1, null), "04", "0401", "040199", default);
        Assert.Equal(ChapaTuChoro.Application.Common.ErrorKind.NotFound, unknown.Error!.Kind);
    }

}

internal sealed class StubStatisticsRepository : IStatisticsReadRepository
{
    public int Calls { get; private set; }
    public string? LastCategory { get; private set; }
    public bool Throw { get; set; }
    public string? LastDepartment { get; private set; }
    public string? LastProvince { get; private set; }
    public Task<ExplorationDto> GetExplorationAsync(int year, int month, string? category, string? department, string? province, string? district, CancellationToken ct)
    {
        Calls++; LastCategory = category; LastDepartment = department; LastProvince = province;
        return Task.FromResult(new ExplorationDto(new(year, month), category, department, province, district,
            department is null ? "department" : "district", [new("04", "TEST DEPARTMENT")], [new("0401", "TEST PROVINCE")], [new("040101", "TEST DISTRICT")],
            new(new(year, month), category, 0, 0, 0), [], new("FeatureCollection", [])));
    }
    public Task<MetadataDto> GetMetadataAsync(CancellationToken ct) => Throw
        ? throw new InvalidOperationException("PRIVATE INTERNAL DETAIL")
        : Task.FromResult(new MetadataDto(null, 0, [], [], "https://example.test", "https://example.test"));
    public Task<IReadOnlyList<string>> GetCategoriesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<string>>([]);
    public Task<IReadOnlyList<DistrictStatisticDto>> GetTopDistrictsAsync(int year, int month, string? category, CancellationToken ct)
    {
        Calls++; LastCategory = category;
        return Task.FromResult<IReadOnlyList<DistrictStatisticDto>>([]);
    }
    public CancellationToken LastMapCancellation { get; private set; }
    public string? LastDistrict { get; private set; }
    public Task<GeoFeatureCollectionDto> GetDistrictMapAsync(int year, int month, string? category, string department, string? province, string? district, CancellationToken ct)
    {
        Calls++; LastCategory = category; LastDepartment = department; LastProvince = province; LastDistrict = district; LastMapCancellation = ct;
        return Task.FromResult(new GeoFeatureCollectionDto("FeatureCollection", []));
    }
    public Task<StatisticsSummaryDto> GetSummaryAsync(int year, int month, string? category, CancellationToken ct)
    {
        Calls++; LastCategory = category;
        return Task.FromResult(new StatisticsSummaryDto(new(year, month), category, 0, 0, 0));
    }
}
