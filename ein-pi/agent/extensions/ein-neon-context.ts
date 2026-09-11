import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ORGANIZATION_GUIDANCE = "Neon: antes de list_projects, llama a list_organizations y elige la organización correspondiente al proyecto; pasa su id como org_id. Si hay varias candidatas y el contexto no permite elegir, consulta al usuario. La organización no acredita la rama de base de datos: comprueba por separado la rama y el destino real de la conexión antes de operar.";
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validOrg = (value: unknown): value is string => typeof value === "string" && /^org-[a-z0-9-]{1,56}$/.test(value);

function neonCall(toolName: string, input: Record<string, unknown>) {
  const name = toolName === "mcp" ? input.tool : toolName;
  if (name !== "neon_list_projects" && name !== "neon_list_organizations") return;
  let args: unknown = toolName === "mcp" ? input.args ?? {} : input;
  if (typeof args === "string") {
    try { args = JSON.parse(args); } catch { return; }
  }
  if (!isRecord(args)) return;
  return {
    name, args,
    setOrg(org: string) {
      if (toolName !== "mcp") input.org_id = org;
      else input.args = typeof input.args === "string" ? JSON.stringify({ ...args, org_id: org }) : { ...args, org_id: org };
    },
  };
}

export default function neonContext(pi: ExtensionAPI): void {
  // Only successful explicit project reads establish context. Listing several
  // organizations never selects one, and context never crosses a session/project.
  const organizations = new Map<string, string>();
  pi.on("session_start", () => organizations.clear());
  pi.on("session_shutdown", () => organizations.clear());

  pi.on("tool_call", (event, ctx) => {
    if (!isRecord(event.input)) return;
    const call = neonCall(event.toolName, event.input);
    if (!call) return;
    const key = `${ctx.sessionManager.getSessionId()}\0${ctx.cwd}`;
    if (call.name === "neon_list_organizations") { organizations.delete(key); return; }
    if (call.args.org_id !== undefined && call.args.org_id !== "") return;
    const org = organizations.get(key);
    if (org) { call.setOrg(org); return; }
    return { block: true, reason: ORGANIZATION_GUIDANCE };
  });

  pi.on("tool_result", (event, ctx) => {
    const call = neonCall(event.toolName, event.input);
    if (call?.name === "neon_list_projects") {
      const key = `${ctx.sessionManager.getSessionId()}\0${ctx.cwd}`;
      if (event.isError) organizations.delete(key);
      else if (validOrg(call.args.org_id)) organizations.set(key, call.args.org_id);
    }
    if (event.toolName !== "mcp" || event.isError || !event.input.search) return;
    const foundProjects = event.content.some((item) => item.type === "text" && /\bneon_list_projects\b/.test(item.text));
    if (foundProjects) return { content: [...event.content, { type: "text" as const, text: ORGANIZATION_GUIDANCE }] };
  });
}
