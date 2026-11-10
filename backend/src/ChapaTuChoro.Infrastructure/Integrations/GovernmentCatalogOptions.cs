namespace ChapaTuChoro.Infrastructure.Integrations;

public sealed class GovernmentCatalogOptions
{
    public const string Section = "Integrations:GovernmentCatalog";
    public string BaseUrl { get; set; } = "https://www.datosabiertos.gob.pe/";
    public string DatasetPath { get; set; } = "dataset/denuncias-policiales-registradas-nivel-nacional-mininter";
    public int TimeoutSeconds { get; set; } = 15;
}
