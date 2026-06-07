const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const MOCK_BASE = import.meta.env.VITE_MOCK_BASE_URL ?? "http://localhost:4001";

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  return parseResponse<T>(response);
}

export async function apiSend<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return parseResponse<T>(response);
}

export async function mockGet<T>(path: string): Promise<T> {
  const response = await fetch(`${MOCK_BASE}${path}`);
  return parseResponse<T>(response);
}

export async function mockDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${MOCK_BASE}${path}`, { method: "DELETE" });
  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message ?? `请求失败：${response.status}`);
  }
  return data;
}
