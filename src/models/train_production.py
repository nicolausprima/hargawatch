"""Production Training & MLOps Pipeline for HargaWatch Surabaya.

Integrates:
1. Dynamic Feature Routing (Smart Defaults: No Weather; Calendar for Cabai only; CLI overrides).
2. Walk-Forward Rolling-Origin Backtesting with fast execution (window_step_days configurable).
3. Auto-Model Selection based on lowest WAPE across all baseline and GBDT candidates.
4. Experiment Tracking & Model Registry with Weights & Biases (W&B):
   - wandb.config: Hyperparameters, commodity, horizon, feature lists, routing flags.
   - wandb.log: Walk-forward metrics per model, feature importance chart, interactive summary table.
   - wandb.Artifact: Champion model artifact tagged 'production' and 'latest'.
5. Graceful offline fallback if W&B credentials are not yet configured.
"""

import argparse
import datetime
import json
import os
import pickle
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import matplotlib
matplotlib.use("Agg")  # Non-interactive headless backend
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

# Load .env
load_dotenv(BASE_DIR / ".env")

from src.analytics.features import build_supervised_dataset
from src.models.backtest import resolve_commodity, run_walk_forward_backtest
from src.models.models import (
    CatBoostForecaster,
    HAS_CATBOOST,
    HAS_XGBOOST,
    LightGBMForecaster,
    RidgeForecaster,
    XGBoostForecaster,
)

MODEL_DIR = BASE_DIR / "models" / "forecasting"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
REGISTRY_FILE = MODEL_DIR / "registry.json"


def setup_wandb(project: str, run_name: str, config: Dict) -> Tuple[any, bool]:
    """Initializes Weights & Biases with defensive fallback to offline mode if unauthenticated."""
    try:
        import wandb
        if not hasattr(wandb, "init"):
            print("[INFO] 'wandb' package not fully available or shadowed by local directory. Continuing in standalone mode.")
            return None, False
    except ImportError:
        print("[WARN] 'wandb' package is not installed. Experiment tracking will be disabled.")
        return None, False

    api_key = os.getenv("WANDB_API_KEY")
    entity = os.getenv("WANDB_ENTITY") or None
    is_offline = False

    if api_key and api_key.strip() and api_key != "kunci-api-wandb-anda":
        try:
            wandb.login(key=api_key.strip(), relogin=True)
        except Exception as e:
            print(f"[WARN] W&B login with provided API key failed ({e}). Falling back to offline mode.")
            is_offline = True
    else:
        # Check if already authenticated via CLI
        if not wandb.api.api_key:
            print("[INFO] WANDB_API_KEY is not configured. Running in offline mode.")
            print("[INFO] Run results will be saved locally to ./wandb and can be synced later via 'wandb sync'.")
            is_offline = True

    mode = "offline" if is_offline else "online"

    run = wandb.init(
        project=project,
        entity=entity,
        name=run_name,
        config=config,
        mode=mode,
        reinit=True
    )
    return run, True


def determine_feature_routing(
    commodity_name: str,
    force_weather: bool = False,
    force_calendar: Optional[bool] = None
) -> Tuple[bool, bool]:
    """Smart feature routing based on empirical ablation study.
    
    - Weather: Consumer-city weather adds noise. Disabled by default unless explicitly forced.
    - Calendar: Ramadan/holiday shifts significantly improve Cabai forecasting, but add noise
      to price-regulated staples (Beras, Bawang, Daging).
    """
    include_weather = force_weather

    if force_calendar is not None:
        include_calendar = force_calendar
    else:
        c_lower = commodity_name.lower()
        include_calendar = "cabai" in c_lower or "cabe" in c_lower

    return include_weather, include_calendar


def get_feature_columns(
    df: pd.DataFrame,
    include_weather: bool,
    include_calendar: bool,
    include_keputran: bool = True
) -> List[str]:
    """Builds extensible list of feature columns dynamically present in dataset."""
    feature_cols = [
        "pasar_id", "price_current", "price_lag_1", "price_lag_2", "price_lag_3",
        "price_lag_7", "price_lag_14", "rolling_mean_7d", "rolling_std_7d",
        "rolling_mean_14d", "rolling_std_14d", "pct_change_1d", "pct_change_7d"
    ]
    if include_keputran:
        keputran_cols = ["keputran_price_lag_1", "keputran_price_lag_2", "keputran_price_lag_3"]
        feature_cols += [c for c in keputran_cols if c in df.columns]

    if include_calendar:
        # Ablasi weekend D4, sertakan idulfitri D7
        calendar_cols = [
            "target_bulan", "target_is_libur_nasional",
            "target_is_ramadan", "target_is_pra_ramadan",
            "target_hari_ke_idulfitri"
        ]
        feature_cols += [c for c in calendar_cols if c in df.columns]

    if include_weather:
        weather_cols = ["curah_hujan_mm", "rain_sum_7d", "rain_sum_14d", "rain_lag_28d", "rain_lag_7d", "rain_lag_14d"]
        feature_cols += [c for c in weather_cols if c in df.columns]

    return [c for c in feature_cols if c in df.columns]


