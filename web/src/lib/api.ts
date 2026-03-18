export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("r18_token");
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("r18_token", token);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("r18_token");
}

export async function apiFetch(path: string, init?: RequestInit) {
  const base = process.env.NEXT_PUBLIC_API_BASE!;
  const url = path.startsWith("http") ? path : `${base}${path}`;
  return fetch(url, init);
}

function ensureJsonContentType(headers: Headers, init?: RequestInit) {
  // FastAPI won't parse JSON body into Pydantic model unless Content-Type is application/json.
  // Our MVP often sends body as JSON.stringify(...).
  const hasBody = typeof init?.body === "string" && init.body.length > 0;
  if (!hasBody) return;

  const ct = headers.get("Content-Type");
  if (!ct) headers.set("Content-Type", "application/json");
}

export async function apiFetchAuthed(path: string, init?: RequestInit) {
  const token = getToken();
  if (!token) throw new Error("Вы не авторизованы. Сначала войдите через Telegram или email.");

  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  ensureJsonContentType(headers, init);

  return apiFetch(path, { ...init, headers });
}
