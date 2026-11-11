using System.Net;
using System.Text.Json;
using ChapaTuChoro.Application.Statistics;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class CorsTests
{
    private const string Frontend = "https://frontend.example.test";
    private sealed class Factory(string? allowedOrigin = Frontend, bool fail = false,
        string environment = "Production") : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder) => builder.UseEnvironment(environment)
            .ConfigureAppConfiguration((_, config) => {
                var settings = new Dictionary<string, string?>
                {
                    ["ConnectionStrings:Default"] = "Host=localhost;Database=unused;Username=unused",
                    ["Database:SsmParameterName"] = ""
                };
                if (allowedOrigin is not null) settings["Cors:AllowedOrigins:0"] = allowedOrigin;
                config.AddInMemoryCollection(settings);
            })
            .ConfigureServices(services => {
                services.RemoveAll<IStatisticsReadRepository>();
                services.AddSingleton<IStatisticsReadRepository>(new StubStatisticsRepository { Throw = fail });
            });
    }

    [Theory]
    [InlineData("Production", Frontend)]
    [InlineData("Development", "http://localhost:5173")]
    [InlineData("Development", "http://127.0.0.1:5173")]
    public async Task ExactConfiguredFrontendCanReadResponses(string environment, string origin)
    {
        await using var factory = new Factory(origin, environment: environment);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", origin);
        var response = await client.GetAsync("/api/health");
        response.EnsureSuccessStatusCode();
        Assert.Equal(origin, Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
        Assert.False(response.Headers.Contains("Access-Control-Allow-Credentials"));
        Assert.Contains("Retry-After", string.Join(",", response.Headers.GetValues("Access-Control-Expose-Headers")));
    }

    [Theory]
    [InlineData("https://evil.example.test")]
    [InlineData("https://frontend.example.test.evil.test")]
    [InlineData("https://sub.frontend.example.test")]
    [InlineData("http://frontend.example.test")]
    [InlineData("https://frontend.example.test:8443")]
    [InlineData("null")]
    public async Task OtherOriginsDoNotReceiveBrowserReadPermission(string origin)
    {
        await using var factory = new Factory();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", origin);
        var response = await client.GetAsync("/api/health");
        // CORS is a browser permission, not authentication: it does not prevent execution.
        response.EnsureSuccessStatusCode();
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task SameOriginAndNonBrowserRequestsStillWorkWithoutOrigin()
    {
        await using var factory = new Factory();
        var response = await factory.CreateClient().GetAsync("/api/health");
        response.EnsureSuccessStatusCode();
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Theory]
    [InlineData(Frontend, "GET", "Accept", true)]
    [InlineData("https://evil.example.test", "GET", "Accept", false)]
    [InlineData(Frontend, "POST", "Accept", false)]
    [InlineData(Frontend, "GET", "X-Api-Key", false)]
    public async Task PreflightAllowsOnlyTheConfiguredOriginReadMethodsAndHeaders(string origin,
        string method, string header, bool allowed)
    {
        await using var factory = new Factory();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/metadata");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", method);
        request.Headers.Add("Access-Control-Request-Headers", header);
        var response = await factory.CreateClient().SendAsync(request);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        bool Has(string name, string value) => response.Headers.TryGetValues(name, out var values) &&
            values.SelectMany(x => x.Split(',')).Any(x => x.Trim().Equals(value, StringComparison.OrdinalIgnoreCase));
        Assert.Equal(allowed, Has("Access-Control-Allow-Origin", origin) &&
            Has("Access-Control-Allow-Methods", method) && Has("Access-Control-Allow-Headers", header));
    }

    [Fact]
    public async Task ProductionWithEmptyAllowlistKeepsSameOriginWorkingAndAllowsNoCrossOriginReads()
    {
        await using var factory = new Factory(null);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", Frontend);
        var response = await client.GetAsync("/api/health");
        response.EnsureSuccessStatusCode();
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task AllowedFrontendCanReadSanitizedProblemDetails()
    {
        await using var factory = new Factory(fail: true);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Origin", Frontend);
        var response = await client.GetAsync("/api/metadata");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(Frontend, Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("PRIVATE INTERNAL DETAIL", body);
        Assert.Equal(500, JsonDocument.Parse(body).RootElement.GetProperty("status").GetInt32());
    }

    [Theory]
    [InlineData("*")]
    [InlineData("https://*.example.test")]
    [InlineData("null")]
    [InlineData("https://frontend.example.test/")]
    [InlineData("https://frontend.example.test/path")]
    [InlineData("https://frontend.example.test?query=1")]
    [InlineData("https://frontend.example.test#fragment")]
    [InlineData("https://user:password@frontend.example.test")]
    [InlineData("http://localhost:5173")]
    public async Task UnsafeProductionConfigurationFailsAtStartup(string origin)
    {
        await using var factory = new Factory(origin);
        await Assert.ThrowsAsync<OptionsValidationException>(() => Task.Run(() => factory.CreateClient()));
    }
}
