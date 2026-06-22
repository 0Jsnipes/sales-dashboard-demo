import { getFirebaseAuth } from "@/src/lib/firebase/client";

export async function authHeaders(init?: HeadersInit) {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  const headers = new Headers(init);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = await authHeaders(init?.headers);
  if (!headers.has("Content-Type") && init?.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { cache: "no-store", ...init, headers });
}

export async function authedJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await authedFetch(input, init);
  const data = (await response.json()) as T;
  if (!response.ok) {
    const error = typeof data === "object" && data && "error" in data ? String((data as { error?: unknown }).error) : "REQUEST_FAILED";
    throw new Error(error);
  }
  return data;
}
