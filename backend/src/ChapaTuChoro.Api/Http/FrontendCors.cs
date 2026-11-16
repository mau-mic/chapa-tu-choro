using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.Extensions.Options;

namespace ChapaTuChoro.Api.Http;

public sealed class FrontendCorsOptions
{
    // Same-origin deployments need no cross-origin exceptions.
    public string[] AllowedOrigins { get; set; } = [];
}

public static class FrontendCors
{
    public const string PolicyName = "frontend";

    public static IServiceCollection AddFrontendCors(this IServiceCollection services,
        IConfiguration configuration, IHostEnvironment environment)
    {
        services.AddOptions<FrontendCorsOptions>().Bind(configuration.GetSection("Cors"))
            .Validate(options => options.AllowedOrigins is not null && options.AllowedOrigins.All(origin =>
                IsOrigin(origin, environment.IsDevelopment())),
                "Cors:AllowedOrigins must contain exact HTTPS origins without paths, trailing slashes, credentials, queries, fragments or wildcards. HTTP loopback origins are allowed only in Development.")
            .ValidateOnStart();
        services.AddCors();
        services.AddOptions<CorsOptions>().Configure<IOptions<FrontendCorsOptions>>((cors, frontend) =>
            cors.AddPolicy(PolicyName, policy => policy.WithOrigins(frontend.Value.AllowedOrigins)
                .WithMethods("GET", "HEAD")
                .WithHeaders("Accept", "Content-Type")
                .WithExposedHeaders("Retry-After")
                .SetPreflightMaxAge(TimeSpan.FromMinutes(10))));
        return services;
    }

    private static bool IsOrigin(string origin, bool development)
    {
        if (string.IsNullOrWhiteSpace(origin) || origin != origin.Trim() || origin.Contains('*') ||
            origin.EndsWith('/') || !Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
            !uri.IsWellFormedOriginalString() || uri.UserInfo.Length != 0 || uri.AbsolutePath != "/" ||
            uri.Query.Length != 0 || uri.Fragment.Length != 0)
            return false;
        return uri.Scheme == Uri.UriSchemeHttps ||
            development && uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback;
    }
}
