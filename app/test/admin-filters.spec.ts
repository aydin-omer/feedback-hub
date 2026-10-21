import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const ADMIN_AUTH = "Basic " + btoa(`admin:${env.ADMIN_PASSWORD}`);

type Item = Record<string, unknown>;
type ListResponse = { items: Item[]; counts: Record<string, number> };

async function list(query = "") {
  const request = new IncomingRequest(`http://example.com/api/admin/feedback${query}`, {
    headers: { Authorization: ADMIN_AUTH },
  });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function insertClassified(type: string, sentiment: string, urgency: string) {
  const message = `${type}-${sentiment}-${urgency}-${crypto.randomUUID()}`;
  await env.DB.prepare(
    "INSERT INTO feedback (message, type, sentiment, urgency, summary, status) VALUES (?, ?, ?, ?, 'Test summary.', 'classified')",
  )
    .bind(message, type, sentiment, urgency)
    .run();
  return message;
}

describe("Filters and counts (US-4)", () => {
  it("filters by type", async () => {
    const bug = await insertClassified("bug", "negative", "high");
    const praise = await insertClassified("praise", "positive", "low");

    const { items } = await (await list("?type=bug")).json<ListResponse>();
    const messages = items.map((item) => item.message);

    expect(messages).toContain(bug);
    expect(messages).not.toContain(praise);
    expect(items.every((item) => item.type === "bug")).toBe(true);
  });

  it("combines several filters", async () => {
    const match = await insertClassified("bug", "negative", "high");
    const otherUrgency = await insertClassified("bug", "negative", "low");

    const { items } = await (await list("?type=bug&urgency=high")).json<ListResponse>();
    const messages = items.map((item) => item.message);

    expect(messages).toContain(match);
    expect(messages).not.toContain(otherUrgency);
    expect(items.every((item) => item.type === "bug" && item.urgency === "high")).toBe(true);
  });

  it("rejects an unknown filter value", async () => {
    expect((await list("?type=banana")).status).toBe(400);
    expect((await list("?urgency=extreme")).status).toBe(400);
  });

  it("counts feedback per type, across all data", async () => {
    const before = (await (await list()).json<ListResponse>()).counts;

    await insertClassified("feature_request", "neutral", "medium");
    await insertClassified("feature_request", "positive", "low");
    await env.DB.prepare("INSERT INTO feedback (message) VALUES ('not classified yet')").run();

    const after = (await (await list()).json<ListResponse>()).counts;

    expect(after.feature_request).toBe((before.feature_request ?? 0) + 2);
    expect(after.unclassified).toBe((before.unclassified ?? 0) + 1);
  });

  it("returns counts for all data even when a filter is active", async () => {
    const all = (await (await list()).json<ListResponse>()).counts;
    const filtered = (await (await list("?type=praise")).json<ListResponse>()).counts;

    expect(filtered).toEqual(all);
  });
});