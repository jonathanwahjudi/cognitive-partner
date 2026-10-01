# FASE 0 — Audit Repository, Arsitektur & Rencana Implementasi

**Aplikasi Perhitungan Komisi — acuan: Master Prompt PRD v2.1 Revisi 5**
Tanggal: 2026-10-01 · Status: **MENUNGGU PERSETUJUAN**

> ⚠️ **Catatan sumber penting.** File PRD
> `PRD_Mesin_Perhitungan_Komisi_Revisi_5_Diperbaiki(1).docx` **tidak tersedia**
> di sesi ini (tidak ada di upload maupun di repository). Dokumen ini disusun
> **hanya** dari *Master Prompt Claude Code PRD v2.1 Revisi 5* (`.md`). Bagian PRD
> yang tidak dikutip di master prompt — termasuk rincian lengkap T01–T22, nilai
> K1–K6, dan bagian PRD lain — **belum terbaca**. RTM di bawah wajib divalidasi
> ulang terhadap docx sebelum Fase 1 dimulai.

Dokumen pendamping: [`FASE-0-SKEMA-DATA.md`](./FASE-0-SKEMA-DATA.md) (ERD & skema).

---

## 1. Audit Repository

| Aspek | Temuan |
|---|---|
| Repository | `jonathanwahjudi/cognitive-partner`, 5 commit (Jul 2026), branch `main` + `claude/new-session-0x0315` |
| Tujuan kode yang ada | **"Cognitive Partner"** — demo chatbot AI companion (mode Protector/Navigator/Anchor). **Tidak berkaitan** dengan aplikasi komisi. |
| Stack | Node.js + TypeScript 5 + Express 4 (`backend/`), `cors`, `dotenv`. `ts-node-dev` untuk dev. |
| File kode | 1 file: `backend/src/index.ts` (±150 baris), endpoint `/health`, `/api/session/init`, `/api/chat` |
| Database | **Tidak ada.** Data in-memory (`const sessions: any = {}`). |
| Auth | **Tidak ada.** Ada interface `AuthRequest` tanpa implementasi. |
| Frontend / UI components | **Tidak ada.** |
| Tests | **Tidak ada.** `npm test` = `echo "Error: no test specified" && exit 1`. |
| Deployment | Hanya `backend/Dockerfile.dev` (node:18-alpine, port 5000). Tidak ada CI, docker-compose, IaC, atau konfigurasi produksi. |
| Company assets (logo/warna/font) | **Tidak ditemukan.** → Pakai tema korporat netral + `theme_settings` (PRD §22). |
| Dokumentasi | `docs/DECISIONS.md`, `PITCH.md`, `STRATEGY.md` — semuanya tentang produk Cognitive Partner. |
| Tooling di environment | Node 22.22, npm 10.9, PostgreSQL 16.14 client, Docker 29.6 tersedia. |

**Kesimpulan audit:** tidak ada kode yang dapat dipakai ulang untuk domain komisi.
Yang layak dipertahankan hanya **pilihan bahasa/runtime (TypeScript + Node.js)**.
Express boleh dipertahankan, tetapi kode `cognitive-partner` harus dipisahkan atau
dihapus — **ini keputusan user** (lihat §9, Q-01).

---

## 2. Arsitektur yang Diusulkan

