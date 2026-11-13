using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Statistics;

namespace ChapaTuChoro.Application.Population;

/// <summary>At most 120 monthly observations, with up to four peer territories. Level is internal to the rate-map use case.</summary>
public sealed record PopulationHistoryQuery(int FromYear,int FromMonth,int ToYear,int ToMonth,
    string? Category,string? Department,string? Province,string? District,string? Compare,string? Level=null)
{
    public string Prefix => District ?? Province ?? Department ?? "";
    public string ComparisonLevel => Level ?? (District is not null || Province is not null ? "district" : Department is not null ? "province" : "department");
    public string ScopeCode => District ?? (Province is not null ? Province+"00" : Department is not null ? Department+"0000" : "000000");
    public string[]? ComparedCodes => Compare?.Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries);
}
/// <summary>Immutable denominator observation, including geometry availability by UBIGEO.</summary>
public sealed record PopulationHistoryArea(int Year,string Ubigeo,string Name,long? People,bool HasGeometry);
/// <summary>Server-side period/territory aggregate and district-level quality counts.</summary>
public sealed record PopulationHistoryFact(int Year,int Month,string Ubigeo,long Reports,int MissingPopulationDistricts,int DistrictsWithReports,int MissingGeometryDistricts);
/// <summary>One monthly rate with that year's denominator and observed coverage.</summary>
public sealed record PopulationHistoryPoint(PeriodDto Period,long? Reports,long? Population,decimal? RatePer100k,
    int DistrictsWithReports,int MissingPopulationDistricts,int MissingGeometryDistricts);
/// <summary>A selectable peer territory; not a risk classification.</summary>
public sealed record PopulationTerritory(string Code,string Name);
/// <summary>Aligned monthly series for a selected territory.</summary>
public sealed record PopulationTerritorySeries(string Code,string Name,IReadOnlyList<PopulationHistoryPoint> Points);
/// <summary>Observed coverage of the closing month, not certified reporting completeness.</summary>
public sealed record PopulationHistoryQuality(int ExpectedDistricts,int DistrictsWithReports,int MissingPopulationDistricts,
    int MissingGeometryDistricts,int PopulationDistrictsWithoutGeometry,int MonthsWithReports,int RequestedMonths,IReadOnlyList<int> YearsWithoutPopulation);
/// <summary>Historical rates, peer comparison, ranking and source/quality metadata.</summary>
public sealed record PopulationHistoryDto(PeriodDto From,PeriodDto To,string Level,PopulationRelease Source,
    IReadOnlyList<PopulationHistoryPoint> Monthly,IReadOnlyList<PopulationTerritory> Territories,
    IReadOnlyList<PopulationTerritorySeries> Series,IReadOnlyList<PopulationRanking> Ranking,PopulationHistoryQuality Quality);

public static class PopulationRates
{
    public static decimal? Calculate(long? count,long? population,int missing) =>
        count is not null && population is > 0 && missing==0 ? decimal.Round(count.Value*100000m/population.Value,2) : null;
}

public static class PopulationHistoryProjection
{
    public static PopulationHistoryDto Create(PopulationHistoryQuery query,PopulationRelease source,
        IReadOnlyList<PopulationHistoryArea> areas,IReadOnlyList<PopulationHistoryFact> facts)
    {
        var from=new DateOnly(query.FromYear,query.FromMonth,1);
        var to=new DateOnly(query.ToYear,query.ToMonth,1);
        var months=(to.Year-from.Year)*12+to.Month-from.Month+1;
        var populations=areas.ToDictionary(x=>(x.Year,x.Ubigeo));
        var periods=Enumerable.Range(0,months).Select(offset=>from.AddMonths(offset)).ToArray();
        PopulationHistoryPoint Point(DateOnly date,string code,PopulationHistoryFact[] rows)
        {
            long? reports=rows.Length==0 ? null : rows.Sum(x=>x.Reports);
            var population=populations.GetValueOrDefault((date.Year,code))?.People;
            var missing=rows.Sum(x=>x.MissingPopulationDistricts);
            return new(new(date.Year,date.Month),reports,population,PopulationRates.Calculate(reports,population,missing),
                rows.Sum(x=>x.DistrictsWithReports),missing,rows.Sum(x=>x.MissingGeometryDistricts));
        }
        var byPeriod=facts.GroupBy(x=>(x.Year,x.Month)).ToDictionary(x=>x.Key,x=>x.ToArray());
        var monthly=periods.Select(date=>Point(date,query.ScopeCode,byPeriod.GetValueOrDefault((date.Year,date.Month)) ?? [])).ToArray();
        bool Peer(string code)=>query.District is not null ? code==query.District : query.ComparisonLevel switch
        {
            "department"=>code!="000000" && code.EndsWith("0000",StringComparison.Ordinal),
            "province"=>code.EndsWith("00",StringComparison.Ordinal) && !code.EndsWith("0000",StringComparison.Ordinal),
            _=>!code.EndsWith("00",StringComparison.Ordinal)
        };
        var names=areas.OrderBy(x=>x.Year).GroupBy(x=>x.Ubigeo).ToDictionary(x=>x.Key,x=>x.Last().Name);
        var options=areas.Select(x=>x.Ubigeo).Concat(facts.Select(x=>x.Ubigeo)).Distinct()
            .Where(Peer).Select(code=>new PopulationTerritory(code,names.GetValueOrDefault(code) ?? code))
            .OrderBy(x=>x.Name,StringComparer.Ordinal).ThenBy(x=>x.Code,StringComparer.Ordinal).ToArray();
        var current=facts.Where(x=>x.Year==to.Year && x.Month==to.Month).ToArray();
        var ranking=current.Select(row=>
        {
            var pop=populations.GetValueOrDefault((to.Year,row.Ubigeo))?.People;
            return new PopulationRanking(row.Ubigeo,names.GetValueOrDefault(row.Ubigeo) ?? row.Ubigeo,row.Reports,pop,
                PopulationRates.Calculate(row.Reports,pop,row.MissingPopulationDistricts));
        }).OrderByDescending(x=>x.RatePer100k).ThenBy(x=>x.Ubigeo,StringComparer.Ordinal).ToArray();
        var compared=query.ComparedCodes ?? current.OrderByDescending(x=>x.Reports).ThenBy(x=>x.Ubigeo,StringComparer.Ordinal).Take(3).Select(x=>x.Ubigeo).ToArray();
        var peerPeriods=facts.ToDictionary(x=>(x.Ubigeo,x.Year,x.Month));
        var series=compared.Select(code=>new PopulationTerritorySeries(code,names.GetValueOrDefault(code) ?? code,
            periods.Select(date=>Point(date,code,peerPeriods.TryGetValue((code,date.Year,date.Month),out var fact) ? [fact] : [])).ToArray())).ToArray();
        var districtPopulation=areas.Where(x=>x.Year==to.Year && !x.Ubigeo.EndsWith("00",StringComparison.Ordinal) && x.People>0).ToArray();
        var closing=monthly[^1];
        var quality=new PopulationHistoryQuality(districtPopulation.Length,closing.DistrictsWithReports,closing.MissingPopulationDistricts,
            closing.MissingGeometryDistricts,districtPopulation.Count(x=>!x.HasGeometry),monthly.Count(x=>x.Reports is not null),months,
            periods.Select(x=>x.Year).Distinct().Where(year=>populations.GetValueOrDefault((year,query.ScopeCode))?.People is null).ToArray());
        return new(new(from.Year,from.Month),new(to.Year,to.Month),query.ComparisonLevel,source,monthly,options,series,ranking,quality);
    }
}

