using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Statistics;

namespace ChapaTuChoro.Application.Population;

/// <summary>Annual population pinned to one immutable source release.</summary>
public sealed record PopulationDenominator(int Year, string Code, long? People);
/// <summary>One server-grouped month; null scope reports mean no matching observations.</summary>
public sealed record PopulationInsightFact(int Year, int Month, long? ScopeReports, long NationalReports,
    int ScopeMissingPopulation, int NationalMissingPopulation);
/// <summary>A complete-window mean with separate count/rate observation availability.</summary>
public sealed record PopulationAverage(decimal? Reports, decimal? RatePer100k, int ReportObservations,
    int RateObservations, int RequiredObservations);
/// <summary>Relative change against a prior-only reference; zero references are unavailable.</summary>
public sealed record PopulationDeviation(decimal? ReportsPercent, decimal? RatePercent);
/// <summary>Actual monthly observations and explainable smoothing/reference calculations.</summary>
public sealed record PopulationInsightValues(long? Reports, long? Population, decimal? RatePer100k,
    PopulationAverage Rolling3, PopulationAverage Rolling12, PopulationAverage HistoricalBaseline,
    PopulationAverage SeasonalBaseline, PopulationDeviation HistoricalChange, PopulationDeviation SeasonalChange);
/// <summary>Selected territory and national reference for exactly the same category/month.</summary>
public sealed record PopulationInsightMonth(PeriodDto Period, PopulationInsightValues Scope, PopulationInsightValues National,
    decimal? NationalDifferencePer100k, decimal? NationalDifferencePercent);
/// <summary>Bounded advanced statistics. Internal lookback observations are not exposed as selected months.</summary>
public sealed record PopulationInsightsDto(PeriodDto From, PeriodDto To, string ScopeCode, PopulationRelease Source,
    int LookbackMonths, IReadOnlyList<PopulationInsightMonth> Monthly);

public static class PopulationInsightsProjection
{
    public const int LookbackMonths = 36;
    private sealed record Observation(long? Reports, long? Population, decimal? Rate);

    public static PopulationInsightsDto Create(PopulationHistoryQuery query, PopulationRelease source,
        IReadOnlyList<PopulationDenominator> areas, IReadOnlyList<PopulationInsightFact> facts)
    {
        var from = new DateOnly(query.FromYear, query.FromMonth, 1);
        var to = new DateOnly(query.ToYear, query.ToMonth, 1);
        var populations = areas.ToDictionary(x => (x.Year, x.Code), x => x.People);
        var observed = facts.ToDictionary(x => new DateOnly(x.Year, x.Month, 1));
        Observation Read(DateOnly date, bool national)
        {
            var fact = observed.GetValueOrDefault(date);
            long? reports = national ? fact?.NationalReports : fact?.ScopeReports;
            var people = populations.GetValueOrDefault((date.Year, national ? "000000" : query.ScopeCode));
            var missing = national ? fact?.NationalMissingPopulation ?? 0 : fact?.ScopeMissingPopulation ?? 0;
            return new(reports, people, PopulationRates.Calculate(reports, people, missing));
        }
        PopulationAverage Average(IEnumerable<Observation> values, int required)
        {
            var rows = values.ToArray();
            var counts = rows.Where(x => x.Reports is not null).Select(x => (decimal)x.Reports!.Value).ToArray();
            var rates = rows.Where(x => x.Rate is not null).Select(x => x.Rate!.Value).ToArray();
            return new(counts.Length == required ? decimal.Round(counts.Average(), 2) : null,
                rates.Length == required ? decimal.Round(rates.Average(), 2) : null, counts.Length, rates.Length, required);
        }
        PopulationInsightValues Values(DateOnly date, bool national)
        {
            var actual = Read(date, national);
            var rolling3 = Average(Enumerable.Range(0, 3).Select(i => Read(date.AddMonths(-i), national)), 3);
            var rolling12 = Average(Enumerable.Range(0, 12).Select(i => Read(date.AddMonths(-i), national)), 12);
            var historical = Average(Enumerable.Range(1, LookbackMonths).Select(i => Read(date.AddMonths(-i), national)), LookbackMonths);
            var seasonal = Average(Enumerable.Range(1, 3).Select(i => Read(date.AddYears(-i), national)), 3);
            return new(actual.Reports, actual.Population, actual.Rate, rolling3, rolling12, historical, seasonal,
                new(Change(actual.Reports, historical.Reports), Change(actual.Rate, historical.RatePer100k)),
                new(Change(actual.Reports, seasonal.Reports), Change(actual.Rate, seasonal.RatePer100k)));
        }
        var monthly = Enumerable.Range(0, (to.Year - from.Year) * 12 + to.Month - from.Month + 1).Select(i =>
        {
            var date = from.AddMonths(i);
            var scope = Values(date, false);
            var national = Values(date, true);
            return new PopulationInsightMonth(new(date.Year, date.Month), scope, national,
                scope.RatePer100k is not null && national.RatePer100k is not null
                    ? decimal.Round(scope.RatePer100k.Value - national.RatePer100k.Value, 2) : null,
                Change(scope.RatePer100k, national.RatePer100k));
        }).ToArray();
        return new(new(from.Year, from.Month), new(to.Year, to.Month), query.ScopeCode, source, LookbackMonths, monthly);
    }

    private static decimal? Change(decimal? actual, decimal? reference) => actual is not null && reference is not null && reference != 0
        ? decimal.Round((actual.Value - reference.Value) / reference.Value * 100m, 2) : null;
}

public interface IPopulationInsightsReadRepository
{
    Task<PopulationInsightsDto?> ReadAsync(PopulationHistoryQuery query, CancellationToken ct);
}

public sealed class GetPopulationInsightsHandler(IPopulationInsightsReadRepository repository)
{
    public async Task<Result<PopulationInsightsDto>> HandleAsync(PopulationHistoryQuery query, CancellationToken ct)
    {
        var error = GetPopulationHistoryHandler.Validate(query);
        if (error is not null) return Result<PopulationInsightsDto>.Failure(error);
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(15));
        PopulationInsightsDto? data;
        try
        {
            data = await repository.ReadAsync(query with { Category = string.IsNullOrWhiteSpace(query.Category) ? null : query.Category.Trim() }, budget.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested && budget.IsCancellationRequested)
        {
            return Result<PopulationInsightsDto>.Failure(AppError.DependencyUnavailable("population.timeout", "La consulta tardó demasiado. Vuelve a intentarlo."));
        }
        return data is null
            ? Result<PopulationInsightsDto>.Failure(AppError.NotFound("population.unavailable", "No hay datos disponibles para el período seleccionado."))
            : Result<PopulationInsightsDto>.Success(data);
    }
}
