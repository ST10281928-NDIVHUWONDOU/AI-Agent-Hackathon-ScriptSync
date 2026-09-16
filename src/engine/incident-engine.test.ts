import { describe, expect, it } from 'vitest';
import { IncidentEngine } from './incident-engine';
import { RELATIONSHIPS, SEVERITIES, STATUSES, type RawReport, type Service } from '../models';

const services: Service[] = [
  { service_id: 'SVC-FIRE', service_name: 'Fire', service_type: 'fire', availability: '24/7', scope: '' },
  { service_id: 'SVC-FACILITIES', service_name: 'Facilities', service_type: 'facilities', availability: '24/7', scope: '' },
  { service_id: 'SVC-IT', service_name: 'IT', service_type: 'it', availability: '24/7', scope: '' },
  { service_id: 'SVC-ACCESS', service_name: 'Access', service_type: 'accessibility', availability: '24/7', scope: '' },
  { service_id: 'SVC-SECURITY', service_name: 'Security', service_type: 'security', availability: '24/7', scope: '' },
  { service_id: 'SVC-MEDICAL', service_name: 'Medical', service_type: 'medical', availability: '24/7', scope: '' },
  { service_id: 'SVC-ELECTRICAL', service_name: 'Electrical', service_type: 'electrical', availability: '24/7', scope: '' },
  { service_id: 'SVC-CLEANING', service_name: 'Cleaning', service_type: 'environmental', availability: '24/7', scope: '' }
];
const row = (id: string, description: string, location = 'Block A', category = 'facilities', severity = 'MEDIUM'): RawReport => ({ report_id: id, timestamp: 'bad-timestamp', location, category, reported_severity: severity, description, reporter_type: 'staff' });

describe('IncidentEngine', () => {
  it('correlates evidence, avoids repeat dispatches, evolves state, and validates output', async () => {
    const engine = new IncidentEngine(services, '');
    const predictions = await engine.processAll([
      row('R1', 'Water is pooling near the desks.'), row('R2', 'Water is pooling near the desks.'), row('R3', 'Another witness confirms water pooling near desks.'),
      row('R4', 'Loose handrail on west stairs.', 'West stairs'), row('R5', 'Water has reached a power extension and is unsafe.'),
      row('R6', 'Facilities isolated the pipe and the area is controlled.'), row('R7', 'Resolved: no remaining water or electrical hazard.'), row('R8', 'Water has started pooling again near desks.')
    ]);
    expect(predictions[1].relationship).toBe('DUPLICATE'); expect(predictions[1].actions).toEqual([]);
    expect(predictions[2].relationship).toBe('CORROBORATION'); expect(predictions[2].incident_id).toBe(predictions[0].incident_id);
    expect(predictions[3].incident_id).not.toBe(predictions[0].incident_id);
    expect(predictions[4].severity).toBe('HIGH'); expect(predictions[5].incident_status).toBe('CONTROLLED'); expect(predictions[6].incident_status).toBe('RESOLVED'); expect(predictions[7].incident_status).toBe('ACTIVE');
    expect(predictions.every((prediction) => RELATIONSHIPS.includes(prediction.relationship) && SEVERITIES.includes(prediction.severity) && STATUSES.includes(prediction.incident_status) && prediction.confidence >= 0 && prediction.confidence <= 1)).toBe(true);
    expect(new Set(predictions.map((prediction) => prediction.report_id)).size).toBe(8);
    expect(predictions.flatMap((prediction) => prediction.actions).every((action) => !action.service_id || services.some((service) => service.service_id === action.service_id))).toBe(true);
  });
  it('handles conflict, serious escalation, missing values and deterministic no-Groq fallback', async () => {
    const engine = new IncidentEngine(services, '');
    const predictions = await engine.processAll([
      row('R1', 'A burning smell comes from an electrical lab.', 'Engineering E3', 'fire', 'HIGH'), row('R2', 'Sparks are visible and people are evacuating.', 'Engineering E3', 'fire', 'HIGH'), row('R3', 'One witness says it may only be dust from maintenance.', 'Engineering E3', 'fire', 'LOW'),
      { report_id: 'R4', timestamp: 'not-a-date', location: '', category: '', reported_severity: '', description: '', reporter_type: '' }
    ]);
    expect(predictions[1].severity).toBe('CRITICAL'); expect(predictions[1].incident_status).toBe('ESCALATED'); expect(predictions[2].relationship).toBe('CONFLICT'); expect(predictions[2].confidence).toBeLessThan(predictions[1].confidence); expect(predictions[2].human_review).toBe(true); expect(predictions).toHaveLength(4); expect(engine.replay().statistics.deterministicOnly).toBe(4);
  });
  it('keeps restoration progress controlled until verified closure, then permits reopening', async () => {
    const engine = new IncidentEngine(services, '');
    const predictions = await engine.processAll([
      row('R1', 'Lift A is stopped with occupants inside.', 'Lift A', 'accessibility', 'HIGH'),
      row('R2', 'Repairs are complete and equipment is under test.', 'Lift A', 'accessibility', 'MEDIUM'),
      row('R3', 'Service restored but monitoring continues.', 'Lift A', 'accessibility', 'MEDIUM'),
      row('R4', 'Verified final restoration: lift returned to service and support stood down.', 'Lift A', 'accessibility', 'LOW'),
      row('R5', 'The lift has stopped again and access is unavailable.', 'Lift A', 'accessibility', 'HIGH')
    ]);
    expect(predictions[1].relationship).not.toBe('RESOLUTION'); expect(predictions[1].incident_status).toBe('CONTROLLED'); expect(predictions[1].actions.some((action) => action.type === 'CLOSE_INCIDENT')).toBe(false);
    expect(predictions[2].relationship).not.toBe('RESOLUTION'); expect(predictions[2].incident_status).toBe('CONTROLLED');
    expect(predictions[3].relationship).toBe('RESOLUTION'); expect(predictions[3].incident_status).toBe('RESOLVED'); expect(predictions[3].actions.some((action) => action.type === 'CLOSE_INCIDENT')).toBe(true);
    expect(predictions[4].incident_id).toBe(predictions[0].incident_id); expect(predictions[4].incident_status).toBe('ACTIVE'); expect(predictions[4].relationship).not.toBe('RESOLUTION');
  });
  it('does not suppress credible recurrence after a resolved incident as a duplicate', async () => {
    const engine = new IncidentEngine(services, '');
    const predictions = await engine.processAll([row('R1', 'Sparks are visible at the cabinet.', 'North Hub', 'electrical', 'HIGH'), row('R2', 'Resolved: verified repair complete and no remaining hazard.', 'North Hub', 'electrical', 'LOW'), row('R3', 'Sparks return at the cabinet again.', 'North Hub', 'electrical', 'HIGH')]);
    expect(predictions[2].relationship).toBe('UPDATE'); expect(predictions[2].incident_status).toBe('ACTIVE'); expect(predictions[2].actions.some((action) => action.type === 'ESCALATE_RESPONSE')).toBe(true);
  });
});
