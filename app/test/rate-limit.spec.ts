import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../src/index";
import { hashIp } from "../src/rate-limit";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

// Helper: submits feedback as a specific visitor (identified by IP)
async function submitAs(ip: string, message = "Some feedback") {
  const request = new IncomingRequest("http://example.com/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ message }),
  });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function countFeedback() {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM feedback")
    .first<{ count: number }>();
  return row?.count ?? 0;
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network in tests"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Rate limiting (US-6)", () => {
  it("allows 5 submissions per hour and rejects the 6th without saving it", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 5; i++) {
      expect((await submitAs(ip)).status).toBe(201);
    }

    const before = await countFeedback();
    const sixth = await submitAs(ip);

    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("Retry-After")).not.toBeNull();
    const data = await sixth.json<{ error: string }>();
    expect(data.error).toContain("Too many");
    expect(await countFeedback()).toBe(before);
  });

  it("does not limit a different visitor", async () => {
    for (let i = 0; i < 5; i++) {
      await submitAs("203.0.113.20");
    }
    expect((await submitAs("203.0.113.21")).status).toBe(201);
  });

  it("does not count submissions older than one hour", async () => {
    const ip = "203.0.113.30";
    const ipHash = await hashIp(ip, env.IP_HASH_SALT);
    for (let i = 0; i < 5; i++) {
      await env.DB.prepare(
        "INSERT INTO feedback (message, ip_hash, created_at) VALUES ('Old', ?, datetime('now', '-2 hours'))",
      )
        .bind(ipHash)
        .run();
    }

    expect((await submitAs(ip)).status).toBe(201);
  });

  it("never stores the IP address in plain text", async () => {
    const ip = "203.0.113.40";
    const response = await submitAs(ip);
    const { id } = await response.json<{ id: number }>();

    const row = await env.DB.prepare("SELECT ip_hash FROM feedback WHERE id = ?")
      .bind(id)
      .first<{ ip_hash: string }>();

    expect(row?.ip_hash).not.toContain(ip);
    expect(row?.ip_hash).toHaveLength(64);
  });
});