# Laporan Fase 2 — Achievement, Grade & Commission Engine

Tanggal: 2026-10-03 · Acuan: PRD v2.1 Revisi 5 · Status: **MENUNGGU PERSETUJUAN**

## Ringkasan

Fase ini menambahkan mesin pencapaian dan komisi di server:
- pengakuan penjualan dengan nomor urut permanen;
- urutan proyek yang stabil dalam kuartal;
- kumulatif kontribusi target per kuartal;
- Grade Komisi (grade sebelum proyek) dan Grade Tercapai (grade sesudah proyek, untuk proyek berikutnya);
- aturan grade dan matriks komisi berversi menurut tanggal berlaku;
- hak komisi per sales per proyek;
- revisi kalkulasi dengan snapshot lengkap dan hash input;
- hitung ulang yang deterministik;
- finalisasi dua langkah: Finance memverifikasi, lalu Direktur menyetujui.

Selama K1–K6 belum aktif dan aturan atau matriks belum disetujui Direktur, semua hasil berstatus **SIMULASI** dan tidak dapat difinalisasi. Aplikasi tidak menyediakan tarif bawaan. Satu-satunya matriks yang ada adalah **fixture QA** sintetis, dan fixture itu tidak pernah dapat disetujui.

## Requirement PRD yang Dipenuhi

| Bagian (Master Prompt / PRD) | Implementasi |
|---|---|
| §5 Grade Komisi vs Grade Tercapai | Grade Komisi = grade dari pencapaian **sebelum** proyek. Grade Tercapai = grade sesudah proyek, dipakai proyek berikutnya. Persentase dihitung dengan presisi penuh, tanpa pembulatan sebelum menentukan grade. |
| §6 Target sebagai penyebut | Penyebutnya target kuartal yang aktif. Target kosong atau 0 → pencapaian dan komisi TERBLOKIR (`TARGET_TIDAK_ADA`), tidak dianggap Grade 1. |
| §7 Alokasi | Kontribusi target menambah kumulatif. Alokasi komisi mengalikan nominal komisi. Keduanya terpisah. |
| §8 Pengakuan & urutan | Event pengakuan dibuat saat revisi pertama diverifikasi Finance. Nomornya `recognition_seq` dari sequence DB, append-only. Urutan dalam kuartal: tanggal efektif, lalu nomor pengakuan. Kumulatif direset setiap kuartal. |
| §11 Skema komisi | Matriks per Grade 1–4 dengan rentang [bawah, atas) atas metrik Total Diskon + OC berbasis P. Domain [min, max) di luar rentang → diblokir. Validasi menolak celah, tumpang tindih, tarif kosong, dan tarif di luar 0–100. Lookup harus menemukan tepat satu rentang. |
| §12 Langkah 1–8 | Rumusnya komisi = A × tarif × alokasi komisi. Pembulatan HALF_UP ke Rp1 (usulan K5) per penerima. Setiap blokir disimpan dengan kode dan pesannya. |
| §13 Snapshot | Isi snapshot: revisi proyek, alokasi, target, Cost & Margin, versi aturan grade, versi matriks (termasuk penanda fixture), kebijakan pembulatan, versi engine, daftar proyek pendahulu dan kontribusinya, serta status gate. Hash SHA-256 dari input dipakai untuk deteksi perubahan. |
| §14 Hak komisi | `commission_entitlements` per (proyek, sales, jenis DASAR), stabil, tanpa hard-delete. |
| §18 Koreksi historis (sebagian) | Hasil FINAL tidak pernah ditimpa. Jika hitung ulang menghasilkan nilai berbeda, perbedaan itu dilaporkan (`finalChanged`). Adjustment dikerjakan di Fase 4. |
| §20 RBAC | Izin baru `rules.view/propose/approve` dan `calc.run/verify/approve`. Pengusul aturan tidak dapat menyetujui. Pembuat kalkulasi tidak dapat memverifikasi. Pemverifikasi tidak dapat menyetujui. Akses dibatasi sesuai lingkup sales. |
| §31 Gate produksi (T22) | Mode PRODUKSI hanya bila K1–K6 aktif pada tanggal efektif, aturan grade dan matriks DISETUJUI, dan Cost & Margin berstatus produksi. Hasil SIMULASI ditolak saat verifikasi atau persetujuan (`MODE_SIMULASI`). |

## Perubahan Kode

