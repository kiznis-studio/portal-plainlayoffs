import Database from 'better-sqlite3';
import { createD1Adapter } from './d1-adapter';
import type { D1Database } from './d1-adapter';

const DB_PATH = process.env.DB_PATH || '/data/portal.db';

let _db: D1Database | null = null;

export function getDb(): D1Database | null {
  if (_db) return _db;
  try {
    _db = createD1Adapter(DB_PATH);
    return _db;
  } catch {
    return null;
  }
}

let _rawDb: InstanceType<typeof Database> | null = null;

/** Returns the raw better-sqlite3 instance for complex queries in pages */
export function getRawDb(): InstanceType<typeof Database> | null {
  if (_rawDb) return _rawDb;
  try {
    _rawDb = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    return _rawDb;
  } catch {
    return null;
  }
}

// ─── Query cache ──────────────────────────────────────────────────────────────
const queryCache = new Map<string, unknown>();

export function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (queryCache.has(key)) return Promise.resolve(queryCache.get(key) as T);
  return fn().then(v => { queryCache.set(key, v); return v; });
}

export function getQueryCacheSize(): number { return queryCache.size; }

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Employer {
  id: number;
  name: string;
  slug: string;
  total_notices: number;
  total_workers: number;
  first_notice_date: string | null;
  latest_notice_date: string | null;
  state_count: number;
  primary_state: string | null;
  primary_industry: string | null;
}

export interface Notice {
  id: number;
  employer_id: number | null;
  state: string;
  city: string | null;
  notice_date: string;
  effective_date: string | null;
  workers_affected: number;
  type: string | null;
  industry: string | null;
  naics: string | null;
  ai_caused: number;
  source: string | null;
  employer_name?: string;
  employer_slug?: string;
}

export interface StateRow {
  code: string;
  name: string;
  total_notices: number;
  total_workers: number;
  latest_notice_date: string | null;
  warn_threshold: number;
}

export interface Industry {
  slug: string;
  name: string;
  naics: string | null;
  total_notices: number;
  total_workers: number;
}

export interface MonthStat {
  year: number;
  month: number;
  total_notices: number;
  total_workers: number;
}

// ─── Homepage queries ─────────────────────────────────────────────────────────
export async function getHeroStats() {
  const db = getDb();
  if (!db) return null;
  return cached('hero_stats', async () => {
    const totalWorkers = await db.prepare('SELECT SUM(workers_affected) as n FROM notices').first<{n:number|null}>();
    const totalNotices = await db.prepare('SELECT COUNT(*) as n FROM notices').first<{n:number}>();
    const totalEmployers = await db.prepare('SELECT COUNT(*) as n FROM employers').first<{n:number}>();
    const latestNotice = await db.prepare('SELECT notice_date FROM notices ORDER BY notice_date DESC LIMIT 1').first<{notice_date:string}>();
    return {
      total_workers: totalWorkers?.n ?? 0,
      total_notices: totalNotices?.n ?? 0,
      total_employers: totalEmployers?.n ?? 0,
      latest_date: latestNotice?.notice_date ?? null,
    };
  });
}

export async function getRecentNotices(limit = 25): Promise<Notice[]> {
  const db = getDb();
  if (!db) return [];
  return cached(`recent_notices_${limit}`, async () => {
    const r = await db.prepare(`
      SELECT n.*, e.name as employer_name, e.slug as employer_slug
      FROM notices n LEFT JOIN employers e ON e.id = n.employer_id
      ORDER BY n.notice_date DESC
      LIMIT ?1
    `).bind(limit).all<Notice>();
    return r.results ?? [];
  });
}

export async function getTopEmployers(limit = 20): Promise<Employer[]> {
  const db = getDb();
  if (!db) return [];
  return cached(`top_employers_${limit}`, async () => {
    const r = await db.prepare('SELECT * FROM employers ORDER BY total_workers DESC LIMIT ?1').bind(limit).all<Employer>();
    return r.results ?? [];
  });
}

