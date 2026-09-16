import type { Action, DecisionTrace, Incident, IncidentStatus, NormalizedReport, Prediction, Relationship, Replay, Service, Severity } from '../models.js';
import { normalizeReport, overlap } from '../utils/normalize.js';
import { ServiceDirectory } from '../services/service-directory.js';
import { GroqAdjudicator, type CandidateSummary } from '../groq/adjudicator.js';

const severityRank: Record<Severity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const keyword = (text: string, expression: RegExp): boolean => expression.test(text.toLowerCase());
const clamp = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(2))));

interface Candidate { incident: Incident; score: number; signals: string[]; }

export class IncidentEngine {
  private readonly directory: ServiceDirectory;
  private readonly adjudicator: GroqAdjudicator;
  private readonly incidents: Incident[] = [];
  private readonly decisions: DecisionTrace[] = [];
  constructor(services: Service[], apiKey?: string) { this.directory = new ServiceDirectory(services); this.adjudicator = new GroqAdjudicator(apiKey); }

  async process(raw: Parameters<typeof normalizeReport>[0], position: number): Promise<Prediction> {
    const report = normalizeReport(raw, position);
    const candidates = this.findCandidates(report);
    let chosen: Candidate | undefined = candidates[0]; let groqUsed = false; let groqFallback = false;
    if (chosen && chosen.score >= 0.55 && chosen.score < 0.7) {
      const adjudication = await this.adjudicate(report, candidates.slice(0, 3));
      groqUsed = this.adjudicator.available;
      if (adjudication) chosen = adjudication.selectedIncidentId === 'NEW' ? undefined : candidates.find((item) => item.incident.incidentId === adjudication.selectedIncidentId);
      else if (this.adjudicator.available) groqFallback = true;
    }
    if (!chosen || chosen.score < 0.55) return this.createIncident(report, position, candidates, groqUsed, groqFallback);
    return this.updateIncident(chosen, report, position, candidates, groqUsed, groqFallback);
  }

  async processAll(rows: Parameters<typeof normalizeReport>[0][]): Promise<Prediction[]> { const output: Prediction[] = []; for (let index = 0; index < rows.length; index += 1) output.push(await this.process(rows[index], index + 1)); return output; }
  replay(): Replay {
    const cleanIncidents = this.incidents.map(({ tokenSet, ...incident }) => { void tokenSet; return incident; });
    const counts = (values: string[]): Record<string, number> => values.reduce<Record<string, number>>((map, value) => ({ ...map, [value]: (map[value] ?? 0) + 1 }), {});
    return { generatedAt: new Date().toISOString(), decisions: this.decisions, incidents: cleanIncidents, statistics: { totalIncidents: this.incidents.length, relationships: counts(this.decisions.map((d) => d.prediction.relationship)), actions: counts(this.decisions.flatMap((d) => d.prediction.actions.map((a) => a.type))), severities: counts(this.decisions.map((d) => d.prediction.severity)), finalStatuses: counts(this.incidents.map((i) => i.status)), humanReview: this.decisions.filter((d) => d.prediction.human_review).length, groqAdjudications: this.decisions.filter((d) => d.groq.used && !d.groq.fallback).length, groqFallbacks: this.decisions.filter((d) => d.groq.fallback).length, deterministicOnly: this.decisions.filter((d) => !d.groq.used).length } };
  }

