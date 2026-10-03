# Laporan Fase 1 — Foundation & Core Data

Tanggal: 2026-10-02 · Acuan: PRD v2.1 Revisi 5 · Status: **MENUNGGU PERSETUJUAN**

## Ringkasan

Fondasi aplikasi dibangun dengan modul inti yang terhubung ke PostgreSQL dan business logic di server:
autentikasi sesi, RBAC object-level, audit append-only, master data (sales, pelanggan, tim, pengguna),
proyek beserta revisi, alokasi, dan PO, target per kuartal beserta revisi dan approval, RPE, Cost & Margin,
gerbang keputusan K1–K6, konfigurasi biaya berversi (K2), import proyek, dan UI berbahasa Indonesia.
Selama K1–K6 belum aktif, seluruh hasil berstatus **SIMULASI**.

## Requirement PRD yang dipenuhi

| Bagian PRD | Implementasi |
|---|---|
| 4 Peran & akses | 5 peran, 26 izin; scope proyek dan sales di server; masking biaya sensitif; tanpa self-approval (CHECK di DB + guard API); Admin Sistem diblokir trigger dari izin persetujuan bisnis; penolakan akses dicatat |
| 5 Model data | Lihat bagian Database di bawah. Tanpa hard-delete (trigger) |
| 6 Proyek | ID tetap, referensi unik (case-insensitive), revisi Draft → Diajukan → Terverifikasi/Ditolak → Digantikan; nilai penjualan hanya dari revisi terverifikasi; tanggal efektif wajib dengan bukti; alokasi dengan peran, maks. 1 per sales, kontribusi target dan alokasi komisi terpisah dan masing-masing Σ 100%; perbedaan wajib beralasan dan disetujui Direktur; import dengan preview, validasi per baris, hash sumber, dan idempoten |
| 7 RPE | Qty, harga per unit/total baris, mata uang, kurs + tanggal + sumber + bukti, lokal/impor/jasa, hw/sw; IDR kurs = 1; kategori `covered_by_factor` (NULL = belum ditetapkan → blokir); duplikasi biaya ditolak; revisi RPE dapat ditelusuri |
| 8 Cost & Margin | P = C/d, A = S − O, margin sebelum/sesudah OC, diskon, OC setara (penyebut P), Total Diskon + OC; validasi S > 0, P > 0, C ≥ 0, 0 ≤ O ≤ S, d > 0; A = 0 → margin % N/A; diskon negatif dan rugi ditandai, tidak di-nol-kan; OC persen wajib menyatakan basis; hasil append-only beserta snapshot input |
| 9 Target | Per sales/tahun/kuartal/revisi; satu revisi aktif; target > 0; Σ bulanan = kuartal; target tahunan = Σ 4 kuartal; perubahan wajib beralasan; disetujui Direktur (bukan pengusul); revisi lama tidak dapat diubah |
| 17 Audit | `audit_events` append-only (trigger), mencatat aktor, waktu, objek, old/new, alasan, request id, approval ref; field sandi/token diredaksi |
| 18 UI | 13 menu sesuai izin; detail proyek dengan 7 tab; tabel (cari, filter, sort, pagination, header sticky, total, IDR rata kanan, horizontal scroll); form dengan validasi inline, konfirmasi aksi final, state loading/empty/error/retry/unauthorized/simulasi/terblokir; tema netral yang dapat diatur |
| 20 Keputusan K1–K6 | Draft → Disetujui (Direktur ≠ pengusul) → Aktif (diverifikasi Finance) → Pensiun; rentang aktif tidak boleh tumpang tindih (exclusion constraint); endpoint gate |
| 21 Non-fungsional | argon2id, sesi idle 30 menit / absolut 12 jam, cookie httpOnly + SameSite=Strict (+Secure di produksi), header CSRF, rate-limit login, query berparameter, rahasia via env, transaksi DB |

## Perubahan kode

- `packages/engine`: `decimal.ts`, `quarter.ts`, `cost.ts` (Total Cost), `margin.ts` (Cost & Margin), `allocation.ts`
- `apps/api/src`: `auth/*`, `services/{audit,scope,sod,gate,projects}.ts`, `modules/{auth,users,master,settings,decisions,config,projects,rpe,targets,imports}.ts`, `db/{migrate,seed-qa}.ts`
- `apps/web/src`: `components/{ui,DataTable,Layout,RpeEditor}.tsx`, `pages/*` (Login, Dashboard, Proyek, Detail, Form, RPE, Cost & Margin, Target, Master Data, Pengaturan), `e2e/ui-qa.spec.ts`

## Database

Migrasi `001_foundation.sql`, `002_core_data.sql`, `003_rbac_seed.sql`. Isinya:
- Ekstensi `pgcrypto` dan `btree_gist`.
- Uang disimpan sebagai `NUMERIC(20,2)` dan persen sebagai `NUMERIC(30,12)`. Hasil hitungan disimpan sebagai `NUMERIC(38,18)`.
- `CHECK`: S > 0, 0 ≤ O ≤ S, alokasi 0–100, target > 0, IDR ⇒ kurs = 1, valas ⇒ tanggal dan sumber kurs wajib, approver ≠ proposer.
- `UNIQUE` dan partial unique: satu revisi terbuka atau terverifikasi per proyek, satu target aktif atau usulan per kuartal, satu RPE draft atau terverifikasi, dan file yang sama hanya dapat diimpor sekali.
- `EXCLUDE` gist: masa berlaku keputusan aktif dan versi konfigurasi yang disetujui tidak boleh tumpang tindih.
- Trigger: revisi terverifikasi tidak dapat diubah, alokasi atau baris RPE hanya dapat diubah saat Draft, tabel append-only (audit, approval, Cost & Margin, lampiran), dan anti-hapus untuk master serta data finansial.