### 2.1 Stack

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Bahasa | TypeScript (strict) end-to-end | Sesuai stack yang ada; satu bahasa untuk engine, API, UI |
| Runtime | Node.js 22 LTS | Tersedia; Dockerfile lama (node 18) di-upgrade |
| API | Express 4 (dipertahankan) + `zod` untuk validasi input | Mempertahankan stack; validasi server-side eksplisit |
| Database | **PostgreSQL 16** | `NUMERIC` presisi tetap, `CHECK`/`UNIQUE`/partial index, `SELECT … FOR UPDATE`, sequence atomik, transaksi `SERIALIZABLE`, trigger append-only |
| Akses DB | `Kysely` (query builder typed, parameterized) + migrasi SQL murni | Kontrol penuh atas constraint, trigger, row lock; tanpa ORM magic |
| Decimal | `decimal.js` (di TS) ↔ `NUMERIC` (di DB); uang dikirim sebagai **string** di JSON | Larangan float (PRD §2.11, §38) |
| Auth | Session cookie httpOnly + Secure + SameSite, store di PostgreSQL, hashing `argon2id`, idle & absolute expiry | PRD §33; SSO dapat ditambahkan bila diminta (Q-07) |
| Frontend | React 18 + Vite + TypeScript, TanStack Query & Table, Tailwind CSS + design tokens dari `theme_settings` | Tabel kaya (sort/filter/sticky/pagination) dan theming |
| Export | `exceljs` (Excel), PDF dirender server-side via Playwright/Chromium dari template HTML laporan | Total export = total layar karena memakai query yang sama |
| Test | Vitest (unit engine), Vitest + PostgreSQL nyata (integration/concurrency), Playwright (E2E + screenshot 1440/1280/768/390) | PRD §32, §36 |
| Deployment | Docker image multi-stage + docker-compose (api, web, postgres) untuk dev/UAT; target produksi **belum diketahui** (Q-08) | |

### 2.2 Struktur Monorepo (npm workspaces)

```text
apps/
  api/            Express: routes, auth, RBAC, transaksi, workflow, export
  web/            React SPA (Bahasa Indonesia)
packages/
  engine/         MESIN KOMISI MURNI — tanpa I/O, deterministik
                  (cost & margin, grade, band lookup, komisi, rounding, eligibility rules)
  shared/         tipe, skema zod, util Decimal, enum status
db/
  migrations/     SQL migrasi bernomor
  seeds/qa/       FIXTURE QA SINTETIS — ditandai is_qa_fixture, tidak pernah dimuat di produksi
docs/komisi/      dokumen fase
```

### 2.3 Prinsip Arsitektur Kunci

1. **Engine murni & deterministik.** `packages/engine` menerima *snapshot input*
   (proyek revisi, alokasi, target revisi, versi aturan, kebijakan rounding)
   dan mengembalikan hasil + jejak formula. Tidak membaca jam, DB, atau env.
   Hasil final dapat direproduksi bit-per-bit dari snapshot (PRD §2.12, §13).
2. **Rekalkulasi per (sales, kuartal).** Unit kalkulasi adalah seluruh rangkaian
   event pengakuan seorang sales dalam satu kuartal, diurutkan
   `(tanggal_efektif ASC, recognition_seq ASC)`. Grade Komisi proyek ke‑n =
   f(kumulatif proyek 1..n‑1). Kuartal baru → kumulatif 0 → Grade 1 (PRD §5).
3. **Decision Gate K1–K6.** Setiap kalkulasi diberi `mode = SIMULASI | PRODUKSI`.
   Server menolak finalisasi/klaim/pembayaran produksi bila ada keputusan K
   yang belum `Aktif` untuk tanggal efektif terkait (PRD §30, T22).
4. **Tidak ada nilai bisnis di kode.** Tarif, faktor biaya, pembagi `d`, metrik
   lookup, rounding, timezone — semuanya data berversi dengan approval.
   Missing rule → **blokir**, bukan 0% (PRD §11, §38).
5. **Hak stabil, revisi kalkulasi berganti.** `commission_entitlements` unik pada
   `(project_id, sales_person_id, entitlement_type)`; kalkulasi baru hanya
   menambah `commission_calculation_revisions` (PRD §14).
6. **Uang dijaga di DB, bukan hanya di aplikasi.** Klaim/approve/bayar:
   transaksi + `SELECT … FOR UPDATE` pada entitlement + idempotency key unik +
   partial unique index "satu klaim aktif per entitlement" (PRD §17).
7. **Append-only.** `audit_events`, `approval_events`, hasil final, pembayaran:
   trigger DB menolak `UPDATE`/`DELETE`; koreksi = revisi/adjustment/reversal
   (PRD §13, §18, §28).
8. **Authorization server-side & object-level.** Setiap query dibatasi *scope*
   user (sales sendiri, tim manajer, dll). Admin Sistem tanpa wewenang approval
   bisnis. Pemisahan tugas: pengaju ≠ approver (PRD §20).