**Engine** — `packages/engine/src/commission.ts` (baru):
- `validateGradeBands`, `gradeFor`, `PRD_GRADE_BANDS` (draft dari PRD 10)
- `validateScheme`, `lookupRate`
- `orderEvents`, `calculateSalesQuarter`, `projectCommissionTotal`
- `ROUNDING_K5_USULAN`
- `ENGINE_VERSION` naik ke `0.2.0-fase2`

**API**:
- `apps/api/db/migrations/004_commission_engine.sql` (baru)
- `src/services/commission.ts` (baru): pemilihan versi aturan menurut tanggal efektif, `planSalesQuarter` (pratinjau tanpa menulis), `recalcSalesQuarter` (advisory lock; revisi baru hanya dibuat bila hash berubah)
- `src/modules/rules.ts` (baru): `GET/POST/PUT /api/rules/grades`, `/grades/:id/approve|reject`, `GET/POST/PUT /api/rules/schemes`, `/schemes/validate`, `/schemes/:id/approve|reject`
- `src/modules/calculations.ts` (baru): `GET /api/achievements`, `GET /api/achievements/:salesPersonId`, `POST /api/calculations/recalculate`, `GET /api/calculations`, `GET /api/calculations/by-project/:projectId`, `GET /api/calculations/:id`, `POST /api/calculations/:id/verify|approve`
- `src/modules/projects.ts`: verifikasi pertama kini membuat event pengakuan
- `src/db/seed-qa.ts`: aturan grade v1 (DRAFT) dan matriks fixture QA v1

**Web**:
- `components/Commission.tsx` (baru): tipe, badge grade/status, pemilih periode, rincian kalkulasi
- `pages/AchievementPage.tsx`: Pencapaian Sales — ringkasan per sales dan rincian per proyek
- `pages/SchemePage.tsx`: Skema Komisi — aturan grade, editor matriks dengan validasi langsung, persetujuan Direktur
- `pages/CalculationsPage.tsx`: Perhitungan Komisi — daftar, hitung ulang, verifikasi dan persetujuan
- Tab **Perhitungan** di detail proyek (revisi terkini dan riwayat)
- Placeholder Fase 2 dihapus dari navigasi
- Judul peringatan baru: `MODE_SIMULASI`, `FIXTURE_QA`, `HASIL_USANG`, dan lainnya

**Demo HTML** — `apps/web/src/demo/store.ts`:
- Meniru seluruh endpoint Fase 2 memakai engine yang sama.
- Data demo lama di perangkat dilengkapi otomatis tanpa menghapus isian pengguna.
- Versi demo v9.

## Database

Migrasi `004_commission_engine.sql`:
- `recognition_seq` (sequence) dan `sales_recognition_events`: `project_id` UNIQUE, nomor urut UNIQUE, append-only (trigger). Proyek yang sudah terverifikasi diisi ulang menurut waktu verifikasi.
- `grade_rule_versions`: status DRAFT/DISETUJUI/DITOLAK/PENSIUN. CHECK: penyetuju ≠ pengusul, dan versi DISETUJUI wajib punya tanggal berlaku. EXCLUDE gist mencegah masa berlaku versi DISETUJUI tumpang tindih. Trigger membuat versi non-DRAFT immutable (kecuali DISETUJUI → PENSIUN). Tanpa delete.
- `commission_policy_versions`: CHECK DISETUJUI ⇒ bukan fixture QA. Ada domain metrik, EXCLUDE masa berlaku, dan trigger immutable yang sama.
- `commission_scheme_bands`: tarif boleh NULL (berarti belum diisi), CHECK 0–100. EXCLUDE gist `numrange` per versi dan grade menolak rentang tumpang tindih. Trigger hanya mengizinkan perubahan rentang pada versi DRAFT.
- `commission_entitlements`: UNIQUE(proyek, sales, jenis), tanpa delete.
- `commission_calculation_revisions`: berisi snapshot lengkap, hash, dan versi engine.
  - Partial unique index menjamin satu revisi `is_current` per hak.
  - CHECK: FINAL ⇒ PRODUKSI, sudah diverifikasi dan disetujui; penyetuju ≠ pemverifikasi.
  - Trigger membuat isi immutable; hanya penanda current dan langkah finalisasi yang boleh berubah.
  - Revisi FINAL beku total. Revisi TERBLOKIR tidak dapat difinalisasi. Tanpa delete.

## Business Logic

