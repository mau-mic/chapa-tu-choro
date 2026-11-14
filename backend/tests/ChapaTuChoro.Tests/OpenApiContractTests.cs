using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Application.Concentration;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class OpenApiContractTests
{
    private sealed class Factory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder) => builder
            .UseEnvironment("Development")
            .ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = "Host=localhost;Database=unused;Username=unused",
                ["Database:SsmParameterName"] = ""
            }))
            .ConfigureServices(services =>
            {
                services.RemoveAll<IStatisticsReadRepository>();
                services.AddSingleton<IStatisticsReadRepository>(new StubStatisticsRepository());
                services.RemoveAll<ITrendsReadRepository>();
                services.AddSingleton<ITrendsReadRepository>(new StubTrendsRepository());
                services.RemoveAll<IConcentrationReadRepository>();
                services.AddSingleton<IConcentrationReadRepository>(new StubConcentrationRepository());
                services.RemoveAll<IConcentrationRadiusRepository>();
                services.AddSingleton<IConcentrationRadiusRepository>(new StubRadiusRepository());
                services.RemoveAll<IConcentrationCellsRepository>();
                services.AddSingleton<IConcentrationCellsRepository>(new StubCellsRepository());
                services.RemoveAll<IConcentrationTrendsReadRepository>();
                services.AddSingleton<IConcentrationTrendsReadRepository>(new StubGeographicTrendsRepository());
            });
    }

    [Fact]
    public async Task EveryApplicationEndpointDocumentsSuccessAndProblemDetailsSchemas()
    {
        await using var factory = new Factory();
        using var response = await factory.CreateClient().GetAsync("/openapi/v1.json");
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var paths = document.RootElement.GetProperty("paths");
        var mapParameters = paths.GetProperty("/api/map").GetProperty("get").GetProperty("parameters").EnumerateArray().ToArray();
        Assert.True(mapParameters.Single(p => p.GetProperty("name").GetString() == "department").GetProperty("required").GetBoolean());
        Assert.Contains(mapParameters, p => p.GetProperty("name").GetString() == "province");
        Assert.Contains(mapParameters, p => p.GetProperty("name").GetString() == "district");
        var expected = new Dictionary<string, string>
        {
            ["/api/health"] = "HealthStatusDto",
            ["/api/ready"] = "HealthStatusDto",
            ["/api/dev/catalog-status"] = "CatalogStatusDto",
            ["/api/metadata"] = "MetadataDto",
            ["/api/categories"] = "array",
            ["/api/top-districts"] = "DistrictStatisticDto",
            ["/api/map"] = "GeoFeatureCollectionDto",
            ["/api/statistics/summary"] = "StatisticsSummaryDto",
            ["/api/explorer"] = "ExplorationDto",
            ["/api/trends"] = "TrendsDto",
            ["/api/population/comparison"] = "PopulationComparison",
            ["/api/population/history"] = "PopulationHistoryDto",
            ["/api/population/insights"] = "PopulationInsightsDto",
            ["/api/explorer/rates"] = "ExplorationDto",
            ["/api/concentration/metadata"] = "ConcentrationMetadata",
            ["/api/concentration"] = "ConcentrationSnapshot",
            ["/api/concentration/radius"] = "RadiusSnapshot",
            ["/api/concentration/cells"] = "MapCellsSnapshot",
            ["/api/concentration/trends"] = "ConcentrationTrendsDto"
        };
        Assert.Equal(expected.Count, paths.EnumerateObject().Count());
        foreach (var (path, schemaName) in expected)
        {
            var responses = paths.GetProperty(path).GetProperty("get").GetProperty("responses");
            var schema = responses.GetProperty("200").GetProperty("content").GetProperty("application/json").GetProperty("schema");
            Assert.Contains(schemaName, schema.GetRawText());
            foreach (var status in new[] { "429", "500" }) AssertProblem(responses, status);
            if (path is "/api/ready" or "/api/dev/catalog-status" || path.StartsWith("/api/concentration") && path != "/api/concentration/metadata")
                AssertProblem(responses, "503");
            if (path is not ("/api/health" or "/api/ready" or "/api/dev/catalog-status" or "/api/metadata" or "/api/categories" or "/api/concentration/metadata"))
                AssertProblem(responses, "400");
            if (path.StartsWith("/api/concentration") && path != "/api/concentration/metadata") AssertProblem(responses, "404");
        }
        var schemas = document.RootElement.GetProperty("components").GetProperty("schemas");
        Assert.True(schemas.GetProperty("ConcentrationTrendsDto").GetProperty("properties").TryGetProperty("countingUnit", out _));
        Assert.True(schemas.GetProperty("ConcentrationTrendsDto").GetProperty("properties").TryGetProperty("countScope", out _));
    }

    private static void AssertProblem(JsonElement responses, string status)
    {
        var schema = responses.GetProperty(status).GetProperty("content").GetProperty("application/problem+json").GetProperty("schema");
        Assert.Contains("ProblemDetails", schema.GetRawText());
    }
}