def train_champion_model(
    model_name: str,
    feature_cols: List[str],
    df_train: pd.DataFrame,
    target_col: str = "target_price"
) -> Tuple[any, Optional[pd.DataFrame]]:
    """Fits the champion model architecture on the complete historical dataset."""
    name_clean = model_name.lower()
    train_data = df_train.dropna(subset=[target_col] + feature_cols).copy()
    y_train = train_data[target_col]

    model = None
    feat_imp = None

    if "catboost" in name_clean:
        if not HAS_CATBOOST:
            raise RuntimeError("CatBoost requested as champion but package not available.")
        model = CatBoostForecaster(feature_cols=feature_cols, categorical_cols=["pasar_id"])
        model.fit(train_data, y_train)
        feat_imp = model.get_feature_importances()

    elif "xgboost" in name_clean:
        if not HAS_XGBOOST:
            raise RuntimeError("XGBoost requested as champion but package not available.")
        model = XGBoostForecaster(feature_cols=feature_cols, categorical_cols=["pasar_id"])
        model.fit(train_data, y_train)
        feat_imp = model.get_feature_importances()

    elif "ridge" in name_clean or "linear" in name_clean:
        model = RidgeForecaster(feature_cols=feature_cols, categorical_cols=["pasar_id"])
        model.fit(train_data, y_train)

    elif "lightgbm" in name_clean or "lgb" in name_clean:
        model = LightGBMForecaster(feature_cols=feature_cols, categorical_cols=["pasar_id"])
        model.fit(train_data, y_train)
        feat_imp = model.get_feature_importances()

    return model, feat_imp


def plot_feature_importance(
    feat_imp: pd.DataFrame,
    commodity_name: str,
    output_path: Path
):
    """Generates and saves a clean horizontal bar chart of top features."""
    plt.figure(figsize=(9, 6))
    top_n = min(15, len(feat_imp))
    subset = feat_imp.head(top_n).iloc[::-1]

    plt.barh(subset["feature"], subset["importance"], color="#2563EB", edgecolor="none")
    plt.title(f"Top {top_n} Feature Importance — {commodity_name}", fontsize=12, fontweight="bold")
    plt.xlabel("Importance Score", fontsize=10)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()


def update_local_registry(
    komoditas_id: int,
    canonical_name: str,
    horizon: int,
    best_model_name: str,
    best_wape: float,
    model_path: Optional[str],
    features: List[str]
):
    """Persists current champion model metadata in a local JSON registry."""
    registry = {}
    if REGISTRY_FILE.exists():
        try:
            with open(REGISTRY_FILE, "r", encoding="utf-8") as f:
                registry = json.load(f)
        except Exception:
            registry = {}

    sha256_digest = None
    normalized_path = None
    if model_path:
        mp = Path(model_path)
        if mp.exists():
            import hashlib
            with open(mp, "rb") as f:
                sha256_digest = hashlib.sha256(f.read()).hexdigest()
            normalized_path = f"models/forecasting/{mp.name}"
        else:
            normalized_path = str(model_path)

    key = f"{komoditas_id}_h{horizon}"
    entry = {
        "komoditas_id": komoditas_id,
        "commodity": canonical_name,
        "horizon": horizon,
        "model_name": best_model_name,
        "wape_pct": float(best_wape),
        "model_path": normalized_path,
        "features": features,
        "updated_at": datetime.datetime.now().isoformat()
    }
    if sha256_digest:
        entry["sha256"] = sha256_digest
    registry[key] = entry

    with open(REGISTRY_FILE, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)


