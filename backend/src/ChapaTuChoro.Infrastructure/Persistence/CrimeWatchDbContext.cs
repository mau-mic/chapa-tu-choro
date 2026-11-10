using ChapaTuChoro.Domain.Reports;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;

namespace ChapaTuChoro.Infrastructure.Persistence;

public sealed class CrimeWatchDbContext(DbContextOptions<CrimeWatchDbContext> options) : DbContext(options)
{
    public DbSet<MonthlyCrimeReport> MonthlyReports => Set<MonthlyCrimeReport>();
    internal DbSet<DistrictBoundaryRecord> DistrictBoundaries => Set<DistrictBoundaryRecord>();
    internal DbSet<PopulationReleaseRecord> PopulationReleases => Set<PopulationReleaseRecord>();
    internal DbSet<PopulationObservationRecord> PopulationObservations => Set<PopulationObservationRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("postgis");
        modelBuilder.Entity<PopulationReleaseRecord>(entity =>
        {
            entity.ToTable("population_releases");
            entity.HasKey(x => x.Sha256);
            entity.Property(x => x.Sha256).HasColumnName("sha256");
            entity.Property(x => x.SourceUrl).HasColumnName("source_url");
            entity.Property(x => x.ImportedAt).HasColumnName("imported_at");
            entity.Property(x => x.Active).HasColumnName("active");
        });
        modelBuilder.Entity<PopulationObservationRecord>(entity =>
        {
            entity.ToTable("population_observations");
            entity.HasKey(x => new { x.ReleaseSha256, x.Year, x.Ubigeo });
            entity.Property(x => x.ReleaseSha256).HasColumnName("release_sha256");
            entity.Property(x => x.Year).HasColumnName("year").HasColumnType("smallint");
            entity.Property(x => x.Ubigeo).HasColumnName("ubigeo").HasMaxLength(6);
            entity.Property(x => x.Name).HasColumnName("name");
            entity.Property(x => x.People).HasColumnName("people");
        });

        modelBuilder.Entity<MonthlyCrimeReport>(entity =>
        {
            entity.ToTable("monthly_reports");
            entity.HasKey(x => new { x.Year, x.Month, x.Ubigeo, x.Category });
            entity.Property(x => x.Year).HasColumnName("year");
            entity.Property(x => x.Month).HasColumnName("month");
            entity.Property(x => x.Ubigeo).HasColumnName("ubigeo").HasMaxLength(6);
            entity.Property(x => x.Department).HasColumnName("department");
            entity.Property(x => x.Province).HasColumnName("province");
            entity.Property(x => x.District).HasColumnName("district");
            entity.Property(x => x.Category).HasColumnName("category");
            entity.Property(x => x.Reports).HasColumnName("reports");
        });

        modelBuilder.Entity<DistrictBoundaryRecord>(entity =>
        {
            entity.ToTable("district_boundaries");
            entity.HasKey(x => x.Ubigeo);
            entity.Property(x => x.Ubigeo).HasColumnName("ubigeo");
            entity.Property(x => x.District).HasColumnName("district");
            entity.Property(x => x.Geometry).HasColumnName("geom").HasColumnType("geometry(MultiPolygon,4326)");
        });
    }
}

internal sealed class DistrictBoundaryRecord
{
    public string Ubigeo { get; set; } = string.Empty;
    public string District { get; set; } = string.Empty;
    public MultiPolygon Geometry { get; set; } = null!;
}
