/** Next's internal request URL can use localhost even when the browser uses
 * 127.0.0.1. Compare Origin to the actual HTTP Host, never to forwarded hosts. */
export function isSameOrigin(request: { headers: Headers }): boolean {
  const origin = request.headers.get("origin"),
    host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.origin === origin &&
      url.host === host
    );
  } catch {
    return false;
  }
}
