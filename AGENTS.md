# AGENTS.md — HargaWatch Surabaya

Operational contract, engineering conventions, system constraints, and verification protocols for AI coding agents working on the **HargaWatch Surabaya** repository.

---

## 1. Purpose & System Boundaries

HargaWatch Surabaya is a food price intelligence and early warning platform for the city of Surabaya. The platform ingests daily market prices across 6 strategic markets (Pasar Induk Keputran, Wonokromo, Genteng, Pucang Anom, Tambahrejo, Soponyono) for 37 food commodities (derived from the 38-commodity SISKAPERBAPO regional benchmark by de-duplicating generic garlic ID 3 in favor of imported garlic ID 49; IDs are non-sequential up to ID 96), detects anomalies, forecasts multi-step price trajectories (H=1..14), and evaluates risk via an adaptive 4-pillar Early Warning System (EWS).

Treat the current repository, existing tests, operational configs, and explicit user requirements as sources of truth. Never invent project behavior, fake test commands, or claim verification without observed execution logs.

---

## 2. Repository Map

```text
hargawatch-surabaya/
├── AGENTS.md                  # Project-wide agent rules and document index
├── config/                    # Non-secret configuration (commodities.json, config.yaml)
├── src/
│   ├── pipeline/              # Ingestion, robust fetcher, cleaner, scrapers
│   ├── models/                # Forecast engine, backtesting, anomaly detector, training
│   ├── safety/                # Adaptive 4-pillar Early Warning System (EWS)
│   └── utils/                 # Alert masking, database connection, migration helpers
├── scripts/                   # Daily CLI runners (run_daily_pipeline.py, run_forecasting.py)
├── models/                    # Model registry (forecasting/registry.json) and verified champion blobs (.pkl)
├── tests/                     # Deterministic unit and integration test suite (pytest)
├── docs/                      # Technical specifications, PRDs, runbooks, and methodologies
└── web/                       # Frontend web application (Next.js 15, React 19, Tailwind CSS v4)
    └── AGENTS.md              # Frontend-specific agent instructions
```

---

## 3. Agent Working Process

1. **Working Tree & Status:** Inspect `git status` and branch before editing. Never discard uncommitted user changes.
2. **Context Discovery:** Read relevant sections of code, tests, and configurations before modifying logic.
3. **Targeted Documentation:** Consult `docs/*.md` references only when the task touches that specific domain (see Section 4).
4. **Smallest Coherent Change:** Keep diffs minimal and strictly in-scope. Do not perform unrequested refactors or change unrelated files.
5. **Deterministic Verification:** Run the project's native test commands and report actual verbatim outputs.
6. **Completion Report:** Summarize what was implemented, what was tested with actual commands, and what remains unverified.

---

## 4. Documentation References (Contextual Reading Triggers)

Read documents only when relevant to the task. Verify that a file exists before relying on it; never invent contents.

| Document | When to Read |
|---|---|
| [`README.md`](./README.md) & [`README_dev.md`](./README_dev.md) | Initial repository onboarding, setup instructions, or environment setup. |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Modifying component boundaries, data layer interactions, or Supabase database integration. |
| [`docs/PRD_HargaWatch_v2.md`](./docs/PRD_HargaWatch_v2.md) | Adding or modifying functional requirements, user stories, or platform metrics. |
| [`docs/forecasting_methodology.md`](./docs/forecasting_methodology.md) | Touching feature engineering, GBDT multi-step quantiles, lead features, or model training. |
| [`docs/EWS_methodology.md`](./docs/EWS_methodology.md) | Modifying composite 4-pillar risk scores, alert thresholds, or disparity calculations. |
| [`docs/panduan_operasional.md`](./docs/panduan_operasional.md) | Troubleshooting daily cron execution, Windows Task Scheduler, or database upsert routines. |
| [`docs/klasifikasi_hasil_forecasting.md`](./docs/klasifikasi_hasil_forecasting.md) | Reviewing champion model selection, WAPE benchmark results, or commodity taxonomy. |

---

## 5. Architectural & System Constraints

1. **Scraping Infrastructure (Cloudflare WAF Block):**
   * SISKAPERBAPO blocks datacenter IPs (HTTP 403 Forbidden).
   * **Do NOT move scraping to GitHub Actions.** Daily ingestion is strictly On-Premise via Windows Task Scheduler executing `scripts/run_daily_pipeline.py`.
