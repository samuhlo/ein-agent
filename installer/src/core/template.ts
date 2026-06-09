// =============================================================================
// TEMPLATE ENGINE
// Replaces {{TOKEN}} placeholders in shipped config files at deploy time.
// Only mcp.json and settings.json carry tokens; everything else ships verbatim.
// =============================================================================

export type TemplateVars = {
  HOME: string;
  AGENT_DIR: string;
  ENGRAM_BIN: string;
  ENGRAM_DATA_DIR: string;
};

const TOKEN_RE = /\{\{(\w+)\}\}/g;

// Replace every {{TOKEN}} with its value. Unknown tokens are left intact and
// reported, so a typo in a template surfaces instead of silently vanishing.
export function applyTokens(
  content: string,
  vars: TemplateVars,
): { result: string; unknown: string[] } {
  const unknown = new Set<string>();
  const result = content.replace(TOKEN_RE, (match, name: string) => {
    if (name in vars) return vars[name as keyof TemplateVars];
    unknown.add(name);
    return match;
  });
  return { result, unknown: [...unknown] };
}

// Convenience wrapper that throws if any token went unresolved.
export function renderTemplate(content: string, vars: TemplateVars): string {
  const { result, unknown } = applyTokens(content, vars);
  if (unknown.length > 0) {
    throw new Error(
      `Tokens sin resolver en plantilla: ${unknown.map((t) => `{{${t}}}`).join(", ")}`,
    );
  }
  return result;
}
