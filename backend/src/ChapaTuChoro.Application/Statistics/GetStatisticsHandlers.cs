using ChapaTuChoro.Application.Common;

namespace ChapaTuChoro.Application.Statistics;

public sealed record StatisticsFilter(int Year, int Month, string? Category);

public static class StatisticsFilterValidator
{
    public static AppError? Validate(StatisticsFilter query)
    {
        if (query.Year is < 2000 or > 2100)
            return AppError.Validation("statistics.invalid_year", "Year must be between 2000 and 2100.");
        if (query.Month is < 1 or > 12)
            return AppError.Validation("statistics.invalid_month", "Month must be between 1 and 12.");
        if (query.Category?.Length > 200)
            return AppError.Validation("statistics.invalid_category", "Category is too long.");
        return null;
    }
}

/// <summary>Explicit use-case handlers keep dispatch simple without introducing MediatR.</summary>
public sealed class GetTopDistrictsHandler(IStatisticsReadRepository repository)
{
    public async Task<Result<IReadOnlyList<DistrictStatisticDto>>> HandleAsync(
        StatisticsFilter query, CancellationToken ct)
    {
        var error = StatisticsFilterValidator.Validate(query);
        if (error is not null) return Result<IReadOnlyList<DistrictStatisticDto>>.Failure(error);
        var data = await repository.GetTopDistrictsAsync(query.Year, query.Month,
            NormalizeCategory(query.Category), ct);
        return Result<IReadOnlyList<DistrictStatisticDto>>.Success(data);
    }

    internal static string? NormalizeCategory(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed class GetCrimeMapHandler(IStatisticsReadRepository repository)
{
    public async Task<Result<GeoFeatureCollectionDto>> HandleAsync(
        StatisticsFilter query, string? department, string? province, string? district, CancellationToken ct)
    {
        var error = StatisticsFilterValidator.Validate(query);
        if (error is not null) return Result<GeoFeatureCollectionDto>.Failure(error);
        error = GeographicFilter.Validate(department, province, district);
        if (error is not null) return Result<GeoFeatureCollectionDto>.Failure(error);
        if (department is null)
            return Result<GeoFeatureCollectionDto>.Failure(AppError.Validation(
                "statistics.map_scope_required", "Select a department for district geometry. Use /api/explorer for the national overview."));
        var data = await repository.GetDistrictMapAsync(query.Year, query.Month,
            GetTopDistrictsHandler.NormalizeCategory(query.Category), department, province, district, ct);
        return Result<GeoFeatureCollectionDto>.Success(data);
    }
}

public sealed class GetStatisticsSummaryHandler(IStatisticsReadRepository repository)
{
    public async Task<Result<StatisticsSummaryDto>> HandleAsync(StatisticsFilter query, CancellationToken ct)
    {
        var error = StatisticsFilterValidator.Validate(query);
        if (error is not null) return Result<StatisticsSummaryDto>.Failure(error);
        return Result<StatisticsSummaryDto>.Success(await repository.GetSummaryAsync(query.Year,
            query.Month, GetTopDistrictsHandler.NormalizeCategory(query.Category), ct));
    }
}

public sealed class GetMetadataHandler(IStatisticsReadRepository repository)
{
    public async Task<Result<MetadataDto>> HandleAsync(CancellationToken ct) =>
        Result<MetadataDto>.Success(await repository.GetMetadataAsync(ct));
}

public sealed class GetCategoriesHandler(IStatisticsReadRepository repository)
{
    public async Task<Result<IReadOnlyList<string>>> HandleAsync(CancellationToken ct) =>
        Result<IReadOnlyList<string>>.Success(await repository.GetCategoriesAsync(ct));
}

public sealed class GetExplorationHandler(IStatisticsReadRepository repository)
{
    public async Task<Result<ExplorationDto>> HandleAsync(StatisticsFilter query, string? department, string? province, string? district, CancellationToken ct)
    {
        var error = StatisticsFilterValidator.Validate(query);
        if (error is not null) return Result<ExplorationDto>.Failure(error);
        error = GeographicFilter.Validate(department, province, district);
        if (error is not null) return Result<ExplorationDto>.Failure(error);
        var data = await repository.GetExplorationAsync(query.Year, query.Month,
            GetTopDistrictsHandler.NormalizeCategory(query.Category), department, province, district, ct);
        error = GeographicFilter.ValidateAvailable(department, province, district, data.Departments, data.Provinces, data.Districts);
        if (error is not null) return Result<ExplorationDto>.Failure(error);
        return Result<ExplorationDto>.Success(data);
    }
}
