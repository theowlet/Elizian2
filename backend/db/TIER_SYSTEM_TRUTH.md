# Elizian Tier System — System Truth

**Canonical 5 tiers (ONLY):**
1. **Ather** (entry)
2. **Nova**
3. **Luminar**
4. **Valiant**
5. **Echelon** (priority override; no other tier has capacity override)

**Spelling:** Use "Ather" (not "Aether"). Use "Echelon" (capital E).

**Migration warning:**  
**Recurring wrong names:** The migration `2026-02-tier-names-consistency.sql` renamed Nova→Beacon, Luminar→Crest, Valiant→Ascend. It has been **renamed to `.sql.disabled`** and **excluded in `scripts/run-migrations.js`** so it is never run again. If Tier Configuration ever shows Beacon/Crest/Ascend again (e.g. from an old run), restore with: `node run-tier-names-repair.js`.

**DB:** Ensure `loyalty_tiers` and any tier references use only these five names. Legacy `tiers` table should align (e.g. `name` IN ('Ather','Nova','Luminar','Valiant','Echelon')).

**Repair:** If any other tier names exist (e.g. Aether, Beacon, Crest, Ascend), run `backend/db/scripts/data-consistency-repair.sql` after a backup. It normalizes all tier columns and `target_tiers` arrays to the canonical five. Code also normalizes tier when reading (see `backend/src/utils/tierNames.js` and its use in partner/admin APIs and booking flow).

**Echelon override:** Only Echelon tier may override slot capacity (within `echelon_buffer` or partner `echelon_capacity_buffer_percent`). Operating hours cannot be overridden by any tier.
