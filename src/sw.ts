/// <reference lib="WebWorker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };

const SHARED_ACTIVITY_CACHE = 'xpitch-shared-activity-files-v1';
const SUPPORTED_EXTENSIONS = ['.fit', '.gpx', '.tcx'];
const MAX_SHARED_FILES = 10;
const MAX_SHARED_BYTES = 64 * 1024 * 1024;
const SHARED_FILE_MAX_AGE = 24 * 60 * 60 * 1000;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

function sharedPath(id: string, name: 'manifest' | number): string {
  return `${self.registration.scope}_shared-activity/${encodeURIComponent(id)}/${name}`;
}

function isSupportedFile(file: File): boolean {
  return SUPPORTED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension));
}

async function handleSharedActivity(request: Request): Promise<Response> {
  const redirect = (params = '') => Response.redirect(new URL(`analyze${params}`, self.registration.scope).toString(), 303);
  const formData = await request.formData();
  const files = [...formData.values()].filter((value): value is File => value instanceof File && value.size > 0);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  if (!files.length) return redirect('?shareError=missing');
  if (files.length > MAX_SHARED_FILES || totalBytes > MAX_SHARED_BYTES || files.some((file) => !isSupportedFile(file))) {
    return redirect('?shareError=unsupported');
  }

  const id = crypto.randomUUID();
  const cache = await caches.open(SHARED_ACTIVITY_CACHE);
  const createdAt = Date.now();
  await Promise.all(files.map((file, index) => cache.put(sharedPath(id, index), new Response(file))));
  await cache.put(
    sharedPath(id, 'manifest'),
    new Response(JSON.stringify({
      createdAt,
      files: files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
    }), { headers: { 'content-type': 'application/json' } })
  );
  return redirect(`?shared=${encodeURIComponent(id)}`);
}

async function clearExpiredSharedFiles(): Promise<void> {
  const cache = await caches.open(SHARED_ACTIVITY_CACHE);
  const keys = await cache.keys();
  const manifests = keys.filter((request) => request.url.endsWith('/manifest'));
  await Promise.all(manifests.map(async (request) => {
    const response = await cache.match(request);
    const manifest = response ? await response.json() as { createdAt?: number } : null;
    if (!manifest?.createdAt || Date.now() - manifest.createdAt <= SHARED_FILE_MAX_AGE) return;
    const prefix = request.url.slice(0, -'manifest'.length);
    await Promise.all(keys.filter((key) => key.url.startsWith(prefix)).map((key) => cache.delete(key)));
  }));
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === new URL('import', self.registration.scope).pathname) {
    event.respondWith(handleSharedActivity(event.request));
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clearExpiredSharedFiles());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
