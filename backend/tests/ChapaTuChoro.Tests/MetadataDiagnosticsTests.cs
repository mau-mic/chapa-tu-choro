using ChapaTuChoro.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class MetadataDiagnosticsTests
{
    [PostgisFact]
    public async Task MeasuresCompletedStagesAndIdentifiesFailedStageWithoutLoggingSourceDetails()
    {
        var schema = "ctc_metadata_" + Guid.NewGuid().ToString("N");
        var connectionString = Environment.GetEnvironmentVariable("CTC_TEST_CONNECTIONSTRING")!;
        await using var admin = new NpgsqlConnection(connectionString);
        await admin.OpenAsync();
        await new NpgsqlCommand($"CREATE SCHEMA {schema}", admin).ExecuteNonQueryAsync();
        try
        {
            // An opened connection hides its password; retain the original test configuration.
            var cs = new NpgsqlConnectionStringBuilder(connectionString) { SearchPath = schema };
            await using var source = new NpgsqlDataSourceBuilder(cs.ConnectionString).UseNetTopologySuite().Build();
            await using (var connection = await source.OpenConnectionAsync())
                await new NpgsqlCommand("""
                    CREATE TABLE monthly_reports (year smallint, month smallint);
                    INSERT INTO monthly_reports VALUES (2024,1),(2024,2),(2024,2);
                    CREATE TABLE import_runs (id int, source_kind text, source_name text, sha256 text, imported_at timestamptz);
                    INSERT INTO import_runs VALUES (1,'sidpol','PRIVATE_SOURCE_SENTINEL','PRIVATE_HASH_SENTINEL',now());
                    """, connection).ExecuteNonQueryAsync();
            await using var context = new CrimeWatchDbContext(new DbContextOptionsBuilder<CrimeWatchDbContext>()
                .UseNpgsql(source, p => p.UseNetTopologySuite()).Options);
            var logger = new CaptureLogger();
            var repository = new StatisticsReadRepository(context, source, logger);
            var result = await repository.GetMetadataAsync(default);
            Assert.Equal(3, result.TotalRows);
            Assert.Equal(2, result.AvailablePeriods.Count);
            Assert.Single(result.Imports);
            foreach (var stage in new[] { "periods.read", "reports.count", "imports.acquire_connection", "imports.execute", "imports.read" })
            {
                Assert.Contains(logger.Messages, m => m.Contains($"stage {stage} started"));
                Assert.Contains(logger.Messages, m => m.Contains($"stage {stage} completed"));
            }
            Assert.Contains(logger.Messages, m => m.StartsWith("Metadata operation completed"));
            Assert.DoesNotContain(logger.Messages, m => m.Contains("PRIVATE_") || m.Contains("Password="));
            Assert.All(logger.OperationIds, id => Assert.Equal(logger.OperationIds[0], id));

            logger.Messages.Clear();
            await new NpgsqlCommand($"DROP TABLE {schema}.import_runs", admin).ExecuteNonQueryAsync();
            var error = await Assert.ThrowsAsync<PostgresException>(() => repository.GetMetadataAsync(default));
            Assert.Equal(PostgresErrorCodes.UndefinedTable, error.SqlState);
            Assert.Contains(logger.Messages, m => m.Contains("stage imports.execute failed"));
            Assert.DoesNotContain(logger.Messages, m => m.StartsWith("Metadata operation completed") || m.Contains("does not exist"));
        }
        finally
        {
            await new NpgsqlCommand($"DROP SCHEMA {schema} CASCADE", admin).ExecuteNonQueryAsync();
        }
    }

    private sealed class CaptureLogger : ILogger<StatisticsReadRepository>
    {
        public List<string> Messages { get; } = [];
        public List<string> OperationIds { get; } = [];
        private string? operation;
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull
        {
            operation = ((IEnumerable<KeyValuePair<string, object>>)state).Single(x => x.Key == "MetadataOperationId").Value.ToString();
            return null;
        }
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel level, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Messages.Add(formatter(state, exception));
            OperationIds.Add(operation!);
        }
    }
}
