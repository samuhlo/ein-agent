import { execFileSync } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import { stripNegatedDelivery } from "./git-delivery.ts";

const clean = (text: string) => stripVTControlCharacters(text)
  .replace(/https?:\/\/[^\s/@]+@/gi, "https://[credenciales]@")
  .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, "$1[oculto]")
  .replace(/[\u0000-\u001f\u007f]/g, " ").trim();

export type DeliveryPreview = { title: string; body: string };

export function deliveryPreview(texts: string[], cwd: string, mode: "auto" | "ask" | "off"): DeliveryPreview {
  const affirmative = texts.map(stripNegatedDelivery).join("\n");
  const push = /\bpush\b|\bsube\s+(?:la\s+)?rama\b/i.test(affirmative);
  const pr = /\b(?:PR|pull request)\b/i.test(affirmative);
  const action = [push ? "Subir commits al remoto" : "", pr ? "Crear o actualizar la PR" : ""].filter(Boolean).join(" y ") || "Ejecutar la entrega Git solicitada";
  const git = (...args: string[]) => {
    try { return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 1500, maxBuffer: 16_384, stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { return ""; }
  };
  const branch = git("branch", "--show-current");
  const upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}");
  const status = git("status", "--porcelain");
  const commits = upstream ? git("log", "--format=%h %s", "-5", "@{upstream}..HEAD") : "";
  // Prefer the delivery clause, not intent_work or a truncated implementation
  // packet. The full task stays in the native delegation details.
  const relevant = affirmative.split("\n").filter((line) => /\b(?:push|PR|pull request|sube|publica|entrega)\b/i.test(line) && !/^\s*intent_work:/.test(line));
  const body = [
    `Acción: ${action}`,
    `Repositorio: ${clean(cwd)}`,
    `Rama local: ${clean(branch) || "HEAD separado o rama no disponible"}`,
    `Seguimiento Git: ${clean(upstream) || "sin upstream configurado"}`,
    "El destino solicitado se indica en el encargo; el upstream no lo sustituye.",
    commits ? `Commits locales respecto al upstream (hasta 5):\n${commits.split("\n").map((line) => `  ${clean(line)}`).join("\n")}` : "",
    status ? "Hay cambios locales sin commit." : "",
    `Encargo de entrega: ${clean(relevant.join(" · ") || affirmative).slice(0, 1200)}`,
    mode === "ask" ? "Se pide confirmación porque la política Git del proyecto está en «preguntar siempre»." : "Se pide confirmación porque no hay una autorización vigente para esta entrega.",
  ].filter(Boolean).join("\n");
  return { title: push && !pr ? "¿Autorizar la publicación de commits?" : pr && !push ? "¿Autorizar la entrega de la PR?" : "¿Autorizar esta entrega Git?", body };
}
