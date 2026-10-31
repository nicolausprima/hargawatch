# Panduan Operasional & Standard Operating Procedure (SOP)
## Pipeline Produksi Harian HargaWatch Surabaya

Dokumen ini adalah **SOP resmi dan Runbook Operasional** untuk menjalankan, memonitor, dan memelihara pipeline data, peramalan harga pangan (*forecasting*), serta sistem peringatan dini adaptif (*Adaptive Early Warning System*) Kota Surabaya.

---

## 1. Arsitektur & Alur Kerja Harian

Pipeline operasional berjalan setiap hari secara otomatis tanpa intervensi manual melalui skrip master **`run_pipeline.bat`** yang mengorkestrasi file **`scripts/run_daily_pipeline.py`**.

```mermaid
flowchart TD
    subgraph Eksekusi Pagi [Pukul 06:00 AM WIB]
        Bat[run_pipeline.bat] --> PyMaster[scripts/run_daily_pipeline.py]
    end

    subgraph Tahap 1: Data Engineering & Ingestion
        PyMaster -->|Step 1| S1[scripts/update_harian.py]
        S1 -->|RobustDataFetcher Auto-Retry| Web[SISKAPERBAPO Jatim]
        S1 -->|Forward-Fill Imputation| Silver[(Supabase: fact_harga_pasar & fact_harga_produsen)]
    end

    subgraph Tahap 2: AI Forecasting & Adaptive EWS
        PyMaster -->|Step 2| S2["scripts/run_forecasting.py --from-db"]
        S2 -->|Model Champion Registry| ModelDir[models/forecasting/registry.json]
        S2 -->|Prediksi 14 Hari & EWS Adaptif 4-Pilar| Gold[(Supabase: fact_forecast & fact_early_warning)]
    end

    subgraph Tahap 3: Observability & Alerting
        PyMaster -->|Step 3| S3[scripts/generate_daily_alerts.py]
        S3 -->|Filter Status WASPADA & TINGGI| Telegram[Bot Telegram Satgas Pangan]
    end

    subgraph Monitoring
        PyMaster --> LogFile[(logs/daily_pipeline.log)]
    end
```

### Estimasi Waktu Eksekusi (Benchmark Aktual CPU Lokal):
* **Step 1 (Scraping, Fetcher Retry, & Ingest):** ~30 – 45 detik
* **Step 2 (Forecasting 14 Hari & Adaptive EWS Scoring):** ~1,5 – 2 menit *(memproses proyeksi multi-horizon & 42 matriks risiko pasar)*
* **Step 3 (Telegram Alerting & Evaluation):** ~2 – 5 detik
* **Total Waktu Pipeline:** **± 2 hingga 2,5 menit saja.**

---

## 2. Setup Awal Runner Baru (One-Time Setup)

Jika pipeline hendak dijalankan di laptop baru atau rekan tim baru mengambil alih peran runner, lakukan 3 langkah awal ini satu kali saja:

### Langkah 1: Siapkan Python Virtual Environment
Buka terminal PowerShell pada direktori proyek `hargawatch-surabaya`:
```powershell
# 1. Buat virtual environment
python -m venv .venv

# 2. Install seluruh dependencies yang dibutuhkan
.\.venv\Scripts\pip install -r requirements.txt
```

### Langkah 2: Konfigurasi File Lingkungan (`.env`)
Salin file `.env.example` menjadi `.env` di folder utama proyek:
```powershell
copy .env.example .env
```
Buka file `.env` dan pastikan variabel-variabel kunci berikut terisi:
```env
# Koneksi Database Supabase (Wajib)
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_KEY=eyJh...
SUPABASE_HOST=aws-0-ap-southeast-1.pooler.supabase.com
SUPABASE_PORT=6543
SUPABASE_USER=postgres.xxxxxxxxxxxx
SUPABASE_PASSWORD=password_database_anda
DATABASE_URL=postgresql://postgres.xxx:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres

# Notifikasi Telegram (Wajib jika ingin menerima alert krisis di HP)
TELEGRAM_BOT_TOKEN=token_bot_anda
TELEGRAM_CHAT_ID=id_grup_atau_channel_anda

# MLOps Weights & Biases (Opsional, sudah ada fallback lokal offline)
WANDB_API_KEY=kunci_api_wandb_anda
WANDB_PROJECT=hargawatch-surabaya
```

### Langkah 3: Ekspor Model Champion & Sinkronisasi Registri
Agar proses forecasting harian berjalan instan tanpa perlu melatih ulang dari nol setiap pagi, seluruh artefak model biner (`.pkl`) dan konfigurasinya telah terdaftar di `models/forecasting/registry.json`.

Jika ingin melatih ulang atau memperbarui model champion untuk seluruh **38 komoditas**:
```powershell
# Jalankan retraining & benchmark paralel multi-core:
.\.venv\Scripts\python scripts/run_parallel_commodity_experiments.py --workers 4
```
Perintah ini akan secara otomatis:
1. Melatih arsitektur champion terpilih (*LightGBM*, *CatBoost*, *XGBoost*, atau *Naive Last Value / SMA*) pada data historis lengkap.
2. Menyimpan artefak model biner ke folder `models/forecasting/`.
3. Memperbarui registri model champion `models/forecasting/registry.json` dan metadata `config/commodities.json`.

