using ChapaTuChoro.Application.Population;
using Microsoft.EntityFrameworkCore;

namespace ChapaTuChoro.Infrastructure.Persistence;

public sealed class PopulationInsightsReadRepository(CrimeWatchDbContext context) : IPopulationInsightsReadRepository
{
    public async Task<PopulationInsightsDto?> ReadAsync(PopulationHistoryQuery query, CancellationToken ct)
    {
        var release = await context.PopulationReleases.Where(x => x.Active)
            .Select(x => new PopulationRelease(x.Sha256, x.SourceUrl, x.ImportedAt)).SingleOrDefaultAsync(ct);
        if (release is null) return null;
        var start = new DateOnly(query.FromYear, query.FromMonth, 1).AddMonths(-PopulationInsightsProjection.LookbackMonths);
        var prefix = query.Prefix;
        var scope = query.ScopeCode;
        var observations = context.PopulationObservations.Where(x => x.ReleaseSha256 == release.Sha256 && x.Year >= start.Year && x.Year <= query.ToYear);
        var areas = await observations.Where(x => x.Ubigeo == scope || x.Ubigeo == "000000")
            .Select(x => new PopulationDenominator(x.Year, x.Ubigeo, x.People)).ToListAsync(ct);
        var reports = context.MonthlyReports.Where(x => x.Year >= start.Year && x.Year <= query.ToYear &&
            (x.Year > start.Year || x.Month >= start.Month) && (x.Year < query.ToYear || x.Month <= query.ToMonth));
        if (query.Category is not null) reports = reports.Where(x => x.Category == query.Category);
        // One national pass with a conditional scope aggregate; no query per month, district or peer.
        var facts = await (from report in reports
            join population in observations on new { report.Year, report.Ubigeo } equals new { population.Year, population.Ubigeo } into joined
            from population in joined.DefaultIfEmpty()
            group new { report, population } by new { report.Year, report.Month } into grouped
            select new PopulationInsightFact(grouped.Key.Year, grouped.Key.Month,
                grouped.Where(x => x.report.Ubigeo.StartsWith(prefix)).Any()
                    ? grouped.Where(x => x.report.Ubigeo.StartsWith(prefix)).Sum(x => (long?)x.report.Reports) : null,
                grouped.Sum(x => (long)x.report.Reports),
                grouped.Where(x => x.report.Ubigeo.StartsWith(prefix) && (x.population == null || x.population.People == null))
                    .Select(x => x.report.Ubigeo).Distinct().Count(),
                grouped.Where(x => x.population == null || x.population.People == null).Select(x => x.report.Ubigeo).Distinct().Count()))
            .TagWith("Population insights: bounded lookback, weighted national and conditional territorial aggregates")
            .ToListAsync(ct);
        if (!areas.Any(x => x.Code == scope) && !facts.Any(x => x.ScopeReports is not null)) return null;
        return PopulationInsightsProjection.Create(query, release, areas, facts);
    }
}
