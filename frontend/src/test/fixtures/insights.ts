// Explicitly synthetic analytic values, used only in isolated automated tests.
import type {
  PopulationAverage,
  PopulationInsightValues,
  PopulationInsightsData,
} from "../../lib/api";
import { populationHistoryFixture } from "./population";
const average = (
  reports: number | null,
  rate: number | null,
  required: number,
): PopulationAverage => ({
  reports,
  ratePer100k: rate,
  reportObservations: required,
  rateObservations: required,
  requiredObservations: required,
});
export function insightValues(
  reports: number | null,
  population: number,
  rate: number | null,
): PopulationInsightValues {
  return {
    reports,
    population,
    ratePer100k: rate,
    rolling3: average(
      reports === null ? null : 11,
      rate === null ? null : 1100,
      3,
    ),
    rolling12: average(
      reports === null ? null : 12,
      rate === null ? null : 1200,
      12,
    ),
    historicalBaseline: average(20, 2000, 36),
    seasonalBaseline: average(15, 1500, 3),
    historicalChange: {
      reportsPercent: reports === null ? null : 0,
      ratePercent: rate === null ? null : -50,
    },
    seasonalChange: {
      reportsPercent: reports === null ? null : 33.33,
      ratePercent: rate === null ? null : -33.33,
    },
  };
}
export const populationInsightsFixture: PopulationInsightsData = {
  from: populationHistoryFixture.from,
  to: populationHistoryFixture.to,
  scopeCode: "150000",
  source: populationHistoryFixture.source,
  lookbackMonths: 36,
  monthly: populationHistoryFixture.monthly.map((p) => ({
    period: p.period,
    scope: insightValues(p.reports, p.population!, p.ratePer100k),
    national: insightValues(40, 5000, 800),
    nationalDifferencePer100k:
      p.ratePer100k === null ? null : p.ratePer100k - 800,
    nationalDifferencePercent: p.ratePer100k === null ? null : 25,
  })),
};
