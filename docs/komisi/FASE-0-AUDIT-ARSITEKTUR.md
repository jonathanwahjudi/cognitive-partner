# FASE 0 — Audit Repository, Arsitektur & Rencana Implementasi

**Aplikasi Perhitungan Komisi — acuan: Master Prompt PRD v2.1 Revisi 5**
Tanggal: 2026-10-02 (revisi 2 — divalidasi terhadap PRD docx) · Status: **MENUNGGU PERSETUJUAN**

> **Sumber (revisi 2 dokumen ini).** PRD
> `PRD_Mesin_Perhitungan_Komisi_Revisi_5_Diperbaiki.docx` (v2.1 Revisi 5, 2 Oktober 2026,
> Bagian 1–21) **telah dibaca penuh** dan dicocokkan dengan Master Prompt. Referensi
> `§` pada RTM baris R-01..R-49 merujuk ke Master Prompt; baris R-50 dst. adalah
> kebutuhan yang **hanya ada di PRD** (lihat §3A untuk peta Bagian PRD → RTM).
> Bila PRD dan Master Prompt berbeda, **PRD yang berlaku**.

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
| R-50 | Data biaya sensitif butuh izin khusus (PRD 4) | permission `cost.view_sensitive` | field-level masking di serializer | kolom biaya disembunyikan | object + field level | T20 ext | 1 |
| R-51 | Pengaju tidak boleh menyetujui klaim **atau perubahan aturannya sendiri**; jika approver tidak tersedia proses **ditahan** (PRD 4) | CHECK approver ≠ proposer pada semua tabel approval | guard generik `assertNotSelf()`; status `DITAHAN_MENUNGGU_APPROVER` | — | SoD | T20 | 1–3 |
| R-52 | Sales: departemen, status aktif; penonaktifan tidak menghapus hak (PRD 5) | `sales_people.department`, `is_active` | — | Master Data | — | UAT sales nonaktif | 1 |
| R-53 | Alokasi punya **peran**; maks. **satu alokasi gabungan per sales per proyek** (PRD 5, 6) | `project_sales_allocations.role`, UNIQUE(rev, sales) | — | Alokasi Sales | — | unit | 1 |
| R-54 | Nilai penjualan hanya dari revisi proyek **terverifikasi** (PRD 6) | `project_revisions.status = TERVERIFIKASI` | engine hanya baca revisi terverifikasi | — | Finance | unit | 1–2 |
| R-55 | **Import** proyek: preview, validasi per baris, identitas sumber, laporan error, idempoten (tidak menggandakan proyek) (PRD 6) | `import_batches`, `import_rows`, UNIQUE(source_hash) | import service 2 tahap (preview → commit) | wizard Import | — | integration | 1 |
| R-56 | Pengakuan sebagian (per invoice/penerimaan) **tidak boleh** diaktifkan lewat opsi bebas (PRD 6) | — | tidak ada toggle | — | — | review | 2 |
| R-57 | RPE: jelas apakah harga = **per unit atau total baris** (PRD 7) | `rpe_items.price_basis` (`UNIT`/`TOTAL_BARIS`) | engine normalisasi | RPE | — | T08 ext | 1 |
| R-58 | Perubahan biaya menghasilkan revisi yang dapat ditelusuri; RPE meneruskan ke Cost & Margin otomatis (PRD 7) | revisi RPE → `cost_margin_revisions` | — | — | — | integration | 1 |
| R-59 | S dan O **basis pajak sama** (K2); OC tidak dimasukkan lagi ke Total Cost (PRD 8) | `tax_basis` di revisi proyek | validasi | — | — | unit | 1 |
| R-60 | Input OC **persen** wajib minta basis (S atau P); simpan persen, basis, nominal hasil konversi (PRD 8) | `oc_input_pct`, `oc_input_basis`, `oc_amount` | konversi Decimal | form OC | — | unit | 1 |
| R-61 | Diskon negatif: aturan harus mencakup **atau kalkulasi ditahan untuk ditinjau**; nilai rugi ditandai untuk persetujuan (PRD 8) | `requires_review_flags` | status Terblokir/Ditinjau | badge | — | unit | 1–2 |
| R-62 | Target: satu revisi aktif; target tahunan = Σ 4 kuartal; bila bulanan dipakai Σ 3 bulan = kuartal; tanpa prorata kecuali kebijakan disetujui; sales baru/mutasi/nonaktif tetap butuh target eksplisit (PRD 9) | partial unique revisi aktif; `target_monthly_breakdowns` (opsional) | validasi | Target | — | unit | 1 |
| R-63 | Perubahan target di kuartal berjalan: alasan + simulasi dampak + revisi baru + approval; target yang dipakai hasil final tidak boleh ditimpa (PRD 9) | revisi immutable | correction flow | — | Direktur | T13 ext | 1, 4 |
| R-64 | Grade rule berubah di tengah kuartal → grade before/after dihitung dengan versi yang berlaku **pada proyek tsb.**; versi dipilih per **tanggal efektif proyek**, bukan tanggal klaim/bayar (PRD 11) | snapshot versi per event | engine | — | — | T19 | 2 |
| R-65 | Total Komisi Sales per periode = Σ hak final dasar + delta adjustment disetujui; jangan jumlahkan revisi pengganti + delta sekaligus (PRD 12 L7, 15) | `v_entitlement_balances` | — | Dashboard | — | T21 | 2, 5 |
| R-66 | Finalisasi kalkulasi = verifikasi Finance **+** persetujuan Direktur; klaim: Diajukan (sales) → Menunggu Verifikasi (Finance) → Disetujui/Ditolak (Direktur); klaim ditolak dapat diajukan ulang sebagai revisi dengan histori (PRD 14) | `commission_claims.parent_claim_id` | state machine dengan aktor per transisi | Klaim | RBAC per transisi | T20 | 2–3 |
| R-67 | Klaim disetujui tetap mereservasi saldo belum dibayar; pembayaran mengonsumsi reservasinya sendiri (tidak dikurangi dua kali); saldo negatif = kelebihan bayar, tidak boleh dibayar (PRD 14) | view saldo | service | — | — | T15, T17 | 3 |
| R-68 | Perubahan input setelah approval **menahan** proses untuk pemeriksaan ulang; pembayaran hanya untuk klaim disetujui yang masih layak (PRD 14) | trigger/flag `on_hold` | guard | badge Ditahan | — | integration | 3 |
| R-69 | Pembayaran dengan **referensi transaksi unik + bukti**; klaim ditutup hanya bila sisa = 0 dan rekonsiliasi selesai; reversal dengan alasan + bukti (PRD 14) | UNIQUE(payment_reference), attachment wajib | — | Pembayaran | Finance | T15 | 3–4 |
| R-70 | Daftar klaim memuat sales, pelanggan, proyek, PO, S, O, A, grade, diskon, tarif, hak, diajukan/disetujui/dibayar, saldo, status pelanggan & klaim (PRD 14) | view | — | Klaim Komisi | scope | E2E | 3 |
| R-71 | Filter wajib laporan: sales, pelanggan, proyek, tahun, kuartal, grade, status; distribusi grade di Dashboard Manajemen (PRD 15) | index | — | Laporan | — | T21 | 5 |
| R-72 | Koreksi tanggal lintas kuartal memeriksa **kedua** kuartal; perubahan OC/biaya/matriks tanpa perubahan kontribusi hanya hitung ulang hak terdampak; hasil disetujui yang terdampak → persetujuan ulang + **tahan klaim terkait** (PRD 16) | — | impact engine | Koreksi | — | T13 ext | 4 |
| R-73 | Retur/credit note: tautkan ke proyek asal, koreksi via revisi, **tanpa proyek bernilai negatif palsu** (PRD 16) | CHECK S>0 tetap; `credit_notes.project_id` | — | — | — | UAT retur | 4 |
| R-74 | Snapshot menyimpan **sumber** (bukan hanya nama versi); urutan & proyek pendahulu dapat direkonstruksi (PRD 17) | `input_snapshot` berisi isi aturan + daftar event pendahulu | — | Histori | — | T13, T14 | 2 |
| R-75 | Pengaturan nama perusahaan, logo, warna utama/aksen, identitas laporan (PRD 18) | `theme_settings`, `company_settings` | — | Pengaturan | Admin Sistem | screenshot | 1, 5 |
| R-76 | Persen menampilkan satuan **dan basisnya**; error dekat field + cara memperbaiki (PRD 18) | — | pesan error terstruktur | komponen form | — | E2E | 1 |
| R-77 | Bukti UAT: input, expected, actual, persetujuan pemilik proses; bug nominal/akses/pembayaran wajib selesai sebelum produksi (PRD 19) | `uat_cases` (opsional) | — | — | — | UAT | 5 |
| R-78 | Kalkulasi besar memakai **job** dengan status & error jelas; job retry tanpa duplikasi; retensi data disetujui sebelum penghapusan apa pun (PRD 21) | `calculation_jobs` | worker idempoten | status job | — | integration | 2, 5 |

