const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, "db.json");
const USE_SUPABASE = process.env.USE_SUPABASE === "true";
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT) > 0 ? Number(process.env.HISTORY_LIMIT) : 100;

let supabase = null;
let postgresPool = null;
let postgresReady = false;

function shouldUsePostgres() {
  return process.env.USE_POSTGRES === "true" || Boolean(process.env.DATABASE_URL);
}

function getPostgresConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.POSTGRES_HOST || "postgres";
  const port = process.env.POSTGRES_PORT || "5432";
  const database = process.env.POSTGRES_DB || "vrgame";
  const user = process.env.POSTGRES_USER || "vruser";
  const password = process.env.POSTGRES_PASSWORD || "vrpassword";

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function getPostgresPool() {
  if (!shouldUsePostgres() || USE_SUPABASE) return null;
  if (postgresPool) return postgresPool;

  try {
    const { Pool } = require("pg");
    postgresPool = new Pool({
      connectionString: getPostgresConnectionString(),
      ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false
    });
    return postgresPool;
  } catch (error) {
    console.warn("Não foi possível carregar pg/PostgreSQL. Usando db.json como fallback.", error.message);
    return null;
  }
}

async function ensurePostgresSchema() {
  const pool = getPostgresPool();
  if (!pool) return null;
  if (postgresReady) return pool;

  await pool.query(`
    create extension if not exists pgcrypto;

    create table if not exists app_users (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      username text not null unique,
      display_name text not null,
      password_hash text not null,
      password_salt text not null
    );

    create table if not exists performance_history (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      user_id uuid references app_users(id) on delete cascade,
      player_name text,
      original_id text,
      phase integer,
      custom_mode boolean default false,
      difficulty_phase integer,
      status text,
      lives_left numeric,
      enemy_hits numeric default 0,
      enemy_hits_needed numeric,
      hits integer default 0,
      misses integer default 0,
      attempts integer default 0,
      accuracy numeric default 0,
      duration numeric default 0,
      avg_reaction numeric,
      actions jsonb default '[]'::jsonb,
      action_breakdown jsonb default '{}'::jsonb,
      raw_data jsonb default '{}'::jsonb
    );

    alter table performance_history add column if not exists user_id uuid references app_users(id) on delete cascade;
    alter table performance_history add column if not exists player_name text;

    create index if not exists app_users_username_idx
      on app_users (lower(username));

    create index if not exists performance_history_user_created_at_idx
      on performance_history (user_id, created_at desc);

    create index if not exists performance_history_created_at_idx
      on performance_history (created_at desc);

    create index if not exists performance_history_phase_idx
      on performance_history (phase);

    create index if not exists performance_history_status_idx
      on performance_history (status);
  `);

  postgresReady = true;
  return pool;
}

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


function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 32);
}

function normalizeDisplayName(username) {
  return String(username || "Jogador").trim().slice(0, 40) || "Jogador";
}

function createPasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordValue = String(password || "");
  const hash = crypto.pbkdf2Sync(passwordValue, salt, 120000, 32, "sha256").toString("hex");
  return { hash, salt };
}

function safeUser(row = {}) {
  if (!row) return null;
  return {
    id: String(row.id),
    username: row.username,
    displayName: row.display_name || row.displayName || row.username,
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

function validateNewUser(username, password) {
  const normalizedUsername = normalizeUsername(username);
  const passwordValue = String(password || "");
  if (normalizedUsername.length < 3) {
    throw new Error("O usuário precisa ter pelo menos 3 caracteres.");
  }
  if (passwordValue.length < 4) {
    throw new Error("A senha precisa ter pelo menos 4 caracteres.");
  }
  return { username: normalizedUsername, displayName: normalizeDisplayName(username), password: passwordValue };
}

async function findUserByUsername(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;

  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("app_users")
      .select("*")
      .eq("username", normalizedUsername)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query("select * from app_users where username = $1 limit 1", [normalizedUsername]);
    return rows[0] || null;
  }

  const db = readLocalDb();
  return (db.users || []).find((user) => user.username === normalizedUsername) || null;
}

async function getUserById(userId) {
  if (!userId) return null;
  const id = String(userId);

  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("app_users")
      .select("id, username, display_name, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return safeUser(data);
  }

  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query("select id, username, display_name, created_at from app_users where id = $1 limit 1", [id]);
    return safeUser(rows[0]);
  }

  const db = readLocalDb();
  const user = (db.users || []).find((item) => String(item.id) === id);
  return safeUser(user);
}