### 2.4 Alur Kalkulasi (mapping PRD §12)

```text
[Finance verifikasi tanggal efektif] → recognition_seq (sequence DB, atomik, sekali)
          │
          ▼
Ambil semua event aktif sales X di kuartal Q, urut (eff_date, seq)
          │  untuk setiap event:
          ▼
 L1 validasi (proyek, target>0, alokasi 0–100 & Σ=100, RPE, Cost&Margin, K1–K6, approval)
 L2 cum_before            L3 ach_before = cum_before/target → Grade Komisi (presisi penuh)
 L4 metric = (P−A)/P → lookup band(grade, metric) di matrix versi efektif → rate (tepat 1 match)
 L5 raw = A × rate × alokasi_komisi → rounded (HALF_UP, Rp1 — jika K5 aktif)
 L6 cum_after = cum_before + S × kontribusi_target → Grade Tercapai (untuk event berikutnya)
 L8 simpan snapshot lengkap (§13)
```

---

## 3. Requirement Traceability Matrix (RTM)

Kolom: **DB** = tabel/constraint · **BE** = API/engine · **FE** = UI · **Sec** = keamanan · **Test** = test ID · **F** = fase.

| ID | Requirement (sumber) | DB | BE | FE | Sec | Test | F |
|---|---|---|---|---|---|---|---|
| R-01 | Grade 1–4 batas <50, ≥50, ≥75, ≥100; presisi penuh (§5) | `grade_rule_versions` (band berversi) | engine `gradeFor()` Decimal tanpa rounding | Skema Komisi › Grade | approval Direktur | T01, T02 | 2 |
| R-02 | Grade Komisi = grade sebelum proyek; Grade Tercapai berlaku proyek berikutnya (§5) | snapshot `grade_komisi`, `grade_tercapai` | engine loop berurutan | Detail kalkulasi | — | T01, T03 | 2 |
| R-03 | Awal kuartal kumulatif 0, tanpa carry-over (§5) | `quarter` di event | engine partisi per kuartal | — | — | T04 | 2 |
| R-04 | Kenaikan grade normal tidak hitung ulang proyek lama (§5) | revisi lama tidak berubah | engine append-only | — | — | T01, T13 | 2 |
| R-05 | Target per sales/tahun/kuartal, berrevisi, approval; target ≤0/kosong → blokir (§6) | `sales_targets`, `target_revisions` CHECK `target>0` | validasi L1 → status Terblokir | Target Penjualan | approve Direktur | T12 | 1–2 |
| R-06 | Total penjualan sales = Σ S × kontribusi target, hanya yang diakui K1; OC tidak mengurangi (§6) | view `v_sales_quarter_totals` | query agregat tunggal | Dashboard | scope | T06, T21 | 2, 5 |
| R-07 | Total perusahaan tidak menggandakan proyek bersama (§6, §24) | agregat per `project_id` | query terpisah | Dashboard Manajemen | — | T21 | 5 |
| R-08 | ID proyek tetap + nomor referensi unik (§7) | `projects.reference_no UNIQUE` | — | Proyek | — | unit | 1 |
| R-09 | Kontribusi Target % ≠ Alokasi Komisi %, masing 0–100, Σ=100; beda butuh alasan + approval Direktur (§7, K4) | `project_sales_allocations` CHECK 0–100; validasi Σ di finalisasi | validasi + workflow approval | Alokasi Sales | approval | T06, T12 | 1 |
| R-10 | Grade pribadi per sales, bukan grade owner (§7) | entitlement per sales | engine per sales | — | — | T06 | 2 |
| R-11 | Pengakuan sekali via tanggal efektif terverifikasi Finance; bukan created/invoice/paid/edit date (§8, K1) | `sales_recognition_events` | endpoint verifikasi Finance | Proyek › verifikasi | role Finance | T13, T14 | 2 |
| R-12 | Urutan (eff_date, seq); seq unik, atomik, stabil, tidak berubah saat revisi (§8) | `recognition_seq` dari SEQUENCE, UNIQUE, immutable trigger | — | — | — | T14 | 2 |
| R-13 | Kuartal kalender + timezone perusahaan (§8) | `company_settings.timezone` (berversi) | util kuartal | Pengaturan | — | unit | 1 |
| R-14 | K1 belum disetujui → kalkulasi hanya Simulasi (§8, §30) | `business_decisions` | gate | badge "SIMULASI" | — | T22 | 1–2 |
| R-15 | RPE: supplier, qty, harga, mata uang, kurs+tanggal+bukti, lokal/impor/jasa, hw/sw, biaya-biaya (§9) | `rpe_headers`, `rpe_items`, `rpe_cost_lines`, `attachments` | CRUD + validasi | RPE | Finance verify | T08 | 1 |
| R-16 | Supplier Value IDR = qty × harga × kurs; IDR kurs=1; kurs historis tidak berubah otomatis (§9) | `fx_rate` disimpan per item, immutable setelah verifikasi | engine | RPE | — | T08 | 1 |
| R-17 | Total Cost = Σ(SupplierIDR × faktor) + Σ biaya tambahan non-covered; `covered_by_factor`; tolak double-count (§9) | `cost_categories.covered_by_factor`, `cost_factor_versions` | engine + validasi | RPE | — | T08 | 1 |
| R-18 | Faktor tidak di-hard-code sebelum K2 (§9) | data berversi | — | — | — | review | 1 |
| R-19 | P=C/d, A=S−O, margin sebelum/sesudah OC, diskon, OC-eq, Total Diskon+OC (§10) | `cost_margin_revisions` | engine `costMargin()` | Cost & Margin | — | T07, T09 | 1 |
| R-20 | Validasi S>0, P>0, C≥0, 0≤O≤S, d>0; A=0 → margin% N/A; diskon negatif tidak di-0-kan (§10) | CHECK constraint | engine | inline validation | — | T07, T09, T12 | 1 |
| R-21 | Matriks Grade 1–4, band [lower, upper), versi, efektif, satu metrik per versi (§11, K3) | `commission_policy_versions`, `commission_scheme_bands` | validator aktivasi | Skema Komisi | approval Direktur | T10 | 2 |
| R-22 | Validasi matriks: overlap, gap, tarif kosong, <0/>100, multi/no match, overlap tanggal efektif → blokir; 0% hanya jika eksplisit (§11) | EXCLUDE constraint (`tstzrange`/`numrange`) + validator | validator | pesan error | — | T10 | 2 |
| R-23 | Komisi = A × rate × alokasi komisi (§12, K4) | snapshot | engine | Formula ditampilkan | — | T05, T06 | 2 |
| R-24 | Total komisi proyek = Σ rounded per sales (§12 L7) | — | engine | Detail proyek | — | T06 | 2 |
| R-25 | Snapshot lengkap 30+ field (§13) | `commission_calculation_revisions` (+ `input_snapshot JSONB`, hash) | engine output | Histori | immutable | T13, T19 | 2 |
| R-26 | Entitlement stabil (project+sales+jenis); revisi tidak menciptakan hak baru (§14) | UNIQUE `(project_id, sales_person_id, entitlement_type)` | upsert | — | — | T16, T19 | 2 |
| R-27 | Layak hanya setelah K6: invoice rekonsiliasi, piutang 0, credit note, tanpa dispute, kalkulasi final, Finance verifikasi (§15) | `invoices`, `customer_receipts`, `receipt_allocations`, `credit_notes`, `disputes` | eligibility evaluator | Sales/Piutang | Finance | T18 | 3 |
| R-28 | State machine Kalkulasi/Eligibility/Claim/Payment (§16) | enum + CHECK transisi via fungsi | state machine terpusat | badge teks | — | T15, T18 | 2–3 |
| R-29 | Pengaju tidak boleh approve sendiri (§16, §20) | CHECK `approved_by <> submitted_by` | guard | tombol disembunyikan **dan** ditolak server | SoD | T20 | 3 |
| R-30 | Pembayaran manual, tanpa transfer bank (§16, §34) | `commission_payments` | — | Pembayaran | Finance | — | 3 |
| R-31 | Saldo Hak = Final + Adj+ − Adj− − Bayar; saldo bebas − reservasi klaim aktif; hitung ulang dalam transaksi + lock (§17) | view + `FOR UPDATE` | service | Klaim | — | T15 | 3 |
| R-32 | Idempotency key; satu klaim aktif per entitlement; tidak bayar > saldo (§17) | `idempotency_records UNIQUE`, partial unique index, CHECK | middleware | — | concurrency | T15 | 3 |
| R-33 | Koreksi via revisi; simulasi dampak dari event terdampak paling awal s/d akhir kuartal; delta; approval (§18) | `correction_cases`, revisi baru | engine `simulateImpact()` | Koreksi | approval Direktur | T13 | 4 |
| R-34 | Adjustment = hasil baru − hasil disetujui lama; negatif → overpayment case, tanpa potong otomatis (§18) | `adjustments`, `overpayment_cases` | service | Koreksi | — | T16, T17 | 4 |
| R-35 | Period lock: Finance usul, Direktur setujui; reopen dengan alasan, simulasi, approval, audit (§19) | `period_locks`, `period_reopen_requests` | guard di setiap write | Pengaturan › Periode | — | T20 | 4 |
| R-36 | RBAC 5 role; Admin Sistem tanpa approval bisnis; object-level (§20) | `roles`, `permissions`, `user_roles`, `team_members` | middleware `authorize(perm, objectScope)` | menu per role | — | T20 | 1 |
| R-37 | Schema minimum §21; FK, index, CHECK, UNIQUE, transaksi; tanpa hard-delete record final | lihat dokumen skema | — | — | — | migration test | 1–4 |
| R-38 | UI modern, Bahasa Indonesia, responsif, tema netral + theme config; navigasi minimum (§22) | `theme_settings` | — | layout | — | screenshot | 1, 5 |
| R-39 | Dashboard Sales & Manajemen dengan metrik wajib (§23, §24) | views | endpoint agregat | Dashboard | scope | T21 | 5 |
| R-40 | Detail proyek: tab & penjelasan kalkulasi (§25) | — | — | Detail Proyek | scope | E2E | 2, 5 |
| R-41 | Tabel: search/filter/sort/pagination/sticky/totals/IDR kanan/badge; form: inline validation, konfirmasi; state loading/empty/error/retry/unauthorized/incomplete/simulasi/blocked (§26) | — | pagination server-side | komponen DataTable/Form | — | E2E | 1, 5 |
| R-42 | Export Excel & PDF mengikuti filter, scope, revisi, tanggal; total sama (§27) | — | export service memakai query yang sama | tombol Export | scope | T21 | 5 |
| R-43 | Audit append-only (actor, waktu, objek, aksi, old/new, alasan, request id, approval ref) (§28) | `audit_events` + trigger tolak UPDATE/DELETE | middleware audit dalam transaksi yang sama | Histori | — | integration | 1 |
| R-44 | Presisi: decimal, % ≥ 6 desimal, tanpa round sebelum lookup, round sekali per entitlement, Rp1 HALF_UP (§29, K5 — usulan) | `rounding_policies` berversi | engine | — | — | T11 | 2 |
| R-45 | Decision gate K1–K6 (status, nilai, efektif, bukti, pembuat, approver) (§30) | `business_decisions` | gate | Pengaturan › Keputusan K1–K6 | Direktur | T22 | 1 |
| R-46 | Gate produksi (§31) | — | checklist endpoint | halaman Kesiapan Produksi | — | T22 | 5 |
| R-47 | NFR: 20 user, 10k proyek, p95 ≤3 s; session expiry; TLS; secrets env; tidak log password/token; backup harian terenkripsi; RPO 24 j / RTO 8 j, uji restore (§33) | index | logger redaksi | — | — | load test, restore drill | 5 |
| R-48 | Pembayaran reversal (§35 Fase 4) | `commission_payments` reversal row (negatif, referensi) | service | Pembayaran | approval | T17 | 4 |
| R-49 | UAT tambahan: retur, pindah kuartal, ubah target, ganti owner, multi-invoice, refund, sales nonaktif, valas, backup restore (§32) | — | — | — | — | UAT-01..09 | 3–5 |

