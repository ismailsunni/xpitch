export const SHARED_ACTIVITY_CACHE = 'xpitch-shared-activity-files-v1';

export const ACTIVITY_FILE_ACCEPT = [
  '.fit',
  '.gpx',
  '.tcx',
  'application/octet-stream',
  'application/gpx+xml',
  'application/vnd.garmin.tcx+xml',
].join(',');

const SUPPORTED_EXTENSIONS = ['.fit', '.gpx', '.tcx'];
const MAX_SHARED_FILES = 10;
const MAX_SHARED_BYTES = 64 * 1024 * 1024;

type SharedFileInfo = {
  name: string;
  type: string;
  size: number;
};

type SharedFileManifest = {
  createdAt: number;
  files: SharedFileInfo[];
};

function basePath(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).pathname;
}

function keyFor(id: string, name: 'manifest' | number): string {
  return `${basePath()}_shared-activity/${encodeURIComponent(id)}/${name}`;
}

export function isSupportedActivityFile(file: Pick<File, 'name'>): boolean {
  const lowerName = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

export function validateSharedActivityFiles(files: Pick<File, 'name' | 'size'>[]): string | null {
  if (!files.length) return 'No activity file was received.';
  if (files.length > MAX_SHARED_FILES) return `Choose up to ${MAX_SHARED_FILES} activity files at once.`;
  if (files.some((file) => !isSupportedActivityFile(file))) return 'Only FIT, GPX, and TCX files can be imported.';
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_SHARED_BYTES) return 'The shared activity files are too large. Keep the total below 64 MB.';
  return null;
}

export async function takeSharedActivityFiles(id: string): Promise<File[]> {
  if (!id || !('caches' in window)) return [];

  const cache = await caches.open(SHARED_ACTIVITY_CACHE);
  const manifestKey = keyFor(id, 'manifest');
  const manifestResponse = await cache.match(manifestKey);
  if (!manifestResponse) return [];

  try {
    const manifest = (await manifestResponse.json()) as SharedFileManifest;
    if (!Array.isArray(manifest.files) || Date.now() - manifest.createdAt > 24 * 60 * 60 * 1000) return [];

    const files = await Promise.all(
      manifest.files.map(async (info, index) => {
        const response = await cache.match(keyFor(id, index));
        if (!response) throw new Error('The shared activity file is no longer available.');
        return new File([await response.blob()], info.name, { type: info.type, lastModified: manifest.createdAt });
      })
    );
    return files;
  } finally {
    await Promise.all([
      cache.delete(manifestKey),
      ...Array.from({ length: MAX_SHARED_FILES }, (_, index) => cache.delete(keyFor(id, index))),
    ]);
  }
}
