"""Master Daily Pipeline Orchestrator for HargaWatch Surabaya.

Executes the sequential daily production workflow:
  Step 1: Scrape & Ingest latest market & producer prices (`scripts/update_harian.py`)
  Step 2: Freshness check & automatic catch-up if stale (`scripts/update_catchup.py`)
  Step 3: Generate 14-day forecasts & EWS risk matrices (`scripts/run_forecasting.py --from-db`)
  Step 4: Dispatch Telegram alerts (`scripts/generate_daily_alerts.py`)

Designed to be invoked by Windows Task Scheduler (via run_pipeline.bat)
or Linux cron jobs.
"""

import argparse
import datetime
import os
import subprocess
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = BASE_DIR / "scripts"
PYTHON_EXE = sys.executable


def log(msg: str):
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] {msg}", flush=True)


def run_step(step_name: str, cmd: list) -> bool:
    """Executes a subprocess step, streaming output in real-time."""
    log(f"--- STARTING: {step_name} ---")
    log(f"Command: {' '.join(cmd)}")
    start_time = time.time()

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    proc = subprocess.Popen(
        cmd,
        cwd=str(BASE_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )

    for line in iter(proc.stdout.readline, ""):
        try:
            print(f"  [{step_name}] {line.rstrip()}", flush=True)
        except UnicodeEncodeError:
            safe_line = line.rstrip().encode("ascii", errors="replace").decode("ascii")
            print(f"  [{step_name}] {safe_line}", flush=True)

    proc.stdout.close()
    return_code = proc.wait()
    duration = time.time() - start_time

    if return_code == 0:
        log(f"--- SUCCESS: {step_name} (completed in {duration:.1f}s) ---\n")
        return True
    else:
        log(f"--- ERROR: {step_name} failed with exit code {return_code} (took {duration:.1f}s) ---\n")
        return False


def check_data_freshness_and_catchup(
    max_stale_days: int = 3,
    get_conn_fn=None,
    run_catchup_fn=None
) -> bool:
    """Verifies that fact_harga_pasar is not stale (> max_stale_days behind today).
    
    If stale, triggers update_catchup.py.
    Returns True if data is fresh, False if stale and catchup failed/data remains stale.
    """
    log("--- CHECKING DATA FRESHNESS ---")
    today = datetime.datetime.now().date()
    max_date = None

    if get_conn_fn is None:
        try:
            from src.utils.ingest_supabase import koneksi
            get_conn_fn = koneksi
        except Exception as e:
            log(f"[WARN] Unable to import Supabase connection helper: {e}")

    if get_conn_fn:
        try:
            conn = get_conn_fn()
            cur = conn.cursor()
            cur.execute("SELECT MAX(tanggal) FROM fact_harga_pasar")
            res = cur.fetchone()
            if res and res[0]:
                max_date = res[0]
                if isinstance(max_date, str):
                    max_date = datetime.date.fromisoformat(max_date[:10])
                elif isinstance(max_date, datetime.datetime):
                    max_date = max_date.date()
            conn.close()
        except Exception as e:
            log(f"[WARN] Failed to query max(tanggal) from database: {e}")

    # Fallback to local CSV if DB query was not available
    if max_date is None:
        csv_path = BASE_DIR / "data" / "processed" / "fact_harga_pasar.csv"
        if csv_path.exists():
            try:
                import pandas as pd
                df_sample = pd.read_csv(csv_path, usecols=["tanggal"], parse_dates=["tanggal"])
                if not df_sample.empty:
                    max_date = df_sample["tanggal"].max().date()
            except Exception as e:
                log(f"[WARN] Failed to read local CSV date: {e}")

    if max_date is None:
        log("[ERROR] Unable to determine max date of fact_harga_pasar.")
        return False

    lag_days = (today - max_date).days
    log(f"Latest market data date: {max_date} (Lag: {lag_days} days, Stale Threshold: {max_stale_days} days)")

    if lag_days > max_stale_days:
        log(f"[WARNING] Data is stale by {lag_days} days (> {max_stale_days} days). Triggering catch-up...")
        
        catchup_success = False
        if run_catchup_fn:
            catchup_success = run_catchup_fn()
        else:
            catchup_cmd = [PYTHON_EXE, str(SCRIPTS_DIR / "update_catchup.py")]
            catchup_success = run_step("DATA_CATCHUP", catchup_cmd)

        if not catchup_success:
            log("[FATAL] Data catch-up failed. Aborting pipeline to prevent forecasting on stale data.")
            try:
                from src.utils.utils_alerting import send_telegram_alert
                send_telegram_alert(
                    f"🚨 *[HargaWatch Freshness Alert]*\n"
                    f"Data harga pasar basi ({lag_days} hari tertinggal, terakhir: {max_date}).\n"
                    f"Catch-up otomatis GAGAL. Pipeline forecasting dibatalkan demi keamanan data."
                )
            except Exception:
                pass
            return False

        # Re-verify freshness after catch-up
        if get_conn_fn:
            try:
                conn = get_conn_fn()
                cur = conn.cursor()
                cur.execute("SELECT MAX(tanggal) FROM fact_harga_pasar")
                res = cur.fetchone()
                if res and res[0]:
                    new_max = res[0]
                    if isinstance(new_max, str):
                        new_max = datetime.date.fromisoformat(new_max[:10])
                    elif isinstance(new_max, datetime.datetime):
                        new_max = new_max.date()
                    if (today - new_max).days > max_stale_days:
                        log(f"[FATAL] Data remains stale after catch-up ({new_max}). Aborting pipeline.")
                        return False
                conn.close()
            except Exception:
                pass

    log("[INFO] Data freshness check PASSED.")
    return True


def main():
    parser = argparse.ArgumentParser(description="HargaWatch Surabaya - Daily Production Pipeline Runner")
    parser.add_argument("--tanggal", type=str, default=None, help="Target date YYYY-MM-DD for scraping (default: yesterday)")
    parser.add_argument("--skip-scrape", action="store_true", help="Skip the scraping step")
    parser.add_argument("--skip-forecast", action="store_true", help="Skip the forecasting step")
    parser.add_argument("--local-only", action="store_true", help="Do not upsert forecasting/EWS to Supabase")
    parser.add_argument("--horizon", type=int, default=14, help="Forecast horizon in days (default: 14)")
    args = parser.parse_args()

    overall_start = time.time()
    log("=================================================================")
    log("  HARGAWATCH SURABAYA - DAILY PRODUCTION PIPELINE EXECUTION")
    log("=================================================================")

    # Step 1: Scrape & Ingest Data
    if not args.skip_scrape:
        scrape_cmd = [PYTHON_EXE, str(SCRIPTS_DIR / "update_harian.py")]
        if args.tanggal:
            scrape_cmd.extend(["--tanggal", args.tanggal])

        success_scrape = run_step("DATA_SCRAPING", scrape_cmd)
        if not success_scrape:
            log("[FATAL] Data scraping failed. Aborting downstream forecasting to prevent stale predictions.")
            sys.exit(1)
    else:
        log("[INFO] Skipping data scraping step as requested (--skip-scrape).")

    # Step 2: Verify Data Freshness & Catch-up before Forecasting
    if not args.skip_forecast:
        is_fresh = check_data_freshness_and_catchup(max_stale_days=3)
        if not is_fresh:
            log("[FATAL] Pipeline stopped because market price data is stale and catch-up could not resolve it.")
            sys.exit(1)

    # Step 3: Forecasting & Early Warning Scoring
    if not args.skip_forecast:
        forecast_cmd = [
            PYTHON_EXE,
            str(SCRIPTS_DIR / "run_forecasting.py"),
            "--horizon",
            str(args.horizon),
            "--from-db",
            "--all-commodities",
        ]
        if args.local_only:
            forecast_cmd.append("--local-only")

        success_forecast = run_step("FORECASTING_AND_EWS", forecast_cmd)
        if not success_forecast:
            log("[ERROR] Forecasting step encountered errors.")
            sys.exit(2)
    else:
        log("[INFO] Skipping forecasting step as requested (--skip-forecast).")

    # Step 4: Dispatch Telegram Alerts
    if not args.skip_forecast:
        alert_cmd = [PYTHON_EXE, str(SCRIPTS_DIR / "generate_daily_alerts.py")]
        success_alert = run_step("DISPATCH_TELEGRAM_ALERTS", alert_cmd)
        if not success_alert:
            log("[WARNING] Alert dispatcher encountered errors (Non-fatal).")

    total_duration = time.time() - overall_start
    log("=================================================================")
    log(f"  ALL DAILY PIPELINE TASKS COMPLETED SUCCESSFULLY ({total_duration:.1f}s)")
    log("=================================================================")
    sys.exit(0)


if __name__ == "__main__":
    main()
