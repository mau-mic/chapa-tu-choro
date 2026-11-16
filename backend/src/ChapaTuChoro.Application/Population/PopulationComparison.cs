using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Statistics;

namespace ChapaTuChoro.Application.Population;

/// <summary>One monthly SIDPOL selection; population always uses the same calendar year.</summary>
public sealed record PopulationQuery(int Year, int Month, string? Category, string? Department, string? Province, string? District);
/// <summary>Content-addressed source of the annual population denominator.</summary>
public sealed record PopulationRelease(string Sha256, string SourceUrl, DateTimeOffset ImportedAt);
/// <summary>Annual population; null means unavailable, never zero.</summary>
public sealed record PopulationArea(string Ubigeo, string Name, long? People);
/// <summary>Server-aggregated monthly report rows; no individual events.</summary>
public sealed record PopulationReports(int Month, string Ubigeo, long Reports, int RowsWithoutPopulation);
/// <summary>Monthly registered reports per 100,000 projected residents, without annualization.</summary>
public sealed record PopulationMonth(int Month, long? Reports, decimal? RatePer100k, int RowsWithoutPopulation);
/// <summary>Territorial comparison preserving counts beside the normalized rate.</summary>
public sealed record PopulationRanking(string Ubigeo, string Name, long Reports, long? Population, decimal? RatePer100k);
/// <summary>Population comparison with provenance, annual reference and missing-denominator indicators.</summary>
public sealed record PopulationComparison(int Year, int Month, string Level, long? Population,
    PopulationRelease Source, IReadOnlyList<PopulationMonth> Monthly, IReadOnlyList<PopulationRanking> Ranking)
{
    public static string ScopeCode(PopulationQuery query) =>
        query.District ?? (query.Province is not null ? query.Province + "00" : query.Department is not null ? query.Department + "0000" : "000000");

    public static PopulationComparison Create(PopulationQuery query, PopulationRelease source,
        IReadOnlyList<PopulationArea> areas, IReadOnlyList<PopulationReports> reports)
    {
        var populations = areas.ToDictionary(x => x.Ubigeo);
        var population = populations.GetValueOrDefault(ScopeCode(query))?.People;
        static decimal? Rate(long? count, long? people, int missing) =>
            count is not null && people is > 0 && missing == 0 ? decimal.Round(count.Value * 100000m / people.Value, 2) : null;
        var byMonth = reports.GroupBy(x => x.Month).ToDictionary(x => x.Key,
            x => (Reports: x.Sum(r => r.Reports), Missing: x.Sum(r => r.RowsWithoutPopulation)));
        var monthly = Enumerable.Range(1, 12).Select(month =>
        {
            var present = byMonth.TryGetValue(month, out var value);
            long? count = present ? value.Reports : null;
            return new PopulationMonth(month, count, Rate(count, population, value.Missing), value.Missing);
        }).ToArray();
        var ranking = reports.Where(x => x.Month == query.Month).Select(x =>
        {
            var area = populations.GetValueOrDefault(x.Ubigeo);
            return new PopulationRanking(x.Ubigeo, area?.Name ?? x.Ubigeo, x.Reports, area?.People,
                Rate(x.Reports, area?.People, x.RowsWithoutPopulation));
        }).OrderByDescending(x => x.RatePer100k).ThenBy(x => x.Ubigeo, StringComparer.Ordinal).ToArray();
        return new(query.Year, query.Month, query.District is not null || query.Province is not null ? "district" : query.Department is not null ? "province" : "department",
            population, source, monthly, ranking);
    }
}

public interface IPopulationReadRepository
{
    Task<PopulationComparison?> ReadAsync(PopulationQuery query, CancellationToken ct);
}

public sealed class GetPopulationComparisonHandler(IPopulationReadRepository repository)
{
    public async Task<Result<PopulationComparison>> HandleAsync(PopulationQuery query, CancellationToken ct)
    {
        var error = StatisticsFilterValidator.Validate(new(query.Year, query.Month, query.Category))
            ?? GeographicFilter.Validate(query.Department, query.Province, query.District);
        if (error is not null) return Result<PopulationComparison>.Failure(error);
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(15));
        PopulationComparison? data;
        try
        {
            data = await repository.ReadAsync(query with { Category = string.IsNullOrWhiteSpace(query.Category) ? null : query.Category.Trim() }, budget.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested && budget.IsCancellationRequested)
        {
            return Result<PopulationComparison>.Failure(AppError.DependencyUnavailable("population.timeout", "La consulta de población tardó demasiado. Vuelve a intentarlo."));
        }
        return data is null
            ? Result<PopulationComparison>.Failure(AppError.NotFound("population.unavailable", "No population projection is available for this year and territory. Import the INEI workbook or choose another selection."))
            : Result<PopulationComparison>.Success(data);
    }
}
