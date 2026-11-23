import type { ApiErrorBody } from "../../shared/src/types.ts";
export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + url, {
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as ApiErrorBody | null;
    throw new Error(
      payload?.error.message ?? `Request failed (${response.status}).`,
    );
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}
