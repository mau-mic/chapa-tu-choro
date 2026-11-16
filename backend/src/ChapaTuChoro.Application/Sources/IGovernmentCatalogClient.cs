namespace ChapaTuChoro.Application.Sources;

/// <summary>Optional HTTP integration; not part of the authoritative statistics ingestion pipeline yet.</summary>
public interface IGovernmentCatalogClient
{
    Task<bool> IsCatalogAvailableAsync(CancellationToken ct = default);
}
