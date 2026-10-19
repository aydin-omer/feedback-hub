const LIST_LIMIT = 200;

export async function listFeedback(env: Env): Promise<Response> {
  // Columns are listed one by one on purpose: never SELECT *,
  // so new sensitive columns (like ip_hash) can't leak by accident
  const { results } = await env.DB.prepare(
    `SELECT id, message, email, type, sentiment, urgency, summary, status, created_at
     FROM feedback
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
  )
    .bind(LIST_LIMIT)
    .all();

  return Response.json(
    { items: results },
    // Admin data must never be stored in browser or proxy caches
    { headers: { "Cache-Control": "no-store" } },
  );
}