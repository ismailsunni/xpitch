const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function videoId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else {
        const [kind, value] = url.pathname.split('/').filter(Boolean);
        if (kind === 'shorts' || kind === 'embed') id = value || '';
      }
    }
    return VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function normalizeYouTubeUrl(value: string): string | null {
  const id = videoId(value);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function youtubeEmbedUrl(value: string | null | undefined): string | null {
  const id = value ? videoId(value) : null;
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}
