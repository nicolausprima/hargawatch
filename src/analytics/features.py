"""Feature engineering pipeline for HargaWatch time-series forecasting.

Generates tabular features without future temporal leakage.
All features for forecasting target at t+h are strictly constructed
from information available at or before forecast origin t (plus known calendar features at t+h).
"""

import hashlib
import json
import os
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_PROCESSED = BASE_DIR / "data" / "processed"
DATA_EXTERNAL = BASE_DIR / "data" / "external"


def calculate_file_sha256(filepath: Path) -> str:
    """Calculates SHA-256 digest of a local file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def write_dataset_manifest(
    manifest_path: Optional[Path] = None,
    df_harga: Optional[pd.DataFrame] = None,
    df_kal: Optional[pd.DataFrame] = None
) -> Path:
    """Writes provenance metadata for local CSV datasets to .manifest.json."""
    m_path = manifest_path or (DATA_PROCESSED / ".manifest.json")
    m_path.parent.mkdir(parents=True, exist_ok=True)
    
    files_info = {}
    csv_configs = [
        ("fact_harga_pasar.csv", df_harga),
        ("dim_kalender.csv", df_kal)
    ]
    for filename, df in csv_configs:
        fpath = DATA_PROCESSED / filename
        if fpath.exists():
            entry = {
                "sha256": calculate_file_sha256(fpath),
                "file_size_bytes": fpath.stat().st_size,
            }
            if df is not None and not df.empty and "tanggal" in df.columns:
                entry["max_tanggal"] = str(df["tanggal"].max())[:10]
                entry["row_count"] = int(len(df))
            else:
                try:
                    df_sample = pd.read_csv(fpath, usecols=["tanggal"], parse_dates=["tanggal"])
                    entry["max_tanggal"] = str(df_sample["tanggal"].max())[:10]
                    entry["row_count"] = int(len(df_sample))
                except Exception:
                    pass
            files_info[filename] = entry
            
    manifest = {
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
        "files": files_info
    }
    with open(m_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    return m_path


def check_dataset_manifest(manifest_path: Optional[Path] = None) -> Optional[dict]:
    """Validates local dataset provenance manifest and warns on staleness (>24h)."""
    m_path = manifest_path or (DATA_PROCESSED / ".manifest.json")
    if not m_path.exists():
        warnings.warn(
            f"[WARN] Cache CSV lokal dibaca dari {DATA_PROCESSED}, tetapi .manifest.json tidak ditemukan: "
            "provenance (asal-usul data) tidak diketahui.",
            UserWarning
        )
        return None

    try:
        with open(m_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        synced_str = manifest.get("last_synced_at")
        if synced_str:
            synced_dt = datetime.fromisoformat(synced_str)
            now_dt = datetime.now(timezone.utc)
            if synced_dt.tzinfo is None:
                synced_dt = synced_dt.replace(tzinfo=timezone.utc)
            age_hours = (now_dt - synced_dt).total_seconds() / 3600.0
            if age_hours > 24.0:
                warnings.warn(
                    f"[WARN] Cache CSV lokal usang ({age_hours:.1f} jam sejak sinkronisasi terakhir: {synced_str}). "
                    "Disarankan sinkronisasi ulang dengan Supabase (--from-db).",
                    UserWarning
                )
        return manifest
    except Exception as err:
        warnings.warn(f"[WARN] Gagal memvalidasi .manifest.json: {err}", UserWarning)
        return None


def generate_mock_raw_datasets() -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Deterministic synthetic dataset fallback for testing/CI when local files and DB are absent."""
    dates = pd.date_range("2025-01-01", "2026-03-31", freq="D")
    records = []
    for c_id, base_p in [(2, 12000.0), (50, 45000.0), (39, 30000.0)]:
        for p_id in [1, 2, 3, 4, 5]:
            p_factor = 0.95 if p_id == 5 else 1.0 + (p_id - 1) * 0.02
            noise = np.sin(np.linspace(0, 10, len(dates))) * 500
            for i, d in enumerate(dates):
                price = float(base_p * p_factor + noise[i])
                records.append({
                    "tanggal": d,
                    "pasar_id": p_id,
                    "komoditas_id": c_id,
                    "harga_asli": price,
                    "harga_imputasi": price,
                    "is_imputed": False
                })
    df_harga = pd.DataFrame(records)
    
    df_kal = pd.DataFrame({
        "tanggal": dates,
        "tahun": dates.year,
        "bulan": dates.month,
        "hari_nama": dates.day_name(),
        "is_weekend": (dates.dayofweek >= 5).astype(int),
        "is_libur_nasional": 0,
        "nama_libur": None,
        "is_ramadan": 0,
        "is_pra_ramadan": 0
    })
    
    df_cuaca = pd.DataFrame({
        "tanggal": dates,
        "curah_hujan_mm": 5.0,
        "jam_hujan": 1.0,
        "hari_hujan": 1,
        "suhu_mean_c": 28.5,
        "suhu_max_c": 32.0,
        "suhu_min_c": 25.0,
        "kelembapan_mean_pct": 75.0,
        "angin_max_kmh": 15.0
    })
    return df_harga, df_kal, df_cuaca