export async function getMonthlyStats(): Promise<MonthStat[]> {
  const db = getDb();
  if (!db) return [];
  return cached('monthly_stats', async () => {
    const r = await db.prepare('SELECT * FROM monthly_stats ORDER BY year DESC, month DESC').all<MonthStat>();
    return r.results ?? [];
  });
}

// ─── Employer queries ─────────────────────────────────────────────────────────
export async function getEmployer(slug: string): Promise<Employer | null> {
  const db = getDb();
  if (!db) return null;
  return db.prepare('SELECT * FROM employers WHERE slug = ?1 COLLATE NOCASE').bind(slug).first<Employer>();
}

export async function getEmployerNotices(employerId: number): Promise<Notice[]> {
  const db = getDb();
  if (!db) return [];
  const r = await db.prepare('SELECT * FROM notices WHERE employer_id = ?1 ORDER BY notice_date DESC').bind(employerId).all<Notice>();
  return r.results ?? [];
}

export async function getAllEmployers(sort: 'workers'|'notices'|'name' = 'workers', limit = 200): Promise<Employer[]> {
  const db = getDb();
  if (!db) return [];
  const orderCol = sort === 'name' ? 'name COLLATE NOCASE' : sort === 'notices' ? 'total_notices DESC' : 'total_workers DESC';
  return cached(`all_employers_${sort}_${limit}`, async () => {
    const r = await db.prepare(`SELECT * FROM employers ORDER BY ${orderCol} LIMIT ?1`).bind(limit).all<Employer>();
    return r.results ?? [];
  });
}

// ─── State queries ─────────────────────────────────────────────────────────────
export async function getStates(): Promise<StateRow[]> {
  const db = getDb();
  if (!db) return [];
  return cached('states', async () => {
    const r = await db.prepare('SELECT * FROM states ORDER BY name COLLATE NOCASE').all<StateRow>();
    return r.results ?? [];
  });
}

export async function getState(code: string): Promise<StateRow | null> {
  const db = getDb();
  if (!db) return null;
  return db.prepare('SELECT * FROM states WHERE code = ?1').bind(code.toUpperCase()).first<StateRow>();
}

export async function getStateEmployers(state: string, limit = 50): Promise<Employer[]> {
  const db = getDb();
  if (!db) return [];
  const r = await db.prepare('SELECT * FROM employers WHERE primary_state = ?1 ORDER BY total_workers DESC LIMIT ?2').bind(state.toUpperCase(), limit).all<Employer>();
  return r.results ?? [];
}

export async function getStateNotices(state: string, limit = 50): Promise<Notice[]> {
  const db = getDb();
  if (!db) return [];
  const r = await db.prepare(`
    SELECT n.*, e.name as employer_name, e.slug as employer_slug
    FROM notices n LEFT JOIN employers e ON e.id = n.employer_id
    WHERE n.state = ?1 ORDER BY n.notice_date DESC LIMIT ?2
  `).bind(state.toUpperCase(), limit).all<Notice>();
  return r.results ?? [];
}

// ─── Industry queries ─────────────────────────────────────────────────────────
export async function getIndustries(): Promise<Industry[]> {
  const db = getDb();
  if (!db) return [];
  return cached('industries', async () => {
    const r = await db.prepare('SELECT * FROM industries ORDER BY total_workers DESC').all<Industry>();
    return r.results ?? [];
  });
}

export async function getIndustry(slug: string): Promise<Industry | null> {
  const db = getDb();
  if (!db) return null;
  return db.prepare('SELECT * FROM industries WHERE slug = ?1').bind(slug).first<Industry>();
}

export async function getIndustryEmployers(slug: string, limit = 50): Promise<Employer[]> {
  const db = getDb();
  if (!db) return [];
  const industry = await getIndustry(slug);
  if (!industry) return [];
  const r = await db.prepare('SELECT * FROM employers WHERE primary_industry = ?1 ORDER BY total_workers DESC LIMIT ?2').bind(industry.name, limit).all<Employer>();
  return r.results ?? [];
}

