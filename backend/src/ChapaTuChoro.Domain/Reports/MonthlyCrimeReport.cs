namespace ChapaTuChoro.Domain.Reports;

/// <summary>Aggregated registered police reports, NOT a geolocated crime incident.</summary>
public sealed class MonthlyCrimeReport
{
    private MonthlyCrimeReport() { } // EF Core

    public MonthlyCrimeReport(int year, int month, string ubigeo, string department,
        string province, string district, string category, int reports)
    {
        if (year is < 2000 or > 2100 || month is < 1 or > 12)
            throw new ArgumentOutOfRangeException(nameof(month), "Invalid report period.");
        if (ubigeo.Length != 6 || !ubigeo.All(char.IsAsciiDigit))
            throw new ArgumentException("UBIGEO must contain six digits.", nameof(ubigeo));
        if (string.IsNullOrWhiteSpace(category))
            throw new ArgumentException("Category is required.", nameof(category));
        if (reports < 0)
            throw new ArgumentOutOfRangeException(nameof(reports));

        Year = year;
        Month = month;
        Ubigeo = ubigeo;
        Department = department;
        Province = province;
        District = district;
        Category = category;
        Reports = reports;
    }

    public int Year { get; private set; }
    public int Month { get; private set; }
    public string Ubigeo { get; private set; } = string.Empty;
    public string Department { get; private set; } = string.Empty;
    public string Province { get; private set; } = string.Empty;
    public string District { get; private set; } = string.Empty;
    public string Category { get; private set; } = string.Empty;
    public int Reports { get; private set; }
}
