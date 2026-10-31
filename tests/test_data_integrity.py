import json
import os
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pandas as pd
import pytest

from src.analytics.features import (
    calculate_file_sha256,
    write_dataset_manifest,
    check_dataset_manifest,
    load_raw_datasets,
    generate_mock_raw_datasets,
)


def test_manifest_generation_and_validation(tmp_path):
    csv_file = tmp_path / "fact_harga_pasar.csv"
    csv_file.write_text("tanggal,harga\n2026-10-31,10000\n", encoding="utf-8")
    manifest_file = tmp_path / ".manifest.json"

    import src.analytics.features as feat
    orig_dp = feat.DATA_PROCESSED
    try:
        feat.DATA_PROCESSED = tmp_path
        write_dataset_manifest(manifest_path=manifest_file)

        assert manifest_file.exists()
        with open(manifest_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert "last_synced_at" in data
        assert "fact_harga_pasar.csv" in data["files"]
        assert data["files"]["fact_harga_pasar.csv"]["row_count"] == 1
        assert len(data["files"]["fact_harga_pasar.csv"]["sha256"]) == 64

        # Test validation on fresh cache (no warning)
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            manifest = check_dataset_manifest(manifest_path=manifest_file)
            assert manifest is not None
            assert not any("usang" in str(item.message) for item in w)

        # Test validation on stale cache (>24 hours)
        stale_time = (datetime.now(timezone.utc) - timedelta(hours=36)).isoformat()
        data["last_synced_at"] = stale_time
        with open(manifest_file, "w", encoding="utf-8") as f:
            json.dump(data, f)

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            check_dataset_manifest(manifest_path=manifest_file)
            assert any("usang" in str(item.message) for item in w)

        # Test validation when manifest is missing
        manifest_file.unlink()
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            check_dataset_manifest(manifest_path=manifest_file)
            assert any("tidak ditemukan" in str(item.message) for item in w)
    finally:
        feat.DATA_PROCESSED = orig_dp


def test_fail_closed_without_mock_flag(monkeypatch, tmp_path):
    """When DB fails and CSV is absent, load_raw_datasets must raise RuntimeError (fail-closed)."""
    import src.analytics.features as feat
    orig_dp = feat.DATA_PROCESSED
    try:
        feat.DATA_PROCESSED = tmp_path  # Empty directory: no fact_harga_pasar.csv
        monkeypatch.setenv("HARGAWATCH_ALLOW_MOCK", "0")

        # Mock DB connection failure
        def mock_koneksi():
            raise ConnectionError("Supabase connection failed")
        monkeypatch.setattr("src.utils.ingest_supabase.koneksi", mock_koneksi)

        with pytest.raises(RuntimeError) as exc_info:
            feat.load_raw_datasets(force_db=True)

        assert "Pipeline fail-closed" in str(exc_info.value)
    finally:
        feat.DATA_PROCESSED = orig_dp


def test_mock_allowed_with_flag(monkeypatch, tmp_path):
    """When HARGAWATCH_ALLOW_MOCK=1, load_raw_datasets falls back to synthetic mock data."""
    import src.analytics.features as feat
    orig_dp = feat.DATA_PROCESSED
    try:
        feat.DATA_PROCESSED = tmp_path  # Empty directory: no fact_harga_pasar.csv
        monkeypatch.setenv("HARGAWATCH_ALLOW_MOCK", "1")

        def mock_koneksi():
            raise ConnectionError("Supabase connection failed")
        monkeypatch.setattr("src.utils.ingest_supabase.koneksi", mock_koneksi)

        df_h, df_k, df_c = feat.load_raw_datasets(force_db=True)
        assert not df_h.empty
        assert not df_k.empty
        assert not df_c.empty
        assert set(df_h["komoditas_id"].unique()) == {2, 50, 39}
    finally:
        feat.DATA_PROCESSED = orig_dp


from scripts.run_daily_pipeline import check_data_freshness_and_catchup


class MockCursor:
    def __init__(self, return_date):
        self.return_date = return_date

    def execute(self, query):
        pass

    def fetchone(self):
        return (self.return_date,)


class MockConnection:
    def __init__(self, return_date):
        self.return_date = return_date

    def cursor(self):
        return MockCursor(self.return_date)

    def close(self):
        pass


def test_freshness_guardrail_fresh_data():
    """Fresh data (e.g. yesterday) passes without triggering catch-up."""
    yesterday = datetime.now().date() - timedelta(days=1)
    mock_conn = lambda: MockConnection(yesterday)
    catchup_called = []

    res = check_data_freshness_and_catchup(
        max_stale_days=3,
        get_conn_fn=mock_conn,
        run_catchup_fn=lambda: catchup_called.append(True) or True
    )
    assert res is True
    assert len(catchup_called) == 0


def test_freshness_guardrail_stale_triggers_catchup():
    """Stale data (> 3 days) triggers catchup; re-verified fresh data passes."""
    stale_date = datetime.now().date() - timedelta(days=5)
    fresh_date = datetime.now().date() - timedelta(days=1)
    dates = [stale_date, fresh_date]

    def mock_conn():
        return MockConnection(dates.pop(0) if dates else fresh_date)

    catchup_called = []

    def mock_catchup():
        catchup_called.append(True)
        return True

    res = check_data_freshness_and_catchup(
        max_stale_days=3,
        get_conn_fn=mock_conn,
        run_catchup_fn=mock_catchup
    )
    assert res is True
    assert len(catchup_called) == 1


def test_freshness_guardrail_catchup_failure_aborts():
    """Stale data where catchup fails returns False to abort the pipeline."""
    stale_date = datetime.now().date() - timedelta(days=5)
    mock_conn = lambda: MockConnection(stale_date)

    res = check_data_freshness_and_catchup(
        max_stale_days=3,
        get_conn_fn=mock_conn,
        run_catchup_fn=lambda: False
    )
    assert res is False
