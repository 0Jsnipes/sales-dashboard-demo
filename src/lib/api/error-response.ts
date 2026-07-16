import { NextResponse } from "next/server";

const KNOWN_ERROR_STATUS: Record<string, number> = {
  UNAUTHENTICATED: 401,
  PROFILE_NOT_FOUND: 403,
  FORBIDDEN: 403,
  VIEW_AS_READ_ONLY: 403,
  VIEW_AS_TARGET_NOT_FOUND: 404,
  DASHBOARD_SCOPE_FORBIDDEN: 403,
};

export function resolveErrorStatus(error: unknown, fallbackMessage = "UNKNOWN") {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const status = KNOWN_ERROR_STATUS[message] ?? 500;
  return { message, status };
}

// Every API route's catch block funnels through here so unexpected (5xx) failures
// are always logged server-side — previously they only ever reached the client's
// JSON response and left no trace anywhere else.
export function logServerError(context: string, error: unknown, status: number) {
  if (status >= 500) console.error(`[api:${context}]`, error);
}

export function errorResponse(context: string, error: unknown, fallbackMessage = "UNKNOWN") {
  const { message, status } = resolveErrorStatus(error, fallbackMessage);
  logServerError(context, error, status);
  return NextResponse.json({ error: message }, { status });
}
