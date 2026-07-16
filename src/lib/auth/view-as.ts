export const VIEW_AS_HEADER = "X-AB-View-As";

export function viewAsRequestIsReadOnly(method: string) {
  return method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD" || method.toUpperCase() === "OPTIONS";
}
