import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { stripVTControlCharacters } from "node:util";
import type { McpCard } from "./mcp-card.ts";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string => typeof value === "string" ? stripVTControlCharacters(value).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "") : "";
// FIDELITY -> Recommendation badges belong to options, never to free text.
const option = (value: unknown): string => text(value).replace(/\s*\((?:recommended|recomendad[oa])\)\s*$/i, "");

export function questionReceipt(card: McpCard): string[] {
  if (!card.result || card.partial) return ["Esperando tu respuesta"];
  const details = card.result.details;
  if (card.error || (record(details) && details.error)) return ["No se pudo recoger tu respuesta"];
  if (!record(details) || !Array.isArray(details.answers) || typeof details.cancelled !== "boolean") return ["No se pudo leer la respuesta"];
  const lines: string[] = details.cancelled ? ["Cuestionario cancelado"] : [];
  if (details.cancelled && (details.answers.length || text(details.globalNote))) lines.push("Respuestas sin enviar:");
  const args = record(card.args) ? card.args : {};
  const questions = Array.isArray(args.questions) ? args.questions : [];
  for (const answer of details.answers) {
    if (!record(answer)) continue;
    const values = answer.kind === "multi" && Array.isArray(answer.selected)
      ? answer.selected.map(option).filter(Boolean)
      : [answer.kind === "option" ? option(answer.answer) : text(answer.answer)].filter(Boolean);
    const question = questions[Number(answer.questionIndex)];
    const label = record(question) ? text(question.header) || text(question.question) : text(answer.question);
    if (card.expanded && text(answer.question)) lines.push(text(answer.question));
    lines.push(`${!card.expanded && questions.length > 1 && label ? `${label}: ` : ""}${values.join(", ") || "Sin respuesta"}`);
    if (text(answer.notes)) lines.push(`Nota: ${text(answer.notes)}`);
    if (card.expanded && text(answer.preview)) lines.push(text(answer.preview));
  }
  if (text(details.globalNote)) lines.push(`Nota general: ${text(details.globalNote)}`);
  return lines.length ? lines : ["Sin respuesta"];
}

export function renderQuestionCard(card: McpCard, width: number, theme: Pick<Theme, "fg" | "bold">): string[] {
  const title = `${theme.fg("dim", "ein · ")}${theme.fg("toolTitle", "Tu respuesta")}`;
  return new Text(`${title}\n${questionReceipt(card).join("\n")}`, 0, 0).render(width);
}