## 3A. Peta Bagian PRD → RTM

| Bagian PRD | Topik | Baris RTM |
|---|---|---|
| 1–3 | Gambaran, tujuan, alur, prinsip | R-01..R-04, R-06, R-23 |
| 4 | Peran & hak akses | R-36, R-50, R-51 |
| 5 | Model data utama | R-37, R-52, R-53 |
| 6 | Sales & proyek, pengakuan & urutan | R-08..R-14, R-53..R-56 |
| 7 | RPE & biaya | R-15..R-18, R-57, R-58 |
| 8 | Cost & Margin | R-19, R-20, R-59..R-61 |
| 9 | Target | R-05, R-62, R-63 |
| 10 | Pencapaian & grade | R-01..R-03, R-06 |
| 11 | Skema komisi | R-21, R-22, R-64 |
| 12 | Logika kalkulasi + K5 | R-23..R-25, R-44, R-65 |
| 13 | Contoh Susan (target Q1 Rp3.000.000.000) | R-02, T01 |
| 14 | Kelayakan, klaim, pembayaran, anti ganda | R-26..R-32, R-66..R-70 |
| 15 | Dashboard & laporan | R-39, R-42, R-65, R-71 |
| 16 | Validasi & koreksi historis, period lock, retur | R-33..R-35, R-72, R-73 |
| 17 | Audit & reproduksi | R-43, R-74 |
| 18 | Navigasi & UI | R-38, R-40, R-41, R-75, R-76 |
| 19 | T01–T22 + UAT | §8, R-49, R-77 |
| 20 | Keputusan K1–K6 + gate produksi | R-45, R-46, §4 |
| 21 | Non-fungsional | R-47, R-78 |