export async function getIndustryNotices(slug: string, limit = 50): Promise<Notice[]> {
  const db = getDb();
  if (!db) return [];
  const industry = await getIndustry(slug);
  if (!industry) return [];
  const r = await db.prepare(`
    SELECT n.*, e.name as employer_name, e.slug as employer_slug
    FROM notices n LEFT JOIN employers e ON e.id = n.employer_id
    WHERE n.industry = ?1 ORDER BY n.notice_date DESC LIMIT ?2
  `).bind(industry.name, limit).all<Notice>();
  return r.results ?? [];
}

// ─── Year queries ─────────────────────────────────────────────────────────────
export async function getYears(): Promise<number[]> {
  const db = getDb();
  if (!db) return [];
  return cached('years', async () => {
    const r = await db.prepare('SELECT DISTINCT year FROM monthly_stats ORDER BY year DESC').all<{year:number}>();
    return r.results?.map(r => r.year) ?? [];
  });
}

export async function getYearData(year: number) {
  const db = getDb();
  if (!db) return null;
  const months = await db.prepare('SELECT * FROM monthly_stats WHERE year = ?1 ORDER BY month').bind(year).all<MonthStat>();
  const topNotices = await db.prepare(`
    SELECT n.*, e.name as employer_name, e.slug as employer_slug
    FROM notices n LEFT JOIN employers e ON e.id = n.employer_id
    WHERE substr(n.notice_date, 1, 4) = ?1 ORDER BY n.workers_affected DESC LIMIT 20
  `).bind(String(year)).all<Notice>();
  const total = months.results?.reduce((a, m) => ({ notices: a.notices + m.total_notices, workers: a.workers + m.total_workers }), { notices: 0, workers: 0 });
  return { year, months: months.results ?? [], topNotices: topNotices.results ?? [], total };
}

// ─── Search ───────────────────────────────────────────────────────────────────
export async function searchEmployers(query: string, limit = 30): Promise<Employer[]> {
  const db = getDb();
  if (!db) return [];
  const q = `%${query}%`;
  const r = await db.prepare('SELECT * FROM employers WHERE name LIKE ?1 ORDER BY total_workers DESC LIMIT ?2').bind(q, limit).all<Employer>();
  return r.results ?? [];
}

// ─── Rankings ─────────────────────────────────────────────────────────────────
export async function getRankings(limit = 100): Promise<Employer[]> {
  const db = getDb();
  if (!db) return [];
  return cached(`rankings_${limit}`, async () => {
    const r = await db.prepare('SELECT * FROM employers ORDER BY total_workers DESC LIMIT ?1').bind(limit).all<Employer>();
    return r.results ?? [];
  });
}

// ─── Paginated recent notices ─────────────────────────────────────────────────
export async function getPaginatedNotices(page: number, perPage = 50): Promise<{notices: Notice[], total: number}> {
  const db = getDb();
  if (!db) return { notices: [], total: 0 };
  const offset = (page - 1) * perPage;
  const [noticesRes, countRes] = await Promise.all([
    db.prepare(`
      SELECT n.*, e.name as employer_name, e.slug as employer_slug
      FROM notices n LEFT JOIN employers e ON e.id = n.employer_id
      ORDER BY n.notice_date DESC LIMIT ?1 OFFSET ?2
    `).bind(perPage, offset).all<Notice>(),
    db.prepare('SELECT COUNT(*) as n FROM notices').first<{n:number}>(),
  ]);
  return { notices: noticesRes.results ?? [], total: countRes?.n ?? 0 };
}

// ─── Warm cache ───────────────────────────────────────────────────────────────
export async function warmQueryCache(db: D1Database): Promise<void> {
  await Promise.all([
    getHeroStats(),
    getMonthlyStats(),
    getStates(),
    getIndustries(),
    getTopEmployers(20),
    getRankings(100),
    getRecentNotices(25),
    getYears(),
    getAllEmployers('workers', 200),
  ]);
}
