using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Domain.Reports;

namespace ChapaTuChoro.Application.Concentration;

public sealed record MapBounds(double West, double South, double East, double North);
public sealed record MapCellsQuery(ConcentrationQuery Selection, int GridMetres, MapBounds Bounds);
public sealed record MapCellsSnapshot(ConcentrationOption Selection, int GridMetres, int MinimumCellRecords,
    IReadOnlyList<DensityCell> Cells, long VisibleRecords, long SuppressedCells, MapBounds Coverage);
public interface IConcentrationCellsRepository
{
    Task<Result<MapCellsSnapshot>> GetAsync(MapCellsQuery query, CancellationToken ct);
}
public sealed class GetMapCellsHandler(IConcentrationReadRepository selections, IConcentrationCellsRepository repository)
{
    public async Task<Result<MapCellsSnapshot>> HandleAsync(MapCellsQuery query, CancellationToken ct)
    {
        var q = query.Selection; var b = query.Bounds;
        var error = StatisticsFilterValidator.Validate(new(q.Year,q.Month,q.Category))
            ?? GeographicFilter.Validate(q.Department,q.Province,q.District);
        if (error is not null) return Result<MapCellsSnapshot>.Failure(error);
        if (!ConcentrationPolicy.MapGridSizesMetres.Contains(query.GridMetres)
            || !double.IsFinite(b.West) || !double.IsFinite(b.South) || !double.IsFinite(b.East) || !double.IsFinite(b.North)
            || b.West < -82 || b.East > -68 || b.South < -19 || b.North > 1 || b.West >= b.East || b.South >= b.North)
            return Result<MapCellsSnapshot>.Failure(AppError.Validation("concentration.invalid_map_view", "Selecciona una vista de Perú y una agrupación de 500 m, 1 km o 10 km."));
        if (!ConcentrationPolicy.Categories.ContainsKey(q.Category) || q.Year is not (2025 or 2026) || q.Year == 2025 && q.Category == "all")
            return Result<MapCellsSnapshot>.Failure(AppError.Validation("concentration.unsupported_selection", "Selecciona una categoría y un período disponibles."));
        var metadata = await selections.MetadataAsync(ct);
        if (metadata.SetupRequired) return Result<MapCellsSnapshot>.Failure(AppError.DependencyUnavailable("concentration.setup_required", "Aplica las migraciones de concentración y ejecuta la importación."));
        if (!metadata.Available.Any(o => o.Year == q.Year && o.Month == q.Month && o.Category == q.Category))
            return Result<MapCellsSnapshot>.Failure(AppError.NotFound("concentration.period_unavailable", "No hay una instantánea importada para esta selección."));
        return await repository.GetAsync(query,ct);
    }
}
