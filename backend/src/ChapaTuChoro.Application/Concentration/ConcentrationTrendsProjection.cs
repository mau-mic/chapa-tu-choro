using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Domain.Reports;

namespace ChapaTuChoro.Application.Concentration;

/// <summary>Source-classification aggregates read from one independently selected publication.</summary>
public sealed record ConcentrationTrendRow(int Month, string Category, string Code, long Count);

/// <summary>Projects geographic source aggregates independently of persistence and SIDPOL counts.</summary>
public static class ConcentrationTrendsProjection
{
    private const string Other = "Otras modalidades de la fuente";

    public static ConcentrationTrendsSnapshot Project(
        TrendsQuery query,
        IReadOnlyList<ConcentrationOption> available,
        IReadOnlyList<int> months,
        IReadOnlyList<ConcentrationTrendRow> rows,
        IReadOnlyList<DepartmentOptionDto> departmentOptions,
        IReadOnlyList<ProvinceOptionDto> provinceOptions,
        IReadOnlyDictionary<string, string> places)
    {
        var departments = departmentOptions.Concat(places.Keys.Select(code => code[..2]).Distinct()
            .Where(code => !departmentOptions.Any(option => option.Code == code))
            .Select(code => new DepartmentOptionDto(code, code))).OrderBy(option => option.Name).ToArray();
        var provinces = query.Department is null ? [] : provinceOptions.Concat(places.Keys
            .Where(code => code.StartsWith(query.Department, StringComparison.Ordinal)).Select(code => code[..4]).Distinct()
            .Where(code => !provinceOptions.Any(option => option.Code == code))
            .Select(code => new ProvinceOptionDto(code, code))).OrderBy(option => option.Name).ToArray();
        var districts = query.Department is null ? [] : places
            .Where(place => place.Key.StartsWith(query.Province ?? query.Department, StringComparison.Ordinal))
            .Select(place => new DistrictOptionDto(place.Key, place.Value)).OrderBy(option => option.Name).ToArray();

        // Only imported months have observations. An imported empty month is zero;
        // a missing import remains absent so the trends use case can represent it as null.
        var totals = rows.Where(row => row.Category == query.Category).ToArray();
        var observations = months.Select(month => new MonthlyTrendDto(new(query.FromYear, month),
            totals.Where(row => row.Month == month).Sum(row => row.Count))).ToArray();
        var categoryObservations = new List<CategoryObservationDto>();
        foreach (var month in months.Where(month => month >= query.FromMonth))
        {
            var period = new PeriodDto(query.FromYear, month);
            var current = rows.Where(row => row.Month == month).ToArray();
            if (query.Category != "all")
            {
                categoryObservations.Add(new(period, ConcentrationPolicy.Categories[query.Category!], current.Sum(row => row.Count)));
                continue;
            }

            foreach (var category in ConcentrationPolicy.Categories.Where(category => category.Key != "all"))
            {
                categoryObservations.Add(new(period, category.Value,
                    current.Where(row => row.Category == category.Key).Sum(row => row.Count)));
            }
            var total = current.Where(row => row.Category == "all").Sum(row => row.Count);
            var classified = current.Where(row => row.Category != "all" && ConcentrationPolicy.Categories.ContainsKey(row.Category))
                .Sum(row => row.Count);
            var residual = total - classified;
            if (residual < 0)
            {
                throw new InvalidOperationException("Concentration category aggregates exceed authoritative total.");
            }
            categoryObservations.Add(new(period, Other, residual));
        }

        var categories = categoryObservations.GroupBy(observation => observation.Category)
            .Select(group => new CategoryTotalDto(group.Key, group.Sum(observation => observation.Reports)))
            .Where(category => category.Reports > 0 || query.Category != "all")
            .OrderByDescending(category => category.Reports).ThenBy(category => category.Category).ToArray();
        string TerritoryName(string code) => query.Department is null
            ? departments.FirstOrDefault(option => option.Code == code)?.Name ?? code
            : query.Province is null && query.District is null
                ? provinces.FirstOrDefault(option => option.Code == code)?.Name ?? code
                : districts.FirstOrDefault(option => option.Code == code)?.Name ?? code;
        var territories = totals.Where(row => row.Month >= query.FromMonth).GroupBy(row => row.Code)
            .Select(group => new AreaStatisticDto(group.Key, TerritoryName(group.Key), group.Sum(row => row.Count)))
            .OrderByDescending(area => area.Reports).ThenBy(area => area.Code).ToArray();
        return new(new(observations, categories, territories, departments, provinces, districts, categoryObservations), available);
    }
}
