using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Domain.Reports;

namespace ChapaTuChoro.Application.Concentration;

public sealed record ConcentrationTrendsSnapshot(TrendsSnapshot Data, IReadOnlyList<ConcentrationOption> Available);
public interface IConcentrationTrendsReadRepository
{
    Task<Result<ConcentrationTrendsSnapshot>> GetAsync(TrendsQuery query,CancellationToken ct);
}
public sealed record ConcentrationTrendsDto(TrendsDto Data, string CountingUnit, string CountScope,
    PeriodDto? LatestPeriod, IReadOnlyList<ConcentrationOption> Imports);
public sealed class GetConcentrationTrendsHandler(IConcentrationTrendsReadRepository repository)
{
    public async Task<Result<ConcentrationTrendsDto>> HandleAsync(TrendsQuery query, CancellationToken ct)
    {
        var error = StatisticsFilterValidator.Validate(new(query.FromYear,query.FromMonth,query.Category))
            ?? StatisticsFilterValidator.Validate(new(query.ToYear,query.ToMonth,query.Category))
            ?? GeographicFilter.Validate(query.Department,query.Province,query.District);
        if(error is not null) return Result<ConcentrationTrendsDto>.Failure(error);
        if(query.FromMonth>query.ToMonth)
            return Result<ConcentrationTrendsDto>.Failure(AppError.Validation("concentration.invalid_trends_range","El mes inicial debe ser anterior o igual al final."));
        if (query.FromYear != query.ToYear || query.FromYear is not (2025 or 2026)
            || query.Category is null || !ConcentrationPolicy.Categories.ContainsKey(query.Category)
            || query.FromYear == 2025 && query.Category == "all")
            return Result<ConcentrationTrendsDto>.Failure(AppError.Validation("concentration.invalid_trends_source",
                "Selecciona una publicación anual y una categoría disponible. Los archivos de 2025 no tienen un total conjunto validado."));
        var read = await repository.GetAsync(query,ct);
        if(!read.IsSuccess)return Result<ConcentrationTrendsDto>.Failure(read.Error!);
        var available=read.Value!.Available;
        var result=GetTrendsHandler.Project(query,read.Value.Data);
        if(!result.IsSuccess)return Result<ConcentrationTrendsDto>.Failure(result.Error!);
        return Result<ConcentrationTrendsDto>.Success(new(result.Value!, "source-classification-rows", "valid-ubigeo-including-unmappable",
            new(query.FromYear, available.Max(x => x.Month)), available.Where(x => x.Month >= query.FromMonth && x.Month <= query.ToMonth).ToArray()));
    }
}