**Ketidaksesuaian yang ditemukan:** tidak ada konflik rumus antara PRD dan Master Prompt.
PRD lebih rinci pada R-50..R-78 (di atas). Satu catatan: PRD §21 menyebut aplikasi
**berfokus desktop**, sementara Master Prompt §36 meminta uji hingga 390px — keduanya
dipenuhi (desktop-first, tetap dapat dipakai di tablet/ponsel dengan horizontal scroll).

---

## 4. Status Keputusan K1–K6

Semua keputusan berstatus **BELUM DISETUJUI** berdasarkan dokumen yang tersedia.
Master prompt hanya memuat **"Usulan PRD"**. Konsekuensi: aplikasi berjalan pada mode
**SIMULASI**; finalisasi, klaim, dan pembayaran produksi **diblokir** (PRD §30).

| K | Cakupan | Usulan di master prompt | Konfigurasi yang masih **tidak tersedia** | Status |
|---|---|---|---|---|
| **K1** | Pengakuan penjualan & periode | Diakui sekali pada tanggal efektif terverifikasi Finance; kuartal kalender; urut (tanggal, seq) | **Timezone perusahaan**; definisi "tanggal efektif" (BAST? PO? serah terima?); perlakuan retur/pembatalan; proyek pindah kuartal | Usulan — belum disetujui |
| **K2** | Biaya, pricelist, OC, pajak, faktor, kurs | Rumus PRD 7–8 (P = C/d, OC setara = O/P, dst.) | **Nilai faktor** lokal/impor/jasa (hw/sw); **pembagi `d`**; **cakupan biaya dalam faktor**; **perlakuan pajak** (S dan O wajib basis sama); **kebijakan kurs**; **apakah ada komponen jasa yang dikecualikan**; definisi/kepanjangan **OC** (tidak dijabarkan di PRD) | Belum ada nilai |
| **K3** | Matriks diskon & tarif Grade 1–4 | Metrik = Total Diskon + OC berbasis Pricelist; [lower, upper) | **Seluruh rentang & tarif resmi**; **domain diskon yang diperbolehkan** (termasuk diskon negatif); periode berlaku | Belum ada nilai |
| **K4** | Penerima, dasar, alokasi | A × tarif individual × alokasi; kedua kelompok alokasi Σ 100%; beda boleh dengan approval | **Hak owner, manager, pre-sales** (bila ada) → menentukan `entitlement_type` | Usulan — belum disetujui |
| **K5** | Presisi, rounding, batas nominal | Decimal; % ≥6 desimal; half-up per penerima ke Rp1 | **Batas nominal/qty** sesuai bisnis dan tipe data | Usulan — belum disetujui |
| **K6** | Kelayakan, koreksi, pembayaran | Invoice rekonsiliasi, piutang 0 setelah CN sah, tanpa dispute/refund, kalkulasi final | Definisi **lunas**; perlakuan CN/refund/dispute; alur persetujuan; koreksi periode terkunci; **penanganan kelebihan bayar**; pencatatan **pembayaran parsial** kepada sales | Usulan — belum disetujui |

Sesuai PRD 20: setiap keputusan disimpan dengan status Draft/Disetujui, nilai, tanggal
efektif, bukti, pemberi keputusan, dan pemberi persetujuan. **Direktur menyetujui, Finance
memverifikasi implementasi.** Dokumen PRD yang dipakai untuk coding tidak mengubah usulan
menjadi kebijakan disetujui.

