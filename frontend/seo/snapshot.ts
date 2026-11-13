export interface Count { year: number; month: number; reports: number }
export interface Category { name: string; reports: number }
export interface Department {
  code: string; name: string; monthly: Count[];
  districts: { code: string; name: string; province: string; reports: number }[];
  categories: Category[];
}
export interface StatisticsSnapshot {
  version: 1; exportedAt: string; period: { year: number; month: number };
  imports: { sha256: string; importedAt: string }[]; departments: Department[];
}
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid SEO statistics snapshot; export validated database aggregates again');
}
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 300;
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const timestamp = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const periodKey = (p: { year: number; month: number }) => p.year * 12 + p.month;
function validPeriod(p: { year: number; month: number }) {
  return Number.isInteger(p.year) && p.year >= 2000 && p.year <= 2100 && Number.isInteger(p.month) && p.month >= 1 && p.month <= 12;
}
export function validateSnapshot(value: unknown): StatisticsSnapshot {
  const s = value as StatisticsSnapshot;
  requireValue(s && s.version === 1 && timestamp(s.exportedAt) && s.period && validPeriod(s.period));
  requireValue(Array.isArray(s.imports) && s.imports.length && s.imports.every(i => i && /^[a-f0-9]{64}$/.test(i.sha256) && timestamp(i.importedAt)));
  requireValue(Array.isArray(s.departments) && s.departments.length && s.departments.length <= 25);
  const codes = new Set<string>();
  let hasLatest = false;
  for (const d of s.departments) {
    requireValue(d && /^(0[1-9]|1\d|2[0-5])$/.test(d.code) && !codes.has(d.code) && text(d.name));
    codes.add(d.code);
    requireValue(Array.isArray(d.monthly) && d.monthly.length && Array.isArray(d.districts) && Array.isArray(d.categories));
    let previous = 0;
    for (const m of d.monthly) {
      requireValue(m && validPeriod(m) && count(m.reports) && periodKey(m) > previous && periodKey(m) <= periodKey(s.period));
      previous = periodKey(m);
    }
    const latest = d.monthly.find(m => periodKey(m) === periodKey(s.period));
    hasLatest ||= latest !== undefined;
    const districts = new Set<string>();
    for (const r of d.districts) {
      requireValue(r && /^\d{6}$/.test(r.code) && r.code.startsWith(d.code) && !r.code.endsWith('00') && !districts.has(r.code) && text(r.name) && text(r.province) && count(r.reports));
      districts.add(r.code);
    }
    const categories = new Set<string>();
    for (const c of d.categories) {
      requireValue(c && text(c.name) && !categories.has(c.name) && count(c.reports));
      categories.add(c.name);
    }
    requireValue(latest ? d.districts.length && d.categories.length && latest.reports === d.districts.reduce((n, r) => n + r.reports, 0) && latest.reports === d.categories.reduce((n, c) => n + c.reports, 0) : !d.districts.length && !d.categories.length);
  }
  requireValue(hasLatest);
  // Detect sums which cannot be represented accurately by JavaScript/JSON consumers.
  for (const m of nationalMonthly(s)) requireValue(count(m.reports));
  return s;
}
export function nationalMonthly(s: StatisticsSnapshot): Count[] {
  const totals = new Map<number, Count>();
  for (const d of s.departments) for (const m of d.monthly) {
    const key = periodKey(m);
    totals.set(key, { ...m, reports: (totals.get(key)?.reports ?? 0) + m.reports });
  }
  return [...totals.values()].sort((a, b) => periodKey(a) - periodKey(b));
}
export function departmentPath(d: Department): string {
  const slug = d.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `/estadisticas/departamentos/${d.code}-${slug || 'departamento'}/`;
}
