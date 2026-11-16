using Xunit;
using System.Net;
using ChapaTuChoro.Api.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ChapaTuChoro.Tests;

public sealed class VerifiedEdgeClientIpTests
{
    [Theory]
    [InlineData("203.0.113.7")]
    [InlineData("2001:db8::7")]
    public async Task EnabledUsesVerifiedVisitorIp(string address)
    {
        var context = new DefaultHttpContext();
        context.Request.Headers["x-ctc-client-ip"] = address;
        IPAddress? observed = null;
        var middleware = new VerifiedEdgeClientIpMiddleware(c => { observed = c.Connection.RemoteIpAddress; return Task.CompletedTask; },
            Options.Create(new ProxyTrustOptions { UseVerifiedEdgeClientIp = true }));
        await middleware.InvokeAsync(context);
        Assert.Equal(IPAddress.Parse(address), observed);
    }

    [Theory]
    [InlineData("")]
    [InlineData("invalid")]
    [InlineData("203.0.113.1,203.0.113.2")]
    public async Task InvalidIdentityDoesNotReachEndpoint(string header)
    {
        using var services = new ServiceCollection().AddLogging().AddProblemDetails().BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = services };
        context.Request.Headers["x-ctc-client-ip"] = header;
        var called = false;
        var middleware = new VerifiedEdgeClientIpMiddleware(_ => { called = true; return Task.CompletedTask; },
            Options.Create(new ProxyTrustOptions { UseVerifiedEdgeClientIp = true }));
        await middleware.InvokeAsync(context);
        Assert.False(called);
        Assert.Equal(400, context.Response.StatusCode);
    }

    [Fact]
    public async Task DisabledIgnoresSpoofedHeader()
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Loopback;
        context.Request.Headers["x-ctc-client-ip"] = "203.0.113.7";
        var called = false;
        var middleware = new VerifiedEdgeClientIpMiddleware(_ => { called = true; return Task.CompletedTask; }, Options.Create(new ProxyTrustOptions()));
        await middleware.InvokeAsync(context);
        Assert.True(called);
        Assert.Equal(IPAddress.Loopback, context.Connection.RemoteIpAddress);
    }
}
