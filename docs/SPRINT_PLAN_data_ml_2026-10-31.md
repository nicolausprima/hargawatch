# Rencana 2 Sprint: Data Asli & Machine Learning (Draft Revisi)

> Draft rencana kerja. Dasar: `audit_claude_2026-10-31.md`.
> Status: **draft, belum dikerjakan**. Tidak ada kode yang diubah.

## Tujuan

- **Sprint 1:** semua data yang dikonsumsi sistem adalah data riil. Tidak ada mock di jalur produksi, cache lokal punya jejak asal-usul, dan fallback harga tidak menyesatkan.
- **Sprint 2:** model `.pkl` hanya dimuat jika terverifikasi (path dan SHA-256), dan angka performa model di UI berasal dari registry.

## Prinsip

1. **Fail-closed:** jika data atau model tidak bisa diverifikasi, pipeline berhenti dan mengirim alert. Tidak ada fallback diam-diam.
2. Setiap item punya **Definition of Done (DoD)** berupa tes atau bukti yang bisa dijalankan.
3. Ikuti aturan `AGENTS.md`: tanpa lookahead bias, `ffill(limit=7)`, scraping tetap on-premise.

---

## Sprint 1: Integritas Data Asli & Keandalan Pipeline

### 1.1 Pindahkan mock ke fixture, lalu fail-fast di produksi

- **Lokasi:** `src/analytics/features.py` (`generate_mock_raw_datasets`, ±baris 19 dan 113), `tests/conftest.py`
- **Masalah:** jika DB gagal dan `fact_harga_pasar.csv` tidak ada, `load_raw_datasets()` memakai data sinus sintetis (F-07).
- **Urutan kerja (penting):**
  1. Cek tes yang bergantung pada fallback mock (`grep generate_mock_raw_datasets`, `load_raw_datasets`).
  2. Pindahkan generator mock ke `tests/` (fixture di `conftest.py`) atau ke flag eksplisit `HARGAWATCH_ALLOW_MOCK=1`.
  3. Setelah tes aman, hapus jalur mock dari produksi. Ganti dengan `RuntimeError` yang jelas.
  4. Pastikan runner (`run_daily_pipeline.py`, `run_forecasting.py`) menangkap error ini lalu mengirim alert Telegram (token tetap di-mask).
- **DoD:**
  - [ ] Tes: tanpa DB dan tanpa CSV, `load_raw_datasets()` melempar error (bukan mengembalikan data).
  - [ ] Tes: mock hanya aktif jika flag opt-in diset.
  - [ ] `pytest tests/ -v` tetap hijau.

### 1.2 Manifest provenance & pengecekan usia cache CSV

- **Lokasi:** `src/analytics/features.py`, `data/processed/`, skrip yang menulis CSV
- **Masalah:** CSV lokal tidak punya tanggal ekspor/checksum dan bisa berbeda dari Supabase live (F-10).
- **Pekerjaan:**
  - Tulis `data/processed/.manifest.json` setiap CSV diekspor: `last_synced_at`, `max_tanggal`, `row_count`, `sha256` per file.
  - Saat loader membaca CSV: tampilkan peringatan jika `last_synced_at` > 24 jam atau `max_tanggal` tertinggal.
  - Jika manifest tidak ada, beri peringatan eksplisit "provenance tidak diketahui".
- **Catatan:** `data/processed/*` ada di `.gitignore` (kecuali dim_*). Manifest ikut tidak ter-track dan itu benar karena bersifat lokal.
- **DoD:**
  - [ ] Tes: manifest ditulis dengan field lengkap.
  - [ ] Tes: cache berumur > 24 jam memicu peringatan.
  - [ ] Opsional: laporan perbedaan CSV vs Supabase (jumlah baris dan `max_tanggal` per tabel).

### 1.3 Perbaiki fallback harga pada simulasi belanja (REVISI)

