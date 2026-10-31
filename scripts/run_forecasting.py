"""Master production forecasting and early warning pipeline for HargaWatch Surabaya.

Generates 7-14 day forecasts (p10, p50, p90) and computes daily Early Warning risk scores.
Supports saving locally to data/processed/ or upserting directly to Supabase.

Integrates with:
- Champion Model Registry (models/forecasting/registry.json and W&B Model Registry)
- Smart Dynamic Feature Routing (Weather dropped by default; Calendar for Cabai only)
- Champion strategy dispatch: Naive baseline for stable commodities, GBDT for volatile ones.
"""

import argparse
import json
import os
import pickle
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from src.analytics.features import (
    load_raw_datasets, prepare_base_series, build_lag_features,
    build_weather_features, build_supervised_dataset,
    build_keputran_lead_features, calculate_days_to_idulfitri,
    DATA_PROCESSED
)
from src.models.models import (
    LightGBMForecaster, CatBoostForecaster, XGBoostForecaster,
    HAS_CATBOOST, HAS_XGBOOST
)
from src.safety.early_warning import compute_early_warning_scores

MODEL_DIR = BASE_DIR / "models" / "forecasting"
REGISTRY_FILE = MODEL_DIR / "registry.json"

# Strategic priority commodities identified in EDA
PRIORITY_KOMODITAS_IDS = [
    50,  # Cabe Rawit Merah (Most Volatile -> LightGBM + Calendar)
    39,  # Bawang Merah (High Volatility -> CatBoost)
    2,   # Beras Premium (Strategic Staple -> Naive Last Value)
    13,  # Daging Ayam Ras (Stable -> Naive Last Value)
    16,  # Telur Ayam Ras (Medium Volatility -> CatBoost)
    10,  # Minyak Goreng Curah
    7    # Gula Kristal Putih
]


def load_champion_from_registry(
    komoditas_id: int,
    horizon: int = 7
) -> Tuple[Optional[str], Optional[any], Optional[List[str]]]:
    """Retrieves champion model metadata from local registry or W&B Artifacts."""
    if not REGISTRY_FILE.exists():
        return None, None, None

    try:
        with open(REGISTRY_FILE, "r", encoding="utf-8") as f:
            registry = json.load(f)
    except Exception:
        return None, None, None

    key = f"{komoditas_id}_h{horizon}"
    entry = registry.get(key)
    if not entry:
        return None, None, None

    model_name = entry.get("model_name", "")
    model_path_str = entry.get("model_path")
    features = entry.get("features", [])

    if "naive" in model_name.lower():
        return "naive", None, features

    model_obj = None
    resolved_path = None
    if model_path_str:
        p = Path(model_path_str)
        if p.exists():
            resolved_path = p.resolve()
        elif (MODEL_DIR / p.name).exists():
            resolved_path = (MODEL_DIR / p.name).resolve()

    if resolved_path and resolved_path.exists():
        try:
            # Security: Path containment check - model MUST reside strictly within MODEL_DIR
            model_dir_resolved = MODEL_DIR.resolve()
            if not resolved_path.is_relative_to(model_dir_resolved):
                raise PermissionError(f"Security violation: model path {resolved_path} outside {model_dir_resolved}")

            # Security: Mandatory SHA-256 integrity validation for non-naive models
            expected_sha256 = entry.get("sha256")
            if not expected_sha256:
                raise ValueError(f"Integrity check failed: champion entry {key} ({model_name}) lacks sha256 in registry.json")

            import hashlib
            with open(resolved_path, "rb") as f:
                actual_sha256 = hashlib.sha256(f.read()).hexdigest()
            if actual_sha256 != expected_sha256:
                raise ValueError(f"Integrity check mismatch for {resolved_path.name}: expected {expected_sha256}, got {actual_sha256}")

            with open(resolved_path, "rb") as f:
                model_obj = pickle.load(f)
            return model_name, model_obj, features
        except Exception as e:
            print(f"  [SECURITY/INTEGRITY ERROR] Failed to load local model {resolved_path}: {e}")

    # Fallback to W&B Model Registry if available
    try:
        import wandb
        api = wandb.Api()
        project = os.getenv("WANDB_PROJECT", "hargawatch-surabaya")
        artifact_path = f"{project}/forecast-model-{komoditas_id}-h{horizon}:production"
        artifact = api.artifact(artifact_path)
        download_dir = artifact.download()
        pkl_files = list(Path(download_dir).glob("*.pkl"))
        if pkl_files:
            target_pkl = pkl_files[0].resolve()
            # Security: Path containment check for downloaded artifact
            download_dir_resolved = Path(download_dir).resolve()
            if not target_pkl.is_relative_to(download_dir_resolved):
                raise PermissionError(f"Security violation: artifact path {target_pkl} outside {download_dir_resolved}")
            with open(target_pkl, "rb") as f:
                model_obj = pickle.load(f)
            return model_name, model_obj, features
    except Exception as e:
        print(f"  [WARN] W&B fallback artifact load skipped: {e}")

    return model_name, None, features


