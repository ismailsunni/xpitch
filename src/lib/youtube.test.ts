import { describe, expect, it } from 'vitest';
import { normalizeYouTubeUrl, youtubeEmbedUrl } from './youtube';

describe('YouTube match videos', () => {
  it('normalizes watch, short, and share links', () => {
    const expected = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(normalizeYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12')).toBe(expected);
    expect(normalizeYouTubeUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe(expected);
    expect(normalizeYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(expected);
  });

  it('only creates an embed URL for a valid YouTube video', () => {
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
    expect(normalizeYouTubeUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeEmbedUrl('not a URL')).toBeNull();
  });
});
