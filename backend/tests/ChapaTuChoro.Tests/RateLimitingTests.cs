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

public sealed class RateLimitingTests
{
    private sealed class Factory(int clientLimit = 100, int endpointLimit = 1) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseEnvironment("Development")
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = "Host=localhost;Database=unused;Username=unused",
                ["Database:SsmParameterName"] = "", ["RateLimiting:ClientPermitLimit"] = clientLimit.ToString(),
                ["RateLimiting:EndpointPermitLimit"] = endpointLimit.ToString(), ["RateLimiting:TrendsPermitLimit"] = "1"
            }))
            .ConfigureServices(services => {
                services.RemoveAll<ChapaTuChoro.Application.Concentration.IConcentrationReadRepository>();
                services.AddSingleton<ChapaTuChoro.Application.Concentration.IConcentrationReadRepository>(new StubConcentrationRepository());
                services.RemoveAll<ChapaTuChoro.Application.Concentration.IConcentrationRadiusRepository>();
                services.AddSingleton<ChapaTuChoro.Application.Concentration.IConcentrationRadiusRepository>(new StubRadiusRepository());
                services.RemoveAll<ChapaTuChoro.Application.Concentration.IConcentrationCellsRepository>();
                services.AddSingleton<ChapaTuChoro.Application.Concentration.IConcentrationCellsRepository>(new StubCellsRepository());
                services.RemoveAll<ChapaTuChoro.Application.Concentration.IConcentrationTrendsReadRepository>();
                services.AddSingleton<ChapaTuChoro.Application.Concentration.IConcentrationTrendsReadRepository>(new StubGeographicTrendsRepository());
                services.RemoveAll<IStatisticsReadRepository>();
                services.RemoveAll<ITrendsReadRepository>();
                services.AddSingleton<IStatisticsReadRepository>(new StubStatisticsRepository());
                services.AddSingleton<ITrendsReadRepository>(new StubTrendsRepository());
            });
    }

    [Theory]
    [InlineData("/api/health")]
    [InlineData("/api/concentration/metadata")]
    [InlineData("/api/concentration?year=2026&month=10&category=all")]
    [InlineData("/api/concentration/cells?year=2026&month=10&category=all&gridMetres=500&west=-77.3&south=-12.3&east=-76.8&north=-11.7")]
    [InlineData("/api/concentration/trends?year=2026&fromMonth=1&toMonth=10&category=all")]
    [InlineData("/api/concentration/radius?year=2026&month=10&category=all&longitude=-77&latitude=-12&radiusMetres=500")]
    [InlineData("/api/metadata")]
    [InlineData("/api/categories")]
    [InlineData("/api/map?year=2024&month=1&department=15")]
    [InlineData("/api/top-districts?year=2024&month=1")]
    [InlineData("/api/statistics/summary?year=2024&month=1")]
    [InlineData("/api/explorer?year=2024&month=1")]
    [InlineData("/api/trends?fromYear=2024&fromMonth=1&toYear=2024&toMonth=4")]
    [InlineData("/openapi/v1.json")]
    public async Task EveryEndpointHasABoundedBucketAndReturnsProblemDetails(string path)
    {
        await using var factory = new Factory();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173");
        (await client.GetAsync(path)).EnsureSuccessStatusCode();
        var rejected = await client.GetAsync(path + (path.Contains('?') ? "&" : "?") + "ignored=another-query");
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal("application/problem+json", rejected.Content.Headers.ContentType?.MediaType);
        Assert.Equal("http://localhost:5173", Assert.Single(rejected.Headers.GetValues("Access-Control-Allow-Origin")));
        Assert.Contains("Retry-After", string.Join(",", rejected.Headers.GetValues("Access-Control-Expose-Headers")));
        Assert.True(rejected.Headers.RetryAfter?.Delta > TimeSpan.Zero);
        var body = JsonDocument.Parse(await rejected.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(429, body.GetProperty("status").GetInt32());
        Assert.Equal("api.rate_limited", body.GetProperty("title").GetString());
        Assert.True(body.TryGetProperty("traceId", out _));
    }

    [Theory]
    [InlineData("/api/concentration/cells?year=2026&month=10&category=all&gridMetres=500&west=-77.3&south=-12.3&east=-76.8&north=-11.7")]
    [InlineData("/api/concentration/trends?year=2026&fromMonth=1&toMonth=10&category=all")]
    [InlineData("/api/concentration/radius?year=2026&month=10&category=all&longitude=-77&latitude=-12&radiusMetres=500")]
    public async Task SpatialQueriesUseTheStricterBudget(string path)
    {
        await using var factory = new Factory(endpointLimit:5);
        var client=factory.CreateClient();
        (await client.GetAsync(path)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.TooManyRequests,(await client.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData("/api/ready")]
    [InlineData("/api/dev/catalog-status")]
    [InlineData("/unmatched/path")]
    public async Task GlobalClientLimitAlsoProtectsReadinessDevAndUnmatchedRequests(string path)
    {
        await using var factory = new Factory(clientLimit: 1);
        var client = factory.CreateClient();
        (await client.GetAsync("/api/health")).EnsureSuccessStatusCode();
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.TryAddWithoutValidation("X-Forwarded-For", "198.51.100.123");
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task DifferentEndpointsHaveSeparateBucketsButTrendsHasItsOwnStricterLimit()
    {
        await using var factory = new Factory(endpointLimit: 5);
        var client = factory.CreateClient();
        (await client.GetAsync("/api/categories")).EnsureSuccessStatusCode();
        var url = "/api/trends?fromYear=2024&fromMonth=1&toYear=2024&toMonth=4";
        (await client.GetAsync(url)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.GetAsync(url)).StatusCode);
        (await client.GetAsync("/api/categories")).EnsureSuccessStatusCode();
    }
    [Fact]
    public async Task ConcurrencyPermitsAreReleasedAndDifferentClientsHaveSeparateBuckets()
    {
        await using var factory = new Factory(clientLimit: 100, endpointLimit: 100);
        var limiter = factory.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<Microsoft.AspNetCore.RateLimiting.RateLimiterOptions>>().Value.GlobalLimiter!;
        var context = new Microsoft.AspNetCore.Http.DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Parse("192.0.2.1");
        var leases = new List<System.Threading.RateLimiting.RateLimitLease>();
        try
        {
            for (var i = 0; i < 4; i++)
            {
                var lease = await limiter.AcquireAsync(context);
                Assert.True(lease.IsAcquired); leases.Add(lease);
            }
            using var rejected = await limiter.AcquireAsync(context);
            Assert.False(rejected.IsAcquired);
            leases[0].Dispose();
            using var recovered = await limiter.AcquireAsync(context);
            Assert.True(recovered.IsAcquired);
        }
        finally { foreach (var lease in leases) lease.Dispose(); }
        await using var isolatedFactory = new Factory(clientLimit: 1);
        var isolated = isolatedFactory.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<Microsoft.AspNetCore.RateLimiting.RateLimiterOptions>>().Value.GlobalLimiter!;
        using var first = await isolated.AcquireAsync(context);
        using var sameClient = await isolated.AcquireAsync(context);
        Assert.False(sameClient.IsAcquired);
        context.Connection.RemoteIpAddress = IPAddress.Parse("192.0.2.2");
        using var anotherClient = await isolated.AcquireAsync(context);
        Assert.True(anotherClient.IsAcquired);
    }

}

internal sealed class StubConcentrationRepository : ChapaTuChoro.Application.Concentration.IConcentrationReadRepository
{
    private static readonly ChapaTuChoro.Application.Concentration.ConcentrationOption Option=new(2026,10,"all","Test source rows","https://example.test/source",DateTimeOffset.UtcNow);
    public Task<ChapaTuChoro.Application.Concentration.ConcentrationMetadata> MetadataAsync(CancellationToken ct)=>Task.FromResult(new ChapaTuChoro.Application.Concentration.ConcentrationMetadata(false,[Option]));
    public Task<ChapaTuChoro.Application.Concentration.ConcentrationSnapshot?> GetAsync(ChapaTuChoro.Application.Concentration.ConcentrationQuery q,CancellationToken ct)=>Task.FromResult<ChapaTuChoro.Application.Concentration.ConcentrationSnapshot?>(new(Option,0,0,0,[],[],[],1000,5,"source-classification-rows","Independent context",new(0,0,System.Text.Json.JsonSerializer.SerializeToElement(new {}))));
}

internal sealed class StubRadiusRepository : ChapaTuChoro.Application.Concentration.IConcentrationRadiusRepository
{
    public Task<ChapaTuChoro.Application.Common.Result<ChapaTuChoro.Application.Concentration.RadiusSnapshot>> CountAsync(ChapaTuChoro.Application.Concentration.RadiusQuery q, CancellationToken ct) =>
        Task.FromResult(ChapaTuChoro.Application.Common.Result<ChapaTuChoro.Application.Concentration.RadiusSnapshot>.Success(new(new(q.Selection.Year,q.Selection.Month,q.Selection.Category,"Test","https://example.test/source",DateTimeOffset.UtcNow),q.Longitude,q.Latitude,q.RadiusMetres,0,false,5,JsonSerializer.SerializeToElement(new {type="Polygon",coordinates=Array.Empty<double[][]>()}),"source-classification-rows","Test accuracy")));
}

internal sealed class StubCellsRepository : ChapaTuChoro.Application.Concentration.IConcentrationCellsRepository
{
    public Task<ChapaTuChoro.Application.Common.Result<ChapaTuChoro.Application.Concentration.MapCellsSnapshot>> GetAsync(ChapaTuChoro.Application.Concentration.MapCellsQuery q,CancellationToken ct) =>
        Task.FromResult(ChapaTuChoro.Application.Common.Result<ChapaTuChoro.Application.Concentration.MapCellsSnapshot>.Success(new(new(q.Selection.Year,q.Selection.Month,q.Selection.Category,"Test","https://example.test/source",DateTimeOffset.UtcNow),q.GridMetres,5,[],0,0,q.Bounds)));
}

internal sealed class StubGeographicTrendsRepository : ChapaTuChoro.Application.Concentration.IConcentrationTrendsReadRepository
{
 public async Task<ChapaTuChoro.Application.Common.Result<ChapaTuChoro.Application.Concentration.ConcentrationTrendsSnapshot>> GetAsync(TrendsQuery q,CancellationToken ct)=>
  ChapaTuChoro.Application.Common.Result<ChapaTuChoro.Application.Concentration.ConcentrationTrendsSnapshot>.Success(new(await new StubTrendsRepository().GetAsync(q,ct),[new(2026,10,"all","Test","https://example.test/source",DateTimeOffset.UtcNow)]));
}