- **Lokasi:** `web/src/lib/dataService.ts` (±baris 1647, 1704, 1726), `web/src/app/page.tsx`
- **Masalah:** harga yang tidak ditemukan diganti Rp15.000 atau rerata tanpa label (F-06).
- **Keputusan revisi:** **jangan memakai HAP/HET sebagai pengganti.** HAP/HET adalah batas regulasi, bukan harga pasar. Pemakaiannya bias ke atas dan datanya belum konsisten antarhalaman (F-04).
- **Pekerjaan:**
  - Pakai **harga terakhir yang tersedia** untuk komoditas dan pasar tersebut, dengan batas umur ≤ 7 hari (sejalan dengan `ffill(limit=7)`).
  - Jika tidak ada, **keluarkan item dari total** dan tampilkan "harga belum tersedia". Hapus konstanta `15000`.
  - Beri label "estimasi" pada harga hasil carry-forward dan bawa flag `is_imputed` sampai UI.
  - Bersihkan hasil simulasi lama saat input berubah atau request gagal (F-08).
- **DoD:**
  - [ ] Tidak ada literal `15000` tersisa di `dataService.ts`.
  - [ ] Item tanpa harga tidak masuk total dan ranking.
  - [ ] Harga carry-forward tampil dengan label estimasi di UI.
  - [ ] `npm run build` dan `npm run lint` lolos.

### 1.4 Guardrail freshness di master runner

- **Lokasi:** `scripts/run_daily_pipeline.py`, memanfaatkan `scripts/update_catchup.py` yang **sudah ada**
- **Pekerjaan:**
  - Sebelum forecasting, ambil `max(tanggal)` dari `fact_harga_pasar`. Jika tertinggal > 3 hari, panggil logika catch-up.
  - Jika catch-up gagal atau data tetap basi, **hentikan pipeline** dan kirim alert (jangan meramal dari data basi).
  - Gunakan kembali alert Telegram yang sudah ada di `update_catchup.py`.
- **DoD:**
  - [ ] Tes dengan klien DB/tanggal ter-mock: data basi memicu catch-up.
  - [ ] Tes: catch-up gagal menghentikan pipeline dengan exit code non-zero.

### Urutan kerja Sprint 1

`1.1 (mock ke fixture) → 1.1 (fail-fast) → 1.2 (manifest) → 1.4 (freshness) → 1.3 (UI keranjang)`

---

## Sprint 2: Keamanan, Validasi & Sinkronisasi Model ML

### 2.1 Checksum SHA-256 di model registry (fail-closed)

- **Lokasi:** `models/forecasting/registry.json`, `src/models/train_production.py`, `scripts/run_parallel_commodity_experiments.py`
- **Masalah:** 0 dari 37 entri punya `sha256`, jadi validasi integritas tidak pernah jalan.
- **Fakta yang perlu diperhatikan:** hanya 10 file `.pkl` ada di repo, sisanya entri Naive yang tidak punya blob.
- **Aturan:**
  - Model **non-Naive wajib punya `sha256`**. Loader menolak entri non-Naive tanpa hash (tidak dilewati).
  - Entri Naive tidak memerlukan hash.
- **Pekerjaan:**
  - Buat utilitas (mis. `scripts/update_registry_hashes.py`) yang menghitung SHA-256 semua `.pkl` champion dan menulisnya ke registry.
  - Perbarui pipeline training agar hash tercatat otomatis saat model diekspor.
  - Putuskan kebijakan `.pkl` di git: saat ini 10 file ter-track padahal `.gitignore` mengecualikannya. Pilih salah satu (tetap commit sebagai artefak terverifikasi, atau keluarkan dari git).
- **DoD:**
  - [ ] Semua entri non-Naive di registry punya `sha256`.
  - [ ] Tes: entri non-Naive tanpa hash ditolak.
  - [ ] Tes: hash tidak cocok → `pickle.load` tidak dipanggil.

### 2.2 Penguatan pemuatan model (path dan deserialisasi)

- **Lokasi:** `scripts/run_forecasting.py` (±baris 90-128)
- **Pekerjaan:**
  - Ganti `str(path).startswith(...)` dengan `resolved_path.is_relative_to(MODEL_DIR.resolve())` (cek ke `MODEL_DIR`, bukan hanya `BASE_DIR`).
  - Wajibkan verifikasi hash sebelum `pickle.load` (lihat 2.1). Jika gagal, laporkan peringatan integritas dan jangan memuat.
  - Terapkan containment yang sama untuk artefak W&B. Catatan: artefak W&B tidak punya hash di registry. Pilihannya: simpan hash di registry untuk artefak W&B juga, atau nonaktifkan fallback W&B di produksi.
  - Jangan menelan semua exception diam-diam; log penyebabnya (tanpa membocorkan secret).
