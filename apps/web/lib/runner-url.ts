export function parseLoopbackRunnerUrl(
  value: string | undefined,
): string | null {
  if (!value) return "http://localhost:43117";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return null;
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}
