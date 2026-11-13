using ChapaTuChoro.Application.Population;
using Microsoft.EntityFrameworkCore;

namespace ChapaTuChoro.Infrastructure.Persistence;

public sealed class PopulationReadRepository(CrimeWatchDbContext context) : IPopulationReadRepository
{
    public async Task<PopulationComparison?> ReadAsync(PopulationQuery query, CancellationToken ct)
    {
        // Pin a release identity. Old releases remain immutable, so a concurrent import
        // cannot mix denominator versions between these sequential, bounded queries.
        var release = await context.PopulationReleases.Where(x => x.Active)
            .Select(x => new PopulationRelease(x.Sha256, x.SourceUrl, x.ImportedAt)).SingleOrDefaultAsync(ct);
        if (release is null) return null;
        var prefix = query.District ?? query.Province ?? query.Department ?? "";
        var areas = await context.PopulationObservations
            .Where(x => x.ReleaseSha256 == release.Sha256 && x.Year == query.Year && x.Ubigeo.StartsWith(prefix))
            .Select(x => new PopulationArea(x.Ubigeo, x.Name, x.People)).ToListAsync(ct);
        if (!areas.Any(x => x.Ubigeo == PopulationComparison.ScopeCode(query))) return null;
        var reports = context.MonthlyReports.Where(x => x.Year == query.Year && x.Ubigeo.StartsWith(prefix));
        if (query.Category is not null) reports = reports.Where(x => x.Category == query.Category);
        var population = context.PopulationObservations.Where(x => x.ReleaseSha256 == release.Sha256 && x.Year == query.Year);
        var codeLength = query.District is not null || query.Province is not null ? 6 : query.Department is not null ? 4 : 2;
        var suffix = codeLength == 2 ? "0000" : codeLength == 4 ? "00" : "";
        var aggregated = await (
            from report in reports
            join observation in population on report.Ubigeo equals observation.Ubigeo into joined
            from observation in joined.DefaultIfEmpty()
            group new { report, observation } by new { report.Month, Code = report.Ubigeo.Substring(0, codeLength) + suffix } into grouped
            select new PopulationReports(grouped.Key.Month, grouped.Key.Code,
                grouped.Sum(x => (long)x.report.Reports),
                grouped.Sum(x => x.observation == null || x.observation.People == null ? 1 : 0)))
            .TagWith("Population comparison: annual reports aggregated before materialization")
            .ToListAsync(ct);
        return PopulationComparison.Create(query, release, areas, aggregated);
    }
}

internal sealed class PopulationReleaseRecord
{
    public string Sha256 { get; set; } = "";
    public string SourceUrl { get; set; } = "";
    public DateTimeOffset ImportedAt { get; set; }
    public bool Active { get; set; }
}

internal sealed class PopulationObservationRecord
{
    public string ReleaseSha256 { get; set; } = "";
    public int Year { get; set; }
    public string Ubigeo { get; set; } = "";
    public string Name { get; set; } = "";
    public long? People { get; set; }
}
