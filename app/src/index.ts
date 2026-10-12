import { classifyFeedback } from "./classify";

const MAX_MESSAGE_LENGTH = 2000;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

// NEW: runs in the background after the user already got their confirmation
async function classifyAndStore(env: Env, id: number, message: string): Promise<void> {
  try {
    const result = await classifyFeedback(message, env.GEMINI_API_KEY);
    await env.DB.prepare(
      "UPDATE feedback SET type = ?, sentiment = ?, urgency = ?, summary = ?, status = 'classified' WHERE id = ?",
    )
      .bind(result.type, result.sentiment, result.urgency, result.summary, id)
      .run();
  } catch (error) {
    // The feedback is already saved as 'unclassified', so nothing is lost
    console.error(`Classification failed for feedback ${id}:`, error);
  }
}

async function handleCreateFeedback(
  request: Request,
  env: Env,
  ctx: ExecutionContext, // NEW: needed for waitUntil
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return json({ error: "Request body must be a JSON object" }, 400);
  }

  const { message, email } = body as { message?: unknown; email?: unknown };

  if (typeof message !== "string" || message.trim() === "") {
    return json({ error: "Message is required" }, 400);
  }
  const cleanMessage = message.trim();
  if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
    return json({ error: `Message must be at most ${MAX_MESSAGE_LENGTH} characters` }, 400);
  }

  if (email !== undefined && email !== null && typeof email !== "string") {
    return json({ error: "Email must be a string" }, 400);
  }
  const cleanEmail = typeof email === "string" && email.trim() !== "" ? email.trim() : null;

  const result = await env.DB.prepare(
    "INSERT INTO feedback (message, email) VALUES (?, ?) RETURNING id",
  )
    .bind(cleanMessage, cleanEmail)
    .first<{ id: number }>();

  const id = result!.id;

  // NEW: answer the user now, classify after the response is sent
  ctx.waitUntil(classifyAndStore(env, id, cleanMessage));

  return json({ id }, 201);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/feedback") {
      if (request.method === "POST") {
        return handleCreateFeedback(request, env, ctx);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;