const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, "db.json");
const USE_SUPABASE = process.env.USE_SUPABASE === "true";
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT) > 0 ? Number(process.env.HISTORY_LIMIT) : 100;

let supabase = null;

function getSupabaseClient() {
  if (!USE_SUPABASE) return null;
  if (supabase) return supabase;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn("USE_SUPABASE=true, mas SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não foram configurados. Usando db.json como fallback.");
    return null;
  }

  try {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    return supabase;
  } catch (error) {
    console.warn("Não foi possível carregar @supabase/supabase-js. Usando db.json como fallback.", error.message);
    return null;
  }
}

function ensureLocalDbFile() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, `${JSON.stringify({ users: [], performanceHistory: [] }, null, 2)}\n`, "utf8");
  }
}

function readLocalDb() {
  try {
    ensureLocalDbFile();
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    if (!Array.isArray(parsed.users)) parsed.users = [];
    if (!Array.isArray(parsed.performanceHistory)) parsed.performanceHistory = [];
    return parsed;
  } catch (error) {
    console.error("Erro ao ler db.json:", error);
    return { users: [], performanceHistory: [] };
  }
}

function writeLocalDb(db) {
  ensureLocalDbFile();
  fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function toFiniteNumber(value, fallback = 0) {
  if (value === "INF" || value === Infinity) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeForSupabase(entry = {}) {
  return {
    original_id: entry.id ? String(entry.id).slice(0, 120) : null,
    phase: toFiniteNumber(entry.phase, 1),
    custom_mode: Boolean(entry.customMode),
    difficulty_phase: toFiniteNumber(entry.difficultyPhase ?? entry.phase, 1),
    status: entry.status || "interrompida",
    lives_left: toFiniteNumber(entry.livesLeft, 0),
    enemy_hits: toFiniteNumber(entry.enemyHits, 0),
    enemy_hits_needed: toFiniteNumber(entry.enemyHitsNeeded, 0),
    hits: toFiniteNumber(entry.hits, 0),
    misses: toFiniteNumber(entry.misses, 0),
    attempts: toFiniteNumber(entry.attempts, 0),
    accuracy: toFiniteNumber(entry.accuracy, 0),
    duration: toFiniteNumber(entry.duration, 0),
    avg_reaction: entry.avgReaction == null ? null : toFiniteNumber(entry.avgReaction, null),
    actions: Array.isArray(entry.actions) ? entry.actions : [],
    action_breakdown: entry.actionBreakdown && typeof entry.actionBreakdown === "object" ? entry.actionBreakdown : {},
    raw_data: entry,
    created_at: entry.createdAt || new Date().toISOString()
  };
}

function fromSupabaseRow(row = {}) {
  const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};

  return {
    ...raw,
    id: raw.id || row.original_id || row.id,
    phase: row.phase ?? raw.phase,
    customMode: row.custom_mode ?? raw.customMode,
    difficultyPhase: row.difficulty_phase ?? raw.difficultyPhase,
    status: row.status ?? raw.status,
    livesLeft: row.lives_left == null && raw.livesLeft === "INF" ? "INF" : (row.lives_left ?? raw.livesLeft),
    enemyHits: row.enemy_hits ?? raw.enemyHits,
    enemyHitsNeeded: row.enemy_hits_needed == null && raw.enemyHitsNeeded === "INF" ? "INF" : (row.enemy_hits_needed ?? raw.enemyHitsNeeded),
    hits: row.hits ?? raw.hits,
    misses: row.misses ?? raw.misses,
    attempts: row.attempts ?? raw.attempts,
    accuracy: row.accuracy ?? raw.accuracy,
    duration: row.duration ?? raw.duration,
    avgReaction: row.avg_reaction ?? raw.avgReaction,
    actions: row.actions ?? raw.actions ?? [],
    actionBreakdown: row.action_breakdown ?? raw.actionBreakdown ?? {},
    createdAt: row.created_at ?? raw.createdAt
  };
}

async function getHistory() {
  const client = getSupabaseClient();

  if (client) {
    const { data, error } = await client
      .from("performance_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) throw error;
    return (data || []).map(fromSupabaseRow);
  }

  const db = readLocalDb();
  return db.performanceHistory || [];
}

async function saveHistory(entry) {
  const client = getSupabaseClient();

  if (client) {
    const payload = normalizeForSupabase(entry);
    const { data, error } = await client
      .from("performance_history")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;
    return fromSupabaseRow(data);
  }

  const db = readLocalDb();
  db.performanceHistory = [entry, ...(db.performanceHistory || [])].slice(0, HISTORY_LIMIT);
  writeLocalDb(db);
  return entry;
}

async function replaceHistory(entries) {
  const client = getSupabaseClient();

  if (client) {
    const { error: deleteError } = await client
      .from("performance_history")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (deleteError) throw deleteError;

    if (!entries.length) return [];

    const payload = entries.map(normalizeForSupabase);
    const { data, error } = await client
      .from("performance_history")
      .insert(payload)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(fromSupabaseRow);
  }

  const db = readLocalDb();
  db.performanceHistory = entries.slice(0, HISTORY_LIMIT);
  writeLocalDb(db);
  return db.performanceHistory;
}

async function getDatabaseStatus() {
  const client = getSupabaseClient();

  if (!client) {
    return {
      provider: "json",
      usingSupabase: false,
      dbPath: DB_PATH
    };
  }

  const { error } = await client
    .from("performance_history")
    .select("id", { count: "exact", head: true });

  return {
    provider: "supabase",
    usingSupabase: true,
    connected: !error,
    error: error ? error.message : null
  };
}

module.exports = {
  DB_PATH,
  ensureLocalDbFile,
  getDatabaseStatus,
  getHistory,
  saveHistory,
  replaceHistory
};
