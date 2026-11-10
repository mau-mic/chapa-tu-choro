namespace ChapaTuChoro.Domain.Incidents;

/// <summary>Future feature: a sourced incident. Never infer exact coordinates from an aggregate report.</summary>
public sealed class Incident
{
    private Incident() { }

    private Incident(Guid id, DateTime occurredAtUtc, string category, string sourceUrl,
        decimal? latitude, decimal? longitude, LocationPrecision locationPrecision)
    {
        Id = id;
        OccurredAtUtc = occurredAtUtc;
        Category = category;
        SourceUrl = sourceUrl;
        Latitude = latitude;
        Longitude = longitude;
        LocationPrecision = locationPrecision;
    }

    public Guid Id { get; private set; }
    public DateTime OccurredAtUtc { get; private set; }
    public string Category { get; private set; } = string.Empty;
    public string SourceUrl { get; private set; } = string.Empty;
    public decimal? Latitude { get; private set; }
    public decimal? Longitude { get; private set; }
    public LocationPrecision LocationPrecision { get; private set; }
    public IncidentReviewStatus Status { get; private set; } = IncidentReviewStatus.PendingReview;

    public static Incident CreateForReview(DateTime occurredAtUtc, string category, string sourceUrl,
        decimal? latitude = null, decimal? longitude = null,
        LocationPrecision precision = LocationPrecision.Unknown)
    {
        if (occurredAtUtc.Kind != DateTimeKind.Utc)
            throw new ArgumentException("Occurrence date must be in UTC.", nameof(occurredAtUtc));
        if (string.IsNullOrWhiteSpace(category))
            throw new ArgumentException("Category is required.", nameof(category));
        if (!Uri.TryCreate(sourceUrl, UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttps)
            throw new ArgumentException("Source must be an HTTPS URL.", nameof(sourceUrl));
        if ((latitude is null) != (longitude is null))
            throw new ArgumentException("Both coordinates must be supplied or neither.");
        if (latitude is < -90 or > 90 || longitude is < -180 or > 180)
            throw new ArgumentOutOfRangeException(nameof(latitude), "Invalid geographic coordinates.");
        if (latitude is null && precision != LocationPrecision.Unknown)
            throw new ArgumentException("Location precision must be Unknown without coordinates.");

        return new Incident(Guid.NewGuid(), occurredAtUtc, category.Trim(), sourceUrl,
            latitude, longitude, precision);
    }
}

public enum LocationPrecision { Unknown, DistrictApproximation, NeighborhoodApproximation, StreetApproximation }
public enum IncidentReviewStatus { PendingReview, Published, Rejected }