## Business logic

Rumus mengikuti PRD 7–8 (usulan K2) dan diberi label versi `PRD-2.1-R5-K2-USULAN`. Persentase tidak dibulatkan; tampilan dibulatkan 2 desimal.
Mode PRODUKSI pada Cost & Margin hanya diberikan bila seluruh syarat berikut terpenuhi:
- K2 aktif pada tanggal efektif proyek.
- Revisi proyek dan RPE sudah terverifikasi.
- Versi faktor dan pembagi sudah disetujui, bukan fixture QA, dan berlaku pada tanggal efektif proyek.
- Tidak ada catatan yang perlu ditinjau.

Bila salah satu tidak terpenuhi, hasil berstatus SIMULASI dan alasannya ditampilkan.

## Tests (dijalankan sungguhan)

| Command | Hasil |
|---|---|
| `npm test -w @komisi/engine` | **32 passed** — T07, T08 (+ anti double-count, kurs, faktor hilang/0), T09 (d kosong/0 memblokir), bagian T12 (O > S, alokasi 110%), kuartal kalender, persen presisi penuh, float ditolak |
| `npm test -w @komisi/api` (PostgreSQL 16 nyata, DB uji dibuat dan dihapus otomatis) | **34 passed** — auth/sesi/CSRF, sesi idle habis, RBAC & scope (bagian T20), self-approval ditolak, Admin tanpa izin approval, audit dan Cost & Margin append-only, anti-hapus, gate K1–K6 (bagian T22), fixture QA tidak dapat disetujui, target 0 ditolak, alur proyek lengkap, revisi immutable, RPE/Cost & Margin (C = 2.300.000), masking biaya, import idempoten, lampiran object-level |
| `npm run typecheck` (engine, api, web) | bersih |
| `npx playwright test` (Chromium) | **16 passed** — 4 skenario × 4 viewport, 120 screenshot, tanpa horizontal overflow halaman |

T01–T06, T10, T11, T13–T19, dan T21 berada di luar cakupan Fase 1 (dijadwalkan pada Fase 2–5). T12 dan T20 baru diuji sebagian.

## UI verification

Viewport 1440, 1280, 768, dan 390. Halaman yang diuji: login (+ error), dashboard, daftar proyek, proyek baru (+ validasi), detail proyek (7 tab), proyek dengan perbedaan alokasi, RPE, Cost & Margin, target, master data, pengaturan (keputusan, biaya, import, audit, tema), placeholder fase lanjut, tampilan sales (lingkup terbatas, biaya disembunyikan, halaman tanpa akses), dan konfirmasi Direktur.

Masalah yang ditemukan lalu diperbaiki:
- Label sidebar terpotong.
- Nomor referensi terpecah di layar 390px.
- Target tahunan menampilkan "Rp0" saat datanya belum lengkap.
- Angka faktor tampil dengan nol berlebih.
- Tombol yang dinonaktifkan karena pemisahan tugas tidak disertai penjelasan.

Catatan: screenshot full-page menampilkan sidebar/modal fixed hanya setinggi viewport. Ini artefak screenshot, bukan bug tata letak.

## Security verification

Hal yang sudah diuji: object-level scope untuk proyek, sales, dan lampiran; masking biaya; self-approval pada keputusan, proyek, RPE, dan target; trigger yang mencegah Admin mendapat izin persetujuan; CSRF; sesi kedaluwarsa; redaksi sandi di audit; penolakan akses dicatat sebagai `DITOLAK`.

Belum diuji: konkurensi klaim/pembayaran (Fase 3, T15) dan load test (Fase 5).

## Status K1–K6

Semua masih **DRAFT** (usulan PRD dimuat sebagai draft pada data demo, **bukan** disetujui). Akibatnya aplikasi dalam mode SIMULASI. Nilai yang belum tersedia: timezone, faktor, d, cakupan biaya, basis pajak, kurs, tarif Grade 1–4, batas nominal, dan definisi lunas.

## Masalah / risiko

1. **Repo GitHub belum dibuat.** Integrasi GitHub sesi ini tidak berizin membuat repository (403). Kode tersedia sebagai zip dan siap di-push.
2. Perubahan `covered_by_factor` kategori biaya tercatat di audit tetapi **belum berversi atau melalui approval**. Usulan: jadikan bagian versi K2 pada Fase 2.
3. Simulasi dampak perubahan target di kuartal berjalan belum ada (Fase 2/4). Saat ini perubahan hanya mewajibkan alasan dan approval.
4. Rate-limit login masih in-memory (per proses). Untuk deployment multi-instance perlu store bersama.
5. Penyimpangan kecil dari rencana Fase 0: akses DB memakai `pg` dengan query berparameter (tanpa Kysely), dan tabel memakai komponen sendiri (tanpa TanStack Table). Fungsinya setara dan dependensinya lebih sedikit.
6. Lampiran disimpan di DB (`bytea`, maks. 10 MB). Untuk volume besar perlu object storage.

## Keputusan user yang dibutuhkan

1. Buat repo GitHub kosong `aplikasi-komisi` dan beri akses Claude GitHub App, agar saya bisa push.
2. Q-04 timezone perusahaan (K1).
3. Q-05 perlakuan proyek bersama bila target salah satu sales tidak valid.
4. Q-06 definisi OC dan basis pajak (K2).
5. Q-07 login lokal atau SSO.
6. Q-08 hosting UAT/produksi.
7. Setuju bahwa kategori biaya dijadikan berversi dengan approval (risiko 2)?

## Status

```text
FASE 1 SELESAI — MENUNGGU PERSETUJUAN
```

**Apakah saya boleh melanjutkan ke Fase 2?**
