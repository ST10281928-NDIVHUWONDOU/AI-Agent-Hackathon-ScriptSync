import type { Service } from '../models.js';

export class ServiceDirectory {
  private readonly byType: Map<string, Service>;
  readonly ids: Set<string>;
  constructor(services: Service[]) { this.byType = new Map(services.map((service) => [service.service_type.toLowerCase(), service])); this.ids = new Set(services.map((service) => service.service_id)); }
  get(type: string): Service | undefined { return this.byType.get(type); }
  serviceForIncident(type: string, severity: string): Service | undefined {
    if (type === 'fire') return this.get('fire');
    if (type === 'medical') return severity === 'CRITICAL' ? this.get('medical') : this.get('medical');
    if (type === 'electrical') return this.get('electrical');
    if (type === 'it') return this.get('it');
    if (type === 'accessibility') return this.get('accessibility') ?? this.get('facilities');
    if (type === 'security') return this.get('security');
    if (type === 'environmental') return this.get('environmental') ?? this.get('facilities');
    return this.get('facilities');
  }
}
