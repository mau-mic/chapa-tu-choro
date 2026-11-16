namespace ChapaTuChoro.Domain.Reports;

// Aggregated source classifications, not independently verified unique incidents.
public static class ConcentrationPolicy
{
    public const int GridMetres = 1000;
    public const int MinimumCellRecords = 5;
    public const int MaximumMapCells = 5000;
    public static readonly IReadOnlySet<int> MapGridSizesMetres = new HashSet<int> { 500, 1000, 10000 };
    public static readonly IReadOnlySet<int> QueryRadiiMetres = new HashSet<int> { 500, 1000, 2000 };
    public static readonly IReadOnlyDictionary<string, string> Categories = new Dictionary<string, string>
    {
        ["all"] = "Todos los registros de la fuente",
        ["homicide"] = "Homicidio",
        ["extortion"] = "Extorsión",
        ["theft"] = "Hurto",
        ["robbery"] = "Robo",
        ["fraud"] = "Estafa",
        ["violence"] = "Violencia contra la mujer",
        ["gangs"] = "Pandillaje",
        ["drugs"] = "Microcomercialización de drogas"
    };
    public static bool IsAuthoritative(int year, string category, string source) =>
        year == 2026 && source == "active-2026" || year == 2025 && category != "all" && source == "archive-2025-" + category;
}
