import { expect, test } from "bun:test";
import neonContext from "../ein-pi/agent/extensions/ein-neon-context.ts";

function harness() {
  const handlers = new Map<string, Function>();
  neonContext({ on: (name: string, fn: Function) => handlers.set(name, fn) } as any);
  const ctx = { cwd: "/project", sessionManager: { getSessionId: () => "session" } };
  const call = (input: Record<string, unknown>, toolName = "mcp", context = ctx) => handlers.get("tool_call")!({ toolName, input }, context);
  const result = (input: Record<string, unknown>, isError = false, toolName = "mcp") => handlers.get("tool_result")!({ toolName, input, isError, content: [] }, ctx);
  return { handlers, ctx, call, result };
}

test("Neon discovery supplies organization guidance before the first project call", () => {
  const { handlers, ctx, call } = harness();
  const original = [{ type: "text", text: "neon_list_projects: List projects" }];
  const discovered = handlers.get("tool_result")!({ toolName: "mcp", input: { search: "list_projects", server: "neon" }, content: original, isError: false }, ctx);
  expect(discovered.content[0]).toEqual(original[0]);
  expect(discovered.content[1].text).toContain("list_organizations");
  expect(discovered.content[1].text).toContain("org_id");
  expect(call({ tool: "neon_list_projects", args: { search: "demo" } })).toMatchObject({ block: true });
  expect(call({ tool: "neon_list_organizations", args: {} })).toBeUndefined();
  expect(call({ tool: "neon_list_projects", args: { org_id: "org-demo", search: "demo" } })).toBeUndefined();
});

test("only a successful explicit project read establishes reusable context", () => {
  const { call, result } = harness();
  result({ tool: "neon_list_organizations" });
  expect(call({ tool: "neon_list_projects" })).toMatchObject({ block: true });
  result({ tool: "neon_list_projects", args: { org_id: "org-demo" } }, true);
  expect(call({ tool: "neon_list_projects" })).toMatchObject({ block: true });
  result({ tool: "neon_list_projects", args: { org_id: "org-demo" } });
  const input: { tool: string; args: Record<string, unknown> } = { tool: "neon_list_projects", args: { search: "demo", limit: 5 } };
  expect(call(input)).toBeUndefined();
  expect(input.args).toEqual({ search: "demo", limit: 5, org_id: "org-demo" });
  const explicit = { tool: "neon_list_projects", args: { org_id: "org-other" } };
  call(explicit);
  expect(explicit.args.org_id).toBe("org-other");
});

test("object, JSON-string and direct calls preserve their arguments", () => {
  const { call, result } = harness();
  result({ org_id: "org-demo" }, false, "neon_list_projects");
  const input = { tool: "neon_list_projects", args: '{"search":"demo","limit":5}' };
  call(input);
  expect(JSON.parse(input.args)).toEqual({ org_id: "org-demo", search: "demo", limit: 5 });
  const direct: Record<string, unknown> = { search: "demo" };
  call(direct, "neon_list_projects");
  expect(direct.org_id).toBe("org-demo");
});

test("new sessions, projects, failed reads and rediscovery discard old context", () => {
  const { handlers, ctx, call, result } = harness();
  const seed = () => result({ tool: "neon_list_projects", args: { org_id: "org-demo" } });
  seed();
  expect(call({ tool: "neon_list_projects" }, "mcp", { ...ctx, cwd: "/other" })).toMatchObject({ block: true });
  expect(call({ tool: "neon_list_projects" }, "mcp", { ...ctx, sessionManager: { getSessionId: () => "other" } })).toMatchObject({ block: true });
  for (const reset of [
    () => handlers.get("session_start")!(), () => handlers.get("session_shutdown")!(),
    () => result({ tool: "neon_list_projects", args: {} }, true),
    () => call({ tool: "neon_list_organizations" }),
  ]) {
    seed(); reset();
    expect(call({ tool: "neon_list_projects" })).toMatchObject({ block: true });
  }
});

test("other servers, mutations, malformed arguments and non-Neon discovery are untouched", () => {
  const { call, handlers, ctx } = harness();
  for (const tool of ["other_list_projects", "neon_run_sql", "neon_create_branch"]) {
    const input = { tool, args: {} };
    expect(call(input)).toBeUndefined();
    expect(input.args).toEqual({});
  }
  expect(call({ tool: "neon_list_projects", args: "{" })).toBeUndefined();
  expect(handlers.get("tool_result")!({ toolName: "mcp", input: { search: "projects" }, content: [{ type: "text", text: "other_list_projects" }], isError: false }, ctx)).toBeUndefined();
});
