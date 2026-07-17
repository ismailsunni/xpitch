import { describe, expect, it } from 'vitest';
import { historyLineConfig } from './charts';

describe('chart config helpers', () => {
  it('builds history line configs with labels, units, and sparse data support', () => {
    const config = historyLineConfig(
      'Distance',
      [
        { x: 'Jul 1', y: 5.2 },
        { x: 'Jul 8', y: null },
        { x: 'Jul 15', y: 6.1 },
      ],
      'km'
    );

    expect(config.type).toBe('line');
    expect(config.data.labels).toEqual(['Jul 1', 'Jul 8', 'Jul 15']);
    const dataset = config.data.datasets[0] as any;
    expect(dataset.data).toEqual([5.2, null, 6.1]);
    expect(dataset.spanGaps).toBe(true);
    expect((config.options as any).scales.y.title.text).toBe('km');
    expect((config.options as any).plugins.tooltip.callbacks.label({ parsed: { y: 5.2 } })).toBe('Distance: 5.2 km');
  });
});