---

## 4. Status Keputusan K1–K6

Semua keputusan berstatus **BELUM DISETUJUI** berdasarkan dokumen yang tersedia.
Master prompt hanya memuat **"Usulan PRD"**. Konsekuensi: aplikasi berjalan pada mode
**SIMULASI**; finalisasi, klaim, dan pembayaran produksi **diblokir** (PRD §30).

| K | Cakupan | Usulan di master prompt | Konfigurasi yang masih **tidak tersedia** | Status |
|---|---|---|---|---|
| **K1** | Pengakuan penjualan & periode | Diakui sekali pada tanggal efektif terverifikasi Finance; kuartal kalender; urut (tanggal, seq) | **Timezone perusahaan**; definisi "tanggal efektif" (BAST? PO? serah terima?); perlakuan retur/pembatalan; proyek pindah kuartal | Usulan — belum disetujui |
| **K2** | Biaya, pricelist, OC, pajak, faktor, kurs | Rumus §9–§10 | **Nilai faktor biaya** lokal/impor/jasa (hw/sw); **pembagi pricelist `d`**; **basis pajak** (S termasuk/tidak termasuk PPN?); **definisi OC** dan siapa yang menetapkan; **sumber & aturan kurs**; daftar kategori biaya dan `covered_by_factor` | Belum ada nilai |
| **K3** | Matriks diskon & tarif Grade 1–4 | Metrik lookup = Total Diskon + OC; interval [lower, upper) | **Seluruh band & tarif Grade 1–4**; **domain metrik yang didukung** (mis. apakah diskon negatif/markup didukung, batas atas) untuk validasi gap | Belum ada nilai |
| **K4** | Penerima, dasar, alokasi | Dasar A = S−O; Komisi = A × rate × alokasi; Σ kontribusi = Σ alokasi = 100%, beda dengan approval Direktur | Jenis hak (`entitlement_type`) selain "dasar"? Siapa yang boleh menjadi penerima (sales nonaktif? manajer?) | Usulan — belum disetujui |
| **K5** | Presisi, rounding, batas nominal | Decimal; % ≥6 desimal; round sekali per entitlement; Rp1 HALF_UP | **"Batas nominal"** (plafon/min komisi?) belum dijelaskan | Usulan — belum disetujui |
| **K6** | Eligibility, CN/refund/dispute, koreksi, approval, pembayaran | Syarat layak 6 butir (§15) | Matriks approval rinci (batas nominal per approver?); aturan refund setelah komisi dibayar; boleh klaim sebagian dari saldo? | Usulan — belum disetujui |

