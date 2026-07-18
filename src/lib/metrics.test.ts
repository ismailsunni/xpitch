import { describe, expect, it } from 'vitest';
import { METRICS, METRIC_SECTIONS, metricDesc } from './metrics';

describe('metric glossary', () => {
  it('keeps the flattened tooltip lookup aligned with the glossary sections', () => {
    const keys = METRIC_SECTIONS.flatMap((section) => section.items.map((item) => item.key));

    expect(Object.keys(METRICS).sort()).toEqual([...keys].sort());
  });

  it('returns descriptions for known metrics and an empty string for unknown keys', () => {
    expect(metricDesc('heatmap')).toContain('Where you spent time');
    expect(metricDesc('not-a-metric')).toBe('');
  });
});
