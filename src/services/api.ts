async function parseJsonSafe<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `${res.status} ${res.statusText}`);
  }

  return parseJsonSafe<T>(res);
}