> Nilai uji (faktor 1.1 di T08, tarif 2%/3% di T05/T06, band [0,10%)/[10,20%) di T10)
> adalah **fixture QA sintetis** — tidak akan dipakai sebagai konfigurasi produksi
> (PRD §2.9). Fixture ditandai `is_qa_fixture = true` dan diblokir di mode produksi.

---

## 5. Konfigurasi yang Belum Tersedia (ringkas)

1. File PRD `.docx` lengkap (termasuk definisi rinci T01–T22).
2. Timezone perusahaan.
3. Definisi "tanggal efektif penjualan".
4. Daftar kategori biaya + `covered_by_factor` + nilai faktor per kategori/jenis.
5. Pembagi pricelist `d` (tunggal atau per kategori?).
6. Basis pajak untuk S, C, P, O.
7. Definisi dan sumber OC.
8. Kebijakan dan sumber kurs.
9. Matriks band + tarif Grade 1–4 dan domain metrik.
10. Target kuartalan setiap sales.
11. Daftar sales, tim, manajer, Direktur, Finance (user awal).
12. Logo/warna/identitas perusahaan (opsional; tanpa ini → tema netral).
13. Target hosting produksi, mekanisme backup, SSO/IdP (jika ada).

---

## 6. Risiko & Ambiguitas (tanpa mengarang jawaban)

