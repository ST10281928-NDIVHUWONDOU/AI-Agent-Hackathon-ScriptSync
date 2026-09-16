import Groq from 'groq-sdk';
import type { Relationship } from '../models.js';

export interface Adjudication { selectedIncidentId: string | 'NEW'; relationship: Relationship; normalizedIncidentType: string; semanticConfidence: number; conflictDetected: boolean; resolutionSignal: boolean; conciseReason: string; }
export interface CandidateSummary { incidentId: string; type: string; location: string; evidence: string; }

const relationshipSet = new Set<Relationship>(['NEW', 'UPDATE', 'CORROBORATION', 'CONFLICT', 'DUPLICATE', 'RESOLUTION']);
export class GroqAdjudicator {
  private readonly client: Groq | null;
  private failure: string | null = null;
  constructor(apiKey = process.env.GROQ_API_KEY) { this.client = apiKey ? new Groq({ apiKey, timeout: 4_000, maxRetries: 0 }) : null; }
  get available(): boolean { return this.client !== null; }
  get lastFailure(): string | null { return this.failure; }
  async decide(report: { description: string; location: string; type: string }, candidates: CandidateSummary[]): Promise<Adjudication | null> {
    if (!this.client) return null;
    this.failure = null;
    const allowedIds = new Set([...candidates.map((candidate) => candidate.incidentId), 'NEW']);
    try {
      const completion = await this.client.chat.completions.create({ model: 'openai/gpt-oss-120b', response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'Return one JSON object only, with no markdown. Never infer facts. selectedIncidentId must be exactly one supplied candidate ID or NEW. relationship must be exactly NEW, UPDATE, CORROBORATION, CONFLICT, DUPLICATE, or RESOLUTION. semanticConfidence must be a number from 0 to 1. conflictDetected and resolutionSignal must be booleans. Include all keys: selectedIncidentId, relationship, normalizedIncidentType, semanticConfidence, conflictDetected, resolutionSignal, conciseReason.' },
        { role: 'user', content: JSON.stringify({ report, allowedSelectedIncidentIds: [...allowedIds], candidates }) }
      ] });
      const content = completion.choices[0]?.message.content;
      if (!content) return null;
      const parsed: unknown = JSON.parse(content);
      if (!isAdjudication(parsed, allowedIds)) { this.failure = schemaFailure(parsed); return null; }
      return parsed;
    } catch (error: unknown) { this.failure = safeFailure(error); return null; }
  }
}
function safeFailure(error: unknown): string {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown Groq request failure';
  return detail.replace(/(?:gsk|sk)_[A-Za-z0-9_-]+/g, '[redacted credential]');
}
function schemaFailure(value: unknown): string {
  if (!value || typeof value !== 'object') return 'schema validation failed: response was not an object';
  const entry = value as Record<string, unknown>;
  const fields = ['selectedIncidentId', 'relationship', 'normalizedIncidentType', 'semanticConfidence', 'conflictDetected', 'resolutionSignal', 'conciseReason'];
  const missing = fields.filter((field) => !(field in entry));
  if (missing.length > 0) return `schema validation failed: missing ${missing.join(', ')}`;
  return `schema validation failed: selectedIncidentId=${String(entry.selectedIncidentId)}, relationship=${String(entry.relationship)}`;
}
function isAdjudication(value: unknown, allowedIds: Set<string>): value is Adjudication {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.selectedIncidentId === 'string' && allowedIds.has(entry.selectedIncidentId) && typeof entry.normalizedIncidentType === 'string' && typeof entry.semanticConfidence === 'number' && entry.semanticConfidence >= 0 && entry.semanticConfidence <= 1 && typeof entry.conflictDetected === 'boolean' && typeof entry.resolutionSignal === 'boolean' && typeof entry.conciseReason === 'string' && typeof entry.relationship === 'string' && relationshipSet.has(entry.relationship as Relationship);
}
