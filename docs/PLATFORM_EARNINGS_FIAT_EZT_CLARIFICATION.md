# Platform Earnings: Fiat vs EZT Split — Correctness vs Partner Tiers

## Business rule (non-negotiable)

- **Platform Fee = (Fiat received by partner) × (Platform %)**  
- Fee is calculated **only on the fiat amount** (cash/card). **Not** on EZT.
- That fee is **split for reporting**: Fiat % and EZT % of the **fiat amount**. When Fiat % = EZT % (e.g. 2.5% + 2.5% = 5%), the two **amounts** (fiat_component and ezt_component) are **equal**.

## What the code does (correct)

In `enhancedRedemptionService.js`, for every redemption we write one row to `platform_earnings_ledger`:

- `platform_fee_total = round2(fiatReceived × platform_fee_percent / 100)` — total fee (e.g. 5% of fiat).
- `fiat_component = round2(fiatReceived × fiat_fee_percent / 100)` — e.g. 2.5% of fiat.
- `ezt_component = round2(fiatReceived × ezt_fee_percent / 100)` — e.g. 2.5% of fiat.

So when Partner Tiers show Platform % = 5, Fiat % = 2.5, EZT % = 2.5, the two amounts (fiat_component and ezt_component) are equal, and they sum to platform_fee_total.

## Partner Tiers UI (Fiat % / EZT %)

In **Partner Tiers**, each tier has:

- **Platform %** (e.g. 5.00) — total fee as % of fiat received: `platform_fee_total = fiatReceived × (Platform % / 100)`.
- **Fiat %** and **EZT %** (e.g. 2.50 + 2.50) — **split of that fee** for reporting: each is applied to the **fiat amount**, so when they are equal, the two amounts (Fiat and EZT columns) are equal.

## Why your dashboard can show non-zero EZT

If **Platform Earnings** shows:

- **Total earnings** = ₹X  
- **Fiat component** = ₹A  
- **EZT component** = ₹B  
with **A + B = X** but **B > 0**, then:

- The **aggregation** is correct (Total = Fiat + EZT, and tier/partner breakdowns sum to the same totals).
- The **non-zero EZT** comes from **old** ledger rows created **before** the fiat-only fix. For those rows we used to store a split (from total bill × Fiat % and × EZT %), so some rows have non-zero `ezt_component`.

So:

- **Arithmetic:** Totals and breakdowns are consistent.  
- **Rule:** Only **new** rows are guaranteed to follow “fee only on fiat” (EZT component = 0). Old rows can still have non-zero EZT component.

## How to make existing data match the rule

To have the dashboard reflect “fee only on fiat” for **all** rows (including historical), you can run a one-time normalization:

- Set `ezt_component = 0` and `fiat_component = platform_fee_total` for every row in `platform_earnings_ledger`.

After that:

- **Total earnings** = **Fiat component** (same value).
- **EZT component** = 0 for all time.

A script for this is in `backend/scripts/normalize-platform-earnings-ledger-fiat-only.js` (run once, then optional to keep for audit).

## Summary

| Question | Answer |
|----------|--------|
| Are Platform Earnings and the Fiat/EZT split **correct** with respect to Partner Tiers? | **Yes** for the **calculation**: we use only **Platform %** on **fiat received**; Fiat % / EZT % in Partner Tiers are not used for the fee. |
| Is the **dashboard math** (Total = Fiat + EZT, tier/partner sums) correct? | **Yes.** The aggregation is correct. |
| Why is EZT component non-zero on the dashboard? | Because of **old** ledger rows created before the fiat-only fix. New rows have EZT = 0. |
| Should we change Partner Tiers (Fiat % / EZT %)? | Not required for correctness. You can keep them for display or future use; we can add UI copy that “Platform % is applied to fiat only; Fiat/EZT % are for display.” |
