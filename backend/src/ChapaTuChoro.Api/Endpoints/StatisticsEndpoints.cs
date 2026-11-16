using ChapaTuChoro.Api.Http;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Application.Concentration;

namespace ChapaTuChoro.Api.Endpoints;

public static class StatisticsEndpoints
{
    public static IEndpointRouteBuilder MapStatisticsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api").WithTags("Statistics");
        group.MapGet("/metadata", async (GetMetadataHandler handler, CancellationToken ct) =>
            (await handler.HandleAsync(ct)).ToHttpResult())
            .Produces<MetadataDto>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
        group.MapGet("/categories", async (GetCategoriesHandler handler, CancellationToken ct) =>
            (await handler.HandleAsync(ct)).ToHttpResult())
            .Produces<IReadOnlyList<string>>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
        group.MapGet("/top-districts", async (int year, int month, string? category,
                GetTopDistrictsHandler handler, CancellationToken ct) =>
            (await handler.HandleAsync(new StatisticsFilter(year, month, category), ct)).ToHttpResult())
            .Produces<IReadOnlyList<DistrictStatisticDto>>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError)
            .ProducesProblem(StatusCodes.Status400BadRequest);
        group.MapGet("/map", async (int year, int month, string department, string? province, string? district, string? category,
                GetCrimeMapHandler handler, CancellationToken ct) =>
            (await handler.HandleAsync(new StatisticsFilter(year, month, category), department, province, district, ct)).ToHttpResult())
            .WithDescription("Simplified district GeoJSON for a required department UBIGEO; optionally narrow by province or district. Use /api/explorer for the national overview. Empty scopes return an empty FeatureCollection.")
            .Produces<GeoFeatureCollectionDto>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError)
            .ProducesProblem(StatusCodes.Status400BadRequest);
        group.MapGet("/statistics/summary", async (int year, int month, string? category,
                GetStatisticsSummaryHandler handler, CancellationToken ct) =>
            (await handler.HandleAsync(new StatisticsFilter(year, month, category), ct)).ToHttpResult())
            .Produces<StatisticsSummaryDto>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError)
            .ProducesProblem(StatusCodes.Status400BadRequest);
        group.MapGet("/explorer", async (int year, int month, string? category, string? department, string? province, string? district,
                GetExplorationHandler handler, CancellationToken ct) =>
            (await handler.HandleAsync(new StatisticsFilter(year, month, category), department, province, district, ct)).ToHttpResult())
            .Produces<ExplorationDto>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError)
            .ProducesProblem(StatusCodes.Status400BadRequest);
        group.MapGet("/trends", async (int fromYear, int fromMonth, int toYear, int toMonth,
                string? category, string? department, string? province, string? district,
                GetTrendsHandler handler, CancellationToken ct) =>
            (await handler.HandleAsync(new TrendsQuery(fromYear, fromMonth, toYear, toMonth,
                category, department, province, district), ct)).ToHttpResult())
            .Produces<TrendsDto>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError)
            .ProducesProblem(StatusCodes.Status400BadRequest);
        group.MapGet("/concentration/metadata", async (GetConcentrationHandler handler, CancellationToken ct) =>
            Results.Ok(await handler.MetadataAsync(ct)))
            .Produces<ConcentrationMetadata>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError);
        group.MapGet("/concentration", async (int year, int month, string category, string? department, string? province, string? district,
            GetConcentrationHandler handler, CancellationToken ct) =>
            (await handler.HandleAsync(new(year, month, category, department, province, district), ct)).ToHttpResult())
            .Produces<ConcentrationSnapshot>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);
        group.MapGet("/concentration/radius", async (int year, int month, string category, double longitude, double latitude, int radiusMetres,
            string? department, string? province, string? district, GetRadiusAnalysisHandler handler, CancellationToken ct) =>
            (await handler.HandleAsync(new(new(year, month, category, department, province, district), longitude, latitude, radiusMetres), ct)).ToHttpResult())
            .Produces<RadiusSnapshot>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);
        group.MapGet("/concentration/cells", async (int year, int month, string category, int gridMetres,
            double west, double south, double east, double north, string? department, string? province, string? district,
            GetMapCellsHandler handler, CancellationToken ct) =>
            (await handler.HandleAsync(new(new(year, month, category, department, province, district), gridMetres, new(west, south, east, north)), ct)).ToHttpResult())
            .Produces<MapCellsSnapshot>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);
        group.MapGet("/concentration/trends", async (int year, int fromMonth, int toMonth, string category,
            string? department, string? province, string? district, GetConcentrationTrendsHandler handler, CancellationToken ct) =>
            (await handler.HandleAsync(new(year, fromMonth, year, toMonth, category, department, province, district), ct)).ToHttpResult())
            .Produces<ConcentrationTrendsDto>()
            .ProducesProblem(StatusCodes.Status429TooManyRequests)
            .ProducesProblem(StatusCodes.Status500InternalServerError)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);
        return app;
    }
}