public interface IPopulationHistoryReadRepository
{
    Task<PopulationHistoryDto?> ReadAsync(PopulationHistoryQuery query,CancellationToken ct);
}

public sealed class GetPopulationHistoryHandler(IPopulationHistoryReadRepository repository)
{
    public async Task<Result<PopulationHistoryDto>> HandleAsync(PopulationHistoryQuery query,CancellationToken ct)
    {
        var error=Validate(query);
        if(error is not null)return Result<PopulationHistoryDto>.Failure(error);
        using var budget=CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(15));
        PopulationHistoryDto? data;
        try { data=await repository.ReadAsync(query with {Category=string.IsNullOrWhiteSpace(query.Category)?null:query.Category.Trim()},budget.Token); }
        catch(OperationCanceledException) when(!ct.IsCancellationRequested && budget.IsCancellationRequested)
        { return Result<PopulationHistoryDto>.Failure(AppError.DependencyUnavailable("population.timeout","La consulta tardó demasiado. Vuelve a intentarlo.")); }
        if(data is null)return Result<PopulationHistoryDto>.Failure(AppError.NotFound("population.unavailable","No hay proyecciones importadas para este período y territorio."));
        if(query.ComparedCodes?.Any(code=>!data.Territories.Any(x=>x.Code==code))==true)
            return Result<PopulationHistoryDto>.Failure(AppError.NotFound("population.territory_unavailable","Un territorio seleccionado no está disponible en esta consulta."));
        return Result<PopulationHistoryDto>.Success(data);
    }

    public static AppError? Validate(PopulationHistoryQuery query)
    {
        var error=StatisticsFilterValidator.Validate(new(query.FromYear,query.FromMonth,query.Category))
            ?? StatisticsFilterValidator.Validate(new(query.ToYear,query.ToMonth,query.Category))
            ?? GeographicFilter.Validate(query.Department,query.Province,query.District);
        if(error is not null)return error;
        var months=(query.ToYear-query.FromYear)*12+query.ToMonth-query.FromMonth+1;
        if(months is <1 or >120)return AppError.Validation("population.invalid_range","Elige un rango ordenado de hasta 120 meses.");
        if(query.Compare?.Length>27)return AppError.Validation("population.invalid_comparison","Selecciona hasta cuatro territorios.");
        var codes=query.ComparedCodes;
        if(codes is not null && (codes.Length>4 || codes.Distinct().Count()!=codes.Length || codes.Any(code=>
            code.Length!=6 || !code.All(char.IsAsciiDigit) || !code.StartsWith(query.Prefix,StringComparison.Ordinal) ||
            (query.District is not null ? code!=query.District : query.ComparisonLevel=="department" ? code=="000000" || !code.EndsWith("0000",StringComparison.Ordinal)
             : query.ComparisonLevel=="province" ? !code.EndsWith("00",StringComparison.Ordinal) || code.EndsWith("0000",StringComparison.Ordinal) : code.EndsWith("00",StringComparison.Ordinal)))))
            return AppError.Validation("population.invalid_comparison","Selecciona hasta cuatro territorios distintos del nivel y ámbito elegidos.");
        return null;
    }
}