  private findCandidates(report: NormalizedReport): Candidate[] {
    return this.incidents.map((incident) => {
      const signals: string[] = []; let score = 0;
      if (incident.normalizedType === report.type && report.type !== 'unknown') { score += 0.44; signals.push('same incident type'); }
      const sameLocation = Boolean(report.locationKey) && report.locationKey === incident.canonicalLocation;
      if (sameLocation) { score += 0.4; signals.push('same normalized location'); }
      else if (report.locationKey && incident.canonicalLocation && (report.locationKey.includes(incident.canonicalLocation) || incident.canonicalLocation.includes(report.locationKey))) { score += 0.28; signals.push('compatible location'); }
      const tokenOverlap = overlap(report.tokens, incident.tokenSet);
      if (tokenOverlap >= 0.2) { score += Math.min(0.24, tokenOverlap * 0.34); signals.push(`evidence overlap ${Math.round(tokenOverlap * 100)}%`); }
      // Same type alone must not merge separate, explicitly located incidents (for example two medical calls on different fields).
      if (report.locationKey && incident.canonicalLocation && !sameLocation && !report.locationKey.includes(incident.canonicalLocation) && !incident.canonicalLocation.includes(report.locationKey)) score = Math.min(score, 0.5);
      if (incident.status === 'RESOLVED') score -= 0.04;
      return { incident, score: Math.max(0, score), signals };
    }).filter((candidate) => candidate.score >= 0.24).sort((a, b) => b.score - a.score);
  }

  private async adjudicate(report: NormalizedReport, candidates: Candidate[]): Promise<Awaited<ReturnType<GroqAdjudicator['decide']>> | null> {
    const summaries: CandidateSummary[] = candidates.map(({ incident }) => ({ incidentId: incident.incidentId, type: incident.normalizedType, location: incident.canonicalLocation, evidence: incident.evidence.slice(-2).join(' | ') }));
    return this.adjudicator.decide({ description: report.description, location: report.location, type: report.type }, summaries);
  }

  private createIncident(report: NormalizedReport, position: number, candidates: Candidate[], groqUsed: boolean, groqFallback: boolean): Prediction {
    const initialSeverity = this.assessSeverity(report, null, 'NEW');
    const incident: Incident = { incidentId: `I${String(this.incidents.length + 1).padStart(3, '0')}`, normalizedType: report.type, canonicalLocation: report.locationKey, severity: initialSeverity, confidence: this.initialConfidence(report), status: initialSeverity === 'CRITICAL' ? 'ESCALATED' : initialSeverity === 'HIGH' ? 'ACTIVE' : 'INVESTIGATING', linkedReportIds: [], evidence: [], tokenSet: new Set(), services: [], actionHistory: [], severityHistory: [], confidenceHistory: [], statusHistory: [], conflictCount: 0, reviewCount: 0 };
    this.incidents.push(incident);
    const humanReview = this.needsReview(report, incident.severity, false);
    const actions = this.initialActions(incident, report, position);
    this.applyEvidence(incident, report);
    if (humanReview) incident.reviewCount += 1;
    return this.emit(incident, report, 'NEW', actions, humanReview, 'new incident from distinct type/location evidence', 0, [], candidates, groqUsed, groqFallback, position);
  }

  private updateIncident(candidate: Candidate, report: NormalizedReport, position: number, candidates: Candidate[], groqUsed: boolean, groqFallback: boolean): Prediction {
    const incident = candidate.incident; const relationship = this.relationship(incident, report);
    const previousSeverity = incident.severity; const previousStatus = incident.status;
    incident.severity = this.assessSeverity(report, incident, relationship);
    incident.status = this.assessStatus(report, incident, relationship, previousStatus);
    incident.confidence = this.assessConfidence(incident.confidence, relationship, report);
    const humanReview = this.needsReview(report, incident.severity, relationship === 'CONFLICT');
    if (humanReview) incident.reviewCount += 1;
    if (relationship === 'CONFLICT') incident.conflictCount += 1;
    const actions = this.followUpActions(incident, report, relationship, previousSeverity, previousStatus, position);
    this.applyEvidence(incident, report);
    const reason = relationship === 'DUPLICATE' ? 'near-identical evidence linked without a repeat dispatch' : relationship === 'CONFLICT' ? 'conflicting evidence retained; confidence constrained' : relationship === 'RESOLUTION' ? 'explicit restoration or hazard-clearance evidence supports closure' : relationship === 'CORROBORATION' ? 'independent supporting evidence linked to existing incident' : 'new operational evidence updates existing incident';
    return this.emit(incident, report, relationship, actions, humanReview, reason, candidate.score, candidate.signals, candidates, groqUsed, groqFallback, position);
  }

