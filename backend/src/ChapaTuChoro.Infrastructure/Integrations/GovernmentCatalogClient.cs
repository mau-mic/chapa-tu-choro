using ChapaTuChoro.Application.Sources;
using Microsoft.Extensions.Options;

namespace ChapaTuChoro.Infrastructure.Integrations;

public sealed class GovernmentCatalogClient(HttpClient httpClient, IOptions<GovernmentCatalogOptions> options)
    : IGovernmentCatalogClient
{
    public async Task<bool> IsCatalogAvailableAsync(CancellationToken ct = default)
    {
        // Availability check only: the public catalog page is HTML, NOT a documented JSON API.
        using var response = await httpClient.GetAsync(
            options.Value.DatasetPath, HttpCompletionOption.ResponseHeadersRead, ct);
        return response.IsSuccessStatusCode;
    }
}