2. **Model Deserialization Security:**
   * Any loading of `.pkl` files in `scripts/run_forecasting.py` must enforce directory path containment strictly within `MODEL_DIR` (`resolved_path.is_relative_to(MODEL_DIR.resolve())`) and enforce mandatory SHA-256 integrity digests against `models/forecasting/registry.json` for all non-Naive champion models (fail-closed before `pickle.load`). The 10 champion `.pkl` blobs are tracked in Git as verified model artifacts.
3. **Database Security & Access Control:**
   * PostgreSQL tables in Supabase (`fact_forecast`, `fact_early_warning`, `fact_harga_pasar`) have Row-Level Security (RLS) enabled.
   * Client-side queries use the public anonymous/publishable key (`sb_publishable_...`). Ingestion and administrative mutations use the private service role key strictly from local `.env`.
4. **Alert Privacy:**
   * Telegram Bot tokens must never be logged in exception traces. Always mask via `[REDACTED_BOT_TOKEN]` (see `src/utils/utils_alerting.py`).

---

## 6. Data Science & Machine Learning Integrity

Apply these rules whenever editing data preprocessing, feature engineering, modeling, or evaluation:

1. **Zero Lookahead Bias:**
   * Never use backward-fill (`bfill`), centered rolling windows, or interpolation on target or price features.
   * Forward-fill is strictly limited to 7 days: `ffill(limit=7)`. Missing prices beyond 7 days remain `NaN`.
   * All rolling statistics (`rolling_mean`, `rolling_std`, `rolling_max`) must be strictly left-aligned using `.shift(1)`.
2. **Wholesale Transmission Features:**
   * High-volatility commodities require lead prices from Pasar Induk Keputran (`keputran_price_lag_1`, `lag_2`, `lag_3`).
3. **Baseline Comparison:**
   * Every model evaluation must be compared against the Naive Last Value Persistence baseline under identical walk-forward backtesting splits.
   * Commodities where Naive outperforms ML (WAPE < 1%, e.g., Beras, Minyak Goreng Curah) must use Naive champion strategy.
4. **Training-Serving Skew Elimination:**
   * Preprocessing and feature construction logic must be imported from `src/pipeline/ingestion.py` and `src/analytics/features.py`. Do not duplicate transformations between offline notebooks and production scripts.
5. **Fail-Closed Data Integrity:**
   * Production datasets never fall back silently to synthetic/mock data. If DB and local CSV cache are unavailable, pipeline raises `RuntimeError`. Mock data is strictly gated behind `HARGAWATCH_ALLOW_MOCK=1` for offline CI testing.
   * Local CSV caches maintain `.manifest.json` provenance with SHA-256, row counts, and staleness checks (>24h warning).

---

## 7. Testing & Verification Protocols

Run tests before declaring any task complete. Never skip, delete, or weaken assertions to make a test pass.

### Backend & ML Verification Commands
```bash
# Activate virtual environment
.venv\Scripts\activate   # Windows
# source .venv/bin/activate # Linux/macOS

# Run complete test suite (90 unit and integration tests)
pytest tests/ -v

# Run targeted test suites
pytest tests/test_ews_adaptive.py -v
pytest tests/test_forecast_engine.py -v
pytest tests/test_anomaly_detector.py -v

# Smoke test daily pipeline execution (dry-run / live)
python scripts/run_daily_pipeline.py
```

### Frontend Verification Commands (Run in `web/`)
```bash
cd web
npm run build             # Must compile successfully (8/8 static pages)
npm audit --audit-level=high  # Must report 0 vulnerabilities
```

---

## 8. Security & Risky Operations

* **Secrets & Environment:** Never print, log, or commit `.env` or credential files.
* **Database Mutations:** Never execute `DROP TABLE` or destructive database schema migrations without explicit confirmation.
* **Git Operations:** Never execute `git push --force`, `git reset --hard` on remote branches, or commit directly to `main`.
* **CI/CD Scope:** GitHub Actions workflow (`.github/workflows/ci.yml`) runs automated tests with `permissions: contents: read` and does not require production secrets.

---

## 9. Definition of Done & Completion Report

When reporting task completion, include:
1. **Summary of Changes:** Specific files modified and architectural rationale.
2. **Verification Evidence:** Exact commands executed and their output (e.g. `90 passed in 60.88s`, `npm run build: 8/8 static pages`).
3. **Unverified Aspects:** Explicitly state any checks that were skipped or not possible to run locally.
4. **Git Branch & Commit Status:** Current branch, commit hash, and whether changes have been pushed to origin.
