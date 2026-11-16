using System.Net;
using System.Text.Json;
using ChapaTuChoro.Application.Statistics;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class StatisticsApiTests
{
    private sealed class Factory(bool fail = false) : WebApplicationFactory<Program>
    {
        public StubStatisticsRepository Repository { get; } = new() { Throw = fail };
        protected override void ConfigureWebHost(IWebHostBuilder builder) => builder
            .UseEnvironment("Testing")
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            { ["ConnectionStrings:Default"] = "Host=localhost;Database=unused;Username=unused", ["Database:SsmParameterName"] = "" }))
            .ConfigureServices(services => {
                services.RemoveAll<IStatisticsReadRepository>();
                services.AddSingleton<IStatisticsReadRepository>(Repository);
                services.RemoveAll<ITrendsReadRepository>();
                services.AddSingleton<ITrendsReadRepository>(new StubTrendsRepository());
            });
    }

    [Theory]
    [InlineData("/api/concentration/trends?year=2025&fromMonth=1&toMonth=10&category=all")]
    [InlineData("/api/concentration/trends?year=2026&fromMonth=13&toMonth=10&category=all")]
    [InlineData("/api/concentration/trends?year=2026&fromMonth=3&toMonth=1&category=all")]
    [InlineData("/api/concentration/trends?year=2026&fromMonth=1&toMonth=10&category=unknown")]
    [InlineData("/api/concentration/trends?year=2026&fromMonth=1&toMonth=10&category=all&province=1501")]
    [InlineData("/api/concentration?year=2025&month=1&category=all")]
    [InlineData("/api/concentration/cells?year=2026&month=10&category=all&gridMetres=1&west=-77.3&south=-12.3&east=-76.8&north=-11.7")]
    [InlineData("/api/concentration/cells?year=2026&month=10&category=all&gridMetres=500&west=NaN&south=-12.3&east=-76.8&north=-11.7")]
    [InlineData("/api/concentration/cells?year=2026&month=10&category=all&gridMetres=500&west=-76&south=-12.3&east=-77&north=-11.7")]
    [InlineData("/api/concentration/cells?year=2026&month=10&category=all&gridMetres=500&west=-180&south=-12.3&east=-76.8&north=-11.7")]
    [InlineData("/api/concentration/radius?year=2026&month=1&category=all&longitude=-77&latitude=-12&radiusMetres=1")]
    [InlineData("/api/concentration/radius?year=2026&month=1&category=all&longitude=0&latitude=-12&radiusMetres=500")]
    [InlineData("/api/concentration/radius?year=2026&month=1&category=all&longitude=-77&latitude=NaN&radiusMetres=500")]
    [InlineData("/api/concentration/radius?year=2025&month=1&category=all&longitude=-77&latitude=-12&radiusMetres=500")]
    [InlineData("/api/concentration?year=2026&month=13&category=all")]
    [InlineData("/api/concentration?year=2026&month=1&category=unknown")]
    [InlineData("/api/concentration?year=2026&month=1&category=all&district=150101")]
    [InlineData("/api/trends?fromYear=2024&fromMonth=2&toYear=2024&toMonth=1")]
    [InlineData("/api/trends?fromYear=2024&fromMonth=1&toYear=2024&toMonth=13")]
    [InlineData("/api/trends?fromYear=abc&fromMonth=1&toYear=2024&toMonth=1")]
    [InlineData("/api/trends?fromYear=2024&fromMonth=1&toYear=2024&toMonth=1&district=040101")]
    [InlineData("/api/explorer?year=2024&month=1&district=040101")]
    [InlineData("/api/explorer?year=2024&month=1&department=04&province=0402&district=040101")]
    [InlineData("/api/explorer?year=2024&month=1&department=04&district=040100")]
    [InlineData("/api/explorer?year=2024&month=1&province=0401")]
    [InlineData("/api/explorer?year=2024&month=1&department=04&province=0501")]
    [InlineData("/api/explorer?year=2024&month=1&department=04&province=040101")]
    [InlineData("/api/explorer?year=2024&month=1&department=1501")]
    [InlineData("/api/explorer?year=2024&month=1&department=aa")]
    [InlineData("/api/map?year=2024&month=13")]
    [InlineData("/api/map?year=2024&month=1")]
    [InlineData("/api/map?year=2024&month=1&department=00")]
    [InlineData("/api/map?year=2024&month=1&department=1501")]
    [InlineData("/api/map?year=2024&month=1&department=aa")]
    [InlineData("/api/map?year=2024&month=1&province=1501")]
    [InlineData("/api/map?year=2024&month=1&department=15&province=0701")]
    [InlineData("/api/map?year=2024&month=1&department=15&district=070101")]
    [InlineData("/api/map?year=2024&month=1&department=15&province=1502&district=150101")]
    [InlineData("/api/top-districts?year=abc&month=1")]
    [InlineData("/api/map?year=2024")]
    [InlineData("/api/statistics/summary?year=1999&month=1")]
    public async Task InvalidQueriesReturnProblemDetails(string path)
    {
        await using var factory = new Factory();
        var response = await factory.CreateClient().GetAsync(path);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(400, body.RootElement.GetProperty("status").GetInt32());
    }

    [Fact]
    public async Task EmptyMapIsAValidGeoJsonCollection()
    {
        await using var factory = new Factory();
        var response = await factory.CreateClient().GetAsync("/api/map?year=2024&month=1&department=15");
        response.EnsureSuccessStatusCode();
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("FeatureCollection", body.RootElement.GetProperty("type").GetString());
        Assert.Equal(0, body.RootElement.GetProperty("features").GetArrayLength());
    }

    [Theory]
    [InlineData("", null, null)]
    [InlineData("&province=1501", "1501", null)]
    [InlineData("&district=150101", null, "150101")]
    [InlineData("&province=1501&district=150101", "1501", "150101")]
    public async Task ScopedMapBindsTerritoryAndPreservesGeoJsonContract(string suffix, string? province, string? district)
    {
        await using var factory = new Factory();
        using var response = await factory.CreateClient().GetAsync("/api/map?year=2024&month=1&department=15&category=%20A%20" + suffix);
        response.EnsureSuccessStatusCode();
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("FeatureCollection", body.RootElement.GetProperty("type").GetString());
        Assert.Equal(JsonValueKind.Array, body.RootElement.GetProperty("features").ValueKind);
        Assert.Equal("15", factory.Repository.LastDepartment);
        Assert.Equal(province, factory.Repository.LastProvince);
        Assert.Equal(district, factory.Repository.LastDistrict);
        Assert.Equal("A", factory.Repository.LastCategory);
        Assert.Equal(1, factory.Repository.Calls);
    }

    [Fact]
    public async Task UnexpectedFailuresDoNotExposeInternalDetails()
    {
        await using var factory = new Factory(true);
        var response = await factory.CreateClient().GetAsync("/api/metadata");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("PRIVATE INTERNAL DETAIL", body);
        Assert.Contains("traceId", body);
    }
}
