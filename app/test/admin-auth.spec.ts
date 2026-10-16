import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

// Builds an Authorization header the same way a browser does for Basic Auth
function basicAuth(username: string, password: string) {
  return "Basic " + btoa(`${username}:${password}`);
}

async function get(path: string, authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization) headers["Authorization"] = authorization;
  const request = new IncomingRequest(`http://example.com${path}`, { headers });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("Admin protection (US-5)", () => {
  // Every way of reaching the dashboard or its API must be locked
  for (const path of ["/admin", "/admin/", "/admin/index.html", "/api/admin/anything"]) {
    it(`blocks ${path} without credentials`, async () => {
      const response = await get(path);
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
    });
  }

  it("blocks a wrong password", async () => {
    const response = await get("/admin", basicAuth("admin", "wrong-password"));
    expect(response.status).toBe(401);
  });

  it("blocks a wrong username, even with the right password", async () => {
    const response = await get("/admin", basicAuth("someone", env.ADMIN_PASSWORD));
    expect(response.status).toBe(401);
  });

  it("blocks a malformed Authorization header instead of crashing", async () => {
    const response = await get("/admin", "Basic this-is-not-valid-base64!!!");
    expect(response.status).toBe(401);
  });

  it("blocks other authentication schemes", async () => {
    const response = await get("/admin", "Bearer some-token");
    expect(response.status).toBe(401);
  });

  it("lets the admin through the guard", async () => {
    // No admin API endpoint exists yet (that comes in US-3), so getting past
    // the guard means reaching a normal "Not found" instead of "Unauthorized"
    const response = await get("/api/admin/anything", basicAuth("admin", env.ADMIN_PASSWORD));
    expect(response.status).toBe(404);
  });

  it("keeps public routes public", async () => {
    const response = await get("/api/feedback");
    expect(response.status).not.toBe(401);
  });
});