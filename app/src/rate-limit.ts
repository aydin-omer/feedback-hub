export const MAX_SUBMISSIONS_PER_HOUR = 5;

// Turns an IP address into an irreversible fingerprint.
// The secret salt makes it impossible to recover the IP by trying every address.
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// How many submissions did this fingerprint make in the last hour?
export async function countRecentSubmissions(db: D1Database, ipHash: string): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM feedback WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')",
    )
    .bind(ipHash)
    .first<{ count: number }>();
  return row?.count ?? 0;
}