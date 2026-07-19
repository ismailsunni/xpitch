// Service errors often include database or provider details. Keep messages in
// the UI actionable without exposing those implementation details.
export function userErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'The request was cancelled. Try again.';
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return 'Network connection failed. Check your connection and try again.';
  }
  return fallback;
}
