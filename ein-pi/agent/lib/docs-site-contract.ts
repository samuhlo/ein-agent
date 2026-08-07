// =============================================================================
// DOCS SITE CONTRACT
// Validador estructural de las páginas de `docs-site/src/content/docs/` contra
// el contrato CT-1..CT-9 / SK-1..SK-5 heredado de
// `openspec/changes/archive/docs-content-inventory/design.md` §B.
// Un parser (`parsePage`) produce un modelo inmutable; cada lint consume ese
// modelo y no toca el filesystem — lo que necesita del disco entra por
// `PageContext` (`fileExists`, `linkExists`). Solo `lintDocsTree` toca fs.
// =============================================================================

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, sep } from "node:path";

export type IssueLevel = "error" | "warning";
export type PageIssue = { level: IssueLevel; code: string; message: string; line?: number };

export type SectionRole = "content" | "structural";
export type SectionState = "pending" | "drafted" | "empty" | "structural";

export type PageSection = {
	heading: string;
	level: 2 | 3;
	role: SectionRole;
	state: SectionState;
	startLine: number; // 1-based, línea del encabezado
	endLine: number; // 1-based, última línea de la sección (inclusive)
};

export type PageFrontmatter = {
	keys: string[];
	title: string;
	description: string;
	sources: string[];
	verifiedRev: string;
};

export type PendingBlock = {
	startLine: number;
	endLine: number;
	keys: string[];
	falta?: string;
	fuentes?: string;
	lineas?: string;
	malformed: boolean;
};

export type ParsedPage = {
	path: string;
	lines: string[];
	frontmatter: PageFrontmatter | null;
	bodyStart: number; // índice 0-based de la primera línea del cuerpo (después de `---` de cierre)
	sections: PageSection[];
	blocks: PendingBlock[];
};

export type PageContext = {
	path: string; // ruta relativa a la raíz del repo
	fileExists: (repoRelativePath: string) => boolean;
	linkExists: (pageRelativePath: string) => boolean;
	chain?: { pages: string[]; index: number };
};

export type PageReport = {
	path: string;
	ok: boolean;
	state: "skeleton" | "partial" | "drafted";
	issues: PageIssue[];
	errors: number;
	warnings: number;
	sections: PageSection[];
};

export type TreeReport = {
	ok: boolean;
	pages: PageReport[];
	errors: number;
	warnings: number;
	census: { skeleton: number; partial: number; drafted: number };
};

export const CANONICAL_SECTIONS = [
	"En una frase",
	"Para quién y qué aprenderás",
	"Ruta rápida",
	"Detalles",
	"Checklist",
	"Siguiente paso",
	"Fuentes",
] as const;

const STRUCTURAL_HEADINGS = new Set(["Siguiente paso", "Fuentes", "Detalles"]);

function issue(level: IssueLevel, code: string, message: string, line?: number): PageIssue {
	return { level, code, message, line };
}

// -----------------------------------------------------------------------------
// parsePage — modelo puro, sin fs
// -----------------------------------------------------------------------------

export function parsePage(path: string, content: string): ParsedPage {
	const lines = content.split("\n");
	const frontmatter = parseFrontmatter(lines);
	const bodyStart = frontmatterBodyStart(lines);
	const sections = parseSections(lines, bodyStart);
	const blocks = parseBlocks(lines);
	return { path, lines, frontmatter, bodyStart, sections, blocks };
}

function frontmatterBodyStart(lines: string[]): number {
	if (lines[0] !== "---") return 0;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i] === "---") return i + 1;
	}
	return 0;
}

function parseFrontmatter(lines: string[]): PageFrontmatter | null {
	if (lines[0] !== "---") return null;
	let closeIdx = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i] === "---") {
			closeIdx = i;
			break;
		}
	}
	if (closeIdx === -1) return null;

	const keys: string[] = [];
	let title = "";
	let description = "";
	let sources: string[] = [];
	let verifiedRev = "";

	for (let i = 1; i < closeIdx; i++) {
		const raw = lines[i];
		const match = raw.match(/^([a-zA-Z_]+):\s*(.*)$/);
		if (!match) continue;
		const key = match[1];
		const value = match[2];
		keys.push(key);
		if (key === "title") title = stripQuotes(value);
		else if (key === "description") description = stripQuotes(value);
		else if (key === "sources") sources = parseSourcesArray(value);
		else if (key === "verified_rev") verifiedRev = stripQuotes(value);
	}

	return { keys, title, description, sources, verifiedRev };
}

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
	return trimmed;
}

