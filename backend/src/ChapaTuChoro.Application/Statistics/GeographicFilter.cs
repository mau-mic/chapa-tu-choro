using ChapaTuChoro.Application.Common;

namespace ChapaTuChoro.Application.Statistics;

public static class GeographicFilter
{
    public static AppError? Validate(string? department, string? province, string? district)
    {
        if (department is not null && (department.Length != 2 || department == "00" || !department.All(char.IsAsciiDigit)))
            return AppError.Validation("statistics.invalid_department", "Department must be a two-digit UBIGEO department code.");
        if (province is not null && (department is null || province.Length != 4 ||
                !province.All(char.IsAsciiDigit) || !province.StartsWith(department, StringComparison.Ordinal) || province.EndsWith("00")))
            return AppError.Validation("statistics.invalid_province", "Province must be a four-digit UBIGEO belonging to the selected department.");
        if (district is not null && (department is null || district.Length != 6 ||
                !district.All(char.IsAsciiDigit) || !district.StartsWith(province ?? department, StringComparison.Ordinal) ||
                district.EndsWith("00") || district.Substring(2, 2) == "00"))
            return AppError.Validation("statistics.invalid_district", "District must be a six-digit UBIGEO belonging to the selected department and province.");
        return null;
    }

    public static AppError? ValidateAvailable(string? department, string? province, string? district,
        IReadOnlyList<DepartmentOptionDto> departments, IReadOnlyList<ProvinceOptionDto> provinces,
        IReadOnlyList<DistrictOptionDto> districts)
    {
        if (department is not null && !departments.Any(x => x.Code == department))
            return AppError.NotFound("statistics.department_not_found", "Department is not available in the imported data.");
        if (province is not null && !provinces.Any(x => x.Code == province))
            return AppError.NotFound("statistics.province_not_found", "Province is not available in the imported data for this department.");
        if (district is not null && !districts.Any(x => x.Code == district))
            return AppError.NotFound("statistics.district_not_found", "District is not available in the imported data for this area.");
        return null;
    }
}
