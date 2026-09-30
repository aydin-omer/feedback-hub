import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

// Helper: sends a POST request to our API, like the form will do
async function postFeedback(body: string) {
  const request = new IncomingRequest("http://example.com/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

// Helper: how many rows are in the feedback table right now
async function countFeedback() {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM feedback")
    .first<{ count: number }>();
  return row?.count ?? 0;
}

describe("POST /api/feedback (US-1)", () => {
  it("saves valid feedback and returns its id", async () => {
    const response = await postFeedback(
      JSON.stringify({ message: "The export button does not work", email: "user@example.com" }),
    );

    expect(response.status).toBe(201);
    const data = await response.json<{ id: number }>();

    const row = await env.DB.prepare("SELECT message, email, status FROM feedback WHERE id = ?")
      .bind(data.id)
      .first();
    expect(row).toEqual({
      message: "The export button does not work",
      email: "user@example.com",
      status: "unclassified",
    });
  });

  it("accepts feedback without an email", async () => {
    const response = await postFeedback(JSON.stringify({ message: "Love the new dashboard" }));
    expect(response.status).toBe(201);
  });

  it("rejects an empty message and saves nothing", async () => {
    const before = await countFeedback();
    const response = await postFeedback(JSON.stringify({ message: "   " }));

    expect(response.status).toBe(400);
    expect(await countFeedback()).toBe(before);
  });

  it("rejects a message longer than 2,000 characters", async () => {
    const response = await postFeedback(JSON.stringify({ message: "a".repeat(2001) }));

    expect(response.status).toBe(400);
    const data = await response.json<{ error: string }>();
    expect(data.error).toContain("2000");
  });

  it("rejects a request that is not valid JSON", async () => {
    const response = await postFeedback("this is not json");
    expect(response.status).toBe(400);
  });
});