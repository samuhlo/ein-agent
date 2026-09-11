import type { Theme, ToolInfo } from "@earendil-works/pi-coding-agent";
import { renderMcpCard, redactMcpText, type McpCard } from "./mcp-card.ts";

const labels: Record<string, string> = {
  bash: "Ejecutar comando", read: "Leer archivo", edit: "Editar archivo",
  write: "Escribir archivo", grep: "Buscar contenido", find: "Buscar archivos", ls: "Listar archivos",
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export function isNativeCardTool(tool: ToolInfo): boolean {
  return tool.sourceInfo.source === "builtin" && Object.hasOwn(labels, tool.name);
}

function commandLabel(command: string): string {
  // Only exact commands receive semantic labels; compound scripts stay neutral.
  if (/^git\s+status(?:\s+--short)?(?:\s+--branch)?\s*$/.test(command)) return "Comprobar repositorio";
  if (/^git\s+branch\s+--show-current\s*$/.test(command)) return "Consultar rama";
  if (/^(?:env\s+(?:-u\s+\w+\s+)+)?bun\s+(?:run\s+)?(?:test|typecheck)(?:\s+[^;&|<>\n]*)?$/.test(command)) return "Ejecutar comprobaciones";
  return labels.bash!;
}

function summary(card: McpCard): string {
  if (card.error) {
    const text = card.result?.content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n") ?? "";
    if (/password authentication failed/i.test(text)) return "Fallo de autenticación de la base de datos";
    if (/permission denied/i.test(text)) return "Permiso denegado";
    if (/^(?:Tool execution aborted|Operation cancelled)\.?$/m.test(text)) return "Tool execution aborted";
    const exit = text.match(/(?:Command|Process) exited with code (\d+)/);
    return exit ? `El comando terminó con código ${exit[1]}` : redactMcpText(text).split("\n").find((line) => line.trim()) || "La herramienta ha fallado";
  }
  if (card.tool === "edit") return "Cambios aplicados";
  if (card.tool === "write") return "Archivo guardado";
  const text = card.result?.content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n") ?? "";
  const images = card.result?.content.filter((block) => block.type === "image").length ?? 0;
  if (card.tool === "read") {
    const count = text ? text.trimEnd().split("\n").length : 0;
    return [count ? `${count} líneas en la respuesta` : "", images ? `${images} imagen(es)` : ""].filter(Boolean).join(" · ") || "Archivo vacío";
  }
  const args = record(card.args) ? card.args : {};
  const command = typeof args.command === "string" ? args.command.trim() : "";
  if (/^git\s+branch\s+--show-current\s*$/.test(command) && /^[^\s]+\s*$/.test(text)) return `Rama: ${redactMcpText(text.trim())}`;
  if (card.tool === "bash") return text.trim() ? "Comando completado · salida disponible" : "Comando completado · sin salida";
  return text.trim() ? "Consulta completada · resultados disponibles" : "Consulta completada · sin salida";
}

export function renderNativeCard(card: McpCard, width: number, theme: Pick<Theme, "fg" | "bold">): string[] {
  const args = record(card.args) ? card.args : {};
  const command = typeof args.command === "string" ? args.command.trim() : "";
  const path = typeof args.path === "string" ? args.path : undefined;
  const progress = path && /(?:^|\/)openspec\/changes\/[^/]+\/(?:tasks|apply-progress)\.md$/.test(path);
  const label = card.tool === "bash" ? commandLabel(command)
    : progress && (card.tool === "edit" || card.tool === "write") ? "Actualizar progreso" : labels[card.tool] ?? card.tool;
  const preview = card.tool === "bash"
    ? command.length > 100 || command.includes("\n") ? "Script · abrir detalles" : `Comando: ${redactMcpText(command)}`
    : [path ? `Ruta: ${redactMcpText(path)}` : "", typeof args.pattern === "string" ? `Patrón: ${redactMcpText(args.pattern)}` : ""].filter(Boolean).join(" · ");
  const result = card.result && {
    ...card.result,
    content: card.expanded ? [
      ...card.result.content,
      ...(record(card.result.details) && typeof card.result.details.diff === "string"
        ? [{ type: "text", text: `Diff\n${card.result.details.diff}` }] : []),
    ] : [{ type: "text", text: summary(card) }],

  };
  // The shared card owns layout and sanitization. Expanded input remains the
  // actual tool arguments, so edits and scripts are fully inspectable.
  return renderMcpCard({
    ...card, result, presentation: { server: "ein", operation: label, preview },
  }, width, theme);
}
