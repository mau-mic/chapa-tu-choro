using ChapaTuChoro.Application.Sources;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Infrastructure.Integrations;
using ChapaTuChoro.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace ChapaTuChoro.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Resolve after host configuration is complete; share one pool across EF and spatial reads.
        services.AddSingleton<NpgsqlDataSource>(_ =>
        {
            var connectionString = configuration.GetConnectionString("Default");
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new InvalidOperationException("ConnectionStrings:Default must be configured.");
            var connectionBuilder = new NpgsqlConnectionStringBuilder(connectionString)
            {
                MaxPoolSize = 2,
                // Transaction pooling cannot use session-level prepared statements.
                MaxAutoPrepare = 0
            };
            return new NpgsqlDataSourceBuilder(connectionBuilder.ConnectionString)
                .UseNetTopologySuite().Build();
        });
        services.AddDbContext<CrimeWatchDbContext>((sp, options) =>
            options.UseNpgsql(sp.GetRequiredService<NpgsqlDataSource>(), pg => pg.UseNetTopologySuite()));
        services.AddScoped<ChapaTuChoro.Application.Concentration.IConcentrationCellsRepository, ConcentrationCellsRepository>();
        services.AddScoped<ChapaTuChoro.Application.Concentration.IConcentrationRadiusRepository, ConcentrationRadiusRepository>();
        services.AddScoped<IStatisticsReadRepository, StatisticsReadRepository>();
        services.AddScoped<ITrendsReadRepository, TrendsReadRepository>();
        services.AddScoped<ChapaTuChoro.Application.Population.IPopulationReadRepository, PopulationReadRepository>();
        services.AddScoped<ChapaTuChoro.Application.Population.IPopulationHistoryReadRepository, PopulationHistoryReadRepository>();
        services.AddScoped<ChapaTuChoro.Application.Population.IPopulationInsightsReadRepository, PopulationInsightsReadRepository>();
        services.AddScoped<ChapaTuChoro.Application.Concentration.IConcentrationTrendsReadRepository, ConcentrationTrendsReadRepository>();
        services.AddScoped<ChapaTuChoro.Application.Concentration.IConcentrationReadRepository, ConcentrationReadRepository>();

        services.AddOptions<GovernmentCatalogOptions>()
            .Bind(configuration.GetSection(GovernmentCatalogOptions.Section))
            .Validate(o => Uri.TryCreate(o.BaseUrl, UriKind.Absolute, out var uri)
                && uri.Scheme == Uri.UriSchemeHttps, "Government catalog must use HTTPS.")
            .Validate(o => o.TimeoutSeconds is >= 1 and <= 120, "Invalid catalog timeout.")
            .ValidateOnStart();

        services.AddHttpClient<IGovernmentCatalogClient, GovernmentCatalogClient>((sp, client) =>
        {
            var options = sp.GetRequiredService<IOptions<GovernmentCatalogOptions>>().Value;
            client.BaseAddress = new Uri(options.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("ChapaTuChoro/0.1");
        });
        return services;
    }
}