def run_training_pipeline(
    commodity: str = "Cabe Rawit Merah",
    horizon: int = 7,
    window_step_days: int = 60,
    model_type: str = "all",
    force_weather: bool = False,
    force_calendar: Optional[bool] = None,
    test_start_date: str = "2025-01-01"
) -> Dict:
    """Main execution orchestrator for backtest, model selection, retraining, and W&B logging."""
    komoditas_id, canonical_name = resolve_commodity(commodity)
    include_weather, include_calendar = determine_feature_routing(
        canonical_name, force_weather=force_weather, force_calendar=force_calendar
    )

    print("\n" + "=" * 65)
    print(f"  HARGAWATCH MLOPS TRAINING PIPELINE")
    print(f"  Target: {canonical_name} (ID: {komoditas_id}) | Horizon: {horizon} Days")
    print(f"  Weather Features: {include_weather} | Calendar Features: {include_calendar}")
    print(f"  Validation: Walk-Forward Rolling-Origin (Step: {window_step_days} days)")
    print("=" * 65 + "\n")

    # 1. Build Supervised Dataset to inspect features
    df_full = build_supervised_dataset(
        horizon=horizon,
        komoditas_id=komoditas_id,
        include_weather=include_weather
    )
    feature_cols = get_feature_columns(df_full, include_weather, include_calendar)
    print(f"[INFO] Prepared dataset with {len(df_full)} rows and {len(feature_cols)} active predictor features:")
    print(f"       {feature_cols}")

    # 2. Setup W&B Tracking
    project = os.getenv("WANDB_PROJECT", "hargawatch-surabaya")
    run_name = f"Train-{canonical_name.replace(' ', '_')}-H{horizon}-{datetime.date.today().strftime('%Y%m%d')}"
    wandb_config = {
        "commodity": canonical_name,
        "komoditas_id": komoditas_id,
        "horizon_days": horizon,
        "window_step_days": window_step_days,
        "test_start_date": test_start_date,
        "include_weather": include_weather,
        "include_calendar": include_calendar,
        "features_used": feature_cols,
        "num_features": len(feature_cols),
        "validation_strategy": "walk_forward_rolling_origin"
    }

    run, wandb_enabled = setup_wandb(project=project, run_name=run_name, config=wandb_config)

    # 3. Execute Walk-Forward Backtesting
    print(f"\n[INFO] Running Walk-Forward Backtesting for {canonical_name}...")
    df_summary, df_predictions = run_walk_forward_backtest(
        commodity_name=canonical_name,
        horizon=horizon,
        test_start_date=test_start_date,
        window_step_days=window_step_days,
        include_weather=include_weather,
        include_calendar=include_calendar,
        model_type=model_type,
        verbose=True
    )

    if df_summary.empty:
        raise RuntimeError("Backtest returned an empty summary table.")

    # 4. Auto-Model Selection: Identify Lowest WAPE
    df_sorted = df_summary.sort_values("WAPE (%)").reset_index(drop=True)
    best_row = df_sorted.iloc[0]
    best_model_name = str(best_row["Model"])
    best_wape = float(best_row["WAPE (%)"])
    best_mae = float(best_row.get("MAE (Rp)", 0.0))
    best_da = float(best_row.get("Directional Accuracy (%)", 0.0))
    best_picp = float(best_row["PICP (%)"]) if pd.notna(best_row.get("PICP (%)")) else None

    print("\n" + "-" * 65)
    print(f"  [RESULT] Champion Model for {canonical_name}: {best_model_name}")
    print(f"           WAPE: {best_wape:.2f}% | MAE: Rp {best_mae:,.0f} | DA: {best_da:.1f}%")
    if best_picp is not None:
        print(f"           PICP: {best_picp:.1f}% (Coverage of 80% CI)")
    print("-" * 65)

    is_ml_model = any(k in best_model_name.lower() for k in ["lightgbm", "catboost", "xgboost", "ridge"])
    saved_model_path = None

    # 5. Retrain and Register Champion Model if Machine Learning
    if is_ml_model:
        print(f"\n[INFO] Retraining champion {best_model_name} on all historical data...")
        model_obj, feat_imp = train_champion_model(
            model_name=best_model_name,
            feature_cols=feature_cols,
            df_train=df_full
        )

        slug = best_model_name.lower().split()[0].replace("forecaster", "")
        model_filename = f"{slug}_{komoditas_id}_h{horizon}.pkl"
        saved_model_path = MODEL_DIR / model_filename

        with open(saved_model_path, "wb") as f:
            pickle.dump(model_obj, f)
        print(f"[INFO] Champion model binary saved to {saved_model_path}")

        # Feature Importance Plot
        plot_path = MODEL_DIR / f"feat_imp_{komoditas_id}_h{horizon}.png"
        if feat_imp is not None and not feat_imp.empty:
            plot_feature_importance(feat_imp, canonical_name, plot_path)
            if wandb_enabled and run:
                import wandb
                run.log({"Feature Importance": wandb.Image(str(plot_path))})
            if plot_path.exists():
                plot_path.unlink()  # Clean up temp image
    else:
        print(f"[INFO] Baseline model '{best_model_name}' wins. No heavy binary artifact required.")

    # 6. Update Local Registry JSON
    update_local_registry(
        komoditas_id=komoditas_id,
        canonical_name=canonical_name,
        horizon=horizon,
        best_model_name=best_model_name,
        best_wape=best_wape,
        model_path=str(saved_model_path) if saved_model_path else None,
        features=feature_cols
    )
    print(f"[INFO] Updated local model registry at {REGISTRY_FILE}")

    # 7. Log to Weights & Biases
    if wandb_enabled and run:
        import wandb

        # Log all summary metrics per candidate
        for _, row in df_summary.iterrows():
            m_name = row["Model"]
            m_dict = row.drop("Model").to_dict()
            prefixed = {f"{m_name}/{k}": v for k, v in m_dict.items() if pd.notna(v)}
            run.log(prefixed)

        # Log champion metrics to summary
        run.summary["champion_model"] = best_model_name
        run.summary["champion_wape"] = best_wape
        run.summary["champion_mae"] = best_mae
        run.summary["champion_da"] = best_da
        if best_picp is not None:
            run.summary["champion_picp"] = best_picp

        # Log Summary Table
        run.log({"Backtest Summary Table": wandb.Table(dataframe=df_summary)})

        # Log Model Artifact to Registry
        if saved_model_path and saved_model_path.exists():
            artifact = wandb.Artifact(
                name=f"forecast-model-{komoditas_id}-h{horizon}",
                type="model",
                description=f"{best_model_name} for {canonical_name} (H{horizon}, WAPE: {best_wape:.2f}%)",
                metadata={
                    "commodity": canonical_name,
                    "komoditas_id": komoditas_id,
                    "model_name": best_model_name,
                    "wape_pct": best_wape,
                    "mae_rp": best_mae,
                    "features": feature_cols,
                    "horizon": horizon
                }
            )
            artifact.add_file(str(saved_model_path))
            run.log_artifact(artifact, aliases=["latest", "production"])
            print(f"[INFO] Registered model artifact 'forecast-model-{komoditas_id}-h{horizon}' in W&B Registry.")

        run.finish()
        print("[SUCCESS] W&B run completed and synced successfully.")

    return {
        "komoditas_id": komoditas_id,
        "commodity": canonical_name,
        "best_model": best_model_name,
        "wape": best_wape,
        "model_path": str(saved_model_path) if saved_model_path else None
    }


