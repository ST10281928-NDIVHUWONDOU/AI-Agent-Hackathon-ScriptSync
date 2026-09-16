import type { Action, DecisionTrace, Incident, Replay } from '../models';

export interface IncidentAtPoint { incident: Omit<Incident, 'tokenSet'>; decisions: DecisionTrace[]; last: DecisionTrace; actions: Array<{ decision: DecisionTrace; action: Action }>; conflicts: number; reviews: number; }
export function decisionsThrough(replay: Replay, index: number): DecisionTrace[] { return replay.decisions.slice(0, Math.max(0, Math.min(index + 1, replay.decisions.length))); }
export function filterDecisions(decisions: DecisionTrace[], filters: string[]): DecisionTrace[] {
  if (filters.length === 0 || filters.includes('ALL')) return decisions;
  return decisions.filter((decision) => filters.some((filter) => filter === 'REVIEW' ? decision.prediction.human_review : decision.prediction.relationship === filter || decision.prediction.severity === filter || decision.prediction.incident_status === filter));
}
export function currentIncidentId(replay: Replay, index: number): string | null { return decisionsThrough(replay, index).at(-1)?.prediction.incident_id ?? null; }
export function isReplay(value: unknown): value is Replay { return Boolean(value && typeof value === 'object' && Array.isArray((value as { decisions?: unknown }).decisions) && Array.isArray((value as { incidents?: unknown }).incidents)); }
export function incidentsAtPoint(replay: Replay, index: number): IncidentAtPoint[] {
  const source = new Map(replay.incidents.map((incident) => [incident.incidentId, incident])); const groups = new Map<string, DecisionTrace[]>();
  decisionsThrough(replay, index).forEach((decision) => groups.set(decision.prediction.incident_id, [...(groups.get(decision.prediction.incident_id) ?? []), decision]));
  return [...groups.entries()].flatMap(([incidentId, decisions]) => { const incident = source.get(incidentId); const last = decisions.at(-1); return incident && last ? [{ incident, decisions, last, actions: decisions.flatMap((decision) => decision.prediction.actions.map((action) => ({ decision, action }))), conflicts: decisions.filter((decision) => decision.prediction.relationship === 'CONFLICT').length, reviews: decisions.filter((decision) => decision.prediction.human_review).length }] : []; }).sort((left, right) => left.incident.incidentId.localeCompare(right.incident.incidentId));
}
export function sourceLabel(decision: DecisionTrace): string { return decision.groq.fallback ? 'Deterministic fallback' : decision.groq.used ? 'Groq adjudication' : 'Deterministic'; }
export function actionLabel(action: Action): string { return action.service_id ? `${action.type} · ${action.service_id}` : action.type; }
export function confidence(value: number): string { return `${Math.round(value * 100)}%`; }
