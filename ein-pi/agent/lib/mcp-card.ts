import { stripVTControlCharacters } from "node:util";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

type McpCardBlock = { type: string; text?: string; mimeType?: string; uri?: string; name?: string; resource?: { uri?: string; text?: string; mimeType?: string } };
export type McpCardResult = { content: readonly McpCardBlock[]; details?: unknown };
export type McpCard = {
  tool: string;
  args: unknown;
  result?: McpCardResult;
  partial: boolean;
  started: boolean;
  error: boolean;
  expanded: boolean;
  durationMs?: number;
  expandHint: string;
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const DISPLAY_LIMIT = 262_144;
const PREVIEW_LIMIT = 8192;
const SECRET_KEY = /password|passwd|secret|token|authorization|cookie|api[_-]?key|connection[_-]?(?:string|url)|database[_-]?url|dsn/i;
const counted = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

export function redactMcpText(text: string): string {
  return stripVTControlCharacters(text)
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s<>"']+/gi, "[conexión oculta]")
    .replace(/(https?:\/\/)[^\s/@]+@/gi, "$1[credenciales]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [oculto]")
    .replace(/([?&](?:token|key|api_key|access_token|secret|password)=)[^&\s"']*/gi, "$1[oculto]")
    .replace(/((?:["']?)(?:password|passwd|secret|token|authorization|cookie|api[_-]?key|connection[_-]?(?:string|url)|database[_-]?url|dsn)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi, "$1[oculto]");
}

function displayJson(value: unknown): string {
  try {
    return redactMcpText(JSON.stringify(value, (key, item) => SECRET_KEY.test(key) ? "[oculto]" : item, 2) ?? "");
  } catch { return "[argumentos no representables]"; }
}

function displayText(text: string): string {
  if (text.length <= DISPLAY_LIMIT) {
    try { return displayJson(JSON.parse(text)); } catch { /* Plain-text results keep their original lines. */ }
  }
  return redactMcpText(text);
}

function displayBlock(block: McpCardBlock): string {
  if (block.type === "text") return displayText((block.text ?? "").slice(0, DISPLAY_LIMIT));
  return [
    `[${block.type}${block.mimeType ? `: ${block.mimeType}` : ""}]`,
    block.name, block.uri ?? block.resource?.uri,
    block.resource?.text ? displayText(block.resource.text.slice(0, DISPLAY_LIMIT)) : undefined,
  ].filter(Boolean).join("\n");
}

function argumentsObject(value: unknown): Record<string, unknown> {
  if (record(value)) return value;
  if (typeof value === "string" && value.length <= DISPLAY_LIMIT) {
    try { const parsed: unknown = JSON.parse(value); if (record(parsed)) return parsed; } catch { /* Incomplete streamed arguments remain a preview. */ }
  }
  return {};
}

const operationNames: Record<string, string> = {
  list_projects: "Listar proyectos", list_organizations: "Listar organizaciones",
  list_branches: "Listar ramas", get_project: "Consultar proyecto", run_sql: "Ejecutar SQL",
};

function operation(name: string): string {
  return operationNames[name] ?? name.replace(/_/g, " ");
}

function identity(card: McpCard): { server: string; operation: string; input: Record<string, unknown> } {
  const args = argumentsObject(card.args);
  const details = record(card.result?.details) ? card.result.details : {};
  const server = typeof details.server === "string" ? details.server : typeof args.server === "string" ? args.server : card.tool.startsWith("mcp__") ? card.tool.slice(5) : "MCP";
  if (card.tool === "mcpScript") return { server: "MCP", operation: "Ejecutar script", input: {} };
  const proxy = card.tool === "mcp" || card.tool.startsWith("mcp__");
  const input = proxy ? argumentsObject(args.args) : args;
  if (typeof args.search === "string" && card.tool === "mcp") return { server, operation: "Buscar herramientas", input: { search: args.search } };
  if (typeof args.describe === "string" && card.tool === "mcp") return { server, operation: "Consultar esquema", input: { name: args.describe } };
  if (typeof args.connect === "string" && card.tool === "mcp") return { server: args.connect, operation: "Conectar", input: {} };
  const name = typeof details.tool === "string" ? details.tool : proxy && typeof args.tool === "string" ? args.tool : card.tool;
  if (card.tool === "mcp" && !args.tool) return { server, operation: typeof args.action === "string" ? operation(args.action) : args.server ? "Consultar herramientas" : "Consultar conexiones", input: {} };
  const prefix = `${server}_`;
  return { server, operation: operation(name.startsWith(prefix) ? name.slice(prefix.length) : name), input };
}

function previewInput(input: Record<string, unknown>): string | undefined {
  for (const [key, label] of [["search", "Búsqueda"], ["name", "Nombre"], ["path", "Ruta"], ["project_id", "Proyecto"], ["branch_id", "Rama"]]) {
    if (typeof input[key!] === "string" && input[key!]) return `${label}: ${redactMcpText(String(input[key!]).slice(0, PREVIEW_LIMIT)).replace(/\s+/g, " ")}`;
  }
  return undefined;
}

function summarize(result: McpCardResult, error: boolean): string {
  const details = record(result.details) ? result.details : {};
  if (!error && details.mode === "search" && Number.isSafeInteger(details.count) && Number(details.count) >= 0 && Array.isArray(details.matches)) {
    return `${counted(Number(details.count), "herramienta encontrada", "herramientas encontradas")}${details.hasMore === true ? ` · ${details.matches.length} en esta página` : ""}`;
  }
  const blocks = result.content;
  const firstText = blocks.find((block) => block.type === "text" && block.text?.trim())?.text;
  const media = blocks.filter((block) => block.type !== "text");
  const images = media.filter((block) => block.type === "image").length;
  const otherResources = media.length - images;
  const mediaSummary = [images ? counted(images, "imagen", "imágenes") : "", otherResources ? counted(otherResources, "recurso adjunto", "recursos adjuntos") : ""].filter(Boolean).join(" · ");
  if (!firstText) return error
    ? redactMcpText(typeof details.message === "string" ? details.message : `Error: ${details.error || "sin detalle"}`)
    : mediaSummary || "Sin contenido en la respuesta";
  const text = firstText.slice(0, PREVIEW_LIMIT).trim();
  let summary: string;
  try {
    const value: unknown = JSON.parse(text);
    if (error) {
      const detail = record(value) ? value.message ?? value.error : undefined;
      summary = typeof detail === "string" ? redactMcpText(detail) : "La herramienta ha devuelto un error";
    } else if (Array.isArray(value)) summary = `${counted(value.length, "elemento", "elementos")} en esta respuesta`;
    else if (record(value)) {
      const arrays = Object.entries(value).filter(([, item]) => Array.isArray(item));
      const labels: Record<string, [string, string]> = { projects: ["proyecto", "proyectos"], organizations: ["organización", "organizaciones"], branches: ["rama", "ramas"], tools: ["herramienta", "herramientas"], results: ["resultado", "resultados"], items: ["elemento", "elementos"] };
      summary = arrays.length === 1 && labels[arrays[0]![0]]
        ? `${counted((arrays[0]![1] as unknown[]).length, ...labels[arrays[0]![0]]!)} en esta respuesta`
        : `Respuesta estructurada · ${counted(Object.keys(value).length, "campo", "campos")}`;
    } else summary = redactMcpText(text);
  } catch {
    summary = redactMcpText(text).split("\n").map((line) => line.trim()).find(Boolean) ?? "Sin contenido en la respuesta";
    if (/^[\[{]/.test(summary)) summary = "Respuesta estructurada · abrir detalles";
  }
  return [summary, mediaSummary].filter(Boolean).join(" · ");
}

export function renderMcpCard(card: McpCard, width: number, theme: Pick<Theme, "fg" | "bold">): string[] {
  const safeWidth = Math.max(1, Math.floor(width));
  const target = identity(card);
  const details = record(card.result?.details) ? card.result.details : {};
  const cancelled = ["aborted", "cancelled", "canceled"].includes(String(details.error))
    || card.error && card.result?.content.some((block) => block.type === "text" && /^(?:Tool execution aborted|Operation cancelled)\.?$/.test(block.text?.trim() ?? ""));
  const failed = card.error || Boolean(details.error);
  const pending = !card.result || card.partial;
  const glyph = pending ? "●" : cancelled ? "■" : failed ? "✗" : "✓";
  const tone = pending ? "accent" : cancelled ? "muted" : failed ? "error" : "success";
  const title = `${theme.fg(tone, glyph)} ${theme.fg("toolTitle", theme.bold(redactMcpText(target.server).replace(/\s+/g, " ")))} ${theme.fg("dim", "·")} ${theme.fg("toolTitle", redactMcpText(target.operation).replace(/\s+/g, " "))}`;
  const duration = !pending && card.durationMs !== undefined ? `${(Math.max(0, card.durationMs) / 1000).toFixed(1)} s` : "";
  const room = safeWidth - visibleWidth(title) - duration.length;
  const lines = [truncateToWidth(title + (duration && room >= 2 ? " ".repeat(room) + theme.fg("dim", duration) : ""), safeWidth)];
  const add = (text: string, color: Parameters<Theme["fg"]>[0] = "muted") => lines.push(truncateToWidth(theme.fg(color, `  ${text}`), safeWidth));
  if (!card.expanded) {
    const preview = previewInput(target.input);
    if (preview) add(preview);
    add(pending ? card.started ? "En curso" : "Preparando llamada" : cancelled ? "Llamada cancelada" : summarize(card.result!, failed), failed && !pending && !cancelled ? "error" : "muted");
    add(card.expandHint ? `${card.expandHint} · detalles` : "Detalles · atajo sin asignar", "dim");
    return lines;
  }
  add(`Herramienta: ${redactMcpText(card.tool)}`, "dim");
  const expanded = ["Argumentos", displayJson(card.args), ...(card.result ? ["Respuesta", ...card.result.content.map(displayBlock)] : [card.started ? "En curso" : "Preparando llamada"])].join("\n");
  const bounded = expanded.slice(0, DISPLAY_LIMIT);
  for (const line of wrapTextWithAnsi(redactMcpText(bounded), Math.max(1, safeWidth - 2))) add(line);
  if (bounded.length < expanded.length || card.result?.content.some((block) => (block.text?.length ?? 0) > DISPLAY_LIMIT || (block.resource?.text?.length ?? 0) > DISPLAY_LIMIT)) add("Vista limitada a 256 KiB; la salida original se conserva en la sesión.");
  return lines;
}