| # | Risiko / Ambiguitas | Dampak | Mitigasi yang diusulkan |
|---|---|---|---|
| A-01 | PRD docx tidak tersedia; hanya master prompt | Requirement terlewat / salah tafsir | User mengunggah docx; RTM direvisi sebelum Fase 1 |
| A-02 | Repository berisi proyek lain (Cognitive Partner) | Konflik kode/dokumen, kebingungan | User memutuskan (Q-01) |
| A-03 | Singkatan **OC** tidak didefinisikan di master prompt | Salah sumber data O | Konfirmasi definisi di K2 |
| A-04 | Basis pajak tidak ditentukan | S, P, margin, dan komisi bisa salah | K2 wajib sebelum produksi |
| A-05 | Domain metrik lookup tidak ditentukan → validasi "gap pada domain yang didukung" tidak bisa dilakukan | Aktivasi matriks tidak bisa divalidasi | Domain menjadi atribut eksplisit `commission_policy_versions` (min, max) yang wajib diisi |
| A-06 | Diskon negatif (S > P) — band mana yang berlaku? | No-match → blokir | Default perilaku: **blokir** (sesuai §11) sampai matriks mencakupnya |
| A-07 | Proyek bersama di mana sales B tidak punya target kuartal itu | Seluruh proyek terblokir atau hanya bagian B? | Usul teknis: blokir per entitlement sales tsb.; **perlu keputusan** (Q-05) |
| A-08 | Revisi target di tengah kuartal | Grade proyek sebelumnya berubah? | Diperlakukan sebagai koreksi historis (§18) dengan simulasi dampak; perlu konfirmasi |
| A-09 | Backdated insertion ke kuartal yang sudah terkunci | Konflik dengan period lock | Wajib reopen workflow (§19) |
| A-10 | Σ rounded per sales ≠ rounded(total proyek) | Selisih Rp1 | Sesuai §12 L7 total = Σ rounded; ditampilkan transparan |
| A-11 | Partial claim / partial payment komisi | Desain claim lines | Desain mendukung nominal klaim ≤ saldo bebas; aturan bisnis via K6 |
| A-12 | Dispute / refund setelah komisi dibayar | Overpayment | Overpayment case manual, tanpa pemotongan otomatis (§18) |
| A-13 | Performa rekalkulasi kuartal saat koreksi besar | Lambat | Rekalkulasi per (sales, kuartal) saja; batch job retry-safe |
| A-14 | Kebocoran data antar sales | Pelanggaran akses | Object-level scope di layer query + test T20 |
| A-15 | Penggunaan fixture QA di produksi | Komisi salah dibayar | Flag `is_qa_fixture` + gate server + seed terpisah |
| A-16 | Kurs: siapa yang input, apakah per item atau per proyek | Inkonsistensi | Disimpan per item RPE, immutable setelah verifikasi |
| A-17 | Hosting/backup produksi belum diketahui | RPO/RTO tidak terbukti | Fase 5: prosedur `pg_dump` terenkripsi + restore drill di environment UAT |