def train_and_forecast_commodity(
    komoditas_id: int,
    commodity_name: str,
    horizon_days: int = 14,
    include_weather: bool = False,
    force_db: bool = False
) -> pd.DataFrame:
    """Generates multi-step direct quantile forecasts using champion architectures."""
    df_harga, df_kal, df_cuaca = load_raw_datasets(force_db=force_db)
    df_base = prepare_base_series(df_harga, komoditas_id=komoditas_id)
    df_lags = build_lag_features(df_base)
    # Ensure wholesale lead features from Pasar Induk Keputran are present (eliminates feature skew)
    df_lags = build_keputran_lead_features(df_lags)

    origin_date = df_lags["tanggal"].max()
    slice_origin = df_lags[df_lags["tanggal"] == origin_date].copy()

    # Safety Guardrail: Only forecast for active markets where the commodity is actually traded (price_current > 0 and notna)
    slice_origin = slice_origin[slice_origin["price_current"].notna() & (slice_origin["price_current"] > 0)].copy()

    if slice_origin.empty:
        return pd.DataFrame()

    c_lower = commodity_name.lower()
    is_cabai = "cabai" in c_lower or "cabe" in c_lower

    # Feature routing
    weather_feats = build_weather_features(df_cuaca) if include_weather else pd.DataFrame()
    if not weather_feats.empty:
        slice_origin = slice_origin.merge(weather_feats, on="tanggal", how="left")

    base_feature_cols = [
        "pasar_id", "price_current", "price_lag_1", "price_lag_2", "price_lag_3",
        "price_lag_7", "price_lag_14", "rolling_mean_7d", "rolling_std_7d",
        "rolling_mean_14d", "rolling_std_14d", "pct_change_1d", "pct_change_7d"
    ]
    if is_cabai:
        calendar_cols = [
            "target_bulan", "target_is_weekend", "target_is_libur_nasional",
            "target_is_ramadan", "target_is_pra_ramadan"
        ]
        base_feature_cols += calendar_cols

    if include_weather and not weather_feats.empty:
        w_cols = ["curah_hujan_mm", "rain_sum_7d", "rain_sum_14d", "rain_lag_28d"]
        base_feature_cols += [c for c in w_cols if c in weather_feats.columns]

    # Check champion strategy from Registry for H7
    champ_name, champ_model_h7, champ_features = load_champion_from_registry(komoditas_id, horizon=7)

    # If stable commodity with Naive champion strategy (Beras, Bawang Putih, Daging Ayam)
    # or if commodity is strategic staple known to be Naive-dominated
    is_naive_champion = (champ_name and "naive" in champ_name.lower()) or (
        komoditas_id in [2, 13, 49] and not is_cabai
    )

    all_forecasts = []
    origin_dt = pd.to_datetime(origin_date)

    # Pre-compute H=7 anchor forecast if champion ML model is available
    preds_h7 = None
    if not is_naive_champion and champ_model_h7 is not None:
        inf_slice_h7 = slice_origin.copy()
        target_h7_dt = origin_dt + pd.Timedelta(days=7)
        kal_target_7 = df_kal[df_kal["tanggal"] == target_h7_dt]
        if kal_target_7.empty:
            inf_slice_h7["target_bulan"] = target_h7_dt.month
            inf_slice_h7["target_is_weekend"] = int(target_h7_dt.weekday() >= 5)
            inf_slice_h7["target_is_libur_nasional"] = 0
            inf_slice_h7["target_is_ramadan"] = 0
            inf_slice_h7["target_is_pra_ramadan"] = 0
        else:
            inf_slice_h7["target_bulan"] = kal_target_7["bulan"].iloc[0]
            inf_slice_h7["target_is_weekend"] = kal_target_7["is_weekend"].iloc[0]
            inf_slice_h7["target_is_libur_nasional"] = kal_target_7["is_libur_nasional"].iloc[0]
            inf_slice_h7["target_is_ramadan"] = kal_target_7["is_ramadan"].iloc[0]
            inf_slice_h7["target_is_pra_ramadan"] = kal_target_7["is_pra_ramadan"].iloc[0]

        inf_slice_h7["target_hari_ke_idulfitri"] = calculate_days_to_idulfitri(pd.Series([target_h7_dt])).iloc[0]

        # Defensive feature column alignment: ensure all expected features exist
        expected_cols = getattr(champ_model_h7, "feature_cols", champ_features or base_feature_cols)
        for col in expected_cols:
            if col not in inf_slice_h7.columns:
                inf_slice_h7[col] = 0

        try:
            preds_h7 = champ_model_h7.predict(inf_slice_h7)
        except Exception as e:
            print(f"  [WARN] Inference error with champion model for {commodity_name}: {e}. Falling back to Naive.")
            preds_h7 = None

    for h in range(1, horizon_days + 1):
        target_date = origin_dt + pd.Timedelta(days=int(h))

        if is_naive_champion or preds_h7 is None:
            # Naive Last Value Persistence baseline with 80% CI based on rolling std
            p_curr = slice_origin["price_current"].values
            std_7d = slice_origin["rolling_std_7d"].fillna(slice_origin["price_current"] * 0.02).values
            std_7d = np.maximum(std_7d, p_curr * 0.02)
            p50 = np.maximum(0, np.nan_to_num(np.round(p_curr), nan=0)).astype(int)
            p10 = np.maximum(0, np.nan_to_num(np.round(p_curr - 1.28 * std_7d), nan=0)).astype(int)
            p10 = np.minimum(p10, p50)
            p90 = np.maximum(p50, np.nan_to_num(np.round(p_curr + 1.28 * std_7d), nan=p50)).astype(int)
            preds = {
                "harga_prediksi": p50,
                "batas_bawah": p10,
                "batas_atas": p90
            }
        else:
            # Multi-horizon trajectory projection via champion H=7 anchor & Brownian cone of uncertainty
            p_curr = slice_origin["price_current"].values
            p50_7 = preds_h7["harga_prediksi"]
            p10_7 = preds_h7["batas_bawah"]
            p90_7 = preds_h7["batas_atas"]

            ratio = h / 7.0
            sqrt_ratio = np.sqrt(ratio)

            p50_h = np.maximum(0, np.nan_to_num(np.round(p_curr + ratio * (p50_7 - p_curr)), nan=0)).astype(int)
            p10_h = np.maximum(0, np.nan_to_num(np.round(p50_h - sqrt_ratio * (p50_7 - p10_7)), nan=0)).astype(int)
            p90_h = np.maximum(p50_h, np.nan_to_num(np.round(p50_h + sqrt_ratio * (p90_7 - p50_7)), nan=p50_h)).astype(int)

            # Monotonic non-crossing guardrail
            p10_h = np.minimum(p10_h, p50_h)
            p90_h = np.maximum(p90_h, p50_h)

            preds = {
                "harga_prediksi": p50_h,
                "batas_bawah": p10_h,
                "batas_atas": p90_h
            }

        step_df = pd.DataFrame({
            "tanggal": target_date.strftime("%Y-%m-%d"),
            "pasar_id": slice_origin["pasar_id"].astype(int).values,
            "komoditas_id": komoditas_id,
            "harga_prediksi": preds["harga_prediksi"],
            "batas_bawah": preds["batas_bawah"],
            "batas_atas": preds["batas_atas"]
        })
        all_forecasts.append(step_df)

    if not all_forecasts:
        return pd.DataFrame()

    df_fc_all = pd.concat(all_forecasts, ignore_index=True)
    df_fc_all = df_fc_all[df_fc_all["harga_prediksi"] > 0].copy()
    return df_fc_all


