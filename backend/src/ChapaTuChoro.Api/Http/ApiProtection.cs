using System.Globalization;
using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;

namespace ChapaTuChoro.Api.Http;

public sealed class ApiRateLimitOptions
{
    public int WindowSeconds { get; set; } = 60;
    public int InstancePermitLimit { get; set; } = 600;
    public int ClientPermitLimit { get; set; } = 120;
    public int EndpointPermitLimit { get; set; } = 60;
    public int TrendsPermitLimit { get; set; } = 20;
    public int ConcurrentRequests { get; set; } = 4;
}

public sealed class ProxyTrustOptions
{
    public string[] KnownProxies { get; set; } = [];
    public string[] KnownNetworks { get; set; } = [];
}

public static class ApiProtection
{
    public static IServiceCollection AddApiProtection(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<ApiRateLimitOptions>().Bind(configuration.GetSection("RateLimiting"))
            .Validate(o => o.WindowSeconds is >= 1 and <= 3600 && o.InstancePermitLimit > 0 &&
                o.ClientPermitLimit > 0 && o.EndpointPermitLimit > 0 && o.TrendsPermitLimit > 0 &&
                o.ConcurrentRequests > 0, "Rate limiting limits must be positive; window must be 1–3600 seconds.")
            .ValidateOnStart();
        services.AddOptions<ProxyTrustOptions>().Bind(configuration.GetSection("ReverseProxy"))
            .Validate(o => o.KnownProxies.All(x => IPAddress.TryParse(x, out _)), "KnownProxies must contain IP addresses.")
            .Validate(o => o.KnownNetworks.All(x => System.Net.IPNetwork.TryParse(x, out _)), "KnownNetworks must contain IP CIDR ranges.")
            .ValidateOnStart();
        services.AddOptions<ForwardedHeadersOptions>().Configure<IOptions<ProxyTrustOptions>>((options, trust) =>
        {
            // Never accept a client-supplied X-Forwarded-For without an explicit trusted peer.
            options.ForwardedHeaders = trust.Value.KnownProxies.Length == 0 && trust.Value.KnownNetworks.Length == 0 ? ForwardedHeaders.None : ForwardedHeaders.XForwardedFor;
            options.ForwardLimit = 1;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (var proxy in trust.Value.KnownProxies)
            {
                options.KnownProxies.Add(IPAddress.Parse(proxy));
            }
            foreach (var network in trust.Value.KnownNetworks)
            {
                options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
            }
        });
        services.AddRateLimiter(_ => { });
        services.AddOptions<Microsoft.AspNetCore.RateLimiting.RateLimiterOptions>()
            .Configure<IOptions<ApiRateLimitOptions>>((options, settings) =>
        {
            var limits = settings.Value;
            FixedWindowRateLimiterOptions Window(int permits) => new()
            {
                Window = TimeSpan.FromSeconds(limits.WindowSeconds),
                PermitLimit = permits,
                QueueLimit = 0,
                AutoReplenishment = true
            };
            string Client(HttpContext context) => context.Connection.RemoteIpAddress?.MapToIPv6().ToString() ?? "unknown";
            options.GlobalLimiter = PartitionedRateLimiter.CreateChained(
                PartitionedRateLimiter.Create<HttpContext, string>(_ => RateLimitPartition.GetFixedWindowLimiter("instance", _ => Window(limits.InstancePermitLimit))),
                PartitionedRateLimiter.Create<HttpContext, string>(context => RateLimitPartition.GetFixedWindowLimiter(Client(context), _ => Window(limits.ClientPermitLimit))),
                PartitionedRateLimiter.Create<HttpContext, string>(context =>
                {
                    // Route templates bound partition cardinality; query strings and unknown paths cannot create buckets.
                    var route = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? "unmatched";
                    return RateLimitPartition.GetFixedWindowLimiter($"{Client(context)}:{route}",
                        _ => Window(route is "/api/trends" or "/api/population/comparison" or "/api/population/history" or "/api/population/insights" or "/api/explorer/rates" or "/api/concentration" or "/api/concentration/radius" or "/api/concentration/cells" or "/api/concentration/trends" ? limits.TrendsPermitLimit : limits.EndpointPermitLimit));
                }),
                PartitionedRateLimiter.Create<HttpContext, string>(_ => RateLimitPartition.GetConcurrencyLimiter("concurrency", _ => new()
                {
                    PermitLimit = limits.ConcurrentRequests,
                    QueueLimit = 0
                })));
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (context, ct) =>
            {
                var response = context.HttpContext.Response;
                var seconds = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry)
                    ? Math.Max(1, (int)Math.Ceiling(retry.TotalSeconds)) : 1;
                response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
                context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("ApiRateLimiting")
                    .LogWarning("Request rate limited for {Endpoint}; retry after {RetrySeconds}s", context.HttpContext.GetEndpoint()?.DisplayName, seconds);
                await Results.Problem(statusCode: 429, title: "api.rate_limited",
                    detail: "Demasiadas solicitudes. Espera antes de volver a intentarlo.",
                    extensions: new Dictionary<string, object?> { ["traceId"] = context.HttpContext.TraceIdentifier })
                    .ExecuteAsync(context.HttpContext);
            };
        });
        return services;
    }
}