def main():
    parser = argparse.ArgumentParser(description="HargaWatch MLOps Production Training & Registry Pipeline")
    parser.add_argument("--commodity", type=str, default="Cabe Rawit Merah", help="Target commodity name or alias")
    parser.add_argument("--horizon", type=int, default=7, help="Forecasting horizon in days (default: 7)")
    parser.add_argument("--window-step-days", type=int, default=60, help="Backtest rolling origin step in days (default: 60)")
    parser.add_argument("--model-type", type=str, default="all", help="Model family to evaluate ('all', 'gbdt', 'lightgbm', etc.)")
    parser.add_argument("--force-weather", action="store_true", help="Force inclusion of weather features (overrides smart default)")
    parser.add_argument("--force-calendar", action="store_true", help="Force inclusion of calendar features (overrides smart default)")
    parser.add_argument("--no-calendar", action="store_true", help="Force exclusion of calendar features")
    parser.add_argument("--test-start-date", type=str, default="2025-01-01", help="Start date of out-of-sample test window")
    args = parser.parse_args()

    force_cal = None
    if args.force_calendar:
        force_cal = True
    elif args.no_calendar:
        force_cal = False

    run_training_pipeline(
        commodity=args.commodity,
        horizon=args.horizon,
        window_step_days=args.window_step_days,
        model_type=args.model_type,
        force_weather=args.force_weather,
        force_calendar=force_cal,
        test_start_date=args.test_start_date
    )


if __name__ == "__main__":
    main()
