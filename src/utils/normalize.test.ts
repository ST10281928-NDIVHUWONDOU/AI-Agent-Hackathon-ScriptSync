import { describe, expect, it } from 'vitest';
import { inferType, normalizeLocation } from './normalize';

describe('report normalization', () => {
  it('normalizes conservative cardinal abbreviations in locations', () => { expect(normalizeLocation('N. Hall')).toBe('north hall'); });
  it('uses strong operational wording when it conflicts with a reporter category', () => { expect(inferType('facilities', 'Wi-Fi and learning systems are unavailable.')).toBe('it'); expect(inferType('', 'The learning platform remains unavailable.')).toBe('it'); });
});
