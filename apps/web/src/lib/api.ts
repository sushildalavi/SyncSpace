import { API_BASE_URL } from "./env";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** Cookie-authenticated JSON client. Credentials are never read or stored by JavaScript. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    ...(init.signal ? { signal: init.signal } : {})
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const data = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new ApiError(message ?? `Request failed (${response.status})`, response.status);
  }
  return data as T;
}
