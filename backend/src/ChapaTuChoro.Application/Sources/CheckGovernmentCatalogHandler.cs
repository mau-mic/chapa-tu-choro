using ChapaTuChoro.Application.Common;

namespace ChapaTuChoro.Application.Sources;

public sealed record CatalogStatusDto(bool Available);

public sealed class CheckGovernmentCatalogHandler(IGovernmentCatalogClient catalog)
{
    public async Task<Result<CatalogStatusDto>> HandleAsync(CancellationToken ct)
    {
        try
        {
            return await catalog.IsCatalogAvailableAsync(ct)
                ? Result<CatalogStatusDto>.Success(new CatalogStatusDto(true))
                : Result<CatalogStatusDto>.Failure(AppError.DependencyUnavailable(
                    "catalog.unavailable", "The official data catalog did not return a successful response."));
        }
        catch (HttpRequestException)
        {
            return Result<CatalogStatusDto>.Failure(AppError.DependencyUnavailable(
                "catalog.unavailable", "The official data catalog could not be reached."));
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return Result<CatalogStatusDto>.Failure(AppError.DependencyUnavailable(
                "catalog.timeout", "The official data catalog timed out."));
        }
    }
}
