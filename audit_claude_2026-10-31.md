# Audit Sistem HargaWatch Surabaya — 2026-10-31

> Auditor: Claude (Zed agent). Cakupan: backend (`src/`, `scripts/`, `models/`, CI) sampai frontend (`web/`).
> Audit ini memverifikasi ulang temuan dari `audit_freebuff.md` terhadap kode saat ini (branch `main`, HEAD `e583633`).
> Tidak ada file aplikasi yang diubah dan tidak ada commit/push.

## 1. Ringkasan

Backend dan pipeline dalam kondisi sehat secara fungsional. Celah utama ada di tiga area:

1. **Keamanan model:** validasi integritas `.pkl` tidak benar-benar aktif.
2. **Konsistensi angka di frontend:** WAPE dan acuan HAP/HET berbeda antarhalaman.
3. **Pengujian frontend:** tidak ada tes otomatis di CI.

## 2. Hasil verifikasi yang dijalankan

| Perintah | Hasil |
|---|---|
| `python -m pytest tests/ -q -rs` | **80 passed**, 0 skipped (30,10 s) |
| `npm run lint` (di `web/`) | Bersih, tanpa warning/error. `next lint` deprecated |
| `npm audit --audit-level=high` | Tidak ada temuan high; **14 moderate** (dependensi lint: `eslint-plugin-react`, `minimatch`) |
| `npm run build` | **Tidak dijalankan**, status belum terverifikasi |
| Query ke Supabase live | **Tidak dilakukan**. Angka coverage dari audit lama (mis. 208/222 EWS) tidak diverifikasi ulang |

Catatan: tidak ada `.venv` di repo ini, tes dijalankan dengan Python 3.11 global.

## 3. Status temuan audit lama (`audit_freebuff.md`)

| ID | Temuan | Status saat ini |
|---|---|---|
| F-01 | Kurva tren beranda memakai fallback sintetis | **Sebagian diperbaiki:** query forecast sudah memakai `.gt("tanggal", anchorDate)`. Fallback band hardcoded perlu dicek lagi |
| F-02 | Record tanpa EWS tampil `NORMAL` | **Diperbaiki:** sekarang `BELUM_TERSEDIA` (`dataService.ts:536`) |
| F-03 | WAPE/model Forecasting tidak cocok dengan registry | **Belum diverifikasi ulang**, anggap masih terbuka |
| F-04 | HAP/HET berbeda antarhalaman | **Belum diverifikasi ulang**, anggap masih terbuka |
| F-05 | Proyeksi historis / coverage forecast | Terbuka (butuh rekonsiliasi DB vs CSV) |
| F-06 | Harga estimasi masuk statistik tanpa pemisahan | **Terbuka**, fallback Rp15.000 masih ada |
| F-07 | Pipeline ML bisa memakai data mock | **Terbuka**, `features.py:113` |
| F-08 | Hasil simulasi keranjang lama tetap tampil | Belum diverifikasi ulang |
| F-09 | Header EWS menganggap loading sebagai aman | Belum diverifikasi ulang |
| F-10 | CSV lokal berbeda dari Supabase live | **Terbuka** |
| F-11 | Modul mock lama dorman | **Selesai:** `web/src/data/mockData.ts` sudah tidak ada |
| F-12 | Metadata komoditas tidak satu sumber | **Sebagian:** teks "38 komoditas" sudah hilang dari `web/src` |
| F-13 | Tahun `2026` hardcoded | **Selesai:** tersisa hanya di komentar (`dataService.ts:573`) |

## 4. Temuan backend

| Prioritas | Temuan | Lokasi |
|---|---|---|
| Tinggi | `registry.json` **tidak punya field `sha256`** (0 kemunculan, 37 entri model). Validasi integritas di `scripts/run_forecasting.py` bersifat opsional sehingga tidak pernah jalan. | `models/forecasting/registry.json`, `run_forecasting.py:95-102` |
| Tinggi | Cek path containment memakai `str.startswith`, yang meloloskan path saudara berawalan sama (mis. `HargaWatch_evil/`). Gunakan `Path.is_relative_to`. | `run_forecasting.py:92`, `:122` |
| Tinggi | Artefak W&B langsung di-`pickle.load` tanpa verifikasi hash. | `run_forecasting.py:111-127` |
| Sedang | Fallback data mock (`generate_mock_raw_datasets`) masih dapat dipakai jalur produksi jika DB dan CSV tidak tersedia. Seharusnya opt-in untuk test/CI saja. | `src/analytics/features.py:19`, `:113` |
| Sedang | 10 file `.pkl` ter-track di git padahal `.gitignore` mengecualikan `*.pkl`. Registry memuat 37 entri, tetapi hanya 10 blob model yang ada. | `models/forecasting/` |
| Sedang | Cache CSV lokal tidak punya timestamp ekspor, checksum, atau provenance. Loader memprioritaskan CSV, sehingga hasil offline bisa berbeda dari UI live. | `features.py:65-116` |
| Sedang | Belum ada pengecekan freshness data dan alert saat scheduler gagal. Ingestion hanya berjalan di satu mesin Windows (Task Scheduler) sehingga menjadi titik kegagalan tunggal. | `scripts/`, `docs/panduan_operasional.md` |
| Rendah | CI tidak punya linter/type-check Python (ruff/mypy) dan tidak mengukur coverage. | `.github/workflows/ci.yml` |
| Rendah | Dokumen menyebut "79 tests", sekarang 80. Setup `.venv` perlu dipastikan di dokumentasi. | `AGENTS.md`, `README_dev.md` |

