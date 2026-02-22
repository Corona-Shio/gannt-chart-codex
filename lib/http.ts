export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const json = (await response.json()) as { data?: T; error?: unknown };

  if (!response.ok) {
    throw new Error(typeof json.error === "string" ? json.error : JSON.stringify(json.error));
  }

  return (json.data as T) ?? (json as T);
}
