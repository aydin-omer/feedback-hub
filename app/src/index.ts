const MAX_MESSAGE_LENGTH = 2000;

// Small helper so every response is JSON with the right status code
function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

async function handleCreateFeedback(request: Request, env: Env): Promise<Response> {
  // 1. Is the body valid JSON at all?
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

  // 2. Validate the message (US-1 acceptance criteria)
  if (typeof message !== "string" || message.trim() === "") {
    return json({ error: "Message is required" }, 400);
  }
  const cleanMessage = message.trim();
  if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
    return json({ error: `Message must be at most ${MAX_MESSAGE_LENGTH} characters` }, 400);
  }

  // 3. Validate the optional email
  if (email !== undefined && email !== null && typeof email !== "string") {
    return json({ error: "Email must be a string" }, 400);
  }
  const cleanEmail = typeof email === "string" && email.trim() !== "" ? email.trim() : null;

  // 4. Save it. The "?" placeholders keep user input separate from the SQL command
  const result = await env.DB.prepare(
    "INSERT INTO feedback (message, email) VALUES (?, ?) RETURNING id",
  )
    .bind(cleanMessage, cleanEmail)
    .first<{ id: number }>();

  return json({ id: result!.id }, 201);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/feedback") {
      if (request.method === "POST") {
        return handleCreateFeedback(request, env);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;