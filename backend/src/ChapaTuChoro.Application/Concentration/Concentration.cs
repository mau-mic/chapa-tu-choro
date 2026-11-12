using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Domain.Reports;

namespace ChapaTuChoro.Application.Concentration;

public sealed record ConcentrationOption(int Year, int Month, string Category, string Label, string Source, DateTimeOffset ImportedAt);
public sealed record ConcentrationMetadata(bool SetupRequired, IReadOnlyList<ConcentrationOption> Available);
public sealed record ConcentrationQuery(int Year, int Month, string Category, string? Department, string? Province, string? District);
public sealed record DensityCell(string Id, double Longitude, double Latitude, long Records);
public sealed record ConcentrationArea(string Code, string Name, long SourceRecords, long MappedRecords, long? SidpolReports);
public sealed record SnapshotQuality(long SourceRows, long? DistinctSourceIdentifiers, System.Text.Json.JsonElement IngestionChecks);
public sealed record ConcentrationSnapshot(ConcentrationOption Selection, long SourceRecords, long MappedRecords,
    long VisibleRecords, IReadOnlyList<DensityCell> Cells, IReadOnlyList<ConcentrationArea> Ranking,
    IReadOnlyList<MonthlyTrendDto> Monthly, int GridMetres, int MinimumCellRecords, string CountingUnit, string ComparisonNote, SnapshotQuality Quality, bool SpatialDetailAvailable = false);
public interface IConcentrationReadRepository
{
    Task<ConcentrationMetadata> MetadataAsync(CancellationToken ct);
    Task<ConcentrationSnapshot?> GetAsync(ConcentrationQuery query, CancellationToken ct);
}
public sealed class GetConcentrationHandler(IConcentrationReadRepository repository)
{
    public Task<ConcentrationMetadata> MetadataAsync(CancellationToken ct) => repository.MetadataAsync(ct);
    public async Task<Result<ConcentrationSnapshot>> HandleAsync(ConcentrationQuery query, CancellationToken ct)
    {
        var error = StatisticsFilterValidator.Validate(new(query.Year, query.Month, query.Category))
            ?? GeographicFilter.Validate(query.Department, query.Province, query.District);
        if (error is not null) return Result<ConcentrationSnapshot>.Failure(error);
        if (!ConcentrationPolicy.Categories.ContainsKey(query.Category) || query.Year is not (2025 or 2026) || query.Year == 2025 && query.Category == "all")
            return Result<ConcentrationSnapshot>.Failure(AppError.Validation("concentration.unsupported_selection", "Selecciona una categoría de archivo para 2025 o una selección disponible de 2026."));
        var metadata = await repository.MetadataAsync(ct);
        if (metadata.SetupRequired) return Result<ConcentrationSnapshot>.Failure(AppError.DependencyUnavailable("concentration.setup_required", "La fuente de concentración necesita completar su configuración e importación."));
        if (!metadata.Available.Any(o => o.Year == query.Year && o.Month == query.Month && o.Category == query.Category))
            return Result<ConcentrationSnapshot>.Failure(AppError.NotFound("concentration.period_unavailable", "No hay una instantánea importada para esta categoría y período. No se sustituye por otro año."));
        var data = await repository.GetAsync(query, ct);
        return data is null ? Result<ConcentrationSnapshot>.Failure(AppError.NotFound("concentration.snapshot_unavailable", "La instantánea seleccionada ya no está disponible.")) : Result<ConcentrationSnapshot>.Success(data);
    }
}
