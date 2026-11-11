using System.Net;
using ChapaTuChoro.Api.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class ProxyTrustTests
{
    private static ServiceProvider Services(string? proxy = null, string? network = null)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ReverseProxy:KnownProxies:0"] = proxy,
            ["ReverseProxy:KnownNetworks:0"] = network,
            ["RateLimiting:ClientPermitLimit"] = "1"
        }.Where(entry => entry.Value is not null)).Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddApiProtection(configuration);
        return services.BuildServiceProvider();
    }

    private static async Task<DefaultHttpContext> Forward(ServiceProvider services, string peer, string header)
    {
        var context = new DefaultHttpContext { RequestServices = services };
        context.Connection.RemoteIpAddress = IPAddress.Parse(peer);
        context.Request.Headers["X-Forwarded-For"] = header;
        var middleware = new ForwardedHeadersMiddleware(_ => Task.CompletedTask,
            services.GetRequiredService<ILoggerFactory>(),
            services.GetRequiredService<IOptions<ForwardedHeadersOptions>>());
        await middleware.Invoke(context);
        return context;
    }

    [Theory]
    [InlineData("172.29.84.10", null, "172.29.84.10")]
    [InlineData("172.29.84.10", null, "::ffff:172.29.84.10")]
    [InlineData(null, "172.29.84.0/24", "172.29.84.10")]
    [InlineData(null, "172.29.84.0/24", "::ffff:172.29.84.10")]
    public async Task TrustedPeerForwardingSeparatesClientRateLimitBuckets(string? proxy, string? network, string peer)
    {
        using var services = Services(proxy, network);
        var first = await Forward(services, peer, "198.51.100.1");
        var second = await Forward(services, peer, "198.51.100.2");
        Assert.Equal(IPAddress.Parse("198.51.100.1"), first.Connection.RemoteIpAddress);
        Assert.Equal(IPAddress.Parse("198.51.100.2"), second.Connection.RemoteIpAddress);
        var limiter = services.GetRequiredService<IOptions<RateLimiterOptions>>().Value.GlobalLimiter!;
        using (var lease = await limiter.AcquireAsync(first)) Assert.True(lease.IsAcquired);
        using (var lease = await limiter.AcquireAsync(first)) Assert.False(lease.IsAcquired);
        using (var lease = await limiter.AcquireAsync(second)) Assert.True(lease.IsAcquired);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("172.29.84.10", null)]
    [InlineData(null, "172.29.84.0/24")]
    public async Task UntrustedPeerCannotRotateForwardedHeadersToEvadeClientLimit(string? proxy, string? network)
    {
        using var services = Services(proxy, network);
        var first = await Forward(services, "192.0.2.1", "198.51.100.1");
        var second = await Forward(services, "192.0.2.1", "198.51.100.2");
        Assert.Equal(IPAddress.Parse("192.0.2.1"), first.Connection.RemoteIpAddress);
        Assert.Equal(first.Connection.RemoteIpAddress, second.Connection.RemoteIpAddress);
        var limiter = services.GetRequiredService<IOptions<RateLimiterOptions>>().Value.GlobalLimiter!;
        using (var lease = await limiter.AcquireAsync(first)) Assert.True(lease.IsAcquired);
        using (var lease = await limiter.AcquireAsync(second)) Assert.False(lease.IsAcquired);
    }

    [Fact]
    public async Task OnlyImmediateForwardedAddressIsAccepted()
    {
        using var services = Services(proxy: "172.29.84.10");
        var context = await Forward(services, "172.29.84.10", "198.51.100.99, 198.51.100.1");
        Assert.Equal(IPAddress.Parse("198.51.100.1"), context.Connection.RemoteIpAddress);
    }

    [Theory]
    [InlineData("invalid", null)]
    [InlineData(null, "172.29.84.0/99")]
    public void InvalidTrustConfigurationFailsValidation(string? proxy, string? network)
    {
        using var services = Services(proxy, network);
        Assert.Throws<OptionsValidationException>(() => services.GetRequiredService<IOptions<ForwardedHeadersOptions>>().Value);
    }
}
