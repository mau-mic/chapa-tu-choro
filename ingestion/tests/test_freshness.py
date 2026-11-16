"""Synthetic date fixtures only; no official incidents are invented."""
import unittest
from datetime import date, datetime, timezone
from ingestion.freshness import indicator


class FreshnessTests(unittest.TestCase):
    def test_population_uses_projection_reference_not_event_date(self):
        result = indicator('inei-population', 'TEST', date(2026, 6, 30), None, None, date(2026, 11, 13))
        self.assertEqual('projection_reference', result['date_basis'])
        self.assertEqual({'year': 2026, 'month': 6}, result['latest_data_period'])
        self.assertEqual('projected', result['status'])
        future = indicator('inei-population', 'TEST', date(2026, 6, 30), None, None, date(2025, 12, 31))
        self.assertEqual('projected', future['status'])

    def test_old_data_remains_old_when_imported_today(self):
        now = datetime(2026, 11, 13, tzinfo=timezone.utc)
        result = indicator('sidpol-national', 'TEST', date(2026, 9, 1), now, now, now.date())
        self.assertEqual({'year': 2026, 'month': 9}, result['latest_data_period'])
        self.assertEqual(2, result['age_months'])
        self.assertEqual('reporting_period', result['date_basis'])
        self.assertEqual('month', result['date_precision'])

    def test_no_observation_date_is_unknown_even_with_recent_import(self):
        result = indicator('inei-districts', 'TEST', None, datetime.now(timezone.utc), None, date(2026, 11, 13))
        self.assertIsNone(result['latest_data_period'])
        self.assertIsNone(result['age_months'])
        self.assertEqual('unknown', result['status'])

    def test_archives_are_dated_without_invented_overdue_rules(self):
        result = indicator('archive-2025-robbery', 'TEST', date(2025, 9, 1), None, None, date(2026, 11, 13))
        self.assertEqual(14, result['age_months'])
        self.assertEqual('dated', result['status'])
        self.assertEqual('occurrence_month', result['date_basis'])

    def test_future_month_is_invalid_but_current_month_is_supported(self):
        self.assertEqual('invalid_future_period', indicator('active-2026','TEST',date(2026,12,1),None,None,date(2026,11,13))['status'])
        self.assertEqual('dated', indicator('active-2026','TEST',date(2026,11,1),None,None,date(2026,11,13))['status'])