async function createUser(username, password) {
  const valid = validateNewUser(username, password);
  const existing = await findUserByUsername(valid.username);
  if (existing) {
    throw new Error("Este usuário já existe. Entre com a senha ou escolha outro nome.");
  }

  const { hash, salt } = createPasswordHash(valid.password);

  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("app_users")
      .insert({
        username: valid.username,
        display_name: valid.displayName,
        password_hash: hash,
        password_salt: salt
      })
      .select("id, username, display_name, created_at")
      .single();
    if (error) throw error;
    return safeUser(data);
  }

  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query(
      `insert into app_users (username, display_name, password_hash, password_salt)
       values ($1, $2, $3, $4)
       returning id, username, display_name, created_at`,
      [valid.username, valid.displayName, hash, salt]
    );
    return safeUser(rows[0]);
  }

  const db = readLocalDb();
  const nextId = Math.max(0, ...(db.users || []).map((user) => Number(user.id) || 0)) + 1;
  const user = {
    id: nextId,
    username: valid.username,
    display_name: valid.displayName,
    password_hash: hash,
    password_salt: salt,
    created_at: new Date().toISOString()
  };
  db.users.push(user);
  writeLocalDb(db);
  return safeUser(user);
}

async function authenticateUser(username, password) {
  const normalizedUsername = normalizeUsername(username);
  const user = await findUserByUsername(normalizedUsername);
  if (!user || !user.password_hash || !user.password_salt) {
    throw new Error("Usuário ou senha inválidos.");
  }

  const { hash } = createPasswordHash(String(password || ""), user.password_salt);
  const expected = Buffer.from(String(user.password_hash), "hex");
  const received = Buffer.from(hash, "hex");

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Error("Usuário ou senha inválidos.");
  }

  return safeUser(user);
}

