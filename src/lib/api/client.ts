import { getFirebaseAuth } from "@/src/lib/firebase/client";
import { getViewAsAuthUid } from "@/src/lib/auth/view-as-client";
import { VIEW_AS_HEADER } from "@/src/lib/auth/view-as";

export async function authHeaders(init?: HeadersInit, includeViewAs = true) {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  const headers = new Headers(init);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const viewAsAuthUid = includeViewAs ? getViewAsAuthUid() : null;
  if (viewAsAuthUid) headers.set(VIEW_AS_HEADER, viewAsAuthUid);
  else headers.delete(VIEW_AS_HEADER);
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
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const requestLabel = typeof input === "string" ? input : response.url;
  let data: T | null = null;
  if (contentType.includes("application/json") && text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      const preview = text.replace(/\s+/g, " ").trim().slice(0, 180);
      throw new Error(`Invalid JSON from ${requestLabel} (${response.status}): ${preview}`);
    }
  }
  if (!response.ok) {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 180);
    const error = typeof data === "object" && data && "error" in data
      ? String((data as { error?: unknown }).error)
      : `REQUEST_FAILED ${response.status}${preview ? `: ${preview}` : ""}`;
    throw new Error(error);
  }
  if (!data) {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 180);
    throw new Error(`Expected JSON from ${requestLabel} (${response.status}), got ${contentType || "unknown content type"}${preview ? `: ${preview}` : ""}`);
  }
  return data;
}

export async function authedJsonAsActualUser<T>(input: RequestInfo | URL, init?: RequestInit) {
  const headers = await authHeaders(init?.headers, false);
  if (!headers.has("Content-Type") && init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(input, { cache: "no-store", ...init, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) as T & { error?: unknown } : null;
  if (!response.ok) throw new Error(data?.error ? String(data.error) : `REQUEST_FAILED ${response.status}`);
  if (!data) throw new Error(`Expected JSON from ${typeof input === "string" ? input : response.url}.`);
  return data;
}
