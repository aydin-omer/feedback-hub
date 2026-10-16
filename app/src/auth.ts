const ADMIN_USERNAME = "admin";

export function isAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}

export async function isAuthorized(request: Request, expectedPassword: string | undefined): Promise<boolean> {
  // Fail closed: if the secret is missing, nobody gets in
  if (!expectedPassword) return false;

  const header = request.headers.get("Authorization");
  if (!header || !header.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return false; // malformed header: say no, never crash
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return false;

  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  const usernameOk = await safeEqual(username, ADMIN_USERNAME);
  const passwordOk = await safeEqual(password, expectedPassword);
  return usernameOk && passwordOk;
}

// Compares two strings in constant time, so response timing reveals nothing
async function safeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(hashA, hashB);
}

export function unauthorized(): Response {
  return Response.json(
    { error: "Authentication required" },
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Feedback Hub Admin", charset="UTF-8"' },
    },
  );
}