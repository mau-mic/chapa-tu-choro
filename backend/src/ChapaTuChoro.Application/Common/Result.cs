namespace ChapaTuChoro.Application.Common;

public enum ErrorKind { Validation, NotFound, Conflict, Unauthorized, Forbidden, RateLimited, DependencyUnavailable }

public sealed record AppError(string Code, string Description, ErrorKind Kind)
{
    public static AppError Validation(string code, string description) => new(code, description, ErrorKind.Validation);
    public static AppError NotFound(string code, string description) => new(code, description, ErrorKind.NotFound);
    public static AppError DependencyUnavailable(string code, string description) => new(code, description, ErrorKind.DependencyUnavailable);
}

/// <summary>Explicit expected outcomes; unexpected exceptions are handled at the API boundary.</summary>
public sealed class Result<T>
{
    private Result(T? value, AppError? error)
    {
        Value = value;
        Error = error;
    }

    public bool IsSuccess => Error is null;
    public T? Value { get; }
    public AppError? Error { get; }

    public static Result<T> Success(T value) => new(value, null);
    public static Result<T> Failure(AppError error) => new(default, error);
}
