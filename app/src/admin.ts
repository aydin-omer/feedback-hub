import { SENTIMENTS, TYPES, URGENCIES } from "./classify";

const LIST_LIMIT = 200;

// Allowed filters and their allowed values, reusing the same lists
// that validate the AI's answers, so the rules live in one place
const FILTERS = {
  type: TYPES,
  sentiment: SENTIMENTS,
  urgency: URGENCIES,
} as const;

export async function listFeedback(env: Env, url: URL): Promise<Response> {
  const conditions: string[] = [];
  const values: string[] = [];

  for (const [column, allowed] of Object.entries(FILTERS)) {
    const value = url.searchParams.get(column);
    if (value === null || value === "") continue;

    if (!(allowed as readonly string[]).includes(value)) {
      return Response.json({ error: `Unknown value for filter: ${column}` }, { status: 400 });
    }
    conditions.push(`${column} = ?`);
    values.push(value);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [itemsResult, countsResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, message, email, type, sentiment, urgency, summary, status, created_at
       FROM feedback
       ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
      .bind(...values, LIST_LIMIT)
      .all(),
    // Counts always cover all feedback, regardless of the active filters
    env.DB.prepare(
      `SELECT COALESCE(type, 'unclassified') AS type, COUNT(*) AS count
       FROM feedback
       GROUP BY COALESCE(type, 'unclassified')`,
    ).all<{ type: string; count: number }>(),
  ]);

  // Start every category at 0, so empty categories still appear
  const counts: Record<string, number> = Object.fromEntries(
    [...TYPES, "unclassified"].map((type) => [type, 0]),
  );
  for (const row of countsResult.results) {
    counts[row.type] = row.count;
  }

  return Response.json(
    { items: itemsResult.results, counts },
    { headers: { "Cache-Control": "no-store" } },
  );
}