def validate_and_sanitize_outputs(
    df_forecast: pd.DataFrame,
    df_ews: pd.DataFrame
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Atomic data-quality gate verifying forecasts and EWS integrity before persistence/upsert.
    
    Validations enforced:
    1. Primary Key Deduplication: (tanggal, pasar_id, komoditas_id)
    2. Monotonic Non-Crossing: 0 <= batas_bawah <= harga_prediksi <= batas_atas
    3. Completeness & NaN Rejection: No nulls in key analytical metrics
    4. Sane bounds: positive prices and valid EWS score limits [0, 100]
    5. Valid EWS Status Enum: NORMAL, WASPADA, TINGGI
    """
    if df_forecast.empty:
        raise ValueError("[QUALITY GATE ERROR] df_forecast is empty. Aborting publish.")
    if df_ews.empty:
        raise ValueError("[QUALITY GATE ERROR] df_ews is empty. Aborting publish.")

    # 1. Deduplicate records on primary key (tanggal, pasar_id, komoditas_id)
    df_fc = df_forecast.drop_duplicates(subset=["tanggal", "pasar_id", "komoditas_id"], keep="last").copy()
    df_ew = df_ews.drop_duplicates(subset=["tanggal", "pasar_id", "komoditas_id"], keep="last").copy()

    # 2. Reject Nulls / NaNs in critical columns
    fc_critical = ["tanggal", "pasar_id", "komoditas_id", "harga_prediksi", "batas_bawah", "batas_atas"]
    if df_fc[fc_critical].isnull().values.any():
        null_counts = df_fc[fc_critical].isnull().sum().to_dict()
        raise ValueError(f"[QUALITY GATE ERROR] df_forecast contains nulls: {null_counts}")

    ews_critical = ["tanggal", "pasar_id", "komoditas_id", "total_skor", "status_warning"]
    if df_ew[ews_critical].isnull().values.any():
        null_counts = df_ew[ews_critical].isnull().sum().to_dict()
        raise ValueError(f"[QUALITY GATE ERROR] df_ews contains nulls: {null_counts}")

    # 3. Enforce monotonic non-crossing ordering: batas_bawah <= harga_prediksi <= batas_atas
    df_fc["batas_bawah"] = np.minimum(df_fc["batas_bawah"], df_fc["harga_prediksi"])
    df_fc["batas_atas"] = np.maximum(df_fc["batas_atas"], df_fc["harga_prediksi"])

    # 4. Enforce strictly positive prices
    if (df_fc["harga_prediksi"] <= 0).any():
        raise ValueError("[QUALITY GATE ERROR] df_forecast contains non-positive harga_prediksi.")

    # 5. Enforce valid EWS scores and statuses
    if ((df_ew["total_skor"] < 0) | (df_ew["total_skor"] > 100)).any():
        raise ValueError("[QUALITY GATE ERROR] df_ews total_skor out of [0, 100] range.")
    
    valid_statuses = {"NORMAL", "WASPADA", "TINGGI"}
    invalid_statuses = set(df_ew["status_warning"].unique()) - valid_statuses
    if invalid_statuses:
        raise ValueError(f"[QUALITY GATE ERROR] df_ews contains invalid status_warning: {invalid_statuses}")

    print(f"[QUALITY GATE] PASSED: Verified {len(df_fc)} forecast rows & {len(df_ew)} EWS rows (zero nulls, non-crossing quantiles, deduplicated).")
    return df_fc, df_ew


def upsert_to_supabase(df_forecast: pd.DataFrame, df_ews: pd.DataFrame):
    """Upserts forecasts and early warning scores to Supabase."""
    try:
        from src.utils.ingest_supabase import koneksi
        from psycopg2.extras import execute_values

        # Defensive deduplication before batching into PostgreSQL
        df_forecast = df_forecast.drop_duplicates(subset=["tanggal", "pasar_id", "komoditas_id"], keep="last")
        df_ews = df_ews.drop_duplicates(subset=["tanggal", "pasar_id", "komoditas_id"], keep="last")

        conn = koneksi()
        cur = conn.cursor()

        # 1. Upsert fact_forecast
        sql_forecast = """
            INSERT INTO public.fact_forecast (tanggal, pasar_id, komoditas_id, harga_prediksi, batas_bawah, batas_atas)
            VALUES %s
            ON CONFLICT (tanggal, pasar_id, komoditas_id) DO UPDATE
            SET harga_prediksi = EXCLUDED.harga_prediksi,
                batas_bawah = EXCLUDED.batas_bawah,
                batas_atas = EXCLUDED.batas_atas,
                created_at = CURRENT_TIMESTAMP;
        """
        rows_forecast = [
            (r.tanggal, r.pasar_id, r.komoditas_id, r.harga_prediksi, r.batas_bawah, r.batas_atas)
            for r in df_forecast.itertuples()
        ]
        execute_values(cur, sql_forecast, rows_forecast, page_size=500)

        # 2. Upsert fact_early_warning
        sql_ews = """
            INSERT INTO public.fact_early_warning 
            (tanggal, pasar_id, komoditas_id, skor_tren, skor_volatilitas, skor_anomali, skor_prediksi, total_skor, status_warning)
            VALUES %s
            ON CONFLICT (tanggal, pasar_id, komoditas_id) DO UPDATE
            SET skor_tren = EXCLUDED.skor_tren,
                skor_volatilitas = EXCLUDED.skor_volatilitas,
                skor_anomali = EXCLUDED.skor_anomali,
                skor_prediksi = EXCLUDED.skor_prediksi,
                total_skor = EXCLUDED.total_skor,
                status_warning = EXCLUDED.status_warning,
                created_at = CURRENT_TIMESTAMP;
        """
        rows_ews = [
            (r.tanggal, r.pasar_id, r.komoditas_id, r.skor_tren, r.skor_volatilitas,
             r.skor_anomali, r.skor_prediksi, r.total_skor, r.status_warning)
            for r in df_ews.itertuples()
        ]
        execute_values(cur, sql_ews, rows_ews, page_size=500)

        conn.commit()
        cur.close()
        conn.close()
        print(f"[SUCCESS] Upserted {len(rows_forecast)} forecast rows & {len(rows_ews)} EWS rows to Supabase!")

    except Exception as e:
        print(f"[ERROR] Failed to upsert to Supabase: {e}")


def main():
    parser = argparse.ArgumentParser(description="HargaWatch Forecasting Pipeline Runner")
    parser.add_argument("--horizon", type=int, default=14, help="Forecast horizon in days (default: 14)")
    parser.add_argument("--all-commodities", action="store_true", help="Run across all 37 commodities")
    parser.add_argument("--use-weather", action="store_true", help="Force inclusion of weather features")
    parser.add_argument("--local-only", action="store_true", help="Export to local CSV only")
    parser.add_argument("--from-db", action="store_true", help="Force loading fresh data from Supabase DB rather than local CSV")
    args = parser.parse_args()

    df_harga, _, _ = load_raw_datasets(force_db=args.from_db)
    latest_date = df_harga["tanggal"].max()
    print(f"\n========================================================")
    print(f"  HARGAWATCH FORECASTING & EARLY WARNING RUNNER")
    print(f"  Latest Data Date: {latest_date.date()} | Horizon: {args.horizon} Days")
    print(f"  Weather Exogenous: {args.use_weather}")
    print(f"========================================================")

    if args.all_commodities:
        target_ids = df_harga["komoditas_id"].unique().tolist()
    else:
        target_ids = PRIORITY_KOMODITAS_IDS

    if (DATA_PROCESSED / "dim_komoditas.csv").exists():
        df_kom = pd.read_csv(DATA_PROCESSED / "dim_komoditas.csv")
    else:
        from src.utils.ingest_supabase import koneksi
        _conn = koneksi()
        df_kom = pd.read_sql("SELECT * FROM dim_komoditas", _conn)
        _conn.close()
        df_kom.to_csv(DATA_PROCESSED / "dim_komoditas.csv", index=False)

    col_k = "nama_komoditas" if "nama_komoditas" in df_kom.columns else "komoditas"
    if "komoditas" not in df_kom.columns:
        df_kom["komoditas"] = df_kom[col_k]
    name_map = dict(zip(df_kom["komoditas_id"], df_kom["komoditas"]))

    all_forecast_dfs = []
    print(f"\n[INFO] Generating forecasts for {len(target_ids)} target commodities...")
    for cid in target_ids:
        cname = name_map.get(cid, f"ID_{cid}")
        print(f"  -> Forecasting {cname} (ID: {cid})...")
        fc_df = train_and_forecast_commodity(
            komoditas_id=cid,
            commodity_name=cname,
            horizon_days=args.horizon,
            include_weather=args.use_weather,
            force_db=False  # Pulled fresh once in main(), use local cache to prevent N redundant queries
        )
        if not fc_df.empty:
            all_forecast_dfs.append(fc_df)

    if not all_forecast_dfs:
        print("[ERROR] No forecasts were generated.")
        return

    df_final_forecasts = pd.concat(all_forecast_dfs, ignore_index=True)

    # Generate Early Warning Scores at latest_date using day-7 forecast
    print("\n[INFO] Computing Early Warning Risk Matrix...")
    df_base_all = prepare_base_series(df_harga)
    df_lags_all = build_lag_features(df_base_all)
    slice_latest = df_lags_all[
        (df_lags_all["tanggal"] == latest_date) &
        (df_lags_all["komoditas_id"].isin(target_ids)) &
        (df_lags_all["price_current"].notna()) &
        (df_lags_all["price_current"] > 0)
    ].copy()

    # Match with day-7 forecast
    latest_dt = pd.to_datetime(latest_date)
    day7_date = (latest_dt + pd.Timedelta(days=7)).strftime("%Y-%m-%d")
    fc_day7 = df_final_forecasts[df_final_forecasts["tanggal"] == day7_date]
    if fc_day7.empty:
        fc_day7 = df_final_forecasts.drop_duplicates(subset=["pasar_id", "komoditas_id"])

    # Drop tanggal from forecast slice so merge aligns each market/commodity to current origin t
    fc_day7_clean = fc_day7.drop(columns=["tanggal"], errors="ignore")
    df_final_ews = compute_early_warning_scores(slice_latest, fc_day7_clean)

    # Pre-Publish Quality Gate & Deduplication (Gate F-05 / S1)
    print("\n[INFO] Validating forecasting and EWS integrity against Quality Gate...")
    df_final_forecasts, df_final_ews = validate_and_sanitize_outputs(df_final_forecasts, df_final_ews)

    # Save to local CSV
    out_fc_path = DATA_PROCESSED / "fact_forecast.csv"
    out_ews_path = DATA_PROCESSED / "fact_early_warning.csv"
    df_final_forecasts.to_csv(out_fc_path, index=False)
    df_final_ews.to_csv(out_ews_path, index=False)
    print(f"\n[OUTPUT] Saved {len(df_final_forecasts)} rows to {out_fc_path}")
    print(f"[OUTPUT] Saved {len(df_final_ews)} rows to {out_ews_path}")

    # Display EWS Sample Table
    print("\n=== SAMPLE EARLY WARNING RISK MATRIX ===")
    df_display = df_final_ews.merge(df_kom[["komoditas_id", "komoditas"]], on="komoditas_id")
    if (DATA_PROCESSED / "dim_pasar.csv").exists():
        df_pasar = pd.read_csv(DATA_PROCESSED / "dim_pasar.csv")
    else:
        from src.utils.ingest_supabase import koneksi
        _conn = koneksi()
        df_pasar = pd.read_sql("SELECT * FROM dim_pasar", _conn)
        _conn.close()
        df_pasar.to_csv(DATA_PROCESSED / "dim_pasar.csv", index=False)
    df_display = df_display.merge(df_pasar[["pasar_id", "nama_pasar"]], on="pasar_id")
    cols_show = ["nama_pasar", "komoditas", "total_skor", "status_warning", "skor_tren", "skor_volatilitas", "skor_anomali", "skor_prediksi"]
    print(df_display[cols_show].head(15).to_string(index=False))

    # Ingest to Supabase if requested
    if not args.local_only:
        print("\n[INFO] Upserting to Supabase database...")
        upsert_to_supabase(df_final_forecasts, df_final_ews)

    print("\n[SUCCESS] Pipeline execution finished successfully!\n")


if __name__ == "__main__":
    main()