---

## 3. Otomatisasi Harian dengan Windows Task Scheduler

Agar laptop/server menjalankan scraping dan peramalan secara otomatis setiap hari tanpa perlu membuka VSCode atau Terminal:

### Metode Cepat: Otomasi PowerShell (Direkomendasikan)
Cukup buka PowerShell sebagai **Administrator** di folder proyek, lalu jalankan:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup_task_scheduler.ps1
```
Skrip ini akan secara otomatis mendaftarkan task harian bernama `HargaWatch_Daily_Pipeline` pada pukul **06:00 AM WIB** lengkap dengan opsi anti-gagal (*run as soon as possible after missed*).

### Metode Manual (GUI Windows):
1. Tekan tombol **Windows + R** pada keyboard, ketik **`taskschd.msc`** lalu tekan **Enter**.
2. Pada panel sebelah kanan (*Actions*), klik **Create Basic Task...**
   * **Name:** `HargaWatch_Daily_Pipeline`
   * **Trigger:** Daily (Harian), atur jam **06:00:00 AM**.
   * **Action:** Start a program.
   * **Program/script:** Pilih file batch:
     ```text
     D:\...\hargawatch-surabaya\run_pipeline.bat
     ```
   * **Start in (optional) — WAJIB DIISI:** Masukkan path absolut folder proyek Anda (tanpa tanda kutip), contoh:
     ```text
     D:\ARFI\Kuliah\Project\project-semester5\hargawatch-surabaya
     ```
3. **Pengaturan Anti-Gagal (Tab Settings):**
   * Klik ganda task yang baru dibuat.
   * Centang opsi: **`Run task as soon as possible after a scheduled start is missed`**.
   * *Manfaat:* Jika laptop mati pada jam 06:00 pagi dan baru dinyalakan jam 08:00, Windows akan **langsung otomatis mengejar eksekusi pipeline**.

---

## 4. Pengecekan Kesehatan Harian (Daily Health Check)

Setelah jam 06:00 pagi (atau setelah laptop dinyalakan), lakukan pengecekan sederhana untuk memastikan pipeline berjalan sempurna:

1. Buka folder **`logs/`** di proyek Anda.
2. Buka file **`daily_pipeline.log`** menggunakan Notepad / VSCode.
3. Gulir ke baris paling bawah. Pastikan terdapat teks keberhasilan:
   ```text
   =================================================================
     ALL DAILY PIPELINE TASKS COMPLETED SUCCESSFULLY (xx.xs)
   =================================================================
   [FINISHED] Exit code: 0 at ...
   ```
4. **Tanda Setiap Tahap Berhasil:**
   * `--- SUCCESS: DATA_SCRAPING ---` ➔ Data 6 pasar berhasil ditarik via `RobustDataFetcher` & di-upsert ke Supabase (`fact_harga_pasar`).
   * `--- SUCCESS: FORECASTING_AND_EWS ---` ➔ Prediksi 14 hari & matriks risiko EWS 4-pilar terunggah ke Supabase (`fact_forecast` & `fact_early_warning`).
   * `--- SUCCESS: DISPATCH_TELEGRAM_ALERTS ---` ➔ Evaluasi anomali selesai (mengirim alert jika ada status WASPADA/TINGGI).

---

## 5. Panduan Tanggap Darurat (Troubleshooting Runbook)

### Kasus A: Server SISKAPERBAPO Sedang Down / Timeout
* **Gejala:** Step scraping mengeluarkan log timeout atau gagal mengambil tanggal kemarin.
* **Solusi Otomatis:** Scraper menggunakan [`RobustDataFetcher`](file:///d:/ARFI/Kuliah/Project/project-semester5/hargawatch-surabaya/src/pipeline/fetcher.py) yang melakukan *auto-retry 3 kali* dengan *exponential backoff*. Jika seluruh retry gagal, sistem menerapkan *bounded forward-fill* (limit 7 hari) sehingga data deret waktu tidak akan berlubang.
* **Solusi Manual (Catch-Up):** Begitu server SISKAPERBAPO kembali pulih pada siang/sore hari, jalankan skrip pengisian tanggal tertinggal:
  ```powershell
  .\.venv\Scripts\python scripts/update_catchup.py
  ```

### Kasus B: Koneksi Internet Lambat / Supabase Timeout
* **Gejala:** Log mencetak peringatan koneksi database.
* **Solusi:** 
  1. Modul [`src/utils/ingest_supabase.py`](file:///d:/ARFI/Kuliah/Project/project-semester5/hargawatch-surabaya/src/utils/ingest_supabase.py) memiliki *automatic port fallback* (mencoba port 6543 Transaction Pooler, lalu otomatis berpindah ke port 5432 Session Pooler jika terjadi kegagalan koneksi).
  2. Sistem juga dilengkapi *Local CSV Caching*. Prediksi forecasting akan otomatis menggunakan data cadangan lokal `data/processed/fact_harga_pasar.csv` tanpa menghentikan pipeline (*zero-downtime*).

### Kasus C: Notifikasi Telegram Gagal Terkirim
* **Gejala:** Log mencetak `[Alerting] [FAILED] Gagal mengirim notifikasi Telegram`.
* **Solusi:** 
  1. Periksa apakah `TELEGRAM_BOT_TOKEN` atau `TELEGRAM_CHAT_ID` di file `.env` sudah benar.
  2. Perlu diingat bahwa error Telegram bersifat **Non-Fatal**. Data prediksi dan EWS tetap aman tersimpan di Supabase dan dashboard analitik tetap berjalan normal.

### Kasus D: Uji Coba Manual Cepat (Sanity Check)
Jika Anda ingin mengetes apakah seluruh alur berjalan lancar tanpa menunggu jadwal Task Scheduler:
* Cukup lakukan **klik ganda (*double-click*) pada file `run_pipeline.bat`**, atau jalankan di terminal:
  ```cmd
  run_pipeline.bat
  ```

---

## 6. Pemeliharaan Model AI Berkala (Periodic Retraining)

Dalam operasional harian, model `.pkl` yang sudah tersimpan **tidak perlu di-retrain setiap hari** karena model pohon (*GBDT*) bersifat *stateless* dan menerima harga terbaru melalui *lag features*.

### Kapan Perlu Retraining Ulang?
* **Rekomendasi:** Cukup **1 bulan sekali** atau **3 bulan sekali**.
* **Kondisi Khusus:** Jika terjadi perubahan harga ekstrem yang mengubah struktur ekonomi makro (misalnya kenaikan harga BBM nasional atau perubahan drastis HET pangan pemerintah).

### Cara Melakukan Retraining:
Jalankan runner eksperimen paralel multi-core di terminal:
```powershell
python scripts/run_parallel_commodity_experiments.py --workers 4 --force-all
```
Skrip ini akan menelan seluruh riwayat harga mutakhir, melatih model dengan bobot terbaru, dan memperbarui seluruh file `.pkl` di folder `models/forecasting/` serta file `models/forecasting/registry.json`.

### SOP Verifikasi SHA-256 & Keamanan Model (.pkl)
Setiap kali model champion selesai dilatih atau diperbarui, digest integritas SHA-256 wajib dihitung dan dicatat di `models/forecasting/registry.json`:
```powershell
python scripts/update_registry_hashes.py
```
* Pipeline produksi `scripts/run_forecasting.py` menerapkan prinsip *fail-closed*: model non-Naive tanpa SHA-256 yang cocok akan langsung ditolak sebelum `pickle.load` dipanggil.
* Ke-10 file biner champion `.pkl` disimpan di dalam Git tracking sebagai artefak terverifikasi (*audited blobs*).

### SOP Integritas Data & Manifest Provenance
* Dataset di produksi tidak pernah memakai mock secara senyap (*zero silent mock fallback*).
* File cache lokal di `data/processed/` dilengkapi manifest tanda terima `.manifest.json` (SHA-256, `max_tanggal`, `row_count`).
* Untuk memperbarui manifest secara manual:
```powershell
python -c "from src.analytics.features import write_dataset_manifest; write_dataset_manifest()"
```

---

## 7. Rangkuman Perintah Cepat (Cheat Sheet)

| Kebutuhan Operasional | Perintah Terminal |
| :--- | :--- |
| **Menjalankan Pipeline Lengkap Harian** | `run_pipeline.bat` |
| **Menjalankan Hanya Scraping & Ingest Supabase** | `.\.venv\Scripts\python scripts/update_harian.py` |
| **Menjalankan Hanya Forecasting & EWS Adaptif** | `.\.venv\Scripts\python scripts/run_forecasting.py --from-db` |
| **Menjalankan Simulasi Lokal (Tanpa Sentuh Cloud)** | `.\.venv\Scripts\python scripts/run_forecasting.py --local-only --horizon 7` |
| **Mengevaluasi & Mengirim Alert Telegram** | `.\.venv\Scripts\python scripts/generate_daily_alerts.py` |
| **Mengejar Tanggal Data yang Tertinggal** | `.\.venv\Scripts\python scripts/update_catchup.py` |
| **Melatih Ulang 38 Model Champion (Paralel)** | `python scripts/run_parallel_commodity_experiments.py --workers 4` |
| **Menghitung & Memperbarui SHA-256 Registry** | `python scripts/update_registry_hashes.py` |
| **Memperbarui Provenance Manifest Cache CSV** | `python -c "from src.analytics.features import write_dataset_manifest; write_dataset_manifest()"` |
| **Memasang Otomasi Windows Task Scheduler** | `powershell -ExecutionPolicy Bypass -File scripts/setup_task_scheduler.ps1` |
| **Menjalankan Seluruh Unit Test Suite (90 Tests)** | `.\.venv\Scripts\pytest tests/` |
