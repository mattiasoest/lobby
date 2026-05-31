const CHUNK_RELOAD_KEY = 'lobby:chunk-reload';

const CHUNK_LOAD_PATTERNS = [
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'error loading dynamically imported module',
  'dynamically imported module',
] as const;

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? error.cause.message : '';
    return `${error.message} ${cause}`.trim();
  }
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '';
}

export function isChunkLoadError(error: unknown): boolean {
  const msg = errorMessage(error).toLowerCase();
  return CHUNK_LOAD_PATTERNS.some((pattern) => msg.includes(pattern));
}

export function clearChunkReloadAttempt(): void {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
}

export async function importWithChunkRetry<T>(importFn: () => Promise<T>): Promise<T> {
  try {
    const module = await importFn();
    clearChunkReloadAttempt();
    return module;
  } catch (error) {
    if (!isChunkLoadError(error)) throw error;

    const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    if (!alreadyReloaded) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
      window.location.reload();
      return new Promise(() => {});
    }

    clearChunkReloadAttempt();
    throw error;
  }
}

export function reloadApp(): void {
  clearChunkReloadAttempt();
  window.location.reload();
}
