using ChapaTuChoro.Application.Population;
using Microsoft.EntityFrameworkCore;

namespace ChapaTuChoro.Infrastructure.Persistence;

public sealed class PopulationHistoryReadRepository(CrimeWatchDbContext context):IPopulationHistoryReadRepository
{
    public async Task<PopulationHistoryDto?> ReadAsync(PopulationHistoryQuery query,CancellationToken ct)
    {
        var release=await context.PopulationReleases.Where(x=>x.Active)
            .Select(x=>new PopulationRelease(x.Sha256,x.SourceUrl,x.ImportedAt)).SingleOrDefaultAsync(ct);
        if(release is null)return null;
        var prefix=query.Prefix;
        var observations=context.PopulationObservations.Where(x=>x.ReleaseSha256==release.Sha256 && x.Year>=query.FromYear && x.Year<=query.ToYear);
        var areas=await observations.Where(x=>x.Ubigeo.StartsWith(prefix))
            .Select(x=>new PopulationHistoryArea(x.Year,x.Ubigeo,x.Name,x.People,
                context.DistrictBoundaries.Any(d=>d.Ubigeo==x.Ubigeo))).ToListAsync(ct);
        if(!areas.Any(x=>x.Ubigeo==query.ScopeCode))return null;
        var reports=context.MonthlyReports.Where(x=>x.Year>=query.FromYear && x.Year<=query.ToYear &&
            (x.Year>query.FromYear || x.Month>=query.FromMonth) && (x.Year<query.ToYear || x.Month<=query.ToMonth) && x.Ubigeo.StartsWith(prefix));
        if(query.Category is not null)reports=reports.Where(x=>x.Category==query.Category);
        var length=query.ComparisonLevel=="department"?2:query.ComparisonLevel=="province"?4:6;
        var suffix=length==2?"0000":length==4?"00":"";
        var facts=await (from report in reports
            join observation in observations on new {report.Year,report.Ubigeo} equals new {observation.Year,observation.Ubigeo} into joined
            from observation in joined.DefaultIfEmpty()
            join geometry in context.DistrictBoundaries on report.Ubigeo equals geometry.Ubigeo into boundaries
            from geometry in boundaries.DefaultIfEmpty()
            group new {report,observation,geometry} by new {report.Year,report.Month,Code=report.Ubigeo.Substring(0,length)+suffix} into grouped
            select new PopulationHistoryFact(grouped.Key.Year,grouped.Key.Month,grouped.Key.Code,
                grouped.Sum(x=>(long)x.report.Reports),
                grouped.Where(x=>x.observation==null || x.observation.People==null).Select(x=>x.report.Ubigeo).Distinct().Count(),
                grouped.Select(x=>x.report.Ubigeo).Distinct().Count(),
                grouped.Where(x=>x.geometry==null).Select(x=>x.report.Ubigeo).Distinct().Count()))
            .TagWith("Population history: same-year denominator and district quality, server aggregated")
            .ToListAsync(ct);
        return PopulationHistoryProjection.Create(query,release,areas,facts);
    }
}
