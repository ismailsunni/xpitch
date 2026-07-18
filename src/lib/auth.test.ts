import { describe, expect, it } from 'vitest';
import { usernameError } from './auth';

describe('username validation', () => {
  it('reserves every static top-level route', () => {
    for (const route of ['admin', 'analyze', 'fields', 'help', 'history', 'login', 'settings']) {
      expect(usernameError(route)).toBe('That name is reserved');
    }
  });

  it('allows normal profile handles', () => {
    expect(usernameError('midfielder_7')).toBeNull();
  });
});
