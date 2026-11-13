using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Statistics;

namespace ChapaTuChoro.Application.Population;

/// <summary>Decorates the official choropleth with rates while retaining every count and geometry.</summary>
public sealed class GetRateExplorationHandler(GetExplorationHandler exploration,GetPopulationHistoryHandler history)
{
    public async Task<Result<ExplorationDto>> HandleAsync(StatisticsFilter filter,string? department,string? province,string? district,CancellationToken ct)
    {
        var counts=await exploration.HandleAsync(filter,department,province,district,ct);
        if(!counts.IsSuccess)return counts;
        var data=counts.Value!;
        var normalized=await history.HandleAsync(new(filter.Year,filter.Month,filter.Year,filter.Month,filter.Category,
            department,province,district,null,data.Level),ct);
        if(!normalized.IsSuccess && normalized.Error!.Kind!=ErrorKind.NotFound)
            return Result<ExplorationDto>.Failure(normalized.Error);
        var rates=normalized.Value?.Ranking.ToDictionary(x=>x.Ubigeo) ?? [];
        PopulationRanking? Rate(string code,long? reports)=>rates.TryGetValue(code.PadRight(6,'0'),out var row) && row.Reports==reports ? row : null;
        var ranking=data.Ranking.Select(row=>row with {RatePer100k=Rate(row.Code,row.Reports)?.RatePer100k,Population=Rate(row.Code,row.Reports)?.Population})
            .OrderByDescending(x=>x.RatePer100k).ThenBy(x=>x.Code,StringComparer.Ordinal).ToArray();
        var features=data.Map.Features.Select(feature=>feature with {Properties=feature.Properties with
        {RatePer100k=Rate(feature.Properties.Code,feature.Properties.Reports)?.RatePer100k,Population=Rate(feature.Properties.Code,feature.Properties.Reports)?.Population}}).ToArray();
        return Result<ExplorationDto>.Success(data with {Ranking=ranking,Map=new("FeatureCollection",features),
            Quality=normalized.Value?.Quality,PopulationSource=normalized.Value?.Source});
    }
}
