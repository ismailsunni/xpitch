import { describe, expect, it } from 'vitest';
import { isSupportedActivityFile, validateSharedActivityFiles } from './pwa-files';

describe('PWA activity-file validation', () => {
  it('accepts FIT, GPX, and TCX file names regardless of case', () => {
    expect(isSupportedActivityFile({ name: 'match.FIT' })).toBe(true);
    expect(isSupportedActivityFile({ name: 'training.gpx' })).toBe(true);
    expect(isSupportedActivityFile({ name: 'activity.TcX' })).toBe(true);
  });

  it('rejects unsupported or oversized shared imports', () => {
    expect(validateSharedActivityFiles([{ name: 'notes.txt', size: 4 }])).toContain('Only FIT, GPX, and TCX');
    expect(validateSharedActivityFiles([{ name: 'match.fit', size: 65 * 1024 * 1024 }])).toContain('64 MB');
  });
});