function parseSourcesArray(value: string): string[] {
	const trimmed = value.trim();
	if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
	const inner = trimmed.slice(1, -1);
	if (inner.trim() === "") return [];
	return inner
		.split(",")
		.map((item) => stripQuotes(item.trim()))
		.filter((item) => item.length > 0);
}

function parseSections(lines: string[], bodyStart: number): PageSection[] {
	const headingIdx: { line: number; level: 2 | 3; heading: string }[] = [];
	for (let i = bodyStart; i < lines.length; i++) {
		const l3 = lines[i].match(/^### (.+)$/);
		const l2 = lines[i].match(/^## (.+)$/);
		if (l2) headingIdx.push({ line: i, level: 2, heading: l2[1].trim() });
		else if (l3) headingIdx.push({ line: i, level: 3, heading: l3[1].trim() });
	}

	const sections: PageSection[] = [];
	for (let i = 0; i < headingIdx.length; i++) {
		const cur = headingIdx[i];
		const next = headingIdx[i + 1];
		const endLine0 = next ? next.line - 1 : lines.length - 1;
		const role: SectionRole = STRUCTURAL_HEADINGS.has(cur.heading) ? "structural" : "content";
		sections.push({
			heading: cur.heading,
			level: cur.level,
			role,
			state: role === "structural" ? "structural" : "empty",
			startLine: cur.line + 1,
			endLine: endLine0 + 1,
		});
	}
	return sections;
}

function parseBlocks(lines: string[]): PendingBlock[] {
	const blocks: PendingBlock[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (!/^:::caution\[PENDIENTE-D\]$/.test(lines[i].trim()) && !/^:::caution\[.*\]$/.test(lines[i].trim())) continue;
		if (!/^:::caution\[PENDIENTE-D\]$/.test(lines[i].trim())) {
			// Marcador con forma incorrecta (caja, corchetes) — se registra malformado.
		}
		const startLine = i;
		let closeIdx = -1;
		for (let j = i + 1; j < lines.length; j++) {
			if (lines[j].trim() === ":::") {
				closeIdx = j;
				break;
			}
		}
		if (closeIdx === -1) {
			blocks.push({ startLine: startLine + 1, endLine: startLine + 1, keys: [], malformed: true });
			continue;
		}
		const keys: string[] = [];
		let falta: string | undefined;
		let fuentes: string | undefined;
		let lineas: string | undefined;
		let malformed = lines[i].trim() !== ":::caution[PENDIENTE-D]";
		for (let j = startLine + 1; j < closeIdx; j++) {
			const m = lines[j].match(/^([a-z]+):\s*(.*)$/);
			if (!m) {
				malformed = true;
				continue;
			}
			keys.push(m[1]);
			if (m[1] === "falta") falta = m[2];
			else if (m[1] === "fuentes") fuentes = m[2];
			else if (m[1] === "lineas") lineas = m[2];
		}
		blocks.push({ startLine: startLine + 1, endLine: closeIdx + 1, keys, falta, fuentes, lineas, malformed });
		i = closeIdx;
	}
	return blocks;
}

// -----------------------------------------------------------------------------
// CT-1 / CT-1b — frontmatter
// -----------------------------------------------------------------------------

const FRONTMATTER_EXPECTED_KEYS = ["title", "description", "sources", "verified_rev"];

export function lintFrontmatter(page: ParsedPage, ctx: PageContext): PageIssue[] {
	const issues: PageIssue[] = [];
	const fm = page.frontmatter;
	if (!fm) {
		issues.push(issue("error", "CT1_FORMAT", "La página no tiene frontmatter delimitado por `---`.", 1));
		return issues;
	}

	if (fm.keys.length !== FRONTMATTER_EXPECTED_KEYS.length) {
		issues.push(
			issue(
				"error",
				"CT1_KEY_COUNT",
				`El frontmatter tiene ${fm.keys.length} claves; se esperan exactamente ${FRONTMATTER_EXPECTED_KEYS.length}.`,
				1,
			),
		);
	}

	const missing = FRONTMATTER_EXPECTED_KEYS.filter((k) => !fm.keys.includes(k));
	for (const key of missing) {
		issues.push(issue("error", "CT1_KEY_MISSING", `Falta la clave \`${key}\` en el frontmatter.`, 1));
	}

	if (missing.length === 0 && fm.keys.length === FRONTMATTER_EXPECTED_KEYS.length) {
		const orderOk = fm.keys.every((k, i) => k === FRONTMATTER_EXPECTED_KEYS[i]);
		if (!orderOk) {
			issues.push(
				issue(
					"error",
					"CT1_KEY_ORDER",
					`El orden de claves debe ser ${FRONTMATTER_EXPECTED_KEYS.join(", ")}.`,
					1,
				),
			);
		}
	}

	if (!fm.title.endsWith(" · EIN")) {
		issues.push(issue("error", "CT1_TITLE_SUFFIX", "`title` debe terminar en ` · EIN`.", 2));
	}

	if (fm.description.length > 160) {
		issues.push(issue("error", "CT1_DESCRIPTION_LENGTH", "`description` debe tener 160 caracteres o menos.", 3));
	}

	if (fm.sources.length === 0) {
		issues.push(issue("error", "CT1_SOURCES_EMPTY", "`sources` no puede estar vacío.", 4));
	} else {
		const seen = new Set<string>();
		for (const src of fm.sources) {
			if (seen.has(src)) {
				issues.push(issue("error", "CT1_SOURCES_DUPLICATE", `Ruta duplicada en \`sources\`: ${src}`, 4));
			}
			seen.add(src);
		}
	}

	for (const src of fm.sources) {
		if (!ctx.fileExists(src)) {
			issues.push(issue("error", "CT1_SOURCE_NOT_FOUND", `La ruta de \`sources\` no existe: ${src}`, 4));
		}
	}

	if (!/^[0-9a-f]{7,40}$/.test(fm.verifiedRev)) {
		issues.push(issue("error", "CT1_REV_SHAPE", `\`verified_rev\` no tiene forma de SHA: ${fm.verifiedRev}`, 5));
	}

	return issues;
}

// -----------------------------------------------------------------------------
// CT-2 / CT-3 — encabezados
// -----------------------------------------------------------------------------

export function lintHeadings(page: ParsedPage): PageIssue[] {
	const issues: PageIssue[] = [];

	// CT-2: primer encabezado del cuerpo debe ser el H1 exacto.
	let h1Line = -1;
	for (let i = page.bodyStart; i < page.lines.length; i++) {
		if (page.lines[i].startsWith("# ")) {
			h1Line = i;
			break;
		}
		if (page.lines[i].trim() !== "") break;
	}
	if (h1Line === -1) {
		issues.push(issue("error", "CT2_MISSING_H1", "No se encontró un H1 al inicio del cuerpo.", page.bodyStart + 1));
	} else {
		const expectedTitle = page.frontmatter ? page.frontmatter.title.replace(/ · EIN$/, "") : "";
		const actual = page.lines[h1Line].slice(2).trim();
		if (actual !== expectedTitle) {
			issues.push(
				issue(
					"error",
					"CT2_H1_MISMATCH",
					`H1 "${actual}" no coincide con el título del frontmatter "${expectedTitle}".`,
					h1Line + 1,
				),
			);
		}
	}

	// CT-3: los siete `##` en orden, sin duplicados ni faltantes.
	const level2 = page.sections.filter((s) => s.level === 2);
	const headings = level2.map((s) => s.heading);

	const counts = new Map<string, number>();
	for (const h of headings) counts.set(h, (counts.get(h) ?? 0) + 1);
	for (const [h, count] of counts) {
		if (count > 1) {
			issues.push(issue("error", "CT3_DUPLICATE_SECTION", `Encabezado \`## ${h}\` aparece ${count} veces.`));
		}
	}

	const missing = CANONICAL_SECTIONS.filter((h) => !counts.has(h));
	for (const h of missing) {
		issues.push(issue("error", "CT3_SECTION_MISSING", `Falta el encabezado \`## ${h}\`.`));
	}

	if (missing.length === 0 && counts.size === CANONICAL_SECTIONS.length) {
		const orderOk = headings.every((h, i) => h === CANONICAL_SECTIONS[i]);
		if (!orderOk) {
			issues.push(
				issue(
					"error",
					"CT3_SECTION_ORDER",
					`Orden de encabezados incorrecto. Se esperaba: ${CANONICAL_SECTIONS.join(", ")}.`,
				),
			);
		}
	}

	// `## Detalles`: el cuerpo antes del primer `###` MUST estar vacío.
	const detalles = level2.find((s) => s.heading === "Detalles");
	if (detalles) {
		const firstChild = page.sections.find(
			(s) => s.level === 3 && s.startLine > detalles.startLine && s.startLine <= detalles.endLine,
		);
		const limit = firstChild ? firstChild.startLine - 1 : detalles.endLine;
		for (let ln = detalles.startLine + 1; ln <= limit; ln++) {
			const text = page.lines[ln - 1];
			if (text !== undefined && text.trim() !== "") {
				issues.push(
					issue(
						"error",
						"CT3_DETALLES_HAS_PROSA_BEFORE_SUBSECTION",
						"`## Detalles` tiene contenido antes del primer `###`.",
						ln,
					),
				);
				break;
			}
		}
	}

	return issues;
}

// -----------------------------------------------------------------------------
// CT-4 — bloques PENDIENTE-D
// -----------------------------------------------------------------------------

const BLOCK_EXPECTED_KEYS = ["falta", "fuentes", "lineas"];

export function lintPendingBlocks(page: ParsedPage): PageIssue[] {
	const issues: PageIssue[] = [];
	const sources = page.frontmatter?.sources ?? [];

	for (const block of page.blocks) {
		if (block.malformed) {
			issues.push(issue("error", "CT4_FORMAT", "Bloque `:::caution[PENDIENTE-D]` mal formado.", block.startLine));
			continue;
		}

		const missingKeys = BLOCK_EXPECTED_KEYS.filter((k) => !block.keys.includes(k));
		for (const k of missingKeys) {
			issues.push(issue("error", "CT4_BLOCK_MISSING_KEY", `Falta la clave \`${k}:\` en el bloque.`, block.startLine));
		}

		if (missingKeys.length === 0) {
			const orderOk = block.keys.length === BLOCK_EXPECTED_KEYS.length &&
				block.keys.every((k, i) => k === BLOCK_EXPECTED_KEYS[i]);
			if (!orderOk) {
				issues.push(
					issue("error", "CT4_BLOCK_KEY_ORDER", "Las claves del bloque deben ir en orden falta, fuentes, lineas.", block.startLine),
				);
			}
		}

		if (block.fuentes) {
			const fuentesRefs = block.fuentes.split(",").map((s) => s.trim()).filter(Boolean);
			for (const ref of fuentesRefs) {
				if (!sources.includes(ref)) {
					issues.push(
						issue(
							"error",
							"CT4_SOURCE_NOT_IN_FRONTMATTER",
							`\`fuentes:\` referencia "${ref}" que no está en \`sources\` del frontmatter.`,
							block.startLine,
						),
					);
				}
			}
		}
	}

	return issues;
}

// -----------------------------------------------------------------------------
// CT-5 — lista de Fuentes
// -----------------------------------------------------------------------------

export function lintSourcesSection(page: ParsedPage): PageIssue[] {
	const issues: PageIssue[] = [];
	const fuentesSection = page.sections.find((s) => s.heading === "Fuentes" && s.level === 2);
	if (!fuentesSection || !page.frontmatter) return issues;

	const itemRe = /^- `([^`]+)` — (.*)$/;
	const foundPaths: string[] = [];
	let hasMissingDescription = false;

	for (let ln = fuentesSection.startLine + 1; ln <= fuentesSection.endLine; ln++) {
		const text = page.lines[ln - 1];
		if (text === undefined || text.trim() === "") continue;
		const match = text.match(itemRe);
		if (match) {
			foundPaths.push(match[1]);
			if (match[2].trim() === "") hasMissingDescription = true;
		}
	}

	if (hasMissingDescription) {
		issues.push(issue("error", "CT5_MISSING_DESCRIPTION", "Un ítem de `## Fuentes` no tiene descripción.", fuentesSection.startLine));
	}

	const expected = page.frontmatter.sources;
	const sameOrder = expected.length === foundPaths.length && expected.every((p, i) => p === foundPaths[i]);
	if (!sameOrder) {
		issues.push(
			issue(
				"error",
				"CT5_SOURCES_MISMATCH",
				`\`## Fuentes\` no coincide en cantidad/orden con \`sources\` del frontmatter.`,
				fuentesSection.startLine,
			),
		);
	}

	return issues;
}

