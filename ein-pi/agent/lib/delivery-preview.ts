import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { stripNegatedDelivery } from "./git-delivery.ts";

const clean = (text: string) => stripVTControlCharacters(text)
  .replace(/https?:\/\/[^\s/@]+@/gi, "https://[credenciales]@")
  .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, "$1[oculto]")
  .replace(/[\u0000-\u001f\u007f]/g, " ").trim();

export type DeliveryPreview = { title: string; body: string; summary?: readonly string[]; details?: string };

export function deliveryPreview(texts: string[], cwd: string, mode: "auto" | "ask" | "off"): DeliveryPreview {
  const affirmative = texts.map(stripNegatedDelivery).join("\n");
  const commitRequested = /\b(?:crea|haz|prepara|realiza|genera)\s+(?:un\s+|el\s+)?commit\b|\bcommitea\b|\bcommit\s+(?:these|the)\s+(?:changes|files)\b/i.test(affirmative);
  const push = /\bpush\b|\bsube\s+(?:la\s+)?rama\b/i.test(affirmative);
  const pr = /\b(?:PR|pull request)\b/i.test(affirmative);
  const actions = [commitRequested ? "crear un commit" : "", push ? "subir la rama" : "", pr ? "abrir una PR" : ""].filter(Boolean);
  const action = (actions.length > 1 ? `${actions.slice(0, -1).join(", ")} y ${actions.at(-1)}` : actions[0] ?? "ejecutar la entrega Git solicitada").replace(/^./, (letter) => letter.toUpperCase());
  const git = (...args: string[]) => {
    try { return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 1500, maxBuffer: 16_384, stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { return ""; }
  };
  const branch = git("branch", "--show-current");
  const upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}");
  const status = git("status", "--porcelain");
  const commit = git("log", "-1", "--format=%h %s");
  const target = /\b(?:PR|pull request)\s+(?:contra|hacia|a|to|against)\s+([\w./-]+)/i.exec(affirmative)?.[1]?.replace(/[.,;:]+$/, "");
  // Prefer the delivery clause, not intent_work or a truncated implementation
  // packet. The full task stays in the native delegation details.
  const relevant = affirmative.split("\n").filter((line) => /\b(?:push|PR|pull request|sube|publica|entrega)\b/i.test(line) && !/^\s*intent_work:/.test(line));
  const summary = [
    action,
    `Proyecto  ${clean(basename(cwd))}`,
    `Rama  ${clean(branch) || "sin rama disponible"}`,
    pr ? `Base de PR pedida  ${target ? clean(target) : "sin concretar"}` : "",
    status ? "Hay cambios locales pendientes" : "Árbol de trabajo limpio",
  ].filter(Boolean);
  const details = [
    `Repositorio: ${clean(cwd)}`,
    commit ? `HEAD actual: ${clean(commit)}` : "HEAD actual: no disponible",
    `Upstream actual: ${clean(upstream) || "sin configurar"}`,
    `Encargo: ${clean(relevant.join(" · ") || affirmative).slice(0, 1200)}`,
    mode === "ask" ? "Se pide confirmación porque la política Git del proyecto está en «preguntar siempre»." : "Se pide confirmación porque no hay una autorización vigente para esta entrega.",
  ].filter(Boolean).join("\n");
  return { title: "Confirmar entrega Git", summary, details, body: `${summary.join("\n")}\n${details}` };
}