---

## 7. Rencana Implementasi Fase 1–5

Setiap fase diakhiri: test benar-benar dijalankan, UI QA (screenshot 1440/1280/768/390
untuk fase dengan UI), laporan format §37, **STOP menunggu persetujuan**.

### Fase 1 — Foundation & Core Data
- Monorepo, Docker Compose (Postgres 16), CI lint/typecheck/test.
- Migrasi: users/roles/permissions/teams, sales_people, customers, projects + revisions,
  allocations, targets + revisions, RPE + cost lines, cost_margin_revisions,
  business_decisions (K1–K6), company/theme settings, attachments, audit_events (append-only).
- Auth session + RBAC + object-level scope middleware; audit middleware.
- Engine: `costMargin()` (R-15..R-20) + util Decimal/kuartal.
- UI dasar: layout, navigasi minimum, login, Master Data, Proyek, Alokasi, Target, RPE,
  Cost & Margin, Pengaturan › Keputusan K1–K6; badge SIMULASI; seluruh state wajib.
- Test: T07, T08, T09, sebagian T12, RBAC dasar.

### Fase 2 — Achievement, Grade & Commission Engine
- Recognition events + sequence atomik/stabil; partisi kuartal per timezone.
- Grade rule versions, commission policy versions + bands + validator aktivasi.
- Engine kalkulasi kuartal per sales, entitlement stabil, snapshot lengkap + hash input,
  rekalkulasi deterministik; halaman Pencapaian Sales, Skema Komisi, Perhitungan Komisi,
  tab Perhitungan di detail proyek.