def load_raw_datasets(force_db: bool = False) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Loads cleaned fact_harga_pasar, dim_kalender, and fact_cuaca.
    
    Prefers local CSVs by default to prevent slow notebook execution.
    Use force_db=True to pull fresh data from Supabase.
    """
    
    def _load_local_csvs():
        check_dataset_manifest()
        df_h = pd.read_csv(DATA_PROCESSED / "fact_harga_pasar.csv", parse_dates=["tanggal"])
        df_k = pd.read_csv(DATA_PROCESSED / "dim_kalender.csv", parse_dates=["tanggal"])
        path_cuaca = DATA_EXTERNAL / "cuaca" / "cuaca_surabaya.csv"
        if path_cuaca.exists():
            df_c = pd.read_csv(path_cuaca, parse_dates=["tanggal"])
        else:
            df_c = pd.DataFrame(columns=["tanggal", "curah_hujan_mm", "suhu_mean_c"])
        return df_h, df_k, df_c

    if not force_db and (DATA_PROCESSED / "fact_harga_pasar.csv").exists():
        try:
            return _load_local_csvs()
        except Exception as e:
            print(f"[WARN] Failed to load local CSVs: {e}. Falling back to DB...")

    from src.utils.ingest_supabase import koneksi
    
    try:
        conn = koneksi()
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=UserWarning, message=".*pandas only supports SQLAlchemy.*")
            df_harga = pd.read_sql("SELECT * FROM fact_harga_pasar", conn)
            df_kal = pd.read_sql("SELECT * FROM dim_kalender", conn)
            df_cuaca = pd.read_sql("SELECT * FROM fact_cuaca", conn)
        conn.close()
        
        df_harga["tanggal"] = pd.to_datetime(df_harga["tanggal"])
        df_kal["tanggal"] = pd.to_datetime(df_kal["tanggal"])
        df_cuaca["tanggal"] = pd.to_datetime(df_cuaca["tanggal"])
        try:
            DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
            df_harga.to_csv(DATA_PROCESSED / "fact_harga_pasar.csv", index=False)
            df_kal.to_csv(DATA_PROCESSED / "dim_kalender.csv", index=False)
            write_dataset_manifest(df_harga=df_harga, df_kal=df_kal)
        except Exception:
            pass
        return df_harga, df_kal, df_cuaca
    except (Exception, SystemExit) as e:
        if (DATA_PROCESSED / "fact_harga_pasar.csv").exists():
            print(f"[WARN] Gagal menarik data dari Supabase: {e}. Fallback ke CSV lokal...")
            return _load_local_csvs()
        
        allow_mock = os.getenv("HARGAWATCH_ALLOW_MOCK", "0").lower() in ("1", "true", "yes")
        if allow_mock:
            print("[WARN] Supabase dan CSV lokal tidak tersedia. Menggunakan generator mock karena HARGAWATCH_ALLOW_MOCK=1...")
            return generate_mock_raw_datasets()

        raise RuntimeError(
            f"Gagal memuat dataset: Supabase gagal ({e}) dan cache CSV lokal tidak ditemukan di "
            f"{DATA_PROCESSED / 'fact_harga_pasar.csv'}. Pipeline fail-closed untuk mencegah komputasi "
            "pada data tiruan/mock. Set HARGAWATCH_ALLOW_MOCK=1 hanya untuk pengujian offline/CI."
        )


def prepare_base_series(
    df_harga: pd.DataFrame,
    komoditas_id: Optional[int] = None,
    pasar_id: Optional[int] = None
) -> pd.DataFrame:
    """Filters and sorts base series for feature construction."""
    df = df_harga.copy()
    if komoditas_id is not None:
        df = df[df["komoditas_id"] == komoditas_id]
    if pasar_id is not None:
        df = df[df["pasar_id"] == pasar_id]
        
    df = df.sort_values(["komoditas_id", "pasar_id", "tanggal"]).reset_index(drop=True)
    return df


def build_lag_features(df: pd.DataFrame) -> pd.DataFrame:
    """Builds historical lag and rolling statistics per (komoditas_id, pasar_id).
    
    These represent historical signals up to date t:
    - lag_1: price at t
    - lag_2: price at t-1
    - lag_3: price at t-2
    - lag_7: price at t-6
    - lag_14: price at t-13
    - rolling stats over 7d, 14d, 30d windows
    """
    df = df.copy()
    grouped = df.groupby(["komoditas_id", "pasar_id"])["harga_imputasi"]

    # Historical lags (shift 0 is price at t, but in training data row is at t)
    # When creating supervised training set: row date = t (origin).
    df["price_current"] = df["harga_imputasi"]
    df["price_lag_1"] = grouped.shift(1)
    df["price_lag_2"] = grouped.shift(2)
    df["price_lag_3"] = grouped.shift(3)
    df["price_lag_7"] = grouped.shift(7)
    df["price_lag_14"] = grouped.shift(14)

    # Rolling statistics (using closed='left' or shifting by 1 to include only past data)
    df["_shifted"] = grouped.shift(1)
    shifted_grouped = df.groupby(["komoditas_id", "pasar_id"])["_shifted"]
    
    df["rolling_mean_7d"] = shifted_grouped.rolling(7, min_periods=3).mean().reset_index(level=[0, 1], drop=True)
    df["rolling_std_7d"] = shifted_grouped.rolling(7, min_periods=3).std().reset_index(level=[0, 1], drop=True)
    df["rolling_mean_14d"] = shifted_grouped.rolling(14, min_periods=5).mean().reset_index(level=[0, 1], drop=True)
    df["rolling_std_14d"] = shifted_grouped.rolling(14, min_periods=5).std().reset_index(level=[0, 1], drop=True)
    df["rolling_mean_30d"] = shifted_grouped.rolling(30, min_periods=10).mean().reset_index(level=[0, 1], drop=True)
    df["rolling_std_30d"] = shifted_grouped.rolling(30, min_periods=10).std().reset_index(level=[0, 1], drop=True)
    df["rolling_max_90d"] = shifted_grouped.rolling(90, min_periods=15).max().reset_index(level=[0, 1], drop=True)
    df = df.drop(columns=["_shifted"])

    # Short-term momentum & volatility ratio
    df["pct_change_1d"] = (df["price_current"] - df["price_lag_1"]) / (df["price_lag_1"] + 1e-5)
    df["pct_change_7d"] = (df["price_current"] - df["price_lag_7"]) / (df["price_lag_7"] + 1e-5)
    df["volatility_ratio_7_30"] = df["rolling_std_7d"] / (df["rolling_std_30d"] + 1e-5)

    return df


IDULFITRI_DATES = [
    pd.Timestamp("2020-05-24"),
    pd.Timestamp("2021-05-13"),
    pd.Timestamp("2022-05-02"),
    pd.Timestamp("2023-04-22"),
    pd.Timestamp("2024-04-10"),
    pd.Timestamp("2025-03-31"),
    pd.Timestamp("2026-03-20")
]


def calculate_days_to_idulfitri(date_series: pd.Series) -> pd.Series:
    """Calculates signed distance in days to nearest Idulfitri (1 Syawal) (Decision D7)."""
    dt = pd.to_datetime(date_series)
    deltas = []
    for d in dt:
        diffs = [(d - if_date).days for if_date in IDULFITRI_DATES]
        min_idx = int(np.argmin([abs(x) for x in diffs]))
        deltas.append(diffs[min_idx])
    return pd.Series(deltas, index=date_series.index, dtype=int)


def build_keputran_lead_features(df: pd.DataFrame) -> pd.DataFrame:
    """Constructs wholesale lead price features from Pasar Induk Keputran (pasar_id = 5)
    for all commodities and retail markets (Decision D15).
    """
    df = df.copy()
    KEPUTRAN_ID = 5
    
    kep = df[df["pasar_id"] == KEPUTRAN_ID].sort_values("tanggal").copy()
    if kep.empty:
        df["keputran_price_lag_1"] = df["price_current"]
        df["keputran_price_lag_2"] = df["price_lag_1"]
        df["keputran_price_lag_3"] = df["price_lag_2"]
        return df

    kep_grouped = kep.groupby("komoditas_id")
    kep["keputran_price_lag_1"] = kep["price_current"]
    kep["keputran_price_lag_2"] = kep_grouped["price_current"].shift(1)
    kep["keputran_price_lag_3"] = kep_grouped["price_current"].shift(2)

    kep_cols = ["tanggal", "komoditas_id", "keputran_price_lag_1", "keputran_price_lag_2", "keputran_price_lag_3"]
    kep_lookup = kep[kep_cols].drop_duplicates(subset=["tanggal", "komoditas_id"])
    
    df = df.merge(kep_lookup, on=["tanggal", "komoditas_id"], how="left")
    
    # Fill missing Keputran lags with current market's own lags as fallback
    df["keputran_price_lag_1"] = df["keputran_price_lag_1"].fillna(df["price_current"])
    df["keputran_price_lag_2"] = df["keputran_price_lag_2"].fillna(df["keputran_price_lag_1"])
    df["keputran_price_lag_3"] = df["keputran_price_lag_3"].fillna(df["keputran_price_lag_2"])
    
    return df


def build_weather_features(df_cuaca: pd.DataFrame) -> pd.DataFrame:
    """Constructs lagged rainfall and weather features."""
    if df_cuaca.empty:
        return df_cuaca
        
    df_w = df_cuaca.sort_values("tanggal").copy()
    
    # Rainfall cumulative and lag features (using shift(1) for rolling sum to guarantee causal safety)
    shifted_rain = df_w["curah_hujan_mm"].shift(1)
    df_w["rain_lag_7d"] = df_w["curah_hujan_mm"].shift(7)
    df_w["rain_lag_14d"] = df_w["curah_hujan_mm"].shift(14)
    df_w["rain_lag_28d"] = df_w["curah_hujan_mm"].shift(28)
    df_w["rain_sum_7d"] = shifted_rain.rolling(7, min_periods=3).sum()
    df_w["rain_sum_14d"] = shifted_rain.rolling(14, min_periods=5).sum()
    df_w["rain_sum_30d"] = shifted_rain.rolling(30, min_periods=10).sum()
    
    cols = [
        "tanggal", "curah_hujan_mm", "suhu_mean_c",
        "rain_lag_7d", "rain_lag_14d", "rain_lag_28d",
        "rain_sum_7d", "rain_sum_14d", "rain_sum_30d"
    ]
    return df_w[[c for c in cols if c in df_w.columns]]


def build_supervised_dataset(
    horizon: int = 7,
    komoditas_id: Optional[int] = None,
    include_weather: bool = False,
    include_keputran: bool = True,
    return_target_delta: bool = False
) -> pd.DataFrame:
    """Constructs a direct-forecasting supervised dataset for target at t + horizon.
    
    Parameters
    ----------
    horizon : int
        Days ahead to predict (e.g. 7 or 14).
    komoditas_id : Optional[int]
        Specific commodity ID or None for all.
    include_weather : bool
        Whether to merge weather exogenous features.
        
    Returns
    -------
    pd.DataFrame
        Dataset ready for model training and evaluation.
    """
    df_harga, df_kal, df_cuaca = load_raw_datasets()
    df_base = prepare_base_series(df_harga, komoditas_id=komoditas_id)
    df_lags = build_lag_features(df_base)
    
    # Merge wholesale lead features from Pasar Induk Keputran (Decision D15)
    if include_keputran:
        df_lags = build_keputran_lead_features(df_lags)
    
    # Target definition: price at t + horizon
    grouped = df_lags.groupby(["komoditas_id", "pasar_id"])["harga_imputasi"]
    df_lags["target_date"] = pd.to_datetime(df_lags["tanggal"]) + pd.to_timedelta(horizon, unit="D")
    df_lags["target_price"] = grouped.shift(-horizon)
    
    # Target delta: percentage change from origin t to t+h
    df_lags["target_delta_pct"] = (df_lags["target_price"] - df_lags["price_current"]) / df_lags["price_current"]
    
    # Merge future calendar features known at target date (t+h)
    kal_cols = [
        "tanggal", "bulan", "is_weekend", "is_libur_nasional",
        "is_ramadan", "is_pra_ramadan"
    ]
    df_kal_target = df_kal[kal_cols].copy().rename(columns={
        "tanggal": "target_date",
        "bulan": "target_bulan",
        "is_weekend": "target_is_weekend",
        "is_libur_nasional": "target_is_libur_nasional",
        "is_ramadan": "target_is_ramadan",
        "is_pra_ramadan": "target_is_pra_ramadan"
    })
    # Idulfitri proximity feature (Decision D7)
    df_kal_target["target_hari_ke_idulfitri"] = calculate_days_to_idulfitri(df_kal_target["target_date"])
    
    df_merged = df_lags.merge(df_kal_target, on="target_date", how="left")
    
    # Merge weather features at forecast origin t
    if include_weather and not df_cuaca.empty:
        df_weather_feats = build_weather_features(df_cuaca)
        df_merged = df_merged.merge(df_weather_feats, on="tanggal", how="left")

    # Drop rows where target or primary lags are NaN
    valid_mask = df_merged["target_price"].notna() & df_merged["price_lag_14"].notna()
    df_clean = df_merged[valid_mask].reset_index(drop=True)
    
    if not return_target_delta and "target_delta_pct" in df_clean.columns:
        df_clean = df_clean.drop(columns=["target_delta_pct"])
        
    return df_clean
