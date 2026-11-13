import type { PopulationQuality } from "../../lib/api";

export function DataQuality({ quality }: { quality: PopulationQuality }) {
  return (
    <section className="data-quality" aria-labelledby="data-quality-heading">
      <h2 id="data-quality-heading">Calidad y cobertura observada</h2>
      <dl className="quality-grid">
        <div>
          <dt>Distritos con registros en el mes final</dt>
          <dd>
            {quality.districtsWithReports} / {quality.expectedDistricts} con
            población disponible
          </dd>
        </div>
        <div>
          <dt>Distritos con registros sin población compatible</dt>
          <dd>{quality.missingPopulationDistricts}</dd>
        </div>
        <div>
          <dt>Distritos con registros sin geometría</dt>
          <dd>{quality.missingGeometryDistricts}</dd>
        </div>
        <div>
          <dt>Meses con registros en el rango</dt>
          <dd>
            {quality.monthsWithReports} / {quality.requestedMonths}
          </dd>
        </div>
      </dl>
      {quality.missingPopulationDistricts > 0 && (
        <p role="status">
          La tasa del mes final se omite porque hay registros sin denominador
          compatible. Los conteos se conservan.
        </p>
      )}
      {quality.yearsWithoutPopulation.length > 0 && (
        <p role="status">
          Sin población compatible para estos años:{" "}
          {quality.yearsWithoutPopulation.join(", ")}. Sus tasas quedan como no
          disponibles.
        </p>
      )}
      <p>
        {quality.populationDistrictsWithoutGeometry} distritos de población sin
        geometría en el año final. La ausencia de geometría no elimina sus
        conteos ni su población.
      </p>
      <p>
        Los distritos y meses con registros dependen de los filtros elegidos.
        Esta cobertura observada no certifica completitud: un distrito sin
        registros no implica cero hechos. El denominador es una proyección
        preliminar, no el resultado definitivo del Censo 2025.
      </p>
    </section>
  );
}
