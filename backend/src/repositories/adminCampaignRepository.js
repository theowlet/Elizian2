/**
 * Admin Campaign Repository — CRUD, list with filters, analytics.
 * Tier-compliant: Ather, Nova, Luminar, Valiant, Echelon only.
 */

const { getPool } = require('../config/db');
const { VALID_TIERS, EVENT_TYPES, ACTION_TYPES } = require('../campaign/campaignTypes');

const pool = getPool();

const TARGET_CATEGORIES = ['Dining', 'Spa', 'Events', 'Travel', 'Healthcare', 'Others'];
const USER_SEGMENTS = ['new', 'dormant', 'high_value', 'low_engagement'];

function validateTiers(tiers) {
  if (!Array.isArray(tiers)) return [];
  return tiers.filter((t) => VALID_TIERS.includes(t));
}

/** Validate rule JSON: event in EVENT_TYPES, action.type in ACTION_TYPES. */
function validateRuleJson(rule) {
  if (!rule || typeof rule !== 'object') return { valid: true };
  const trigger = rule.trigger || rule;
  const event = trigger.event;
  if (event && !EVENT_TYPES.includes(event)) return { valid: false, message: `Invalid event: ${event}` };
  const action = rule.action || (rule.action_type && { type: rule.action_type, params: rule.action_params || {} });
  if (action && action.type && !ACTION_TYPES.includes(action.type)) return { valid: false, message: `Invalid action: ${action.type}` };
  return { valid: true };
}

/** Normalize rule to { trigger: { event, conditions }, action: { type, params } } for ruleEvaluator. */
function normalizeRuleJson(rule) {
  if (!rule || typeof rule !== 'object') return {};
  const trigger = rule.trigger || {};
  const event = trigger.event || rule.event;
  const conditions = Array.isArray(trigger.conditions) ? trigger.conditions : (Array.isArray(rule.conditions) ? rule.conditions : []);
  const action = rule.action || (rule.action_type ? { type: rule.action_type, params: rule.action_params || {} } : {});
  return { trigger: { event, conditions }, action: { type: action.type, params: action.params || {} } };
}

