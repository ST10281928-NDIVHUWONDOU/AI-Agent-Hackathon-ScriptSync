import { IncidentEngine } from '../src/engine/incident-engine.js';
import { GroqAdjudicator, type CandidateSummary } from '../src/groq/adjudicator.js';
import { loadLocalGroqEnvironment } from '../src/groq/load-environment.js';
import type { RawReport, Service } from '../src/models.js';

const model = 'openai/gpt-oss-120b';
const services: Service[] = [
  { service_id: 'SVC-FACILITIES', service_name: 'Facilities', service_type: 'facilities', availability: '24/7', scope: 'Building repairs' }
];
const candidates: CandidateSummary[] = [
  { incidentId: 'I001', type: 'facilities', location: 'north science corridor', evidence: 'water leak under pipes in the north corridor' },
  { incidentId: 'I002', type: 'facilities', location: 'south science corridor', evidence: 'water leak under pipes in the south corridor' }
];
const rows: RawReport[] = [
  { report_id: 'SYN-001', timestamp: '2026-01-01T09:00', location: 'North Science Corridor', category: 'facilities', reported_severity: 'MEDIUM', description: 'Water leak under pipes in the north corridor.', reporter_type: 'staff' },
  { report_id: 'SYN-002', timestamp: '2026-01-01T09:02', location: 'South Science Corridor', category: 'facilities', reported_severity: 'MEDIUM', description: 'Water leak under pipes in the south corridor.', reporter_type: 'staff' },
  { report_id: 'SYN-003', timestamp: '2026-01-01T09:04', location: '', category: 'facilities', reported_severity: 'MEDIUM', description: 'Water leak under corridor pipes.', reporter_type: 'staff' },
  { report_id: 'SYN-004', timestamp: '2026-01-01T09:06', location: '', category: 'facilities', reported_severity: 'MEDIUM', description: 'Water leak under corridor pipes continues.', reporter_type: 'staff' }
];

function fail(message: string): never { throw new Error(message); }
function statistic(value: number | Record<string, number>, name: string): number { if (typeof value !== 'number') fail(`Unexpected ${name} statistic.`); return value; }
async function main(): Promise<void> {
  const keyDetected = loadLocalGroqEnvironment();
  console.log(`Groq key detected: ${keyDetected ? 'yes' : 'no'}`);
  if (!keyDetected) fail('GROQ_API_KEY was not loaded into the server process.');

  const adjudicator = new GroqAdjudicator();
  const direct = await adjudicator.decide({ description: 'Water leak reported near the science corridor.', location: '', type: 'facilities' }, candidates);
  if (!direct) fail(`Groq request did not return a valid structured adjudication: ${adjudicator.lastFailure ?? 'schema validation failed'}`);
  console.log('Groq request: success');
  console.log(`Model: ${model}`);
  console.log('Structured response valid: yes');
  console.log(`Structured choice: ${direct.selectedIncidentId}; relationship: ${direct.relationship}`);

  const engine = new IncidentEngine(services);
  const predictions = await engine.processAll(rows);
  const replay = engine.replay();
  const final = predictions[2];
  const adjudicationCount = statistic(replay.statistics.groqAdjudications, 'Groq adjudications');
  if (adjudicationCount < 1 || !final || !['I001', 'I002', 'I003'].includes(final.incident_id) || !Number.isFinite(final.confidence)) fail('Synthetic ambiguous fixture did not complete the required production Groq path.');
  console.log('Engine ambiguous scenario: success');
  console.log(`Engine Groq adjudications: ${adjudicationCount}`);
  console.log(`Engine decision: ${final.incident_id}; relationship: ${final.relationship}`);

  const fallbackEngine = new IncidentEngine(services, 'intentionally-invalid-test-key');
  const fallbackPredictions = await fallbackEngine.processAll(rows);
  const fallbackReplay = fallbackEngine.replay();
  const fallbackCount = statistic(fallbackReplay.statistics.groqFallbacks, 'Groq fallbacks');
  if (fallbackCount < 1 || fallbackPredictions.length !== rows.length || !fallbackPredictions.every((prediction) => Number.isFinite(prediction.confidence))) fail('Fallback test did not safely continue after Groq failure.');
  console.log(`Fallback requests: ${fallbackCount}; failed safely`);
  console.log('Fallback decision: valid; subsequent reports: continued');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Groq smoke test failed.'); process.exitCode = 1; });
