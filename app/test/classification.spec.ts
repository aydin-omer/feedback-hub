import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

// Helper: submits feedback and waits until all background work is finished
async function submit(message: string) {
  const request = new IncomingRequest("http://example.com/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx); // waits for work started with waitUntil
  const { id } = await response.json<{ id: number }>();
  return { response, id };
}

// Helper: builds a fake Gemini response in the same shape as the real API
function geminiReplies(classification: object) {
  return Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(classification) }] } }],
  });
}

async function getRow(id: number) {
  return env.DB.prepare(
    "SELECT type, sentiment, urgency, summary, status FROM feedback WHERE id = ?",
  )
    .bind(id)
    .first();
}

afterEach(() => {
  vi.restoreAllMocks(); // remove the fake after each test
});

describe("Automatic classification (US-2)", () => {
  it("stores the AI labels when Gemini answers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiReplies({
        type: "bug",
        sentiment: "negative",
        urgency: "high",
        summary: "The export button is broken.",
      }),
    );

    const { response, id } = await submit("The export button does not work at all");

    expect(response.status).toBe(201);
    expect(await getRow(id)).toEqual({
      type: "bug",
      sentiment: "negative",
      urgency: "high",
      summary: "The export button is broken.",
      status: "classified",
    });
  });

  it("keeps the feedback unclassified when Gemini returns an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal error", { status: 500 }),
    );

    const { response, id } = await submit("Something about the app");

    expect(response.status).toBe(201);
    expect(await getRow(id)).toMatchObject({ type: null, status: "unclassified" });
  });

  it("keeps the feedback unclassified when Gemini cannot be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network down"));

    const { response, id } = await submit("Something about the app");

    expect(response.status).toBe(201);
    expect(await getRow(id)).toMatchObject({ type: null, status: "unclassified" });
  });

  it("rejects labels that are not in the allowed list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiReplies({
        type: "banana",
        sentiment: "negative",
        urgency: "high",
        summary: "Nonsense",
      }),
    );

    const { id } = await submit("Something about the app");

    expect(await getRow(id)).toMatchObject({ type: null, status: "unclassified" });
  });
});