- **DoD:**
  - [ ] Tes: path dengan prefix mirip (`<base>_evil/`) ditolak.
  - [ ] Tes: path traversal (`..`) ditolak.
  - [ ] Tes: hash salah ditolak dan `pickle.load` tidak terpanggil.

### 2.3 Kuantil non-crossing: lengkapi dan buktikan (REVISI, skala kecil)

- **Lokasi:** `src/models/models.py`, `scripts/run_forecasting.py` (`validate_and_sanitize_outputs`)
- **Fakta:** guardrail `batas_bawah <= harga_prediksi` **sudah ada** di XGBoost, CatBoost, Stats, dan quality gate sebelum upsert.
- **Pekerjaan:**
  - Pastikan sisi atas (`harga_prediksi <= batas_atas`) ikut ditegakkan di **semua** jalur, termasuk LightGBM dan Naive.
  - Tambahkan tes yang memverifikasi 14 hari proyeksi tanpa crossing.
- **DoD:**
  - [ ] Tes: `batas_bawah <= harga_prediksi <= batas_atas` untuk H=1..14 di setiap jenis model.

### 2.4 Sinkronkan metrik UI dengan registry (dari F-03, tambahan)

- **Lokasi:** `web/src/app/forecasting/page.tsx`, `web/src/app/early-warning/page.tsx`, `models/forecasting/registry.json`
- **Masalah:** WAPE dan nama model di UI di-hardcode dan tidak cocok dengan registry (mis. Cabai 13,50% vs 14,97%). Nilai fallback "5,36%" statis.
- **Pekerjaan:**
  - Ekspor ringkasan registry (model champion, WAPE, horizon) ke JSON/tabel yang dibaca UI.
  - Tampilkan horizon dan periode backtest pada label metrik.
  - Hapus nilai fallback statis, ganti dengan "tidak tersedia".
- **DoD:**
  - [ ] Angka WAPE dan model di UI untuk 7 komoditas prioritas sama dengan registry.

### 2.5 Dokumentasi & SOP

- **Lokasi:** `docs/panduan_operasional.md`, `AGENTS.md`
- **Pekerjaan:**
  - Dokumentasikan SOP verifikasi SHA-256 dan siklus retraining champion model berkala.
  - Dokumentasikan aturan fail-closed, flag mock, dan manifest cache.
  - Perbarui jumlah tes di `AGENTS.md` (sekarang 80) dan catat kebijakan `.pkl` di git.
- **DoD:**
  - [ ] SOP bisa diikuti langkah demi langkah oleh orang lain.

### Urutan kerja Sprint 2

`2.1 (hash) → 2.2 (loader) → 2.3 (kuantil) → 2.4 (metrik UI) → 2.5 (dokumen)`

---

## Verifikasi akhir (kedua sprint)

```bash
pytest tests/ -v
cd web && npm run build && npm run lint && npm audit --audit-level=high
```

Catat output aktual di laporan penyelesaian sesuai `AGENTS.md` bagian 9.

## Risiko dan hal yang perlu diputuskan

| Hal | Risiko / keputusan |
|---|---|
| Tes bergantung pada fallback mock | Pindahkan mock ke fixture dulu agar CI tidak pecah |
| Kebijakan `.pkl` di git | Tentukan: commit sebagai artefak terverifikasi atau keluarkan dari git |
| Artefak W&B tanpa hash | Simpan hash di registry atau matikan fallback W&B di produksi |
| Pipeline berhenti saat data basi | Pastikan alert terkirim agar kegagalan tidak senyap |
| Perilaku UI saat harga tidak ada | Konfirmasi: item dikeluarkan dari total, bukan diisi angka |

## Di luar cakupan (sengaja ditunda)

- Tes frontend (Vitest) dan pemecahan `dataService.ts`
- Satu sumber HAP/HET (F-04)
- CSP, migrasi `next lint`, `error.tsx`/`loading.tsx`
- Linter/type-check Python dan coverage di CI
- Pengarsipan laporan audit lama
