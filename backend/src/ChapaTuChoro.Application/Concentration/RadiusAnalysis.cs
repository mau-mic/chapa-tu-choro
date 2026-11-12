using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Domain.Reports;
using System.Text.Json;

namespace ChapaTuChoro.Application.Concentration;

public sealed record RadiusQuery(ConcentrationQuery Selection, double Longitude, double Latitude, int RadiusMetres);
public sealed record RadiusSnapshot(ConcentrationOption Selection, double Longitude, double Latitude, int RadiusMetres,
    long? Records, bool Suppressed, int MinimumRecords, JsonElement Area, string CountingUnit, string AccuracyNote);
public interface IConcentrationRadiusRepository
{
    Task<Result<RadiusSnapshot>> CountAsync(RadiusQuery query, CancellationToken ct);
}
public sealed class GetRadiusAnalysisHandler(IConcentrationReadRepository selections, IConcentrationRadiusRepository repository)
{
    public async Task<Result<RadiusSnapshot>> HandleAsync(RadiusQuery query, CancellationToken ct)
    {
        var selection = query.Selection;
        var error = StatisticsFilterValidator.Validate(new(selection.Year, selection.Month, selection.Category))
            ?? GeographicFilter.Validate(selection.Department, selection.Province, selection.District);
        if (error is not null) return Result<RadiusSnapshot>.Failure(error);
        if (!double.IsFinite(query.Longitude) || !double.IsFinite(query.Latitude)
            || query.Longitude is < -82 or > -68 || query.Latitude is < -19 or > 1
            || !ConcentrationPolicy.QueryRadiiMetres.Contains(query.RadiusMetres))
            return Result<RadiusSnapshot>.Failure(AppError.Validation("concentration.invalid_radius", "Selecciona un punto en Perú y un radio de 500, 1000 o 2000 metros."));
        if (!ConcentrationPolicy.Categories.ContainsKey(selection.Category) || selection.Year is not (2025 or 2026)
            || selection.Year == 2025 && selection.Category == "all")
            return Result<RadiusSnapshot>.Failure(AppError.Validation("concentration.unsupported_selection", "Selecciona una categoría y un período disponibles."));
        var metadata = await selections.MetadataAsync(ct);
        if (metadata.SetupRequired) return Result<RadiusSnapshot>.Failure(AppError.DependencyUnavailable("concentration.setup_required", "Aplica las migraciones de concentración y ejecuta la importación."));
        if (!metadata.Available.Any(o => o.Year == selection.Year && o.Month == selection.Month && o.Category == selection.Category))
            return Result<RadiusSnapshot>.Failure(AppError.NotFound("concentration.period_unavailable", "No hay una instantánea importada para esta selección."));
        return await repository.CountAsync(query, ct);
    }
}
