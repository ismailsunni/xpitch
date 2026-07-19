import { describe, expect, it } from 'vitest';
import { userErrorMessage } from './errors';

describe('userErrorMessage', () => {
  it('uses a safe fallback for service errors', () => {
    expect(userErrorMessage(new Error('relation profiles does not exist'), 'Could not save profile.')).toBe('Could not save profile.');
  });

  it('explains network failures without leaking the provider error', () => {
    expect(userErrorMessage(new TypeError('Failed to fetch'), 'Could not load matches.')).toBe(
      'Network connection failed. Check your connection and try again.',
    );
  });
});
