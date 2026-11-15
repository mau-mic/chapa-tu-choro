using Amazon.Lambda.AspNetCoreServer.Hosting;
using Amazon.SimpleSystemsManagement;
using Amazon.SimpleSystemsManagement.Model;
using ChapaTuChoro.Api.Endpoints;
using ChapaTuChoro.Api.Exceptions;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Application.Sources;
using ChapaTuChoro.Api.Http;
using ChapaTuChoro.Infrastructure;
using ChapaTuChoro.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Serilog;
using Serilog.Formatting.Json;

var builder = WebApplication.CreateBuilder(args);

// Optional: the deployed Lambda reads its DB secret from a named SSM SecureString parameter.
// No credential is stored in the Terraform state or checked into source control.
var parameterName = builder.Configuration["Database:SsmParameterName"];
if (!string.IsNullOrWhiteSpace(parameterName))
{
    using var ssm = new AmazonSimpleSystemsManagementClient();
    var response = await ssm.GetParameterAsync(new GetParameterRequest
    {
        Name = parameterName,
        WithDecryption = true
    });
    builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["ConnectionStrings:Default"] = response.Parameter.Value
    });
}

builder.Host.UseSerilog((_, config) => config
    .MinimumLevel.Information()
    .Enrich.FromLogContext()
    .WriteTo.Console(new JsonFormatter(renderMessage: true)));

builder.Services.AddProblemDetails();
builder.Services.AddApiProtection(builder.Configuration);
// Binding errors (missing/non-numeric query parameters) also use ProblemDetails.
builder.Services.Configure<Microsoft.AspNetCore.Routing.RouteHandlerOptions>(o => o.ThrowOnBadRequest = false);
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddOpenApi();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<GetTopDistrictsHandler>();
builder.Services.AddScoped<GetCrimeMapHandler>();
builder.Services.AddScoped<GetExplorationHandler>();
builder.Services.AddScoped<GetTrendsHandler>();
builder.Services.AddScoped<ChapaTuChoro.Application.Population.GetPopulationComparisonHandler>();
builder.Services.AddScoped<ChapaTuChoro.Application.Population.GetPopulationHistoryHandler>();
builder.Services.AddScoped<ChapaTuChoro.Application.Population.GetPopulationInsightsHandler>();
builder.Services.AddScoped<ChapaTuChoro.Application.Population.GetRateExplorationHandler>();
builder.Services.AddScoped<ChapaTuChoro.Application.Concentration.GetConcentrationTrendsHandler>();
builder.Services.AddScoped<ChapaTuChoro.Application.Concentration.GetConcentrationHandler>();
builder.Services.AddScoped<ChapaTuChoro.Application.Concentration.GetRadiusAnalysisHandler>();
builder.Services.AddScoped<ChapaTuChoro.Application.Concentration.GetMapCellsHandler>();
builder.Services.AddScoped<GetStatisticsSummaryHandler>();
builder.Services.AddScoped<GetMetadataHandler>();
builder.Services.AddScoped<GetCategoriesHandler>();
builder.Services.AddScoped<CheckGovernmentCatalogHandler>();
builder.Services.AddAWSLambdaHosting(LambdaEventSource.HttpApi); // Also supports Lambda Function URLs.

builder.Services.AddFrontendCors(builder.Configuration, builder.Environment);

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();
app.UseForwardedHeaders();
app.UseRouting();
app.UseCors(FrontendCors.PolicyName);
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    // Dev-only demonstration of options + typed HttpClient + expected dependency error -> 503.
    app.MapGet("/api/dev/catalog-status", async (CheckGovernmentCatalogHandler handler, CancellationToken ct) =>
        (await handler.HandleAsync(ct)).ToHttpResult())
        .Produces<CatalogStatusDto>()
        .ProducesProblem(StatusCodes.Status503ServiceUnavailable)
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .ProducesProblem(StatusCodes.Status500InternalServerError);
}

app.UseRateLimiter();

app.MapGet("/api/health", () => Results.Ok(new HealthStatusDto("ok")))
    .Produces<HealthStatusDto>()
    .ProducesProblem(StatusCodes.Status429TooManyRequests)
    .ProducesProblem(StatusCodes.Status500InternalServerError);
app.MapGet("/api/ready", async (CrimeWatchDbContext db, CancellationToken ct) =>
    await db.Database.CanConnectAsync(ct)
        ? Results.Ok(new HealthStatusDto("ready"))
        : Results.Problem(statusCode: 503, title: "Database unavailable"))
    .Produces<HealthStatusDto>()
    .ProducesProblem(StatusCodes.Status503ServiceUnavailable)
    .ProducesProblem(StatusCodes.Status429TooManyRequests)
    .ProducesProblem(StatusCodes.Status500InternalServerError);
app.MapStatisticsEndpoints();
app.MapPopulationEndpoints();
app.Run();

public partial class Program { } // For future WebApplicationFactory tests.