function normalizeForSupabase(entry = {}) {
  return {
    user_id: entry.userId || entry.user_id || null,
    player_name: entry.playerName || entry.player_name || null,
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
    userId: row.user_id || raw.userId || raw.user_id || null,
    playerName: row.player_name || raw.playerName || raw.player_name || null,
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

async function getHistory(userId = null) {
  const client = getSupabaseClient();

  if (client) {
    const { data, error } = await client
      .from("performance_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) throw error;
    return (data || []).map(fromSupabaseRow);
  }

  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query(
      "select * from performance_history where user_id = $1 order by created_at desc limit $2",
      [userId, HISTORY_LIMIT]
    );
    return rows.map(fromSupabaseRow);
  }

  const db = readLocalDb();
  return (db.performanceHistory || []).filter((entry) => String(entry.userId || entry.user_id || "") === String(userId || ""));
}

async function saveHistory(entry, user = null) {
  const client = getSupabaseClient();

  if (client) {
    const payload = normalizeForSupabase({
      ...entry,
      userId: user ? user.id : entry.userId,
      playerName: user ? user.displayName : entry.playerName
    });
    const { data, error } = await client
      .from("performance_history")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;
    return fromSupabaseRow(data);
  }

  const pool = await ensurePostgresSchema();
  if (pool) {
    const payload = normalizeForSupabase({
      ...entry,
      userId: user ? user.id : entry.userId,
      playerName: user ? user.displayName : entry.playerName
    });
    const { rows } = await pool.query(
      `insert into performance_history (
        user_id, player_name, original_id, phase, custom_mode, difficulty_phase, status, lives_left,
        enemy_hits, enemy_hits_needed, hits, misses, attempts, accuracy,
        duration, avg_reaction, actions, action_breakdown, raw_data, created_at
      ) values (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17::jsonb, $18::jsonb, $19::jsonb, $20
      ) returning *`,
      [
        payload.user_id, payload.player_name, payload.original_id, payload.phase, payload.custom_mode, payload.difficulty_phase, payload.status, payload.lives_left,
        payload.enemy_hits, payload.enemy_hits_needed, payload.hits, payload.misses, payload.attempts, payload.accuracy,
        payload.duration, payload.avg_reaction, JSON.stringify(payload.actions), JSON.stringify(payload.action_breakdown), JSON.stringify(payload.raw_data), payload.created_at
      ]
    );
    return fromSupabaseRow(rows[0]);
  }

  const db = readLocalDb();
  const localEntry = {
    ...entry,
    userId: user ? user.id : entry.userId,
    playerName: user ? user.displayName : entry.playerName
  };
  db.performanceHistory = [localEntry, ...(db.performanceHistory || [])].filter((item, index, arr) => index < HISTORY_LIMIT || String(item.userId || "") !== String(localEntry.userId || ""));
  writeLocalDb(db);
  return localEntry;
}

async function replaceHistory(entries, user = null) {
  const client = getSupabaseClient();

  if (client) {
    const { error: deleteError } = await client
      .from("performance_history")
      .delete()
      .eq("user_id", user ? user.id : null);

    if (deleteError) throw deleteError;

    if (!entries.length) return [];

    const payload = entries.map((entry) => normalizeForSupabase({
      ...entry,
      userId: user ? user.id : entry.userId,
      playerName: user ? user.displayName : entry.playerName
    }));
    const { data, error } = await client
      .from("performance_history")
      .insert(payload)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(fromSupabaseRow);
  }

  const pool = await ensurePostgresSchema();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from performance_history where user_id = $1", [user ? user.id : null]);

      const savedRows = [];
      for (const entry of entries) {
        const payload = normalizeForSupabase({
          ...entry,
          userId: user ? user.id : entry.userId,
          playerName: user ? user.displayName : entry.playerName
        });
        const { rows } = await client.query(
          `insert into performance_history (
            user_id, player_name, original_id, phase, custom_mode, difficulty_phase, status, lives_left,
            enemy_hits, enemy_hits_needed, hits, misses, attempts, accuracy,
            duration, avg_reaction, actions, action_breakdown, raw_data, created_at
          ) values (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17::jsonb, $18::jsonb, $19::jsonb, $20
          ) returning *`,
          [
            payload.user_id, payload.player_name, payload.original_id, payload.phase, payload.custom_mode, payload.difficulty_phase, payload.status, payload.lives_left,
            payload.enemy_hits, payload.enemy_hits_needed, payload.hits, payload.misses, payload.attempts, payload.accuracy,
            payload.duration, payload.avg_reaction, JSON.stringify(payload.actions), JSON.stringify(payload.action_breakdown), JSON.stringify(payload.raw_data), payload.created_at
          ]
        );
        savedRows.push(rows[0]);
      }

      await client.query("commit");
      return savedRows.map(fromSupabaseRow).slice(0, HISTORY_LIMIT);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  const db = readLocalDb();
  const userId = user ? String(user.id) : "";
  const userEntries = entries.slice(0, HISTORY_LIMIT).map((entry) => ({
    ...entry,
    userId: user ? user.id : entry.userId,
    playerName: user ? user.displayName : entry.playerName
  }));
  db.performanceHistory = [
    ...userEntries,
    ...(db.performanceHistory || []).filter((entry) => String(entry.userId || "") !== userId)
  ];
  writeLocalDb(db);
  return userEntries;
}

async function getDatabaseStatus() {
  const client = getSupabaseClient();

  if (client) {
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

  const pool = await ensurePostgresSchema();
  if (pool) {
    try {
      await pool.query("select 1");
      return {
        provider: "postgres",
        usingPostgres: true,
        connected: true
      };
    } catch (error) {
      return {
        provider: "postgres",
        usingPostgres: true,
        connected: false,
        error: error.message
      };
    }
  }

  return {
    provider: "json",
    usingSupabase: false,
    usingPostgres: false,
    dbPath: DB_PATH
  };
}

module.exports = {
  DB_PATH,
  ensureLocalDbFile,
  authenticateUser,
  createUser,
  getUserById,
  getDatabaseStatus,
  getHistory,
  saveHistory,
  replaceHistory
};