async function listCampaigns({ search, status, type, limit = 50, offset = 0 } = {}) {
  const params = [];
  let paramCount = 0;
  let where = ' WHERE 1=1';

  if (search) {
    paramCount++;
    where += ` AND (c.name ILIKE $${paramCount} OR c.description ILIKE $${paramCount})`;
    params.push(`%${search}%`);
  }
  if (status) {
    paramCount++;
    where += ` AND (c.status = $${paramCount} OR (c.status IS NULL AND c.is_active = true AND $${paramCount} = 'active'))`;
    params.push(status);
  }
  if (type) {
    paramCount++;
    where += ` AND c.campaign_type = $${paramCount}`;
    params.push(type);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM campaigns c ${where}`,
    params
  );
  const total = countResult.rows[0]?.total ?? 0;

  params.push(limit, offset);
  const limitParam = params.length - 1;
  const offsetParam = params.length;

  const sql = `
    SELECT c.*,
      ct.target_tiers AS ct_tiers,
      ct.target_categories AS ct_categories,
      ct.geo_filter AS ct_geo,
      ct.user_segment AS ct_user_segment
    FROM campaigns c
    LEFT JOIN campaign_targets ct ON ct.campaign_id = c.id
    ${where}
    ORDER BY COALESCE(c.start_at, c.start_date) DESC NULLS LAST
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;
  const result = await pool.query(sql, params);
  const rows = result.rows.map((r) => ({
    ...r,
    target_tiers: r.ct_tiers ?? r.target_tiers ?? [],
    target_categories: r.ct_categories ?? r.target_categories ?? [],
    geo_filter: r.ct_geo ?? {},
    user_segment: r.ct_user_segment ?? {},
  }));
  return { rows, total };
}

async function getCampaignById(id) {
  const cResult = await pool.query(
    `SELECT c.* FROM campaigns c WHERE c.id = $1`,
    [id]
  );
  if (cResult.rows.length === 0) return null;
  const campaign = cResult.rows[0];

  const [targets, rules, experiences] = await Promise.all([
    pool.query('SELECT * FROM campaign_targets WHERE campaign_id = $1', [id]).then((r) => r.rows[0] || null),
    pool.query('SELECT * FROM campaign_rules WHERE campaign_id = $1 ORDER BY created_at', [id]).then((r) => r.rows),
    pool.query(
      "SELECT experience_id FROM campaign_experiences WHERE campaign_id = $1",
      [id]
    ).then((r) => r.rows.map((x) => x.experience_id)).catch(() => []),
  ]);

  campaign.targets = targets;
  campaign.rules = rules || [];
  campaign.experience_ids = experiences;
  campaign.target_tiers = (targets?.target_tiers ?? campaign.target_tiers) ?? [];
  campaign.target_categories = (targets?.target_categories ?? campaign.target_categories) ?? [];
  campaign.geo_filter = targets?.geo_filter ?? campaign.geo_filter ?? {};
  campaign.user_segment = targets?.user_segment ?? {};
  return campaign;
}

async function createCampaign(data, actorUserId = null) {
  const ruleJson = data.rule_json ?? data.growth_rule ?? data.rules?.[0]?.rule_json;
  const ruleValidation = validateRuleJson(ruleJson);
  if (!ruleValidation.valid) throw Object.assign(new Error(ruleValidation.message), { statusCode: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tiers = validateTiers(data.target_tiers || data.targets?.target_tiers);
    const categories = Array.isArray(data.target_categories || data.targets?.target_categories)
      ? data.target_categories || data.targets?.target_categories
      : [];
    const startAt = data.start_at || data.start_date || new Date().toISOString();
    const endAt = data.end_at || data.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const insertResult = await client.query(
      `INSERT INTO campaigns (
        name, description, banner_image_url, campaign_type,
        start_date, end_date, start_at, end_at,
        is_active, target_tiers, target_categories, priority_weight, growth_rule,
        status, budget_limit, created_by
      ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::timestamptz, $8::timestamptz,
        COALESCE($9, true), $10::text[], $11::text[], COALESCE($12, 0), COALESCE($13::jsonb, '{}'),
        COALESCE($14, 'draft'), $15, $16)
      RETURNING *`,
      [
        data.name || 'Unnamed Campaign',
        data.description || null,
        data.banner_image_url || null,
        data.campaign_type || null,
        startAt.slice(0, 10),
        endAt.slice(0, 10),
        startAt,
        endAt,
        data.is_active,
        tiers.length ? tiers : (data.target_tiers || []),
        categories,
        data.priority_weight ?? 0,
        data.growth_rule ? JSON.stringify(data.growth_rule) : '{}',
        data.status || 'draft',
        data.budget_limit ?? null,
        actorUserId,
      ]
    );
    const campaign = insertResult.rows[0];

    const hasTargets = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_targets')"
    );
    if (hasTargets.rows[0]?.exists) {
      await client.query(
        `INSERT INTO campaign_targets (campaign_id, target_tiers, target_categories, geo_filter, user_segment)
         VALUES ($1, $2::text[], $3::text[], COALESCE($4::jsonb, '{}'), COALESCE($5::jsonb, '{}'))`,
        [
          campaign.id,
          tiers.length ? tiers : [],
          categories,
          data.geo_filter ? JSON.stringify(data.geo_filter) : '{}',
          data.user_segment ? JSON.stringify(data.user_segment) : '{}',
        ]
      );
    }

    const ruleToSave = ruleJson || data.rules?.[0]?.rule_json || {};
    const rulesTable = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_rules')"
    );
    if (rulesTable.rows[0]?.exists && (ruleToSave.trigger?.event || ruleToSave.event || ruleToSave.action?.type || (ruleToSave.trigger?.conditions && ruleToSave.trigger.conditions.length))) {
      const normalized = normalizeRuleJson(ruleToSave);
      if (normalized.trigger?.event || normalized.action?.type || (normalized.trigger?.conditions && normalized.trigger.conditions.length > 0)) {
        await client.query(
          `INSERT INTO campaign_rules (campaign_id, rule_json) VALUES ($1, $2::jsonb)`,
          [campaign.id, JSON.stringify(normalized)]
        );
      }
    }

    if (Array.isArray(data.experience_ids) && data.experience_ids.length > 0) {
      const expTable = await client.query(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_experiences')"
      );
      if (expTable.rows[0]?.exists) {
        for (const expId of data.experience_ids) {
          await client.query(
            'INSERT INTO campaign_experiences (campaign_id, experience_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [campaign.id, expId]
          );
        }
      }
    }

    await auditLog(client, campaign.id, actorUserId, 'admin', 'create', { name: campaign.name });
    await client.query('COMMIT');
    return await getCampaignById(campaign.id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function updateCampaign(id, data, actorUserId = null) {
  const rulePayload = data.rule_json ?? data.growth_rule ?? data.rules?.[0]?.rule_json;
  if (rulePayload !== undefined) {
    const ruleValidation = validateRuleJson(rulePayload);
    if (!ruleValidation.valid) throw Object.assign(new Error(ruleValidation.message), { statusCode: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id, status FROM campaigns WHERE id = $1 FOR UPDATE', [id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const tiers = validateTiers(data.target_tiers ?? data.targets?.target_tiers);
    const updates = [];
    const values = [];
    let n = 1;

    if (data.name !== undefined) { updates.push(`name = $${n++}`); values.push(data.name); }
    if (data.description !== undefined) { updates.push(`description = $${n++}`); values.push(data.description); }
    if (data.banner_image_url !== undefined) { updates.push(`banner_image_url = $${n++}`); values.push(data.banner_image_url); }
    if (data.campaign_type !== undefined) { updates.push(`campaign_type = $${n++}`); values.push(data.campaign_type); }
    if (data.start_at !== undefined) { updates.push(`start_at = $${n++}`); values.push(data.start_at); }
    if (data.end_at !== undefined) { updates.push(`end_at = $${n++}`); values.push(data.end_at); }
    if (data.start_date !== undefined) { updates.push(`start_date = $${n++}`); values.push(data.start_date); }
    if (data.end_date !== undefined) { updates.push(`end_date = $${n++}`); values.push(data.end_date); }
    if (data.status !== undefined) { updates.push(`status = $${n++}`); values.push(data.status); }
    if (data.priority_weight !== undefined) { updates.push(`priority_weight = $${n++}`); values.push(data.priority_weight); }
    if (data.budget_limit !== undefined) { updates.push(`budget_limit = $${n++}`); values.push(data.budget_limit); }
    if (data.is_active !== undefined) { updates.push(`is_active = $${n++}`); values.push(data.is_active); }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    await client.query(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = $${n}`,
      values
    );

    const hasTargets = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_targets')"
    );
    if (hasTargets.rows[0]?.exists) {
      await client.query(
        `INSERT INTO campaign_targets (campaign_id, target_tiers, target_categories, geo_filter, user_segment)
         VALUES ($1, $2::text[], $3::text[], COALESCE($4::jsonb, '{}'), COALESCE($5::jsonb, '{}'))
         ON CONFLICT (campaign_id) DO UPDATE SET
           target_tiers = EXCLUDED.target_tiers,
           target_categories = EXCLUDED.target_categories,
           geo_filter = EXCLUDED.geo_filter,
           user_segment = EXCLUDED.user_segment`,
        [
          id,
          tiers.length ? tiers : (data.target_tiers || []),
          Array.isArray(data.target_categories) ? data.target_categories : [],
          data.geo_filter ? JSON.stringify(data.geo_filter) : '{}',
          data.user_segment ? JSON.stringify(data.user_segment) : '{}',
        ]
      );
    }

    const rulesTable = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_rules')"
    );
    if (rulesTable.rows[0]?.exists && rulePayload !== undefined) {
      await client.query('DELETE FROM campaign_rules WHERE campaign_id = $1', [id]);
      const normalized = normalizeRuleJson(rulePayload);
      if (normalized.trigger?.event || normalized.action?.type || (normalized.trigger?.conditions && normalized.trigger.conditions.length > 0)) {
        await client.query(
          `INSERT INTO campaign_rules (campaign_id, rule_json) VALUES ($1, $2::jsonb)`,
          [id, JSON.stringify(normalized)]
        );
      }
    }

    await auditLog(client, id, actorUserId, 'admin', 'update', data);
    await client.query('COMMIT');
    return await getCampaignById(id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function setCampaignStatus(id, status, actorUserId = null) {
  const valid = ['draft', 'scheduled', 'active', 'paused', 'expired'];
  if (!valid.includes(status)) throw new Error(`Invalid status: ${status}`);
  return updateCampaign(id, { status }, actorUserId);
}

async function deleteCampaign(id, actorUserId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('DELETE FROM campaigns WHERE id = $1 RETURNING id, name', [id]);
    if (r.rows.length > 0) {
      await auditLog(client, id, actorUserId, 'admin', 'delete', { name: r.rows[0].name });
    }
    await client.query('COMMIT');
    return r.rows.length > 0;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function cloneCampaign(id, actorUserId = null) {
  const source = await getCampaignById(id);
  if (!source) return null;
  const { id: _id, created_at, updated_at, ...rest } = source;
  const payload = {
    name: `${source.name} (Copy)`,
    description: source.description,
    banner_image_url: source.banner_image_url,
    campaign_type: source.campaign_type,
    start_at: source.start_at,
    end_at: source.end_at,
    target_tiers: source.target_tiers || [],
    target_categories: source.target_categories || [],
    geo_filter: source.geo_filter || {},
    user_segment: source.user_segment || {},
    priority_weight: source.priority_weight ?? 0,
    budget_limit: source.budget_limit,
    status: 'draft',
    experience_ids: source.experience_ids || [],
    rule_json: source.rules?.[0]?.rule_json || {},
  };
  return createCampaign(payload, actorUserId);
}

async function getCampaignAnalytics(campaignId) {
  const tableCheck = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_attribution')"
  );
  if (!tableCheck.rows[0]?.exists) {
    return {
      total_events: 0,
      revenue_generated: 0,
      reward_issued: 0,
      by_event_type: {},
      bookings_influenced: 0,
      budget_used: 0,
      roi: null,
    };
  }

  const agg = await pool.query(
    `SELECT
       COUNT(*)::int AS total_events,
       COALESCE(SUM(revenue_generated), 0)::float AS revenue_generated,
       COALESCE(SUM(reward_issued), 0)::float AS reward_issued,
       COUNT(*) FILTER (WHERE event_type = 'booking_created')::int AS bookings_influenced
     FROM campaign_attribution
     WHERE campaign_id = $1`,
    [campaignId]
  );

  const byEvent = await pool.query(
    `SELECT event_type, COUNT(*)::int AS cnt, COALESCE(SUM(revenue_generated), 0)::float AS rev, COALESCE(SUM(reward_issued), 0)::float AS rew
     FROM campaign_attribution WHERE campaign_id = $1 GROUP BY event_type`,
    [campaignId]
  );

  const byEventType = {};
  byEvent.rows.forEach((r) => {
    byEventType[r.event_type] = { count: r.cnt, revenue: r.rev, reward_issued: r.rew };
  });

  const budgetUsed = agg.rows[0]?.reward_issued ?? 0;
  const revenue = agg.rows[0]?.revenue_generated ?? 0;
  const reward = agg.rows[0]?.reward_issued ?? 0;
  const roi = reward > 0 && revenue > 0 ? (revenue / reward) : null;

  const campaignRow = await pool.query('SELECT budget_limit FROM campaigns WHERE id = $1', [campaignId]);
  const budgetLimit = campaignRow.rows[0]?.budget_limit;

  return {
    total_events: agg.rows[0]?.total_events ?? 0,
    revenue_generated: revenue,
    reward_issued: reward,
    bookings_influenced: agg.rows[0]?.bookings_influenced ?? 0,
    by_event_type: byEventType,
    budget_used: budgetUsed,
    budget_limit: budgetLimit != null ? Number(budgetLimit) : null,
    roi: roi != null ? Math.round(roi * 100) / 100 : null,
  };
}

async function auditLog(client, campaignId, actorUserId, actorRole, action, meta = {}) {
  try {
    const t = await client.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_audit_log')"
    );
    if (!t.rows[0]?.exists) return;
    await client.query(
      `INSERT INTO campaign_audit_log (campaign_id, actor_user_id, actor_role, action, meta)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [campaignId, actorUserId, actorRole, action, JSON.stringify(meta)]
    );
  } catch (err) {
    // non-fatal
  }
}

module.exports = {
  listCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  setCampaignStatus,
  deleteCampaign,
  cloneCampaign,
  getCampaignAnalytics,
  validateTiers,
  validateRuleJson,
  TARGET_CATEGORIES,
  USER_SEGMENTS,
};
