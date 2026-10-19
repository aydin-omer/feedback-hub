import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const ADMIN_AUTH = "Basic " + btoa(`admin:${env.ADMIN_PASSWORD}`);

async function call(method: string, authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization) headers["Authorization"] = authorization;
  const request = new IncomingRequest("http://example.com/api/admin/feedback", { method, headers });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

type Item = Record<string, unknown>;

async function listItems(): Promise<Item[]> {
  const response = await call("GET", ADMIN_AUTH);
  expect(response.status).toBe(200);
  const data = await response.json<{ items: Item[] }>();
  return data.items;
}

describe("GET /api/admin/feedback (US-3)", () => {
  it("requires authentication", async () => {
    expect((await call("GET")).status).toBe(401);
  });

  it("lists feedback newest first, with labels, summary, and date", async () => {
    const older = `older-${crypto.randomUUID()}`;
    const newer = `newer-${crypto.randomUUID()}`;
    await env.DB.prepare(
      "INSERT INTO feedback (message, type, sentiment, urgency, summary, status, created_at) VALUES (?, 'bug', 'negative', 'high', 'An old bug.', 'classified', datetime('now', '-1 day'))",
    ).bind(older).run();
    await env.DB.prepare("INSERT INTO feedback (message) VALUES (?)").bind(newer).run();

    const items = await listItems();
    const olderIndex = items.findIndex((item) => item.message === older);
    const newerIndex = items.findIndex((item) => item.message === newer);

    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeGreaterThan(newerIndex);
    expect(items[olderIndex]).toMatchObject({
      type: "bug",
      sentiment: "negative",
      urgency: "high",
      summary: "An old bug.",
      status: "classified",
    });
    expect(items[olderIndex].created_at).toBeTypeOf("string");
  });

  it("includes the full message and email, so the PM can read and reply", async () => {
    const message = `full-message-${crypto.randomUUID()}`;
    await env.DB.prepare("INSERT INTO feedback (message, email) VALUES (?, 'reply@example.com')")
      .bind(message)
      .run();

    const item = (await listItems()).find((i) => i.message === message);
    expect(item?.email).toBe("reply@example.com");
  });

  it("never exposes the IP hash", async () => {
    await env.DB.prepare("INSERT INTO feedback (message, ip_hash) VALUES ('with-hash', 'secret-hash-value')").run();

    const response = await call("GET", ADMIN_AUTH);
    const raw = await response.text();
    expect(raw).not.toContain("ip_hash");
    expect(raw).not.toContain("secret-hash-value");
  });

  it("only allows reading", async () => {
    expect((await call("POST", ADMIN_AUTH)).status).toBe(405);
  });
});