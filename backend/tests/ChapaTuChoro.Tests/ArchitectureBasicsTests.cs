using ChapaTuChoro.Api.Http;
using ChapaTuChoro.Application.Common;
using ChapaTuChoro.Application.Statistics;
using ChapaTuChoro.Domain.Incidents;
using ChapaTuChoro.Domain.Reports;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace ChapaTuChoro.Tests;

public sealed class ArchitectureBasicsTests
{
    [Fact]
    public void InvalidMonthMapsToBadRequest()
    {
        var error = StatisticsFilterValidator.Validate(new StatisticsFilter(2026, 13, null));
        Assert.NotNull(error);
        Assert.Equal(ErrorKind.Validation, error.Kind);
        Assert.Equal(StatusCodes.Status400BadRequest, ResultHttpMapper.ToStatusCode(error.Kind));
    }

    [Fact]
    public void DependencyUnavailableMapsTo503() =>
        Assert.Equal(503, ResultHttpMapper.ToStatusCode(ErrorKind.DependencyUnavailable));

    [Fact]
    public void MonthlyReportRejectsInvalidUbigeo() =>
        Assert.Throws<ArgumentException>(() =>
            new MonthlyCrimeReport(2026, 9, "15-010", "LIMA", "LIMA", "LIMA", "ROBO", 3));

    [Fact]
    public void IncidentCannotFakePrecisionWithoutCoordinates() =>
        Assert.Throws<ArgumentException>(() => Incident.CreateForReview(
            DateTime.UtcNow, "ROBO", "https://example.org/news", precision: LocationPrecision.StreetApproximation));
}

public sealed class LayerReferenceTests
{
    [Theory]
    [InlineData("Domain", new string[] { })]
    [InlineData("Application", new[] { "Domain" })]
    [InlineData("Infrastructure", new[] { "Application" })]
    [InlineData("Api", new[] { "Application", "Infrastructure" })]
    public void ProjectReferencesRespectLayerBoundaries(string layer, string[] allowed)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "backend", "ChapaTuChoro.slnx")))
            directory = directory.Parent;
        Assert.NotNull(directory);
        var path = Path.Combine(directory.FullName, "backend", "src", $"ChapaTuChoro.{layer}", $"ChapaTuChoro.{layer}.csproj");
        var project = System.Xml.Linq.XDocument.Load(path);
        var references = project.Descendants("ProjectReference")
            .Select(reference => Path.GetFileNameWithoutExtension((string)reference.Attribute("Include")!).Replace("ChapaTuChoro.", ""))
            .Order().ToArray();
        Assert.Equal(allowed.Order(), references);
    }

    [Theory]
    [InlineData(typeof(MonthlyCrimeReport), new string[] { })]
    [InlineData(typeof(GetTrendsHandler), new[] { "ChapaTuChoro.Domain" })]
    public void InnerAssembliesCannotReferenceOuterLayers(Type representative, string[] allowed)
    {
        var references = representative.Assembly.GetReferencedAssemblies().Select(reference => reference.Name!)
            .Where(name => name.StartsWith("ChapaTuChoro.", StringComparison.Ordinal));
        Assert.All(references, name => Assert.Contains(name, allowed));
    }
}
