using ChapaTuChoro.Application.Common;
using Microsoft.AspNetCore.Mvc;

namespace ChapaTuChoro.Api.Http;

public static class ResultHttpMapper
{
    public static int ToStatusCode(ErrorKind kind) => kind switch
    {
        ErrorKind.Validation => StatusCodes.Status400BadRequest,
        ErrorKind.Unauthorized => StatusCodes.Status401Unauthorized,
        ErrorKind.Forbidden => StatusCodes.Status403Forbidden,
        ErrorKind.NotFound => StatusCodes.Status404NotFound,
        ErrorKind.Conflict => StatusCodes.Status409Conflict,
        ErrorKind.RateLimited => StatusCodes.Status429TooManyRequests,
        ErrorKind.DependencyUnavailable => StatusCodes.Status503ServiceUnavailable,
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Unhandled expected error kind.")
    };

    public static IResult ToHttpResult<T>(this Result<T> result)
    {
        if (result.IsSuccess) return Results.Ok(result.Value);
        var error = result.Error!;
        var details = new ProblemDetails
        {
            Status = ToStatusCode(error.Kind),
            Title = error.Code,
            Detail = error.Description
        };
        return Results.Problem(details);
    }
}
