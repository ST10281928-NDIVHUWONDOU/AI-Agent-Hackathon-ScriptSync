import Groq from 'groq-sdk';
import type { Relationship } from '../models.js';

export interface Adjudication { selectedIncidentId: string | 'NEW'; relationship: Relationship; normalizedIncidentType: string; semanticConfidence: number; conflictDetected: boolean; resolutionSignal: boolean; conciseReason: string; }
export interface CandidateSummary { incidentId: string; type: string; location: string; evidence: string; }

const relationshipSet = new Set<Relationship>(['NEW', 'UPDATE', 'CORROBORATION', 'CONFLICT', 'DUPLICATE', 'RESOLUTION']);
export class GroqAdjudicator {
  private readonly client: Groq | null;
  constructor(apiKey = process.env.GROQ_API_KEY) { this.client = apiKey ? new Groq({ apiKey, timeout: 4_000, maxRetries: 0 }) : null; }
  get available(): boolean { return this.client !== null; }
  async decide(report: { description: string; location: string; type: string }, candidates: CandidateSummary[]): Promise<Adjudication | null> {
    if (!this.client) return null;
    const allowedIds = new Set([...candidates.map((candidate) => candidate.incidentId), 'NEW']);
    try {
      const completion = await this.client.chat.completions.create({ model: 'openai/gpt-oss-120b', response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'Return only concise JSON. Select one supplied incident ID or NEW. Never infer facts. Keys: selectedIncidentId, relationship, normalizedIncidentType, semanticConfidence, conflictDetected, resolutionSignal, conciseReason.' },
        { role: 'user', content: JSON.stringify({ report, candidates }) }
      ] });
      const content = completion.choices[0]?.message.content;
      if (!content) return null;
      const parsed: unknown = JSON.parse(content);
      if (!isAdjudication(parsed, allowedIds)) return null;
      return parsed;
    } catch { return null; }
  }
}
function isAdjudication(value: unknown, allowedIds: Set<string>): value is Adjudication {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.selectedIncidentId === 'string' && allowedIds.has(entry.selectedIncidentId) && typeof entry.normalizedIncidentType === 'string' && typeof entry.semanticConfidence === 'number' && entry.semanticConfidence >= 0 && entry.semanticConfidence <= 1 && typeof entry.conflictDetected === 'boolean' && typeof entry.resolutionSignal === 'boolean' && typeof entry.conciseReason === 'string' && typeof entry.relationship === 'string' && relationshipSet.has(entry.relationship as Relationship);
}