- Penjualan kuartal hanya mencakup proyek yang revisi saat ininya TERVERIFIKASI, tanggal efektifnya dalam kuartal, dan punya alokasi untuk sales tersebut.
- Kontribusi = S × % kontribusi target. Kumulatif tetap bertambah meskipun komisi proyek itu terblokir.
- Pencapaian = kumulatif / target × 100 (presisi penuh). Grade memakai rentang [bawah, atas): 0–50, 50–75, 75–100, ≥100 (usulan PRD 10, belum disetujui).
- Metrik lookup = Total Diskon + OC dari revisi Cost & Margin terbaru untuk revisi proyek terverifikasi yang sama. Jika Cost & Margin dihitung untuk revisi lain → `COST_MARGIN_USANG` (terblokir).
- Komisi = A × tarif(Grade Komisi, metrik) × alokasi komisi, dibulatkan HALF_UP ke Rp1.
- Versi aturan dipilih menurut tanggal efektif proyek. Jika tidak ada versi DISETUJUI, draft dipakai untuk simulasi dengan alasan yang dicatat.
- Hitung ulang hanya membuat revisi baru bila hash input berubah. Revisi FINAL tidak ditimpa. Halaman Pencapaian menandai hasil yang **usang** (pratinjau langsung berbeda dari revisi tersimpan).
- Verifikasi dan persetujuan ditolak bila hasilnya usang (`HASIL_USANG`). Hal ini mencegah finalisasi atas data yang sudah berubah.

## Tests

Semua command berikut benar-benar dijalankan; hasilnya aktual.

| Command | Hasil |
|---|---|
| `npm run typecheck --workspaces --if-present` | exit 0 |
| `npm test -w packages/engine` | **55 passed** (2 file): T01, T02, T03, T04, T05, T06, T10, T11, T12, T13, T14 + aturan grade + T07/T08/T09 dari Fase 1 |
| `npm test -w apps/api` (PostgreSQL 16 sungguhan, DB uji dibuat dan dihapus per run) | **46 passed** (35 Fase 1 + 11 Fase 2) |
| `npx playwright test e2e/ui-qa.spec.ts` (API + Vite dev, 4 viewport) | **16 passed** |
| `npx playwright test e2e/demo-fase2.spec.ts` (demo HTML tunggal v9) | **1 passed** |

Test integrasi Fase 2 (`apps/api/test/api.test.ts`, blok "Fase 2"):
1. Event pengakuan dibuat saat verifikasi; nomornya permanen dan UPDATE ditolak (T14).
2. Urutan menurut tanggal efektif walaupun proyek diakui belakangan. Grade Komisi 1 → Grade Tercapai 2 → proyek berikutnya Grade Komisi 2. Hasil SIMULASI dengan alasan fixture QA.
3. Hitung ulang tanpa perubahan → 0 revisi baru (deterministik).
4. Tanpa target → TERBLOKIR (`TARGET_TIDAK_ADA`) dan tidak dapat diverifikasi (T12).
5. Hasil SIMULASI ditolak saat verifikasi (`MODE_SIMULASI`, T22).
6. Aturan grade: Finance tidak bisa menyetujui. Direktur bisa. Versi yang disetujui immutable di DB. Masa berlaku tumpang tindih → 409. Celah → 422.
7. Matriks: fixture QA → 422 `FIXTURE_QA`. Tarif kosong → 422 `MATRIKS_TIDAK_VALID`. Validasi tumpang tindih berjalan. Pengusul tidak bisa menyetujui. Rentang versi yang disetujui tidak bisa diubah di DB.
8. Dengan data uji sintetis (K1–K6 aktif 2027, konfigurasi uji disetujui): mode PRODUKSI. Diskon 10,909091% → tarif uji 2% → Rp280.000. Hasil lama ditandai usang. Revisi lama tetap ada.
9. Finalisasi: pembuat kalkulasi tidak bisa memverifikasi. Direktur tidak bisa menyetujui sebelum Finance memverifikasi. Hasil FINAL immutable (UPDATE, ubah current, dan DELETE ditolak).
10. T13: target diubah setelah final → hasil final tidak ditimpa dan dilaporkan di `finalChanged`. Proyek berikutnya dihitung ulang (Grade Komisi naik ke 4).
11. Lingkup: sales hanya melihat pencapaian sendiri; sales lain → 403. Sales tidak bisa menjalankan hitung ulang.

## UI Verification

- Halaman yang diuji pada 1440, 1280, 768 dan 390 px, tanpa horizontal scroll pada halaman (tabel lebar memakai scroll di dalam kontainer):
  - Pencapaian Sales dan rinciannya
  - Skema Komisi dan editor matriks
  - Perhitungan Komisi
  - tab Perhitungan di detail proyek
  - Pencapaian dari sudut pandang sales
  - Skema dari sudut pandang Direktur
