import { extname } from "node:path";
import typescript, { type ScriptKind as TypeScriptScriptKind } from "typescript";

const { ScriptKind } = typescript;

export type CleanerScriptRegion = Readonly<{ start: number; end: number; kind: TypeScriptScriptKind }>;

const KINDS = new Map<string, TypeScriptScriptKind>([[".js", ScriptKind.JS], [".mjs", ScriptKind.JS], [".cjs", ScriptKind.JS], [".jsx", ScriptKind.JSX], [".ts", ScriptKind.TS], [".mts", ScriptKind.TS], [".cts", ScriptKind.TS], [".tsx", ScriptKind.TSX]]);

function attributes(raw: string): Readonly<Record<string, string | true>> {
	const output: Record<string, string | true> = {}; let offset = 0; const token = /\s+([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
	while (offset < raw.length) { token.lastIndex = offset; const match = token.exec(raw); if (!match) throw new Error("Malformed script attributes"); const key = match[1]!.toLowerCase(); if (key in output) throw new Error("Duplicate script attribute"); output[key] = match[2] ?? match[3] ?? match[4] ?? true; offset = token.lastIndex; }
	return output;
}

function language(value: string | true | undefined, fallback: "js" | "ts" = "js"): TypeScriptScriptKind {
	const lang = value === undefined ? fallback : value; if (typeof lang !== "string" || !["js", "jsx", "ts", "tsx"].includes(lang)) throw new Error("Unsupported script language");
	return lang === "tsx" ? ScriptKind.TSX : lang === "jsx" ? ScriptKind.JSX : lang === "ts" ? ScriptKind.TS : ScriptKind.JS;
}

function taggedRegions(source: string, mode: "vue" | "astro"): CleanerScriptRegion[] {
	const regions: CleanerScriptRegion[] = []; const seen = new Set<string>(); const open = /<script\b([^>]*)>/gi; let match: RegExpExecArray | null;
	while ((match = open.exec(source))) { const properties = attributes(match[1]!); if (properties.src !== undefined) throw new Error("External script source is unsupported"); if (mode === "astro" && properties.type !== undefined && properties.type !== "module") throw new Error("Unsupported Astro script type"); const key = properties.setup === undefined ? "script" : "script-setup"; if (mode === "vue" && (properties.setup !== undefined && properties.setup !== true || seen.has(key))) throw new Error("Ambiguous Vue script blocks"); seen.add(key); const close = /<\/script\s*>/gi; close.lastIndex = open.lastIndex; const end = close.exec(source); if (!end) throw new Error("Unclosed script block"); regions.push({ start: open.lastIndex, end: end.index, kind: language(properties.lang) }); open.lastIndex = close.lastIndex; }
	const tags = source.match(/<\/?script\b/gi)?.length ?? 0; if (tags !== regions.length * 2) throw new Error("Malformed or ambiguous script tags"); return regions;
}

export function cleanerScriptRegions(path: string, source: string): CleanerScriptRegion[] {
	const direct = KINDS.get(extname(path).toLowerCase()); if (direct !== undefined) return [{ start: 0, end: source.length, kind: direct }];
	if (extname(path).toLowerCase() === ".vue") return taggedRegions(source, "vue");
	if (extname(path).toLowerCase() !== ".astro") throw new Error("Unsupported Cleaner source");
	const result: CleanerScriptRegion[] = []; let bodyStart = 0; if (source.startsWith("---\n") || source.startsWith("---\r\n")) { const firstEnd = source.indexOf("\n") + 1; const close = /^(---)\r?$/gm; close.lastIndex = firstEnd; const match = close.exec(source); if (!match) throw new Error("Unclosed Astro frontmatter"); result.push({ start: firstEnd, end: match.index, kind: ScriptKind.TS }); bodyStart = close.lastIndex; }
	else if (/^---\r?$/m.test(source)) throw new Error("Ambiguous Astro frontmatter delimiter");
	return [...result, ...taggedRegions(source.slice(bodyStart), "astro").map((region) => ({ ...region, start: region.start + bodyStart, end: region.end + bodyStart }))];
}

export function padCleanerScriptRegion(source: string, region: CleanerScriptRegion): string { return source.slice(0, region.start).replace(/[^\r\n]/g, " ") + source.slice(region.start, region.end); }
