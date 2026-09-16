import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parse } from 'csv-parse/sync';
import { IncidentEngine } from './src/engine/incident-engine.js';
import type { Prediction, RawReport, Service } from './src/models.js';
import { loadLocalGroqEnvironment } from './src/groq/load-environment.js';

interface Options { input: string; services: string; output: string; replay: string; }
function options(args: string[]): Options {
  const result: Options = { input: 'data/campus_reports.csv', services: 'data/campus_services.csv', output: 'predictions.jsonl', replay: 'public/replay.json' };
  for (let index = 0; index < args.length; index += 1) { const option = args[index]; const value = args[index + 1]; if (!value) continue; if (option === '--input') result.input = value; if (option === '--services') result.services = value; if (option === '--output') result.output = value; if (option === '--replay') result.replay = value; }
  return result;
}
function csv<T>(text: string): T[] { return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true }) as T[]; }
function validate(predictions: Prediction[], services: Service[], reports: RawReport[]): void {
  if (predictions.length !== reports.length) throw new Error(`Expected ${reports.length} predictions, got ${predictions.length}`);
  const ids = new Set<string>(); const serviceIds = new Set(services.map((service) => service.service_id));
  predictions.forEach((prediction, index) => { if (prediction.report_id !== reports[index].report_id || ids.has(prediction.report_id)) throw new Error(`Report order or uniqueness failed at row ${index + 1}`); ids.add(prediction.report_id); if (!Number.isFinite(prediction.confidence) || prediction.confidence < 0 || prediction.confidence > 1) throw new Error(`Invalid confidence for ${prediction.report_id}`); prediction.actions.forEach((action) => { if (action.service_id && !serviceIds.has(action.service_id)) throw new Error(`Unknown service ${action.service_id}`); }); });
}
async function main(): Promise<void> {
  loadLocalGroqEnvironment();
  const config = options(process.argv.slice(2));
  const [reportsText, servicesText] = await Promise.all([readFile(config.input, 'utf8'), readFile(config.services, 'utf8')]);
  const reports = csv<RawReport>(reportsText); const services = csv<Service>(servicesText); const engine = new IncidentEngine(services);
  const predictions = await engine.processAll(reports); validate(predictions, services, reports);
  const replay = engine.replay();
  await Promise.all([mkdir(dirname(config.output), { recursive: true }), mkdir(dirname(config.replay), { recursive: true })]);
  await Promise.all([writeFile(config.output, `${predictions.map((prediction) => JSON.stringify(prediction)).join('\n')}\n`, 'utf8'), writeFile(config.replay, `${JSON.stringify(replay, null, 2)}\n`, 'utf8')]);
  console.log(JSON.stringify({ reports: predictions.length, incidents: replay.statistics.totalIncidents, relationships: replay.statistics.relationships, actions: replay.statistics.actions, groq: { adjudications: replay.statistics.groqAdjudications, fallbacks: replay.statistics.groqFallbacks } }, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
