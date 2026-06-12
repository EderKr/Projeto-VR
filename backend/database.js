const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, "db.json");
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT) > 0 ? Number(process.env.HISTORY_LIMIT) : 100;

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
  if (!shouldUsePostgres()) return null;
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
      email text,
      age integer,
      sex text not null default 'male',
      role text not null default 'user',
      gender text not null default 'male',
      password_hash text not null,
      password_salt text not null
    );

    create table if not exists invite_tokens (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      token text not null unique,
      type text not null default 'standard',
      created_by uuid references app_users(id) on delete set null,
      used_by uuid references app_users(id) on delete set null,
      used_at timestamptz
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

    alter table app_users add column if not exists gender text not null default 'male';
    alter table app_users add column if not exists email text;
    alter table app_users add column if not exists age integer;
    alter table app_users add column if not exists sex text not null default 'male';
    alter table app_users add column if not exists role text not null default 'user';
    alter table performance_history add column if not exists user_id uuid references app_users(id) on delete cascade;
    alter table performance_history add column if not exists player_name text;

    create index if not exists app_users_username_idx
      on app_users (lower(username));

    create unique index if not exists app_users_email_unique_idx
      on app_users (lower(email))
      where email is not null;

    create index if not exists invite_tokens_created_at_idx
      on invite_tokens (created_at desc);

    create index if not exists performance_history_user_created_at_idx
      on performance_history (user_id, created_at desc);

    create index if not exists performance_history_created_at_idx
      on performance_history (created_at desc);

    create index if not exists performance_history_phase_idx
      on performance_history (phase);

    create index if not exists performance_history_status_idx
      on performance_history (status);
  `);

  await pool.query("update app_users set email = username where email is null");
  await pool.query("update app_users set sex = gender where sex is null or sex = ''");
  await pool.query(`
    update app_users
    set role = 'admin'
    where id = (
      select id from app_users
      where not exists (select 1 from app_users where role = 'admin')
      order by created_at asc
      limit 1
    )
  `);

  postgresReady = true;
  return pool;
}

function ensureLocalDbFile() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, `${JSON.stringify({ users: [], performanceHistory: [], invites: [] }, null, 2)}\n`, "utf8");
  }
}

function readLocalDb() {
  try {
    ensureLocalDbFile();
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    if (!Array.isArray(parsed.users)) parsed.users = [];
    if (!Array.isArray(parsed.performanceHistory)) parsed.performanceHistory = [];
    if (!Array.isArray(parsed.invites)) parsed.invites = [];
    migrateLocalDb(parsed);
    return parsed;
  } catch (error) {
    console.error("Erro ao ler db.json:", error);
    return { users: [], performanceHistory: [], invites: [] };
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase().slice(0, 120);
}

function normalizeDisplayName(username) {
  return String(username || "Jogador").trim().slice(0, 40) || "Jogador";
}

function normalizeGender(value) {
  return String(value || "").trim().toLowerCase() === "female" ? "female" : "male";
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase() === "admin" ? "admin" : "user";
}

function normalizeInviteType(value) {
  return String(value || "").trim().toLowerCase() === "admin" ? "admin" : "standard";
}

function migrateLocalDb(db) {
  for (const user of db.users || []) {
    if (!user.email) user.email = user.username;
    if (!user.sex) user.sex = user.gender || "male";
    if (!user.gender) user.gender = normalizeGender(user.sex);
    if (!user.role) user.role = "user";
  }

  if ((db.users || []).length > 0 && !(db.users || []).some((user) => user.role === "admin")) {
    db.users[0].role = "admin";
  }
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
    email: row.email || row.username,
    age: row.age == null ? null : Number(row.age),
    sex: normalizeGender(row.sex || row.gender),
    gender: normalizeGender(row.gender || row.sex),
    role: normalizeRole(row.role),
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

function validateNewUser(profile = {}) {
  const name = normalizeDisplayName(profile.name || profile.displayName);
  const email = normalizeEmail(profile.email);
  const age = Number(profile.age);
  const sex = normalizeGender(profile.sex || profile.gender);
  const passwordValue = String(profile.password || "");
  const confirmPasswordValue = String(profile.confirmPassword || "");
  const normalizedUsername = normalizeUsername(email.replace("@", ".") || name);

  if (name.length < 2) {
    throw new Error("Informe um nome com pelo menos 2 caracteres.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Informe um e-mail valido.");
  }
  if (!Number.isInteger(age) || age < 1 || age > 120) {
    throw new Error("Informe uma idade valida.");
  }
  if (confirmPasswordValue && passwordValue !== confirmPasswordValue) {
    throw new Error("A confirmacao de senha nao confere.");
  }
  if (passwordValue.length < 4) {
    throw new Error("A senha precisa ter pelo menos 4 caracteres.");
  }

  return {
    username: normalizedUsername,
    displayName: name,
    email,
    age,
    sex,
    gender: sex,
    password: passwordValue
  };
}

function normalizeHistoryEntry(entry = {}) {
  return {
    id: entry.id || String(entry.original_id || entry.originalId || ""),
    userId: entry.userId || entry.user_id || null,
    playerName: entry.playerName || entry.player_name || null,
    originalId: entry.original_id || entry.originalId || entry.id || null,
    phase: toFiniteNumber(entry.phase, 1),
    customMode: Boolean(entry.customMode),
    difficultyPhase: toFiniteNumber(entry.difficultyPhase ?? entry.phase, 1),
    status: entry.status || "interrompida",
    livesLeft: toFiniteNumber(entry.livesLeft, 0),
    enemyHits: toFiniteNumber(entry.enemyHits, 0),
    enemyHitsNeeded: toFiniteNumber(entry.enemyHitsNeeded, 0),
    hits: toFiniteNumber(entry.hits, 0),
    misses: toFiniteNumber(entry.misses, 0),
    attempts: toFiniteNumber(entry.attempts, 0),
    accuracy: toFiniteNumber(entry.accuracy, 0),
    duration: toFiniteNumber(entry.duration, 0),
    avgReaction: entry.avgReaction == null ? null : toFiniteNumber(entry.avgReaction, null),
    actions: Array.isArray(entry.actions) ? entry.actions : [],
    actionBreakdown: entry.actionBreakdown && typeof entry.actionBreakdown === "object" ? entry.actionBreakdown : {},
    raw_data: entry,
    createdAt: entry.createdAt || entry.created_at || new Date().toISOString()
  };
}

function fromDatabaseRow(row = {}) {
  const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
  return {
    ...raw,
    id: row.original_id || row.id || raw.id,
    userId: row.user_id || raw.userId || raw.user_id || null,
    playerName: row.player_name || raw.playerName || raw.player_name || null,
    originalId: row.original_id || raw.original_id || raw.originalId || row.id || raw.id,
    phase: row.phase ?? raw.phase,
    customMode: row.custom_mode ?? raw.customMode,
    difficultyPhase: row.difficulty_phase ?? raw.difficultyPhase ?? row.phase ?? raw.phase,
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
    actionBreakdown: row.action_breakdown ?? raw.actionBreakdown ?? raw.action_breakdown ?? {},
    createdAt: row.created_at ?? raw.createdAt
  };
}

async function findUserByUsername(username) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedEmail = normalizeEmail(username);
  if (!normalizedUsername && !normalizedEmail) return null;

  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query(
      "select * from app_users where username = $1 or lower(email) = $2 limit 1",
      [normalizedUsername, normalizedEmail]
    );
    return rows[0] || null;
  }

  const db = readLocalDb();
  return (db.users || []).find((user) => user.username === normalizedUsername || normalizeEmail(user.email) === normalizedEmail) || null;
}

async function getUserById(userId) {
  if (!userId) return null;
  const id = String(userId);

  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query("select id, username, display_name, email, age, sex, role, gender, created_at from app_users where id = $1 limit 1", [id]);
    return safeUser(rows[0]);
  }

  const db = readLocalDb();
  const user = (db.users || []).find((item) => String(item.id) === id);
  return safeUser(user);
}

async function createUser(profile = {}, invite = null) {
  const valid = validateNewUser(profile);
  const existing = await findUserByUsername(valid.email);
  if (existing) {
    throw new Error("Este e-mail ja esta cadastrado. Entre com a senha ou use outro e-mail.");
  }

  const { hash, salt } = createPasswordHash(valid.password);
  const role = normalizeRole(invite && invite.type === "admin" ? "admin" : "user");

  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query(
      `insert into app_users (username, display_name, email, age, sex, role, gender, password_hash, password_salt)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id, username, display_name, email, age, sex, role, gender, created_at`,
      [valid.username, valid.displayName, valid.email, valid.age, valid.sex, role, valid.gender, hash, salt]
    );
    return safeUser(rows[0]);
  }

  const db = readLocalDb();
  const nextId = Math.max(0, ...(db.users || []).map((user) => Number(user.id) || 0)) + 1;
  const user = {
    id: nextId,
    username: valid.username,
    display_name: valid.displayName,
    email: valid.email,
    age: valid.age,
    sex: valid.sex,
    role,
    gender: valid.gender,
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

async function getHistory(userId = null) {
  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query(
      "select * from performance_history where user_id = $1 order by created_at desc limit $2",
      [userId, HISTORY_LIMIT]
    );
    return rows.map(fromDatabaseRow);
  }

  const db = readLocalDb();
  return (db.performanceHistory || [])
    .filter((entry) => String(entry.userId || entry.user_id || "") === String(userId || ""))
    .slice(0, HISTORY_LIMIT);
}

async function saveHistory(entry, user = null) {
  const payload = normalizeHistoryEntry({
    ...entry,
    userId: user ? user.id : entry.userId,
    playerName: user ? user.displayName : entry.playerName
  });

  const pool = await ensurePostgresSchema();
  if (pool) {
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
        payload.userId,
        payload.playerName,
        payload.originalId,
        payload.phase,
        payload.customMode,
        payload.difficultyPhase,
        payload.status,
        payload.livesLeft,
        payload.enemyHits,
        payload.enemyHitsNeeded,
        payload.hits,
        payload.misses,
        payload.attempts,
        payload.accuracy,
        payload.duration,
        payload.avgReaction,
        JSON.stringify(payload.actions),
        JSON.stringify(payload.actionBreakdown),
        JSON.stringify(payload.raw_data),
        payload.createdAt
      ]
    );
    return fromDatabaseRow(rows[0]);
  }

  const db = readLocalDb();
  db.performanceHistory = [payload, ...(db.performanceHistory || [])].slice(0, HISTORY_LIMIT);
  writeLocalDb(db);
  return payload;
}

async function replaceHistory(entries, user = null) {
  const payloads = entries.slice(0, HISTORY_LIMIT).map((entry) => normalizeHistoryEntry({
    ...entry,
    userId: user ? user.id : entry.userId,
    playerName: user ? user.displayName : entry.playerName
  }));
  const userId = user ? String(user.id) : "";

  const pool = await ensurePostgresSchema();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from performance_history where user_id = $1", [userId]);

      const savedRows = [];
      for (const payload of payloads) {
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
            payload.userId,
            payload.playerName,
            payload.originalId,
            payload.phase,
            payload.customMode,
            payload.difficultyPhase,
            payload.status,
            payload.livesLeft,
            payload.enemyHits,
            payload.enemyHitsNeeded,
            payload.hits,
            payload.misses,
            payload.attempts,
            payload.accuracy,
            payload.duration,
            payload.avgReaction,
            JSON.stringify(payload.actions),
            JSON.stringify(payload.actionBreakdown),
            JSON.stringify(payload.raw_data),
            payload.createdAt
          ]
        );
        savedRows.push(rows[0]);
      }

      await client.query("commit");
      return savedRows.map(fromDatabaseRow).slice(0, HISTORY_LIMIT);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  const db = readLocalDb();
  db.performanceHistory = [
    ...payloads,
    ...(db.performanceHistory || []).filter((entry) => String(entry.userId || entry.user_id || "") !== userId)
  ];
  writeLocalDb(db);
  return payloads;
}

function safeInvite(row = {}) {
  if (!row) return null;
  return {
    id: String(row.id),
    token: row.token,
    type: normalizeInviteType(row.type),
    createdBy: row.created_by || row.createdBy || null,
    usedBy: row.used_by || row.usedBy || null,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    usedAt: row.used_at || row.usedAt || null
  };
}

async function createInvite(type = "standard", createdBy = null) {
  const inviteType = normalizeInviteType(type);
  const token = crypto.randomBytes(24).toString("base64url");
  const creatorId = createdBy ? String(createdBy.id || createdBy) : null;

  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query(
      `insert into invite_tokens (token, type, created_by)
       values ($1, $2, $3)
       returning *`,
      [token, inviteType, creatorId]
    );
    return safeInvite(rows[0]);
  }

  const db = readLocalDb();
  const nextId = Math.max(0, ...(db.invites || []).map((invite) => Number(invite.id) || 0)) + 1;
  const invite = {
    id: nextId,
    token,
    type: inviteType,
    created_by: creatorId,
    used_by: null,
    created_at: new Date().toISOString(),
    used_at: null
  };
  db.invites.push(invite);
  writeLocalDb(db);
  return safeInvite(invite);
}

async function getInviteByToken(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return null;

  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query("select * from invite_tokens where token = $1 limit 1", [normalizedToken]);
    return rows[0] || null;
  }

  const db = readLocalDb();
  return (db.invites || []).find((invite) => invite.token === normalizedToken) || null;
}

async function useInvite(token, userId) {
  const invite = await getInviteByToken(token);
  if (!invite) {
    throw new Error("Convite invalido.");
  }
  if (invite.used_at || invite.usedAt) {
    throw new Error("Este convite ja foi usado.");
  }

  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query(
      `update invite_tokens
       set used_by = $2, used_at = now()
       where token = $1 and used_at is null
       returning *`,
      [String(token).trim(), String(userId)]
    );
    if (!rows[0]) throw new Error("Este convite ja foi usado.");
    return safeInvite(rows[0]);
  }

  const db = readLocalDb();
  const localInvite = (db.invites || []).find((item) => item.token === String(token).trim());
  if (!localInvite || localInvite.used_at) {
    throw new Error("Este convite ja foi usado.");
  }
  localInvite.used_by = String(userId);
  localInvite.used_at = new Date().toISOString();
  writeLocalDb(db);
  return safeInvite(localInvite);
}

async function listInvites() {
  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query("select * from invite_tokens order by created_at desc limit 200");
    return rows.map(safeInvite);
  }

  const db = readLocalDb();
  return (db.invites || [])
    .slice()
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .map(safeInvite);
}

async function listUsers() {
  const pool = await ensurePostgresSchema();
  if (pool) {
    const { rows } = await pool.query(`
      select u.id, u.username, u.display_name, u.email, u.age, u.sex, u.role, u.gender, u.created_at,
        count(h.id)::int as history_count
      from app_users u
      left join performance_history h on h.user_id = u.id
      group by u.id
      order by u.created_at desc
    `);
    return rows.map((row) => ({ ...safeUser(row), historyCount: Number(row.history_count) || 0 }));
  }

  const db = readLocalDb();
  return (db.users || []).map((user) => ({
    ...safeUser(user),
    historyCount: (db.performanceHistory || []).filter((entry) => String(entry.userId || entry.user_id || "") === String(user.id)).length
  }));
}

async function getDatabaseStatus() {
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
    usingPostgres: false,
    dbPath: DB_PATH
  };
}

module.exports = {
  DB_PATH,
  ensureLocalDbFile,
  authenticateUser,
  createInvite,
  createUser,
  getUserById,
  getInviteByToken,
  getDatabaseStatus,
  getHistory,
  listInvites,
  listUsers,
  saveHistory,
  useInvite,
  replaceHistory
};
