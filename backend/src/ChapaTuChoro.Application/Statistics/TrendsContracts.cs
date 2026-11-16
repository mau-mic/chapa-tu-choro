namespace ChapaTuChoro.Application.Statistics;

public sealed record TrendsQuery(int FromYear, int FromMonth, int ToYear, int ToMonth,
    string? Category, string? Department, string? Province, string? District);
public sealed record MonthlyTrendDto(PeriodDto Period, long? Reports);
public sealed record CategoryObservationDto(PeriodDto Period, string Category, long Reports);
public sealed record CategoryTrendDto(string Category, IReadOnlyList<MonthlyTrendDto> Monthly);
public sealed record CategoryTotalDto(string Category, long Reports);
public sealed record TrendsMetricsDto(long? TotalReports, int MonthsWithData, int RequestedMonths,
    long? CurrentMonthReports, long? PreviousMonthReports, long? PreviousYearMonthReports,
    decimal? MonthlyChangePercent, decimal? YearlyChangePercent);
public sealed record TrendsDto(PeriodDto From, PeriodDto To, string? Category, string? Department,
    string? Province, string? District, string ComparisonLevel,
    IReadOnlyList<DepartmentOptionDto> Departments, IReadOnlyList<ProvinceOptionDto> Provinces,
    IReadOnlyList<DistrictOptionDto> Districts, TrendsMetricsDto Metrics,
    IReadOnlyList<MonthlyTrendDto> Monthly, IReadOnlyList<CategoryTotalDto> Categories,
    IReadOnlyList<AreaStatisticDto> Territories, IReadOnlyList<CategoryTrendDto> CategorySeries);

// Sparse persistence observations, including the months needed for comparisons.
// The application supplies explicit gaps and computes percentages.
public sealed record TrendsSnapshot(IReadOnlyList<MonthlyTrendDto> Observations,
    IReadOnlyList<CategoryTotalDto> Categories, IReadOnlyList<AreaStatisticDto> Territories,
    IReadOnlyList<DepartmentOptionDto> Departments, IReadOnlyList<ProvinceOptionDto> Provinces,
    IReadOnlyList<DistrictOptionDto> Districts, IReadOnlyList<CategoryObservationDto> CategoryObservations);
public interface ITrendsReadRepository
{
    Task<TrendsSnapshot> GetAsync(TrendsQuery query, CancellationToken ct);
}
