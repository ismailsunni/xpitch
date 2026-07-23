import { reactive } from 'vue';
import { router } from '../router';
import { loadFiles } from '../store';
import { isSupportedActivityFile } from './pwa-files';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type FileLaunchParams = {
  files: Array<{ getFile: () => Promise<File> }>;
};

export const pwa = reactive({
  canInstall: false,
  updateAvailable: false,
});

let installPrompt: InstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
let reloadOnControllerChange = false;

export async function installPwa(): Promise<void> {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  pwa.canInstall = false;
}

export function updatePwa(): void {
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

function setUpdateAvailable(next: ServiceWorker | null): void {
  if (next && navigator.serviceWorker.controller) pwa.updateAvailable = true;
}

function registerFileLaunchHandler(): void {
  const launchQueue = (window as Window & { launchQueue?: { setConsumer: (consumer: (params: FileLaunchParams) => void) => void } }).launchQueue;
  if (!launchQueue) return;

  launchQueue.setConsumer((params) => {
    void Promise.all(params.files.map((handle) => handle.getFile())).then(async (files) => {
      const activityFiles = files.filter(isSupportedActivityFile);
      if (!activityFiles.length) return;
      await loadFiles(activityFiles);
      await router.push('/analyze');
    });
  });
}

export function registerPwa(): void {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    pwa.canInstall = true;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    pwa.canInstall = false;
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnControllerChange) window.location.reload();
  });

  const scope = import.meta.env.BASE_URL;
  void navigator.serviceWorker.register(`${scope}sw.js`, { scope }).then((nextRegistration) => {
    registration = nextRegistration;
    setUpdateAvailable(nextRegistration.waiting);
    nextRegistration.addEventListener('updatefound', () => {
      const installing = nextRegistration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') setUpdateAvailable(nextRegistration.waiting);
      });
    });
  });

  registerFileLaunchHandler();
}

export function applyPwaUpdate(): void {
  reloadOnControllerChange = true;
  updatePwa();
}
