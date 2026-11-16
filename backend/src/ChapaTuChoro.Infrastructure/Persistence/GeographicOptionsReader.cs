using ChapaTuChoro.Application.Statistics;
using Npgsql;

namespace ChapaTuChoro.Infrastructure.Persistence;

internal static class GeographicOptionsReader
{
    internal static async Task<(IReadOnlyList<DepartmentOptionDto> Departments, IReadOnlyList<ProvinceOptionDto> Provinces,
        IReadOnlyList<DistrictOptionDto> Districts)> ReadAsync(Func<string, NpgsqlCommand> Query, string? department, CancellationToken ct)
    {
        var options = new List<DepartmentOptionDto>();
        await using (var command = Query("""
            SELECT code, (ARRAY_AGG(name ORDER BY priority))[1] AS name FROM (
                SELECT ubigeo AS code, department AS name, 0 AS priority FROM department_boundaries
                UNION ALL
                SELECT LEFT(ubigeo,2), MAX(department), 1 FROM monthly_reports GROUP BY LEFT(ubigeo,2)
            ) candidates GROUP BY code ORDER BY name, code
            """))
        await using (var reader = await command.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) options.Add(new(reader.GetString(0), reader.GetString(1)));

        var provinces = new List<ProvinceOptionDto>();
        if (department is not null)
        {
            // Province identity comes from UBIGEO; names remain imported source labels.
            // Options are independent of period/category so an empty filter does not
            // remove a user's province selection.
            await using var command = Query("""
                SELECT LEFT(ubigeo,4), MAX(province) FROM monthly_reports
                WHERE ubigeo LIKE @department || '%' GROUP BY LEFT(ubigeo,4)
                ORDER BY MAX(province), LEFT(ubigeo,4)
                """);
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct)) provinces.Add(new(reader.GetString(0), reader.GetString(1)));
        }

        var districts = new List<DistrictOptionDto>();
        if (department is not null)
        {
            // Include official geometries without reports and reports without geometry.
            // The selected district must not restrict its own options.
            await using var command = Query("""
                SELECT code, (ARRAY_AGG(name ORDER BY priority))[1] AS name FROM (
                    SELECT ubigeo AS code, district AS name, 0 AS priority FROM district_boundaries
                    UNION ALL
                    SELECT ubigeo, MAX(district), 1 FROM monthly_reports GROUP BY ubigeo
                ) candidates WHERE code LIKE @department || '%'
                    AND (@province IS NULL OR code LIKE @province || '%')
                GROUP BY code ORDER BY name, code
                """);
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct)) districts.Add(new(reader.GetString(0), reader.GetString(1)));
        }

        return (options, provinces, districts);
    }
}