// -----------------------------------------------------------------------------
// CT-6 / CT-7 — enlaces y cadena de lectura
// -----------------------------------------------------------------------------

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

export function lintLinks(page: ParsedPage, ctx: PageContext): PageIssue[] {
	const issues: PageIssue[] = [];

	for (let i = 0; i < page.lines.length; i++) {
		const line = page.lines[i];
		let match: RegExpExecArray | null;
		LINK_RE.lastIndex = 0;
		while ((match = LINK_RE.exec(line)) !== null) {
			const target = match[2];
			if (!target.endsWith(".md")) continue;
			if (/^https?:\/\//.test(target)) continue;
			if (!ctx.linkExists(target)) {
				issues.push(issue("error", "CT6_BROKEN_LINK", `Enlace roto: ${target}`, i + 1));
			}
		}
	}

	const siguientePaso = page.sections.find((s) => s.heading === "Siguiente paso" && s.level === 2);
	if (siguientePaso) {
		const bodyLines: { text: string; line: number }[] = [];
		for (let ln = siguientePaso.startLine + 1; ln <= siguientePaso.endLine; ln++) {
			const text = page.lines[ln - 1];
			if (text !== undefined && text.trim() !== "") bodyLines.push({ text: text.trim(), line: ln });
		}

		if (bodyLines.length !== 1) {
			issues.push(
				issue("error", "CT7_FORMAT", "`## Siguiente paso` debe tener exactamente un enlace o una línea de texto plano.", siguientePaso.startLine),
			);
		} else {
			const [{ text, line }] = bodyLines;
			LINK_RE.lastIndex = 0;
			const linkMatch = LINK_RE.exec(text);
			const isLink = linkMatch !== null;

			if (ctx.chain) {
				const { pages, index } = ctx.chain;
				const isLast = index === pages.length - 1;
				if (isLast) {
					if (isLink) {
						issues.push(
							issue("error", "CT7_CHAIN_MISMATCH", "El último elemento de la cadena debe cerrar en texto plano, no en enlace.", line),
						);
					}
				} else {
					if (!isLink) {
						issues.push(
							issue("error", "CT7_CHAIN_MISMATCH", "`## Siguiente paso` debe enlazar al siguiente elemento de la cadena.", line),
						);
					} else {
						const target = linkMatch![2];
						const expectedNext = pages[index + 1];
						const targetBasename = target.split("/").pop();
						const expectedBasename = expectedNext.split("/").pop();
						if (targetBasename !== expectedBasename) {
							issues.push(
								issue("error", "CT7_CHAIN_MISMATCH", `El enlace debe apuntar a "${expectedNext}", no a "${target}".`, line),
							);
						}
					}
				}
			}
		}
	}

	return issues;
}

// -----------------------------------------------------------------------------
// CT-8 / CT-9 — reglas por línea
// -----------------------------------------------------------------------------

const VERSION_RE = /v?\d+\.\d+\.\d+/;
const TAG_EXACT = "[BETA-EXCLUDED]";
const TAG_LOOSE_RE = /\[[Bb][Ee][Tt][Aa][ -]?[Ee][Xx][Cc][Ll][Uu][Dd][Ee][Dd]\]/;

export function lintLineRules(page: ParsedPage): PageIssue[] {
	const issues: PageIssue[] = [];
	for (let i = page.bodyStart; i < page.lines.length; i++) {
		const line = page.lines[i];
		if (VERSION_RE.test(line)) {
			issues.push(issue("error", "CT8_VERSION_LITERAL", "Literal de versión encontrado en línea.", i + 1));
		}
		const looseMatch = line.match(TAG_LOOSE_RE);
		if (looseMatch && looseMatch[0] !== TAG_EXACT) {
			issues.push(issue("error", "CT9_TAG_MALFORMED", `Tag de exclusión mal formado: "${looseMatch[0]}".`, i + 1));
		}
	}
	return issues;
}

// -----------------------------------------------------------------------------
// SK — pureza de sección
// -----------------------------------------------------------------------------

export function lintSectionPurity(page: ParsedPage): PageIssue[] {
	const issues: PageIssue[] = [];

	for (const section of page.sections) {
		if (section.role !== "content") continue;

		const blocksInSection = page.blocks.filter(
			(b) => b.startLine > section.startLine && b.startLine <= section.endLine,
		);

		const residualLines: number[] = [];
		for (let ln = section.startLine + 1; ln <= section.endLine; ln++) {
			const text = page.lines[ln - 1];
			if (text === undefined || text.trim() === "") continue;
			const insideBlock = blocksInSection.some((b) => ln >= b.startLine && ln <= b.endLine);
			if (!insideBlock) residualLines.push(ln);
		}

		if (blocksInSection.length > 1) {
			issues.push(issue("error", "SK_MULTIPLE_MARKERS", `Sección "${section.heading}" tiene más de un bloque PENDIENTE-D.`, section.startLine));
			section.state = "pending";
			continue;
		}

		if (blocksInSection.length === 1) {
			if (residualLines.length > 0) {
				for (const ln of residualLines) {
					issues.push(issue("error", "SK_MIXED_SECTION", `Sección "${section.heading}" mezcla marcador y prosa.`, ln));
				}
			}
			section.state = "pending";
			continue;
		}

		// Sin marcador.
		if (residualLines.length === 0) {
			issues.push(issue("error", "SK_EMPTY_SECTION", `Sección "${section.heading}" está vacía sin marcador.`, section.startLine));
			section.state = "empty";
		} else {
			section.state = "drafted";
		}
	}

	return issues;
}

function derivePageState(sections: PageSection[]): "skeleton" | "partial" | "drafted" {
	const contentSections = sections.filter((s) => s.role === "content");
	if (contentSections.length === 0) return "drafted";
	const allPending = contentSections.every((s) => s.state === "pending");
	if (allPending) return "skeleton";
	const nonePending = contentSections.every((s) => s.state !== "pending");
	if (nonePending) return "drafted";
	return "partial";
}

// -----------------------------------------------------------------------------
// Agregadores
// -----------------------------------------------------------------------------

export function lintPage(content: string, ctx: PageContext): PageReport {
	const page = parsePage(ctx.path, content);
	const issues: PageIssue[] = [
		...lintFrontmatter(page, ctx),
		...lintHeadings(page),
		...lintPendingBlocks(page),
		...lintSourcesSection(page),
		...lintLinks(page, ctx),
		...lintLineRules(page),
		...lintSectionPurity(page),
	];

	const errors = issues.filter((i) => i.level === "error").length;
	const warnings = issues.filter((i) => i.level === "warning").length;

	return {
		path: ctx.path,
		ok: errors === 0,
		state: derivePageState(page.sections),
		issues,
		errors,
		warnings,
		sections: page.sections,
	};
}

// Dos cadenas de lectura declaradas sobre el árbol real (map.md notas de tasks.md).
const READING_CHAINS: string[][] = [
	[
		"00-start/overview.md",
		"00-start/getting-started.md",
		"00-start/first-run.md",
		"01-concepts/orchestrator.md",
		"01-concepts/sdd-openspec.md",
		"01-concepts/context.md",
		"01-concepts/deterministic-boundaries.md",
		"02-workflow/workflow-overview.md",
		"02-workflow/artifacts.md",
		"02-workflow/real-workflow-example.md",
	],
	[
		"03-runtimes/runtime-overview.md",
		"03-runtimes/pi-coding-agent.md",
		"03-runtimes/claude-code.md",
		"03-runtimes/runtime-matrix.md",
		"04-reference/cli.md",
		"04-reference/filesystem.md",
		"04-reference/optional-tooling.md",
		"05-debug/doctor.md",
		"05-debug/troubleshooting.md",
		"05-debug/uninstall-recovery.md",
	],
];

function chainForPage(relativePath: string): { pages: string[]; index: number } | undefined {
	for (const chain of READING_CHAINS) {
		const index = chain.indexOf(relativePath);
		if (index !== -1) return { pages: chain, index };
	}
	return undefined;
}

export function lintDocsTree(repoRoot: string, docsDir = "docs-site/src/content/docs"): TreeReport {
	const absoluteDocsDir = join(repoRoot, docsDir);
	const files = listMarkdownFiles(absoluteDocsDir);

	const pages: PageReport[] = [];
	for (const absPath of files) {
		const relToDocsDir = relative(absoluteDocsDir, absPath).split(sep).join("/");
		const content = readFileSync(absPath, "utf8");
		const ctx: PageContext = {
			path: relToDocsDir,
			fileExists: (repoRelativePath: string) => existsSync(join(repoRoot, repoRelativePath)),
			linkExists: (pageRelativePath: string) => existsSync(resolve(dirname(absPath), pageRelativePath)),
			chain: chainForPage(relToDocsDir),
		};
		pages.push(lintPage(content, ctx));
	}

	pages.sort((a, b) => a.path.localeCompare(b.path));

	const errors = pages.reduce((sum, p) => sum + p.errors, 0);
	const warnings = pages.reduce((sum, p) => sum + p.warnings, 0);
	const census = { skeleton: 0, partial: 0, drafted: 0 };
	for (const p of pages) census[p.state]++;

	return { ok: errors === 0, pages, errors, warnings, census };
}

function listMarkdownFiles(dir: string): string[] {
	const result: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) result.push(...listMarkdownFiles(full));
		else if (entry.isFile() && entry.name.endsWith(".md")) result.push(full);
	}
	return result;
}