  private relationship(incident: Incident, report: NormalizedReport): Relationship {
    const text = report.descriptionKey;
    const duplicate = incident.evidence.some((evidence) => evidence === report.descriptionKey) || keyword(text, /\bduplicate\b/) || (overlap(report.tokens, incident.tokenSet) > 0.82 && report.tokens.length > 2);
    if (this.isResolution(text)) return 'RESOLUTION';
    if (duplicate) return 'DUPLICATE';
    if (this.isConflict(text)) return 'CONFLICT';
    if (keyword(text, /another|second|confirms|witness|multiple|security confirms|lecturer reports/)) return 'CORROBORATION';
    return 'UPDATE';
  }
  private assessSeverity(report: NormalizedReport, incident: Incident | null, relationship: Relationship): Severity {
    const text = report.descriptionKey; let assessed: Severity = report.reportedSeverity ?? 'LOW';
    if (keyword(text, /flames|sparks|unconscious|trapped|lost consciousness|evacuat|immediate threat/)) assessed = 'CRITICAL';
    else if (keyword(text, /smoke|burning|collapsed|exposed|alarm|power extension|large dark|widening|multiple buildings|serious/)) assessed = 'HIGH';
    else if (keyword(text, /water|glass|lift|outage|restricted|buzzing|handrail|injury|blocking/)) assessed = 'MEDIUM';
    if (!incident) return assessed;
    if (relationship === 'RESOLUTION') return 'LOW';
    if (keyword(text, /isolated|controlled|stabil|temporary|responsive|released safely|restores some|restored|repair.*complete|under test|testing|monitoring continues|normal traffic|passes safety|no additional/)) return severityRank[incident.severity] > severityRank.MEDIUM ? 'MEDIUM' : incident.severity;
    return severityRank[assessed] > severityRank[incident.severity] ? assessed : incident.severity;
  }
  private assessStatus(report: NormalizedReport, incident: Incident, relationship: Relationship, previous: IncidentStatus): IncidentStatus {
    const text = report.descriptionKey;
    if (relationship === 'RESOLUTION') { incident.resolvedAt = incident.linkedReportIds.length + 1; return 'RESOLVED'; }
    if (previous === 'RESOLVED') return 'ACTIVE';
    if (keyword(text, /controlled|isolated|stabil|released safely|temporary route|temporary lighting|flow has stopped|no additional|responsive and being monitored|restored|repair.*complete|under test|testing|monitoring continues|normal traffic|passes safety/)) return 'CONTROLLED';
    if (incident.severity === 'CRITICAL') return 'ESCALATED';
    if (incident.severity === 'HIGH') return previous === 'ESCALATED' ? 'ESCALATED' : 'ACTIVE';
    return previous === 'INVESTIGATING' ? 'ACTIVE' : previous;
  }
  private assessConfidence(current: number, relationship: Relationship, report: NormalizedReport): number {
    const source = report.reporterType === 'system sensor' ? 0.02 : 0;
    if (relationship === 'DUPLICATE') return clamp(current + 0.005);
    if (relationship === 'CONFLICT') return clamp(current - 0.12);
    if (relationship === 'CORROBORATION') return clamp(current + 0.08 + source);
    if (relationship === 'RESOLUTION') return clamp(Math.max(current + 0.08, 0.78));
    return clamp(current + 0.04 + source);
  }
  private initialConfidence(report: NormalizedReport): number { return clamp(0.54 + (report.locationKey ? 0.05 : 0) + (report.descriptionKey ? 0.05 : 0) + (report.reporterType === 'system sensor' ? 0.03 : 0)); }
  private isResolution(text: string): boolean {
    // Restoration, repair, testing, and monitoring are controlled-progress signals. Closure needs explicit language or a verified final state.
    return keyword(text, /\bresolved\b|\bclosed\b|\bclosure\b|no remaining (?:hazard|issue|risk)|final (?:verification|clearance|sweep)|returned to service.*(?:stood down|verified|confirmed)|(?:verified|verification|confirmed).*(?:restor|repair|return|clear|stable)|(?:restored|repaired|returned).*(?:verified|confirmed|stable|closed)|network services are stable/);
  }
  private isConflict(text: string): boolean { return keyword(text, /conflict|may only|may be dust|believes.*local|only dehydration|doors are open|may have been scheduled|still passable|briefly returned/); }
  private needsReview(report: NormalizedReport, severity: Severity, conflict: boolean): boolean { const text = report.descriptionKey; return (conflict && severityRank[severity] >= severityRank.HIGH) || (report.type === 'security' && keyword(text, /unknown|not yet confirmed|restricted|trying keys/)) || (report.type === 'medical' && severityRank[severity] >= severityRank.HIGH && keyword(text, /unconfirmed|collapsed|unconscious/)); }
  private initialActions(incident: Incident, report: NormalizedReport, position: number): Action[] { const service = this.directory.serviceForIncident(incident.normalizedType, incident.severity); if (!service) return []; return this.recordAction(incident, { type: incident.normalizedType === 'security' && incident.severity === 'LOW' ? 'REQUEST_VERIFICATION' : 'DISPATCH', service_id: service.service_id }, position, report.reportId, 'initial response requested'); }
  private followUpActions(incident: Incident, report: NormalizedReport, relationship: Relationship, previousSeverity: Severity, previousStatus: IncidentStatus, position: number): Action[] {
    if (relationship === 'DUPLICATE' || relationship === 'CONFLICT') return [];
    if (relationship === 'RESOLUTION') return this.recordAction(incident, { type: 'CLOSE_INCIDENT' }, position, report.reportId, 'closure supported');
    if (incident.normalizedType === 'medical' && keyword(report.descriptionKey, /external emergency medical/)) { const ems = this.directory.get('medical'); const external = [...this.directory.ids].includes('SVC-EMS') ? 'SVC-EMS' : ems?.service_id; if (external && !incident.services.includes(external)) return this.recordAction(incident, { type: 'DISPATCH', service_id: external }, position, report.reportId, 'additional emergency medical support'); }
    if (severityRank[incident.severity] > severityRank[previousSeverity]) { const service = this.directory.serviceForIncident(incident.normalizedType, incident.severity); if (service) return this.recordAction(incident, { type: 'ESCALATE_RESPONSE', service_id: service.service_id }, position, report.reportId, 'severity increased'); }
    if (incident.status === 'CONTROLLED' && previousStatus !== 'CONTROLLED') return this.recordAction(incident, { type: 'MONITOR' }, position, report.reportId, 'condition controlled and monitored');
    return [];
  }
  private recordAction(incident: Incident, action: Action, position: number, reportId: string, outcome: string): Action[] { if (action.service_id && !this.directory.ids.has(action.service_id)) return []; if (action.service_id && !incident.services.includes(action.service_id)) incident.services.push(action.service_id); incident.actionHistory.push({ ...action, position, reportId, outcome }); return [action]; }
  private applyEvidence(incident: Incident, report: NormalizedReport): void { incident.linkedReportIds.push(report.reportId); incident.evidence.push(report.descriptionKey); report.tokens.forEach((token) => incident.tokenSet.add(token)); incident.severityHistory.push(incident.severity); incident.confidenceHistory.push(incident.confidence); incident.statusHistory.push(incident.status); }
  private emit(incident: Incident, report: NormalizedReport, relationship: Relationship, actions: Action[], humanReview: boolean, reason: string, score: number, signals: string[], candidates: Candidate[], groqUsed: boolean, groqFallback: boolean, position: number): Prediction {
    const prediction: Prediction = { report_id: report.reportId, incident_id: incident.incidentId, relationship, severity: incident.severity, confidence: clamp(incident.confidence), actions, incident_status: incident.status, human_review: humanReview };
    this.decisions.push({ position, incomingReport: report, prediction, reason, correlation: { score: Number(score.toFixed(2)), signals, candidates: candidates.slice(0, 3).map((candidate) => candidate.incident.incidentId) }, groq: { used: groqUsed, fallback: groqFallback } }); return prediction;
  }
}