> Nilai uji (faktor 1.1 di T08, tarif 2%/3% di T05/T06, band [0,10%)/[10,20%) di T10)
> adalah **fixture QA sintetis** — tidak akan dipakai sebagai konfigurasi produksi
> (PRD §2.9). Fixture ditandai `is_qa_fixture = true` dan diblokir di mode produksi.

---

## 5. Konfigurasi yang Belum Tersedia (ringkas)

1. ~~File PRD `.docx`~~ — **sudah diterima dan dibaca.**
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
| A-01 | ~~PRD docx tidak tersedia~~ | — | **Selesai**: PRD dibaca, RTM ditambah R-50..R-78 |
| A-02 | ~~Repository berisi proyek lain~~ | — | **Diputuskan**: repo baru (lokasi: lihat Q-09) |
| A-03 | Singkatan **OC** tidak dijabarkan, juga di PRD | Salah sumber data O | Konfirmasi definisi di K2 |
| A-04 | Basis pajak tidak ditentukan | S, P, margin, dan komisi bisa salah | K2 wajib sebelum produksi |
| A-05 | Domain metrik lookup tidak ditentukan → validasi "gap pada domain yang didukung" tidak bisa dilakukan | Aktivasi matriks tidak bisa divalidasi | Domain menjadi atribut eksplisit `commission_policy_versions` (min, max) yang wajib diisi |
| A-06 | Diskon negatif (S > P) | No-match → blokir | PRD 8: matriks harus mencakup **atau** kalkulasi ditahan untuk ditinjau → default sistem: **Terblokir/Ditinjau** sampai K3 mencakupnya |
| A-07 | Proyek bersama di mana sales B tidak punya target kuartal itu | Seluruh proyek terblokir atau hanya bagian B? | Usul teknis: blokir per entitlement sales tsb.; **perlu keputusan** (Q-05) |
| A-08 | Revisi target di tengah kuartal | Grade proyek sebelumnya berubah? | **Dijawab PRD 9 & 16**: revisi baru + alasan + simulasi dampak + approval; target yang dipakai hasil final tidak ditimpa |
| A-09 | Backdated insertion ke kuartal yang sudah terkunci | Konflik dengan period lock | Wajib reopen workflow (§19) |
| A-10 | Σ rounded per sales ≠ rounded(total proyek) | Selisih Rp1 | Sesuai §12 L7 total = Σ rounded; ditampilkan transparan |
| A-11 | Partial payment komisi | Desain claim lines | **PRD 14**: beberapa transaksi pembayaran atas satu klaim disetujui diperbolehkan; tetap tunduk K6 |
| A-18 | Aplikasi web butuh server (Node.js + PostgreSQL); **iPad tidak dapat menjalankan server** ini secara native | Aplikasi tidak bisa "dijalankan dari folder Downloads iPad" | Kode disimpan di repo baru; dijalankan di server/cloud/PC dan dibuka lewat browser iPad (Q-09, Q-08) |
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
- Auth session + RBAC + object-level scope middleware (termasuk izin khusus data biaya sensitif, PRD 4); audit middleware.
- Import proyek 2 tahap (preview → commit) dengan validasi per baris dan idempotensi (PRD 6).
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
- Klaim ditolak → ajukan ulang sebagai revisi; penahanan otomatis bila input berubah setelah approval (PRD 14).
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
| ~~Q-01~~ | **Dijawab:** repo baru. |
| ~~Q-02~~ | **Dijawab:** PRD diterima. |
| **Q-09** | Repo baru "di iPad, folder Downloads": saya bekerja di container cloud dan **tidak dapat menulis ke iPad**. Pilihan: (a) repo GitHub baru (mis. `jonathanwahjudi/aplikasi-komisi`) yang dapat dibuka/diunduh dari iPad; (b) file `.zip` yang dikirim ke Anda untuk disimpan ke Downloads; (c) keduanya. |
| **Q-03** | Setujui stack usulan (TypeScript/Express/PostgreSQL/Kysely/React/Vite)? |
| **Q-04** | Timezone perusahaan yang disetujui (K1)? |
| **Q-05** | Bila salah satu sales di proyek bersama tidak punya target valid: blokir seluruh proyek atau hanya entitlement sales tersebut? |
| **Q-06** | Definisi OC dan basis pajak (K2)? |
| **Q-07** | Autentikasi: akun lokal (username/password) cukup untuk MVP, atau wajib SSO (Google Workspace/Microsoft)? |
| **Q-08** | Target hosting UAT/produksi (VPS, cloud, on-premise)? |

Q-04..Q-08 tidak memblokir Fase 1 (sistem tetap mode SIMULASI); Q-03 dan Q-09 memblokir.

---

> **FASE 0 SELESAI — MENUNGGU PERSETUJUAN**
>
> Apakah saya boleh melanjutkan ke Fase 1?