- Tangkapan layar tambahan pada 1024×1366 (iPad potret): rincian kalkulasi menampilkan alasan simulasi, kode blokir, versi aturan, snapshot, dan hash.

## Security Verification

- SoD diuji: pengusul aturan ≠ penyetuju; pembuat kalkulasi ≠ pemverifikasi; pemverifikasi ≠ penyetuju. Penegakannya berlapis: guard API, CHECK DB, dan approval event.
- Izin per endpoint diuji: sales tidak bisa menjalankan hitung ulang; Finance tidak bisa menyetujui aturan.
- Lingkup sales di level objek diuji: akses pencapaian dan kalkulasi milik sales lain → 403 dan tercatat.
- Immutability di level DB diuji langsung dengan UPDATE/DELETE: versi aturan yang disetujui, rentang tarif, hasil final, dan event pengakuan.
- Konkurensi: hitung ulang per sales dan kuartal memakai `pg_advisory_xact_lock`, dan hak serta revisi dikunci dengan `FOR UPDATE`. **Uji paralel khusus belum ditulis** (T15 dijadwalkan di Fase 3).

## K1–K6 Status

| Keputusan | Status di aplikasi |
|---|---|
| K1 Pengakuan & periode | Usulan PRD diterapkan (nomor urut saat verifikasi pertama, kuartal kalender). **Belum aktif.** Zona waktu perusahaan belum ditetapkan. |
| K2 Biaya/pricelist/OC/pajak | Faktor dan pembagi hanya berupa fixture QA. **Belum aktif.** |
| K3 Matriks & tarif | **Tidak ada tarif resmi.** Hanya fixture QA sintetis (tidak dapat disetujui). Aturan grade 50/75/100 masih DRAFT. |
| K4 Penerima & alokasi | Rumus usulan diterapkan. **Belum aktif.** |
| K5 Presisi & pembulatan | HALF_UP ke Rp1 per penerima (usulan). **Belum aktif.** |
| K6 Kelayakan & pembayaran | Dikerjakan di Fase 3. **Belum aktif.** |

Karena itu, semua hasil kalkulasi saat ini berstatus **SIMULASI** dan tidak dapat difinalisasi.

## Masalah/Risiko

1. **Data contoh Q1 2026 semuanya TERBLOKIR.** DEMO-2026-002/003 belum punya Cost & Margin. DEMO-2026-001 punya Cost & Margin, tetapi metriknya (±45,8%) di luar domain fixture [0, 20%). Ini perilaku yang benar, tetapi demo belum memperlihatkan nominal komisi sampai pengguna menghitung Cost & Margin dengan nilai yang masuk domain matriks.
2. **Hitung ulang masih manual** (tombol Finance). Halaman Pencapaian menghitung pratinjau langsung dan menandai hasil usang. Pemicu otomatis bisa ditambahkan bila diinginkan.
3. **Perubahan setelah final hanya dilaporkan.** Koreksi historis dan adjustment (§18) dijadwalkan di Fase 4.
4. **Demo HTML meniru API di browser** (localStorage per perangkat). Demo ini bukan sumber kebenaran, dan datanya tidak tersinkron antar perangkat.
5. **Belum ada uji beban dan uji konkurensi paralel** untuk hitung ulang.
6. **Repo GitHub `aplikasi-komisi` belum dibuat** (sebelumnya pembuatan repo ditolak 403). Commit masih lokal.

## Keputusan User yang Dibutuhkan

1. **K3:** tarif resmi per grade dan rentang Total Diskon + OC, termasuk domain metriknya. Apakah diskon negatif (S > P) harus tercakup, atau tetap ditahan?
2. **Aturan grade:** apakah batas 50/75/100% (PRD 10) disetujui apa adanya?
3. **K1:** zona waktu perusahaan, dan konfirmasi bahwa nomor urut pengakuan diberikan saat verifikasi pertama oleh Finance.
4. **K5:** konfirmasi pembulatan HALF_UP ke Rp1 per penerima per proyek.
5. Apakah hitung ulang perlu berjalan **otomatis** setiap kali data berubah, atau tetap manual oleh Finance dengan penanda "usang"?
6. Buat repo GitHub `aplikasi-komisi` dan beri akses Claude GitHub App agar commit bisa di-push.

## Status

```text
FASE 2 SELESAI — MENUNGGU PERSETUJUAN
```

**Apakah saya boleh melanjutkan ke Fase 3?**
