import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createIntentMaterialKey, normalizeIntentMaterial, type IntentMaterial } from "./sdd-intent-preflight.ts";

export type IntentAgreement = {
	version: 1;
	work: string;
	change?: string;
	status: "pending" | "confirmed" | "cancelled";
	material: IntentMaterial;
	materialKey: string;
	questions: string[];
	delegated?: true;
	reopenReason?: string;
	response?: { id: string; text: string; source: "interactive" | "rpc" };
	history?: { questions: string[]; response: NonNullable<IntentAgreement["response"]> }[];
	revision: string;
};

export function artifactHasIntentKey(source: string, key: string): boolean {
	const declarations = [...source.matchAll(/^[ \t]*(?:[-*][ \t]+)?intent_key:[ \t]*`?(sha256:[a-f0-9]{64})`?[ \t]*$/gm)];
	return declarations.length === 1 && declarations[0]![1] === key;
}

export function validateAgreement(value: unknown): IntentAgreement {
	const record = value as IntentAgreement;
	if (!record || record.version !== 1 || typeof record.work !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.work)
		|| (record.change !== undefined && record.change !== record.work)
		|| !["pending", "confirmed", "cancelled"].includes(record.status)
		|| typeof record.revision !== "string" || !record.revision
		|| !Array.isArray(record.questions) || (record.questions.length < 1 && !record.delegated) || record.questions.length > 4
		|| record.questions.some((q) => typeof q !== "string" || !q.trim())) throw new Error("Invalid intent agreement");
	const material = normalizeIntentMaterial(record.material);
	const validResponse = (response: IntentAgreement["response"]) => response && typeof response.id === "string" && response.id.trim()
		&& typeof response.text === "string" && response.text.trim() && ["interactive", "rpc"].includes(response.source);
	if ((record.delegated !== undefined && record.delegated !== true) || (record.reopenReason !== undefined && typeof record.reopenReason !== "string")) throw new Error("Invalid discovery metadata");
	if (record.history && (!Array.isArray(record.history) || record.history.some((round) => !Array.isArray(round.questions)
		|| round.questions.some((q) => typeof q !== "string") || !validResponse(round.response)))) throw new Error("Invalid discovery history");
	if (createIntentMaterialKey(material) !== record.materialKey) throw new Error("Intent material changed without a new agreement");
	if ((record.response !== undefined || record.status === "confirmed") && !validResponse(record.response)) throw new Error("Intent needs an observed human response");
	return { ...record, material };
}

export function renderAgreement(record: IntentAgreement): string {
	validateAgreement(record);
	const bullets = (items: string[]) => items.map((item) => `- ${item}`).join("\n") || "- —";
	const history = (record.reopenReason ? `Motivo de reapertura: ${record.reopenReason}\n\n` : "") + (record.history?.map((round, index) => `### Ronda ${index + 1}\n\n${bullets(round.questions)}\n\n${round.response.text}\n\n`).join("") ?? "");
	// El bloque estructurado y la vista humana se validan juntos: editar solo
	// una mitad nunca convierte una interpretación distinta en un acuerdo.
	return `# Intent — ${record.work}\n\nEstado: ${record.status}\n\n## Objetivo\n\n${record.material.objective}\n\n## Dentro del alcance\n\n${bullets(record.material.boundaries.in)}\n\n## Fuera del alcance\n\n${bullets(record.material.boundaries.out)}\n\n## Criterios de éxito\n\n${bullets(record.material.completionCriteria)}\n\n## Preguntas\n\n${bullets(record.questions)}\n\n${history}## Respuesta del usuario\n\n${record.response?.text ?? "Pendiente"}\n\n<!-- ein:intent-agreement:${Buffer.from(JSON.stringify(record)).toString("base64")} -->\n`;
}

export function readAgreement(changeDir: string): { kind: "absent" } | { kind: "invalid" } | { kind: "valid"; agreement: IntentAgreement } {
	const path = join(changeDir, "intent.md");
	if (!existsSync(path)) return { kind: "absent" };
	try {
		if (lstatSync(path).isSymbolicLink() || lstatSync(path).size > 64 * 1024) return { kind: "invalid" };
		const raw = readFileSync(path, "utf8");
		const encoded = [...raw.matchAll(/<!-- ein:intent-agreement:([A-Za-z0-9+/=]+) -->/g)];
		if (encoded?.length !== 1) return { kind: "invalid" };
		const agreement = validateAgreement(JSON.parse(Buffer.from(encoded[0]![1]!, "base64").toString("utf8")));
		if (raw.replaceAll("\r\n", "\n") !== renderAgreement(agreement).replaceAll("\r\n", "\n")) return { kind: "invalid" };
		return { kind: "valid", agreement };
	} catch { return { kind: "invalid" }; }
}

export function writeAgreement(changeDir: string, record: IntentAgreement): void {
	const path = join(changeDir, "intent.md");
	if (lstatSync(changeDir).isSymbolicLink() || (existsSync(path) && lstatSync(path).isSymbolicLink())) throw new Error("Unsafe intent path");
	const content = renderAgreement(record);
	if (Buffer.byteLength(content) > 64 * 1024) throw new Error("Intent agreement exceeds 64 KiB; narrow the scope");
	const temporary = join(changeDir, `.intent-${randomUUID()}.tmp`);
	try {
		writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
		renameSync(temporary, path);
	} finally { rmSync(temporary, { force: true }); }
}
