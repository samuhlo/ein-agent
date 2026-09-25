import { prArtifactLabels, type Lang } from "./lang.ts";

export type PrArtifactInput = {
	base: string;
	head: string;
	badge?: string;
	title: string;
	intent: string;
	changes: string[];
	mechanism: string;
	verification: string[];
	risks: string[];
	issue?: string;
	exception?: { production: number; productionBytes: number };
};

type Result = { ok: true; title: string; body: string } | { ok: false; reason: string };
const BRANCH_BADGES: Record<string, string> = { feat: "FEAT", feature: "FEAT", fix: "FIX", docs: "DOCS", test: "TEST", chore: "CHORE", refactor: "REFACTOR", perf: "PERF" };

function oneLine(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function bullets(values: readonly string[]): string { return values.map((value) => `- ${oneLine(value)}`).join("\n"); }
function count(value: number, lang: Lang): string { return String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, lang === "en" ? "," : "."); }

export function composePrArtifact(input: PrArtifactInput, lang: Lang): Result {
	const title = oneLine(input.title).replace(/^\[\[[A-Z0-9_-]+\]\]\s*/u, "");
	const fromTitle = /^\[\[([A-Z0-9_-]+)\]\]/u.exec(input.title)?.[1];
	const badge = (input.badge ?? (fromTitle === "TAG" ? undefined : fromTitle) ?? BRANCH_BADGES[input.head.split("/")[0]!] ?? "CAMBIO").trim().toUpperCase();
	if (badge === "TAG" || !/^[A-Z][A-Z0-9_-]{1,19}$/u.test(badge)) return { ok: false, reason: "invalid PR badge" };
	if (!title || !oneLine(input.intent) || !input.mechanism.trim() || [input.changes, input.verification, input.risks].some((items) => !Array.isArray(items) || !items.length || items.some((item) => !oneLine(item)))) {
		return { ok: false, reason: "PR needs title, intent, changes, mechanism, checks and risks" };
	}
	if (input.issue && !/^(?:#\d+|[A-Z][A-Z0-9]+-\d+)$/u.test(input.issue)) return { ok: false, reason: "invalid issue reference" };
	const labels = prArtifactLabels(lang);
	const taggedTitle = `[[${badge}]] ${title}`;
	const exception = input.exception
		? `\n- ${lang === "en" ? "Approved review exception" : "Excepción de revisión aprobada"}: ${count(input.exception.production, lang)} ${lang === "en" ? "production lines" : "líneas"}, ${count(input.exception.productionBytes, lang)} bytes.`
		: "";
	const body = [
		taggedTitle,
		`> ${labels.intent}: ${oneLine(input.intent)}`,
		`## // 001. ${labels.sections[0]}\n${bullets(input.changes)}`,
		`## // 002. ${labels.sections[1]}\n${input.mechanism.trim()}`,
		`## // 003. ${labels.sections[2]}\n${bullets(input.verification)}`,
		`## // 004. ${labels.sections[3]}\n${bullets(input.risks)}${exception}`,
		...(input.issue ? [`Closes ${input.issue}`] : []),
	].join("\n\n") + "\n";
	return { ok: true, title: taggedTitle, body };
}
