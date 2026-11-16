using ChapaTuChoro.Api.Http;
using ChapaTuChoro.Application.Population;

namespace ChapaTuChoro.Api.Endpoints;

public static class PopulationEndpoints
{
    public static IEndpointRouteBuilder MapPopulationEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/population/insights", async (int fromYear, int fromMonth, int toYear, int toMonth,
            string? category, string? department, string? province, string? district,
            GetPopulationInsightsHandler handler, CancellationToken ct) =>
                (await handler.HandleAsync(new(fromYear, fromMonth, toYear, toMonth, category, department, province, district, null), ct)).ToHttpResult())
            .WithTags("Population").WithName("GetPopulationInsights")
            .WithSummary("Moving averages, prior-only historical/seasonal baselines and weighted national comparison")
            .WithDescription("Maximum 120 selected months plus 36 internal lookback months. Complete rolling 3/12 month windows, preceding 36-month historical mean and same-month previous 3-year seasonal mean. Same category and calendar year denominators nationally and territorially; missing observations are never zero. Not a forecast or personal risk estimate.")
            .Produces<PopulationInsightsDto>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(429).ProducesProblem(503).ProducesProblem(500);
        app.MapGet("/api/population/history", async (int fromYear,int fromMonth,int toYear,int toMonth,
            string? category,string? department,string? province,string? district,string? compare,
            GetPopulationHistoryHandler handler,CancellationToken ct) =>
                (await handler.HandleAsync(new(fromYear,fromMonth,toYear,toMonth,category,department,province,district,compare),ct)).ToHttpResult())
            .WithTags("Population").WithName("GetPopulationHistory")
            .WithSummary("Historical monthly rates, up to four peer territories and observed data quality")
            .WithDescription("Uses the population of each observation year. Maximum 120 months and four six-digit peer population UBIGEO codes. An empty compare selects no peers; omitted compare defaults to up to three. Missing values remain null. Observed coverage does not certify reporting completeness.")
            .Produces<PopulationHistoryDto>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(429).ProducesProblem(503).ProducesProblem(500);
        app.MapGet("/api/explorer/rates", async (int year,int month,string? category,string? department,string? province,string? district,
            GetRateExplorationHandler handler,CancellationToken ct) =>
                (await handler.HandleAsync(new(year,month,category),department,province,district,ct)).ToHttpResult())
            .WithTags("Population").WithName("GetRateExploration")
            .WithSummary("Official choropleth with same-year monthly population rates and original counts")
            .WithDescription("Keeps all official geometries and count fields; unavailable denominators yield null rates, never fabricated zeroes.")
            .Produces<ChapaTuChoro.Application.Statistics.ExplorationDto>().ProducesProblem(400).ProducesProblem(404).ProducesProblem(429).ProducesProblem(503).ProducesProblem(500);
        app.MapGet("/api/population/comparison", async (int year, int month, string? category,
            string? department, string? province, string? district, GetPopulationComparisonHandler handler, CancellationToken ct) =>
                (await handler.HandleAsync(new(year, month, category, department, province, district), ct)).ToHttpResult())
            .WithTags("Population")
            .WithName("GetPopulationComparison")
            .WithSummary("Compare monthly SIDPOL reports with same-year INEI population projections")
            .WithDescription("Returns monthly rates per 100,000 projected residents, original counts, territorial ranking and population provenance. Missing denominators or unmatched report districts suppress rates; absent report months remain null. Rates are not annualized or individual risk estimates.")
            .Produces<PopulationComparison>()
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
        return app;
    }
}
