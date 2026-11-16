using System.Text.Json;

namespace ChapaTuChoro.Application.Statistics;

public sealed record PeriodDto(int Year, int Month);
public sealed record SourceDto(string Kind, string Name, string Sha256, DateTimeOffset ImportedAt);
public sealed record MetadataDto(PeriodDto? LatestPeriod, long TotalRows,
    IReadOnlyList<PeriodDto> AvailablePeriods, IReadOnlyList<SourceDto> Imports,
    string StatisticsSource, string GeometrySource);
public sealed record StatisticsSummaryDto(PeriodDto Period, string? Category,
    long Reports, int DistrictsWithData, int DistrictsWithoutGeometry);
public sealed record DistrictStatisticDto(string Ubigeo, string District, long Reports);
public sealed record DistrictMapProperties(string Ubigeo, string District, long? Reports);
public sealed record GeoFeatureDto(string Type, JsonElement Geometry, DistrictMapProperties Properties);
public sealed record GeoFeatureCollectionDto(string Type, IReadOnlyList<GeoFeatureDto> Features);

public interface IStatisticsReadRepository
{
    Task<ExplorationDto> GetExplorationAsync(int year, int month, string? category, string? department, string? province, string? district, CancellationToken ct);
    Task<StatisticsSummaryDto> GetSummaryAsync(int year, int month, string? category, CancellationToken ct);
    Task<MetadataDto> GetMetadataAsync(CancellationToken ct);
    Task<IReadOnlyList<string>> GetCategoriesAsync(CancellationToken ct);
    Task<IReadOnlyList<DistrictStatisticDto>> GetTopDistrictsAsync(
        int year, int month, string? category, CancellationToken ct);
    Task<GeoFeatureCollectionDto> GetDistrictMapAsync(
        int year, int month, string? category, string department, string? province, string? district, CancellationToken ct);
}

public sealed record DistrictOptionDto(string Code, string Name);
public sealed record ProvinceOptionDto(string Code, string Name);
public sealed record DepartmentOptionDto(string Code, string Name);
public sealed record AreaStatisticDto(string Code, string Name, long Reports, decimal? RatePer100k = null, long? Population = null);
public sealed record AreaPropertiesDto(string Code, string Name, string Level, long? Reports, decimal? RatePer100k = null, long? Population = null);
public sealed record AreaFeatureDto(string Type, JsonElement Geometry, AreaPropertiesDto Properties);
public sealed record AreaFeatureCollectionDto(string Type, IReadOnlyList<AreaFeatureDto> Features);
public sealed record ExplorationDto(PeriodDto Period, string? Category, string? Department, string? Province, string? District, string Level,
    IReadOnlyList<DepartmentOptionDto> Departments, IReadOnlyList<ProvinceOptionDto> Provinces, IReadOnlyList<DistrictOptionDto> Districts, StatisticsSummaryDto Summary,
    IReadOnlyList<AreaStatisticDto> Ranking, AreaFeatureCollectionDto Map,
    ChapaTuChoro.Application.Population.PopulationHistoryQuality? Quality = null,
    ChapaTuChoro.Application.Population.PopulationRelease? PopulationSource = null);
