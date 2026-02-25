# Platform Earnings Screen — What Each Section Means & Why Fiat ≠ EZT

## 1. What each section shows

The Admin **Platform Earnings** screen has three main parts. All numbers come **only** from the `platform_earnings_ledger` table (read-only reporting; no recalculation).

---

### 1.1 Top summary cards (above the tables)

- **Total earnings** = `SUM(platform_fee_total)` over all ledger rows in the selected date range.
- **Fiat component** = `SUM(fiat_component)` over the same rows.
- **EZT component** = `SUM(ezt_component)` over the same rows.

So: **Total earnings** is the total platform fee; **Fiat** and **EZT** are the same fee split into two reporting components. By design in the ledger, for each row `platform_fee_total = fiat_component + ezt_component`, so the same holds for the sums.

---

### 1.2 “By tier (click to drill down)”

- **Meaning:** Same ledger, grouped by **partner tier** (Gold, Silver, Bronze).
- **Columns:**
  - **Tier** — Tier name.
  - **Total** — `SUM(platform_fee_total)` for that tier.
  - **Fiat** — `SUM(fiat_component)` for that tier.
  - **EZT** — `SUM(ezt_component)` for that tier.
- **Click:** Clicking a row applies a **tier** filter to the “Report (ledger rows)” below and refetches that table. It does **not** change how the tier totals are calculated; they are always sums from the ledger.

So “By tier” is just **platform fee totals and their Fiat/EZT split, grouped by tier**.

---

### 1.3 “By partner (click to drill down)”

- **Meaning:** Same ledger, grouped by **partner** (e.g. Choni&Chai, Zyxx).
- **Columns:**
  - **Partner** — Partner name.
  - **Total** — `SUM(platform_fee_total)` for that partner.
  - **Fiat** — `SUM(fiat_component)` for that partner.
  - **EZT** — `SUM(ezt_component)` for that partner.
- **Click:** Clicking a row applies a **partner** filter to the “Report (ledger rows)” below.

So “By partner” is **platform fee totals and their Fiat/EZT split, grouped by partner**.

---

### 1.4 “Report (ledger rows)”

- **Meaning:** Individual rows from `platform_earnings_ledger` (optionally filtered by date, tier, partner, etc.), with partner/deal info joined from other tables.
- **Columns:** Date, Tier, Partner, Deal, **Platform fee** (the `platform_fee_total` for that transaction).
- **Expand (►):** Expandable row shows that transaction’s booking_id, deal_title, timestamp, **fiat_component**, **ezt_component**, and **platform_fee_total**.

So the Report is the **underlying ledger lines** that add up to the “By tier” and “By partner” totals. No extra calculation; it’s the same source of truth.

---

## 2. Business rule you want

- Platform fee = **5% of fiat amount** (fiat received by partner).
- That 5% is **split for reporting**: 2.5% as “Fiat”, 2.5% as “EZT”.
- So **Fiat component** and **EZT component** should be **equal** (both 2.5% of the same fiat amount).

So in every row, and in every aggregate (by tier, by partner, overall), you expect:

- **Fiat** = **EZT**
- **Total** = Fiat + EZT = 2 × Fiat = 2 × EZT

---

## 3. Why the screen shows Fiat ≠ EZT (e.g. Gold, Bronze, Choni&Chai, Zyxx)

The screen does **not** compute Fiat/EZT; it only **sums** what is stored in `platform_earnings_ledger`. So if **Fiat** and **EZT** are unequal for a tier or partner, it is because the **stored** `fiat_component` and `ezt_component` in those ledger rows are unequal.

That can happen for two reasons:

1. **Old logic (before the 2.5% / 2.5% split on fiat)**  
   Earlier versions of the code wrote the ledger differently, for example:
   - Fee (or components) were based on **total bill** instead of **fiat received**, or
   - For a while we wrote **ezt_component = 0** and **fiat_component = platform_fee_total** (“fee only on fiat” with no split).

   So many existing rows have a **non–50/50** split (or EZT = 0). When you sum them by tier or partner, you get **Fiat ≠ EZT**.

2. **Current logic (what we do now)**  
   For **new** redemptions we do:
   - `platform_fee_total` = fiat received × **Platform %** (e.g. 5%),
   - `fiat_component` = fiat received × **Fiat %** (e.g. 2.5%),
   - `ezt_component` = fiat received × **EZT %** (e.g. 2.5%).

   So for **new** rows, Fiat and EZT are equal. The mismatch you see is from **old** rows still in the ledger.

**Why Silver can look correct (Fiat = EZT)**  
For Silver you might see Fiat = EZT (e.g. 260 = 260) because:
- Either most of Silver’s ledger rows were created **after** the 2.5%/2.5% fix, or
- By chance the old logic produced equal sums for Silver’s transactions.

So the **screen and the reporting logic are consistent** with the ledger; the **data** for Gold/Bronze/Choni&Chai/Zyxx is a mix of old and (possibly) new logic, which is why Fiat ≠ EZT there.

---

## 4. Summary table

| Section            | What it is                                      | Source of truth        |
|--------------------|--------------------------------------------------|------------------------|
| Total / Fiat / EZT (top) | Overall sums of fee and its split               | `platform_earnings_ledger` |
| By tier            | Same sums, grouped by tier                       | Same                   |
| By partner         | Same sums, grouped by partner                    | Same                   |
| Report (ledger rows) | Individual ledger rows (optionally filtered)   | Same                   |

So there is **no conflict in the screen logic**: every number is a direct sum or row from the ledger. The only “conflict” is between:

- **Your rule:** Fiat = EZT (2.5% / 2.5% of fiat), and  
- **What’s stored:** Many rows were written with older logic, so their `fiat_component` and `ezt_component` are not equal.

---

## 5. How to fix the display so Fiat = EZT everywhere

To make the **screen** show Fiat = EZT for **all** history (not only new redemptions), you have to change the **stored** values. Two options:

### Option A: One-time 50/50 split on existing rows (recommended if you don’t need the old split)

Overwrite existing ledger rows so the **split** is 50/50, without changing total fee:

- For each row: set  
  `fiat_component = platform_fee_total / 2`  
  `ezt_component = platform_fee_total / 2`  
  (with rounding so they still add to `platform_fee_total`).

After that, every tier and partner will show **Fiat = EZT** and **Total = Fiat + EZT**. A script for this is described below.

### Option B: Leave old data as-is

Keep existing rows unchanged. New redemptions will already have Fiat = EZT. Over time, as more new data is added, the aggregates will move toward your rule, but old data will still show Fiat ≠ EZT.

---

## 6. Script to normalize existing rows to 50/50 split

Run from the **backend** folder:

```bash
# Dry run (only reports how many rows would be updated)
node scripts/normalize-platform-earnings-ledger-50-50-split.js

# Apply (updates fiat_component and ezt_component so they are equal and sum to platform_fee_total)
node scripts/normalize-platform-earnings-ledger-50-50-split.js --apply
```

After `--apply`, the Platform Earnings screen will show **Fiat = EZT** for every tier and partner, with **Total = Fiat + EZT**, for all dates.