- Test: T01–T07, T10–T12, T14, dan T13 bagian engine.

### Fase 3 — Receivables, Eligibility, Claims & Payments
- Invoice, receipts, receipt allocation, credit note, dispute; eligibility evaluator.
- Klaim + claim lines + reservasi saldo, approval (SoD), pembayaran manual sebagian/penuh.
- Idempotency, row lock, partial unique index.
- Test: T15 (uji konkuren nyata ke Postgres), T18, T20.

### Fase 4 — Historical Corrections & Period Lock
- Correction case, impact simulation (earliest affected event → akhir kuartal), delta per proyek,
  approval, revisi baru; adjustment ±; overpayment case; payment reversal.
- Period lock + reopen workflow.
- Test: T13, T16, T17, T19, T20 (locked quarter).

### Fase 5 — Dashboard, Reports, Export & Production Readiness
- Dashboard Sales & Manajemen, laporan, export Excel/PDF (query identik), rekonsiliasi.
- Responsif, aksesibilitas (kontras, keyboard, label), branding config.
- Load test (20 user, 10k proyek, p95 ≤ 3 s), backup terenkripsi + restore drill.
- Halaman Kesiapan Produksi (checklist §31). Jalankan T01–T22 + UAT-01..09.
- Produksi tetap **diblokir** bila gate belum terpenuhi.

---

## 8. Strategi Test (ringkas)

| Lapisan | Alat | Cakupan |
|---|---|---|
| Unit engine | Vitest | Rumus cost/margin, grade boundary (49,999999 → G1), band lookup, rounding HALF_UP, urutan |
| Property-based | `fast-check` | Determinisme (input sama → hasil sama), Σ alokasi, tidak ada float |
| Integration | Vitest + Postgres nyata (container) | Constraint, trigger append-only, RBAC, period lock |
| Concurrency | N request paralel dengan idempotency key sama/beda | T15: tepat satu sukses |
| E2E + visual | Playwright (Chromium terpasang) | Alur utama + screenshot 4 viewport |
| UAT | Skrip kasus + data perusahaan | Setelah K1–K6 disetujui |

---

## 9. Keputusan User yang Dibutuhkan

| ID | Pertanyaan |
|---|---|
| **Q-01** | Repository ini berisi proyek *Cognitive Partner*. Apakah aplikasi komisi dibangun **di repo ini** (kode lama dipindah ke `legacy/` atau dihapus), atau di **repo baru**? |
| **Q-02** | Mohon unggah `PRD_Mesin_Perhitungan_Komisi_Revisi_5_Diperbaiki(1).docx` agar RTM dapat divalidasi penuh. |
| **Q-03** | Setujui stack usulan (TypeScript/Express/PostgreSQL/Kysely/React/Vite)? |
| **Q-04** | Timezone perusahaan yang disetujui (K1)? |
| **Q-05** | Bila salah satu sales di proyek bersama tidak punya target valid: blokir seluruh proyek atau hanya entitlement sales tersebut? |
| **Q-06** | Definisi OC dan basis pajak (K2)? |
| **Q-07** | Autentikasi: akun lokal (username/password) cukup untuk MVP, atau wajib SSO (Google Workspace/Microsoft)? |
| **Q-08** | Target hosting UAT/produksi (VPS, cloud, on-premise)? |

Q-04..Q-06 tidak memblokir Fase 1 (sistem tetap mode SIMULASI); Q-01 dan Q-03 memblokir.

---

> **FASE 0 SELESAI — MENUNGGU PERSETUJUAN**
>
> Apakah saya boleh melanjutkan ke Fase 1?