## 5. Temuan frontend

| Prioritas | Temuan | Lokasi |
|---|---|---|
| Tinggi | WAPE dan model di halaman Forecasting tidak cocok dengan registry (mis. Cabai 13,50% vs 14,97%; Minyak Curah 3,62% vs 0,23%). Nilai fallback "5,36%" statis. | `forecasting/page.tsx`, `early-warning/page.tsx` |
| Tinggi | Acuan HAP/HET berbeda antarhalaman (Bawang Merah Rp36.500 di EWS vs Rp41.500 di Forecasting). Minyak Curah dicatat `kg` tetapi HET per liter. Angka resmi belum divalidasi. | `early-warning/page.tsx`, `forecasting/page.tsx` |
| Sedang | Keranjang belanja memakai fallback Rp15.000 dan rerata tanpa label estimasi. Kartu beranda memakai `harga_imputasi` tanpa membawa flag `is_imputed`. | `dataService.ts:1647`, `:1704`, `:1726` |
| Sedang | Hasil simulasi keranjang lama bisa tetap tampil jika request baru gagal. | `page.tsx:176-197` |
| Sedang | **Tidak ada tes frontend di CI.** `web/tests/*.js` dan `web/test_features.js` adalah skrip ad hoc yang tidak terhubung ke `package.json`. Tidak ada unit test untuk `dataService.ts` (sekitar 1.700 baris berisi seluruh logika bisnis). | `web/package.json`, `ci.yml` |
| Sedang | `dataService.ts` terlalu besar dan memakai banyak `.limit(...)` hardcoded (mis. `limit(500)`, `limit(150)` di `getLiveCommodities`) yang bisa memotong data diam-diam jika komoditas atau pasar bertambah. | `dataService.ts:301-316` |
| Sedang | URL dan key Supabase di-hardcode sebagai fallback. Key bersifat publishable sehingga aman secara desain, tetapi build bisa menyambung ke project produksi tanpa disadari. Nama env di CI (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) perlu disamakan dengan dokumentasi. | `web/src/lib/supabase.ts` |
| Rendah | CSP memakai `'unsafe-eval'` dan `'unsafe-inline'` pada `script-src`, melemahkan perlindungan XSS. | `web/next.config.ts` |
| Rendah | `next lint` deprecated (dihapus di Next 16). Migrasi ke ESLint CLI. | `web/package.json` |
| Rendah | Tidak ditemukan `error.tsx`, `loading.tsx`, atau metadata per halaman di `web/src/app/`. Aksesibilitas belum diperiksa. | `web/src/app/` |

## 6. Dokumentasi dan tata kelola

- Ada banyak file audit yang tumpang tindih: `audit_freebuff.md`, `report.md`, `2026-10-28_DRIFT_REPORT.md`, `docs/audit_forecasting_page.md`. Sebagian sudah usang (F-01, F-02, F-11, F-13). Disarankan diarsipkan ke `docs/archive/` atau digabung menjadi satu sumber kebenaran.
- Tidak ditemukan `.env` yang ter-commit; `.env.example` aman.

## 7. Urutan perbaikan yang disarankan

1. Tambahkan `sha256` ke registry, ganti `startswith` dengan `is_relative_to`, dan verifikasi artefak W&B sebelum `pickle.load`.
2. Matikan fallback mock di produksi; tambahkan pengecekan freshness dan alert kegagalan scheduler.
3. Satukan sumber WAPE (dari registry) dan HAP/HET (satu katalog bertanggal dan bersatuan eksplisit); beri label estimasi pada keranjang.
4. Tambahkan tes frontend (mis. Vitest) untuk `dataService.ts` ke CI, lalu pecah file per domain.
5. Rapikan CSP, migrasi lint, tambahkan `error.tsx`/`loading.tsx`, dan arsipkan laporan audit lama.

## 8. Batasan audit

- Temuan bertanda "belum diverifikasi ulang" berasal dari `audit_freebuff.md` dan belum saya baca ulang di kodenya.
- Tidak ada akses ke database live; kondisi data (coverage, imputasi) tidak diverifikasi.
- `npm run build` tidak dijalankan.
