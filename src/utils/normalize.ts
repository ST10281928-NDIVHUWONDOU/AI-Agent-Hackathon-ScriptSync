import type { NormalizedReport, RawReport, Severity } from '../models.js';

const STOP_WORDS = new Set(['a', 'an', 'the', 'is', 'are', 'at', 'in', 'on', 'of', 'to', 'and', 'with', 'for', 'from', 'this', 'that', 'near', 'has', 'have', 'been', 'but', 'it', 'no', 'one', 'says', 'report', 'reports', 'duplicate']);
const TYPE_RULES: Array<[string, RegExp]> = [
  ['fire', /fire|smoke|burning|flame|alarm/], ['medical', /medical|collapsed|unconscious|breathing|injury|first aid|paramedic/],
  ['electrical', /electric|power|cable|socket|spark|buzzing|light|contactor/], ['it', /wi[-\s]?fi|network|login|authentication|connect|switch|computer|desktop|system|learning platform/],
  ['accessibility', /lift|wheelchair|accessible|accessibility|drop-?off/], ['security', /security|unknown person|contractor|restricted|identification|access control/],
  ['facilities', /water|leak|pipe|handrail|building|repair|ceiling|carpet/], ['environmental', /glass|spill|debris|cleaning|bin|waste|hygiene|insects/]
];
const CATEGORY_ALIASES: Record<string, string> = { cleaning: 'environmental', plumbing: 'facilities', maintenance: 'facilities', network: 'it', wifi: 'it', 'wi-fi': 'it', emergency: 'medical', lift: 'accessibility' };
const STRONG_DESCRIPTION_SIGNALS: Record<string, RegExp> = {
  fire: /fire|smoke|burning|flame|alarm/, medical: /collapsed|unconscious|breathing|first aid|paramedic/,
  electrical: /sparks|exposed wiring|socket|cable|buzzing|contactor/, it: /wi[-\s]?fi|network|authentication|login|learning platform|computer|desktop|system/,
  accessibility: /lift|wheelchair|accessible|drop-?off/, security: /unknown person|contractor|restricted|access control/,
  facilities: /water|leak|pipe|handrail|ceiling|carpet/, environmental: /glass|spill|bin|waste|hygiene|insects/
};

export function clean(value: string | undefined): string { return (value ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
export function tokens(value: string): string[] { return [...new Set(clean(value).split(' ').filter((word) => word.length > 2 && !STOP_WORDS.has(word)))]; }
export function normalizeLocation(value: string | undefined): string { return clean(value).replace(/^n\s+(?=(hall|hub|residence|block|building|science|library)\b)/, 'north ').replace(/\blevel\s+(\w+)/g, 'level $1').replace(/\bblock\s+/g, 'block ').trim(); }
export function normalizeSeverity(value: string | undefined): Severity | null { const key = clean(value); return key === 'critical' ? 'CRITICAL' : key === 'high' ? 'HIGH' : key === 'medium' || key === 'moderate' ? 'MEDIUM' : key === 'low' || key === 'minor' ? 'LOW' : null; }
export function inferType(category: string | undefined, description: string | undefined): string {
  const categoryKey = clean(category); const categoryType = CATEGORY_ALIASES[categoryKey] ?? categoryKey;
  const known = new Set(TYPE_RULES.map(([type]) => type));
  const descriptionKey = clean(description); const evidence = `${categoryKey} ${descriptionKey}`; const hit = TYPE_RULES.find(([, matcher]) => matcher.test(evidence));
  // Preserve reported operational categories. A clearly stated IT outage can safely override a broad facilities/environmental label.
  const canOverrideBroadCategory = (categoryType === 'facilities' || categoryType === 'environmental') && hit?.[0] === 'it';
  if (known.has(categoryType) && (!hit || hit[0] === categoryType || !canOverrideBroadCategory || !STRONG_DESCRIPTION_SIGNALS[hit[0]]?.test(descriptionKey))) return categoryType;
  return hit?.[0] ?? (categoryType || 'unknown');
}
export function normalizeReport(raw: RawReport, position: number): NormalizedReport {
  const description = raw.description?.trim() ?? ''; const location = raw.location?.trim() ?? '';
  return { reportId: raw.report_id?.trim() || `MISSING-${position}`, timestamp: raw.timestamp?.trim() ?? '', location, locationKey: normalizeLocation(location), category: clean(raw.category), type: inferType(raw.category, description), reportedSeverity: normalizeSeverity(raw.reported_severity), description, descriptionKey: clean(description), tokens: tokens(`${description} ${raw.category ?? ''}`), reporterType: clean(raw.reporter_type) };
}
export function overlap(left: string[], right: Iterable<string>): number { const r = new Set(right); return left.length === 0 ? 0 : left.filter((item) => r.has(item)).length / left.length; }
