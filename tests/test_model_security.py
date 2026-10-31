import hashlib
import json
import pickle
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from scripts.run_forecasting import load_champion_from_registry, validate_and_sanitize_outputs


def test_security_rejection_outside_model_dir(tmp_path, monkeypatch):
    """Paths outside MODEL_DIR (even with similar prefix) must be rejected."""
    import scripts.run_forecasting as rf

    evil_dir = tmp_path / "forecasting_evil"
    evil_dir.mkdir()
    evil_file = evil_dir / "model.pkl"
    with open(evil_file, "wb") as f:
        pickle.dump({"fake": 1}, f)

    reg_file = tmp_path / "registry.json"
    reg_data = {
        "50_h7": {
            "komoditas_id": 50,
            "model_name": "XGBoost p50",
            "model_path": str(evil_file),
            "sha256": hashlib.sha256(evil_file.read_bytes()).hexdigest(),
            "features": []
        }
    }
    with open(reg_file, "w") as f:
        json.dump(reg_data, f)

    monkeypatch.setattr(rf, "REGISTRY_FILE", reg_file)
    model_name, model_obj, features = load_champion_from_registry(50, 7)
    assert model_obj is None


def test_security_rejection_missing_sha256(tmp_path, monkeypatch):
    """Non-naive champion model missing sha256 in registry must be rejected before pickle.load."""
    import scripts.run_forecasting as rf

    real_pkl = rf.MODEL_DIR / "xgboost_50_h7.pkl"
    if not real_pkl.exists():
        pytest.skip("xgboost_50_h7.pkl not present locally")

    reg_file = tmp_path / "registry.json"
    reg_data = {
        "50_h7": {
            "komoditas_id": 50,
            "model_name": "XGBoost p50",
            "model_path": str(real_pkl),
            # sha256 deliberately omitted
            "features": []
        }
    }
    with open(reg_file, "w") as f:
        json.dump(reg_data, f)

    monkeypatch.setattr(rf, "REGISTRY_FILE", reg_file)
    model_name, model_obj, features = load_champion_from_registry(50, 7)
    assert model_obj is None


def test_security_rejection_tampered_sha256(tmp_path, monkeypatch):
    """Non-naive champion model with mismatching sha256 must be rejected before pickle.load."""
    import scripts.run_forecasting as rf

    real_pkl = rf.MODEL_DIR / "xgboost_50_h7.pkl"
    if not real_pkl.exists():
        pytest.skip("xgboost_50_h7.pkl not present locally")

    reg_file = tmp_path / "registry.json"
    reg_data = {
        "50_h7": {
            "komoditas_id": 50,
            "model_name": "XGBoost p50",
            "model_path": str(real_pkl),
            "sha256": "0" * 64,  # wrong hash
            "features": []
        }
    }
    with open(reg_file, "w") as f:
        json.dump(reg_data, f)

    monkeypatch.setattr(rf, "REGISTRY_FILE", reg_file)
    model_name, model_obj, features = load_champion_from_registry(50, 7)
    assert model_obj is None


def test_monotonic_quantile_non_crossing_h1_to_h14():
    """Validates that for all simulated forecasts across H=1..14, batas_bawah <= harga_prediksi <= batas_atas."""
    dates = pd.date_range("2026-11-01", periods=14, freq="D")
    df_fc = pd.DataFrame({
        "tanggal": dates,
        "pasar_id": 1,
        "komoditas_id": 50,
        "harga_prediksi": [50000 + i * 500 for i in range(14)],
        # Crossing values to verify sanitization
        "batas_bawah": [52000 + i * 500 for i in range(14)],
        "batas_atas": [48000 + i * 500 for i in range(14)],
    })
    df_ews = pd.DataFrame({
        "tanggal": dates,
        "pasar_id": 1,
        "komoditas_id": 50,
        "total_skor": [25.0] * 14,
        "status_warning": ["NORMAL"] * 14
    })

    sanitized_fc, sanitized_ews = validate_and_sanitize_outputs(df_fc, df_ews)

    assert (sanitized_fc["batas_bawah"] <= sanitized_fc["harga_prediksi"]).all()
    assert (sanitized_fc["harga_prediksi"] <= sanitized_fc["batas_atas"]).all()
