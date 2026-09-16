export const RELATIONSHIPS = ['NEW', 'UPDATE', 'CORROBORATION', 'CONFLICT', 'DUPLICATE', 'RESOLUTION'] as const;
export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const STATUSES = ['INVESTIGATING', 'ACTIVE', 'ESCALATED', 'CONTROLLED', 'RESOLVED'] as const;
export const ACTION_TYPES = ['DISPATCH', 'NOTIFY', 'REQUEST_INSPECTION', 'REQUEST_VERIFICATION', 'ESCALATE_RESPONSE', 'CONTINUE_RESPONSE', 'CREATE_TICKET', 'MONITOR', 'CLOSE_INCIDENT', 'NO_NEW_ACTION'] as const;

export type Relationship = (typeof RELATIONSHIPS)[number];
export type Severity = (typeof SEVERITIES)[number];
export type IncidentStatus = (typeof STATUSES)[number];
export type ActionType = (typeof ACTION_TYPES)[number];

export interface RawReport { report_id?: string; timestamp?: string; location?: string; category?: string; reported_severity?: string; description?: string; reporter_type?: string; }
export interface NormalizedReport { reportId: string; timestamp: string; location: string; locationKey: string; category: string; type: string; reportedSeverity: Severity | null; description: string; descriptionKey: string; tokens: string[]; reporterType: string; }
export interface Service { service_id: string; service_name: string; service_type: string; availability: string; scope: string; }
export interface Action { type: ActionType; service_id?: string; }
export interface Prediction { report_id: string; incident_id: string; relationship: Relationship; severity: Severity; confidence: number; actions: Action[]; incident_status: IncidentStatus; human_review: boolean; }
export interface ActionHistoryItem extends Action { position: number; reportId: string; outcome: string; }
export interface Incident { incidentId: string; normalizedType: string; canonicalLocation: string; severity: Severity; confidence: number; status: IncidentStatus; linkedReportIds: string[]; evidence: string[]; tokenSet: Set<string>; services: string[]; actionHistory: ActionHistoryItem[]; severityHistory: Severity[]; confidenceHistory: number[]; statusHistory: IncidentStatus[]; conflictCount: number; reviewCount: number; resolvedAt?: number; }
export interface DecisionTrace { position: number; incomingReport: NormalizedReport; prediction: Prediction; reason: string; correlation: { score: number; signals: string[]; candidates: string[] }; groq: { used: boolean; fallback: boolean }; }
export interface Replay { generatedAt: string; decisions: DecisionTrace[]; incidents: Array<Omit<Incident, 'tokenSet'>>; statistics: Record<string, number | Record<string, number>>; }
