using System.Net;
using ChapaTuChoro.Application.Population;
using ChapaTuChoro.Application.Statistics;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class PopulationApiTests
{
    private sealed class Factory(bool fail = false, bool absent = false) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseEnvironment("Testing")
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = "Host=localhost;Database=unused;Username=unused",
                ["Database:SsmParameterName"] = "", ["RateLimiting:TrendsPermitLimit"] = "1"
            }))
            .ConfigureServices(services =>
            {
                services.RemoveAll<IPopulationReadRepository>();
                services.AddSingleton<IPopulationReadRepository>(new Repository(fail, absent));
                services.RemoveAll<IPopulationInsightsReadRepository>();
                services.AddSingleton<IPopulationInsightsReadRepository>(new InsightsRepository(fail,absent));
                services.RemoveAll<IPopulationHistoryReadRepository>();
                services.AddSingleton<IPopulationHistoryReadRepository>(new HistoryRepository(fail,absent));
                services.RemoveAll<IStatisticsReadRepository>();
                services.AddSingleton<IStatisticsReadRepository>(new StubStatisticsRepository());
            });
    }

    private sealed class InsightsRepository(bool fail,bool absent) : IPopulationInsightsReadRepository
    {
        public Task<PopulationInsightsDto?> ReadAsync(PopulationHistoryQuery query,CancellationToken ct)
        {
            if(fail)throw new InvalidOperationException("private credential must not leak");
            return Task.FromResult<PopulationInsightsDto?>(absent ? null : PopulationInsightsProjection.Create(query,
                new("test","https://www.gob.pe/inei",DateTimeOffset.UnixEpoch),
                [new(query.ToYear,"000000",1000)], []));
        }
    }

    private sealed class HistoryRepository(bool fail,bool absent):IPopulationHistoryReadRepository
    {
        public Task<PopulationHistoryDto?> ReadAsync(PopulationHistoryQuery query,CancellationToken ct)
        {
            if(fail)throw new InvalidOperationException("private credential must not leak");
            return Task.FromResult<PopulationHistoryDto?>(absent?null:PopulationHistoryProjection.Create(query,
                new("test","https://www.gob.pe/inei",DateTimeOffset.UnixEpoch),
                [new(query.ToYear,"000000","Perú",1000,false),new(query.ToYear,"150000","Lima",1000,false)],[]));
        }
    }

    [Theory]
    [InlineData("/api/population/history?fromYear=2024&fromMonth=1&toYear=2025&toMonth=1")]
    [InlineData("/api/explorer/rates?year=2025&month=1")]
    [InlineData("/api/population/insights?fromYear=2025&fromMonth=1&toYear=2025&toMonth=2")]
    public async Task NewAnalyticsEndpointsAreRateLimited(string path)
    {
        await using var factory=new Factory();
        var client=factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK,(await client.GetAsync(path)).StatusCode);
        var limited=await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.TooManyRequests,limited.StatusCode);
        Assert.NotNull(limited.Headers.RetryAfter);
        Assert.Equal("application/problem+json",limited.Content.Headers.ContentType?.MediaType);
    }

    [Theory]
    [InlineData("/api/population/history?fromYear=2025&fromMonth=2&toYear=2025&toMonth=1")]
    [InlineData("/api/population/history?fromYear=2025&fromMonth=1&toYear=2025&toMonth=1&compare=150101")]
    [InlineData("/api/explorer/rates?year=2025&month=13")]
    [InlineData("/api/population/insights?fromYear=2025&fromMonth=13&toYear=2025&toMonth=1")]
    [InlineData("/api/population/insights?fromYear=2025&fromMonth=1&toYear=2025&toMonth=1&province=1501")]
    public async Task NewAnalyticsValidationUsesProblemDetails(string path)
    {
        await using var factory=new Factory();
        var response=await factory.CreateClient().GetAsync(path);
        Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);
        Assert.Equal("application/problem+json",response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task HistoryUnavailableAndFailuresKeepStandardContracts()
    {
        const string path="/api/population/history?fromYear=2025&fromMonth=1&toYear=2025&toMonth=1";
        await using var absent=new Factory(absent:true);
        Assert.Equal(HttpStatusCode.NotFound,(await absent.CreateClient().GetAsync(path)).StatusCode);
        await using var failed=new Factory(fail:true);
        var response=await failed.CreateClient().GetAsync(path);
        Assert.Equal(HttpStatusCode.InternalServerError,response.StatusCode);
        Assert.DoesNotContain("credential",await response.Content.ReadAsStringAsync());
        await using var absentInsights=new Factory(absent:true);
        var noInsights=await absentInsights.CreateClient().GetAsync("/api/population/insights?fromYear=2025&fromMonth=1&toYear=2025&toMonth=1");
        Assert.Equal(HttpStatusCode.NotFound,noInsights.StatusCode);
        await using var failedInsights=new Factory(fail:true);
        var insightsFailure=await failedInsights.CreateClient().GetAsync("/api/population/insights?fromYear=2025&fromMonth=1&toYear=2025&toMonth=1");
        Assert.Equal(HttpStatusCode.InternalServerError,insightsFailure.StatusCode);
        Assert.DoesNotContain("credential",await insightsFailure.Content.ReadAsStringAsync());
        await using var unavailableMap=new Factory(absent:true);
        var map=await unavailableMap.CreateClient().GetAsync("/api/explorer/rates?year=2025&month=1");
        Assert.Equal(HttpStatusCode.OK,map.StatusCode);
        Assert.Contains("FeatureCollection",await map.Content.ReadAsStringAsync());
    }

    private sealed class Repository(bool fail, bool absent) : IPopulationReadRepository
    {
        public Task<PopulationComparison?> ReadAsync(PopulationQuery query, CancellationToken ct)
        {
            if (fail) throw new InvalidOperationException("private database credential must not leak");
            return Task.FromResult<PopulationComparison?>(absent ? null : PopulationComparison.Create(query,
                new("test", "https://www.gob.pe/inei", DateTimeOffset.UnixEpoch),
                [new("000000", "Perú", 1000)], []));
        }
    }

    [Theory]
    [InlineData("year=2025&month=13")]
    [InlineData("year=abc&month=1")]
    [InlineData("year=2025")]
    [InlineData("year=2025&month=1&province=1501")]
    public async Task InvalidSelectionReturnsProblemDetails(string query)
    {
        await using var factory = new Factory();
        var response = await factory.CreateClient().GetAsync("/api/population/comparison?" + query);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task MissingPopulationReturns404AndUnexpectedErrorsStayPrivate()
    {
        await using var absent = new Factory(absent: true);
        var missing = await absent.CreateClient().GetAsync("/api/population/comparison?year=2025&month=1");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal("application/problem+json", missing.Content.Headers.ContentType?.MediaType);
        await using var failed = new Factory(fail: true);
        var error = await failed.CreateClient().GetAsync("/api/population/comparison?year=2025&month=1");
        Assert.Equal(HttpStatusCode.InternalServerError, error.StatusCode);
        Assert.DoesNotContain("credential", await error.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task SuccessfulComparisonIsProtectedByAnalyticsRateLimit()
    {
        await using var factory = new Factory();
        var client = factory.CreateClient();
        var response = await client.GetAsync("/api/population/comparison?year=2025&month=1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var limited = await client.GetAsync("/api/population/comparison?year=2025&month=2");
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.NotNull(limited.Headers.RetryAfter);
        Assert.Equal("application/problem+json", limited.Content.Headers.ContentType?.MediaType);
    }
}
