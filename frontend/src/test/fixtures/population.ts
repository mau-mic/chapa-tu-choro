// Synthetic fixtures only, never bundled as official data.
import type { PopulationHistoryData } from "../../lib/api";
export const populationHistoryFixture: PopulationHistoryData = {
  from: { year: 2024, month: 12 },
  to: { year: 2025, month: 2 },
  level: "department",
  source: {
    sha256: "test-fixture",
    sourceUrl: "https://www.gob.pe/inei",
    importedAt: "2026-01-01T00:00:00Z",
  },
  monthly: [
    {
      period: { year: 2024, month: 12 },
      reports: 10,
      population: 1000,
      ratePer100k: 1000,
      districtsWithReports: 1,
      missingPopulationDistricts: 0,
      missingGeometryDistricts: 0,
    },
    {
      period: { year: 2025, month: 1 },
      reports: null,
      population: 2000,
      ratePer100k: null,
      districtsWithReports: 0,
      missingPopulationDistricts: 0,
      missingGeometryDistricts: 0,
    },
    {
      period: { year: 2025, month: 2 },
      reports: 20,
      population: 2000,
      ratePer100k: 1000,
      districtsWithReports: 1,
      missingPopulationDistricts: 0,
      missingGeometryDistricts: 1,
    },
  ],
  territories: [
    { code: "150000", name: "TEST LIMA" },
    { code: "070000", name: "TEST CALLAO" },
    { code: "010000", name: "TEST AMAZONAS" },
    { code: "020000", name: "TEST ANCASH" },
    { code: "030000", name: "TEST APURIMAC" },
  ],
  series: [],
  ranking: [
    {
      ubigeo: "150000",
      name: "TEST LIMA",
      reports: 20,
      population: 2000,
      ratePer100k: 1000,
    },
  ],
  quality: {
    expectedDistricts: 2,
    districtsWithReports: 1,
    missingPopulationDistricts: 0,
    missingGeometryDistricts: 1,
    populationDistrictsWithoutGeometry: 1,
    monthsWithReports: 2,
    requestedMonths: 3,
    yearsWithoutPopulation: [],
  },
};
