import { classifyFeedback } from "./classify";
import { MAX_SUBMISSIONS_PER_HOUR, countRecentSubmissions, hashIp } from "./rate-limit"; // NEW
import { isAdminPath, isAuthorized, unauthorized } from "./auth";

const MAX_MESSAGE_LENGTH = 2000;

// NEW: optional headers parameter, needed for Retry-After
function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers });
}

async function classifyAndStore(env: Env, id: number, message: string): Promise<void> {
  try {
    const result = await classifyFeedback(message, env.GEMINI_API_KEY);
    await env.DB.prepare(
      "UPDATE feedback SET type = ?, sentiment = ?, urgency = ?, summary = ?, status = 'classified' WHERE id = ?",
    )
      .bind(result.type, result.sentiment, result.urgency, result.summary, id)
      .run();
  } catch (error) {
    console.error(`Classification failed for feedback ${id}:`, error);
  }
}

async function handleCreateFeedback(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
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

  // NEW: rate limiting (US-6)
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ipHash = await hashIp(ip, env.IP_HASH_SALT);
  if ((await countRecentSubmissions(env.DB, ipHash)) >= MAX_SUBMISSIONS_PER_HOUR) {
    return json(
      { error: "Too many submissions. Please try again later." },
      429,
      { "Retry-After": "3600" },
    );
  }

  // CHANGED: ip_hash is saved too
  const result = await env.DB.prepare(
    "INSERT INTO feedback (message, email, ip_hash) VALUES (?, ?, ?) RETURNING id",
  )
    .bind(cleanMessage, cleanEmail, ipHash)
    .first<{ id: number }>();

  const id = result!.id;
  ctx.waitUntil(classifyAndStore(env, id, cleanMessage));

  return json({ id }, 201);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    // The guard runs first, before any admin page or admin API is reached (US-5)
    if (isAdminPath(url.pathname)) {
      if (!(await isAuthorized(request, env.ADMIN_PASSWORD))) {
        return unauthorized();
      }
      if (url.pathname.startsWith("/api/admin")) {
        // Admin API endpoints come in US-3
        return json({ error: "Not found" }, 404);
      }
      // Authorized: serve the dashboard page from the static files
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/api/feedback") {
      if (request.method === "POST") {
        return handleCreateFeedback(request, env, ctx);
      }
      return json({ error: "Method not allowed" }, 405);
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;