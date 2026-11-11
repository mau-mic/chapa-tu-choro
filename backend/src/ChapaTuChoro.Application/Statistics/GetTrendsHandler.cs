using ChapaTuChoro.Application.Common;

namespace ChapaTuChoro.Application.Statistics;

public sealed class GetTrendsHandler(ITrendsReadRepository repository)
{
    public async Task<Result<TrendsDto>> HandleAsync(TrendsQuery query, CancellationToken ct)
    {
        var error = StatisticsFilterValidator.Validate(new(query.FromYear, query.FromMonth, query.Category))
            ?? StatisticsFilterValidator.Validate(new(query.ToYear, query.ToMonth, query.Category))
            ?? GeographicFilter.Validate(query.Department, query.Province, query.District);
        if (error is not null) return Result<TrendsDto>.Failure(error);
        var from = new DateOnly(query.FromYear, query.FromMonth, 1);
        var to = new DateOnly(query.ToYear, query.ToMonth, 1);
        var months = (to.Year - from.Year) * 12 + to.Month - from.Month + 1;
        if (months is < 1 or > 120)
            return Result<TrendsDto>.Failure(AppError.Validation("trends.invalid_range", "Select an ordered range of 1 to 120 months."));
        query = query with { Category = GetTopDistrictsHandler.NormalizeCategory(query.Category) };
        var snapshot = await repository.GetAsync(query, ct);
        return Project(query,snapshot);
    }

    // Shared projection for validated source-specific queries. Persistence supplies
    // sparse observations; use cases retain the counting and gap rules here.
    public static Result<TrendsDto> Project(TrendsQuery query, TrendsSnapshot snapshot)
    {
        var from = new DateOnly(query.FromYear,query.FromMonth,1);
        var to = new DateOnly(query.ToYear,query.ToMonth,1);
        var months = (to.Year-from.Year)*12+to.Month-from.Month+1;
        var error = GeographicFilter.ValidateAvailable(query.Department, query.Province, query.District,
            snapshot.Departments, snapshot.Provinces, snapshot.Districts);
        if (error is not null) return Result<TrendsDto>.Failure(error);
        var observations = snapshot.Observations.ToDictionary(x => x.Period, x => x.Reports);
        long? Count(DateOnly date) => observations.GetValueOrDefault(new(date.Year, date.Month));
        var series = Enumerable.Range(0, months).Select(offset => {
            var date = from.AddMonths(offset);
            return new MonthlyTrendDto(new(date.Year, date.Month), Count(date));
        }).ToArray();
        var categoryObservations = snapshot.CategoryObservations.ToDictionary(x => (x.Category, x.Period), x => x.Reports);
        var categorySeries = snapshot.Categories.Select(category => new CategoryTrendDto(category.Category,
            series.Select(point => new MonthlyTrendDto(point.Period,
                categoryObservations.TryGetValue((category.Category, point.Period), out var count) ? count : null)).ToArray())).ToArray();
        var available = series.Where(x => x.Reports.HasValue).ToArray();
        var current = Count(to); var previous = Count(to.AddMonths(-1)); var previousYear = Count(to.AddYears(-1));
        var metrics = new TrendsMetricsDto(available.Length == 0 ? null : available.Sum(x => x.Reports!.Value),
            available.Length, months, current, previous, previousYear, Change(current, previous), Change(current, previousYear));
        return Result<TrendsDto>.Success(new(new(from.Year, from.Month), new(to.Year, to.Month), query.Category,
            query.Department, query.Province, query.District,
            query.Department is null ? "department" : query.Province is null && query.District is null ? "province" : "district",
            snapshot.Departments, snapshot.Provinces, snapshot.Districts, metrics, series, snapshot.Categories, snapshot.Territories, categorySeries));
    }

    private static decimal? Change(long? current, long? previous) => current.HasValue && previous > 0
        ? Math.Round(((decimal)current.Value - previous.Value) / previous.Value * 100, 2) : null;
}
