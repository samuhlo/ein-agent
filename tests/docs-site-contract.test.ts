import { describe, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	parsePage,
	lintFrontmatter,
	lintHeadings,
	lintPendingBlocks,
	lintSourcesSection,
	lintLinks,
	lintLineRules,
	lintSectionPurity,
	lintPage,
	lintDocsTree,
	type PageContext,
} from "../ein-pi/agent/lib/docs-site-contract.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

function ctx(overrides: Partial<PageContext> = {}): PageContext {
	return {
		path: "00-start/overview.md",
		fileExists: () => true,
		linkExists: () => true,
		...overrides,
	};
}

// Página canónica: esqueleto puro, las siete secciones, un PENDIENTE-D cada una
// (En una frase, Para quién, Ruta rápida, y dos `###` bajo Detalles, Checklist).
function buildPage(overrides: { frontmatter?: string; body?: string } = {}): string {
	const frontmatter =
		overrides.frontmatter ??
		[
			"---",
			'title: "Overview · EIN"',
			'description: "Descripción corta"',
			'sources: ["README.md"]',
			'verified_rev: "0ae709d"',
			"---",
		].join("\n");

	const body =
		overrides.body ??
		[
			"",
			"# Overview",
			"",
			"## En una frase",
			"",
			":::caution[PENDIENTE-D]",
			"falta: x",
			"fuentes: README.md",
			"lineas: 1",
			":::",
			"",
			"## Para quién y qué aprenderás",
			"",
			":::caution[PENDIENTE-D]",
			"falta: x",
			"fuentes: README.md",
			"lineas: 1",
			":::",
			"",
			"## Ruta rápida",
			"",
			":::caution[PENDIENTE-D]",
			"falta: x",
			"fuentes: README.md",
			"lineas: 1",
			":::",
			"",
			"## Detalles",
			"",
			"### Sub",
			"",
			":::caution[PENDIENTE-D]",
			"falta: x",
			"fuentes: README.md",
			"lineas: 1",
			":::",
			"",
			"## Checklist",
			"",
			":::caution[PENDIENTE-D]",
			"falta: x",
			"fuentes: README.md",
			"lineas: 1",
			":::",
			"",
			"## Siguiente paso",
			"",
			"[Getting Started](../00-start/getting-started.md)",
			"",
			"## Fuentes",
			"",
			"- `README.md` — descripción",
		].join("\n");

	return `${frontmatter}\n${body}`;
}

describe("parsePage", () => {
	test("parsea 7 secciones ## y sus rangos de línea", () => {
		const page = parsePage("00-start/overview.md", buildPage());
		const l2 = page.sections.filter((s) => s.level === 2);
		expect(l2.length).toBe(7);
		expect(l2.map((s) => s.heading)).toEqual([
			"En una frase",
			"Para quién y qué aprenderás",
			"Ruta rápida",
			"Detalles",
			"Checklist",
			"Siguiente paso",
			"Fuentes",
		]);
	});

	test("frontmatter con 4 claves en orden", () => {
		const page = parsePage("x.md", buildPage());
		expect(page.frontmatter?.keys).toEqual(["title", "description", "sources", "verified_rev"]);
	});
});

describe("CT-1 frontmatter", () => {
	test("verified_rev con forma válida no emite issue (2f67c73 y 0ae709d)", () => {
		for (const rev of ["2f67c73", "0ae709d"]) {
			const content = buildPage({
				frontmatter: [
					"---",
					'title: "Overview · EIN"',
					'description: "Descripción corta"',
					'sources: ["README.md"]',
					`verified_rev: "${rev}"`,
					"---",
				].join("\n"),
			});
			const page = parsePage("x.md", content);
			const issues = lintFrontmatter(page, ctx());
			expect(issues.find((i) => i.code === "CT1_REV_SHAPE")).toBeUndefined();
		}
	});

	test("verified_rev con forma inválida emite CT1_REV_SHAPE", () => {
		const content = buildPage({
			frontmatter: [
				"---",
				'title: "Overview · EIN"',
				'description: "Descripción corta"',
				'sources: ["README.md"]',
				'verified_rev: "zzzzzzz"',
				"---",
			].join("\n"),
		});
		const page = parsePage("x.md", content);
		const issues = lintFrontmatter(page, ctx());
		expect(issues.some((i) => i.code === "CT1_REV_SHAPE")).toBe(true);
	});

	test("frontmatter con 3 claves emite CT1_KEY_COUNT y CT1_KEY_MISSING", () => {
		const content = buildPage({
			frontmatter: ["---", 'title: "Overview · EIN"', 'description: "Descripción corta"', 'sources: ["README.md"]', "---"].join(
				"\n",
			),
		});
		const page = parsePage("x.md", content);
		const issues = lintFrontmatter(page, ctx());
		expect(issues.some((i) => i.code === "CT1_KEY_COUNT")).toBe(true);
		expect(issues.some((i) => i.code === "CT1_KEY_MISSING")).toBe(true);
	});

	test("claves fuera de orden emiten CT1_KEY_ORDER", () => {
		const content = buildPage({
			frontmatter: [
				"---",
				'description: "Descripción corta"',
				'title: "Overview · EIN"',
				'sources: ["README.md"]',
				'verified_rev: "0ae709d"',
				"---",
			].join("\n"),
		});
		const page = parsePage("x.md", content);
		const issues = lintFrontmatter(page, ctx());
		expect(issues.some((i) => i.code === "CT1_KEY_ORDER")).toBe(true);
	});

	test("title sin sufijo · EIN emite CT1_TITLE_SUFFIX", () => {
		const content = buildPage({
			frontmatter: [
				"---",
				'title: "Overview"',
				'description: "Descripción corta"',
				'sources: ["README.md"]',
				'verified_rev: "0ae709d"',
				"---",
			].join("\n"),
		});
		const page = parsePage("x.md", content);
		expect(lintFrontmatter(page, ctx()).some((i) => i.code === "CT1_TITLE_SUFFIX")).toBe(true);
	});

	test("description larga emite CT1_DESCRIPTION_LENGTH", () => {
		const content = buildPage({
			frontmatter: [
				"---",
				'title: "Overview · EIN"',
				`description: "${"x".repeat(161)}"`,
				'sources: ["README.md"]',
				'verified_rev: "0ae709d"',
				"---",
			].join("\n"),
		});
		const page = parsePage("x.md", content);
		expect(lintFrontmatter(page, ctx()).some((i) => i.code === "CT1_DESCRIPTION_LENGTH")).toBe(true);
	});

	test("sources vacío emite CT1_SOURCES_EMPTY", () => {
		const content = buildPage({
			frontmatter: [
				"---",
				'title: "Overview · EIN"',
				'description: "Descripción corta"',
				"sources: []",
				'verified_rev: "0ae709d"',
				"---",
			].join("\n"),
		});
		const page = parsePage("x.md", content);
		expect(lintFrontmatter(page, ctx()).some((i) => i.code === "CT1_SOURCES_EMPTY")).toBe(true);
	});

	test("sources duplicado emite CT1_SOURCES_DUPLICATE", () => {
		const content = buildPage({
			frontmatter: [
				"---",
				'title: "Overview · EIN"',
				'description: "Descripción corta"',
				'sources: ["README.md", "README.md"]',
				'verified_rev: "0ae709d"',
				"---",
			].join("\n"),
		});
		const page = parsePage("x.md", content);
		expect(lintFrontmatter(page, ctx()).some((i) => i.code === "CT1_SOURCES_DUPLICATE")).toBe(true);
	});

	test("source inexistente emite CT1_SOURCE_NOT_FOUND", () => {
		const page = parsePage("x.md", buildPage());
		const issues = lintFrontmatter(page, ctx({ fileExists: () => false }));
		expect(issues.some((i) => i.code === "CT1_SOURCE_NOT_FOUND")).toBe(true);
	});
});

describe("CT-2 H1", () => {
	test("sin H1 emite CT2_MISSING_H1", () => {
		const content = buildPage({ body: "\nSin encabezado h1 aquí\n" });
		const page = parsePage("x.md", content);
		expect(lintHeadings(page).some((i) => i.code === "CT2_MISSING_H1")).toBe(true);
	});

	test("H1 que no coincide con title emite CT2_H1_MISMATCH", () => {
		const content = buildPage({ body: buildPage().split("\n").slice(6).join("\n").replace("# Overview", "# Otro título") });
		const page = parsePage("x.md", content);
		expect(lintHeadings(page).some((i) => i.code === "CT2_H1_MISMATCH")).toBe(true);
	});

	test("H1 correcto no emite issue CT2", () => {
		const page = parsePage("x.md", buildPage());
		expect(lintHeadings(page).some((i) => i.code.startsWith("CT2"))).toBe(false);
	});
});

describe("CT-3 secciones", () => {
	test("secciones desordenadas emiten CT3_SECTION_ORDER", () => {
		const lines = buildPage().split("\n");
		const swapped = lines
			.join("\n")
			.replace("## En una frase", "## __TMP__")
			.replace("## Checklist", "## En una frase")
			.replace("## __TMP__", "## Checklist");
		const page = parsePage("x.md", swapped);
		expect(lintHeadings(page).some((i) => i.code === "CT3_SECTION_ORDER")).toBe(true);
	});

	test("sección duplicada emite CT3_DUPLICATE_SECTION", () => {
		const content = buildPage().replace("## Checklist", "## Detalles");
		const page = parsePage("x.md", content);
		expect(lintHeadings(page).some((i) => i.code === "CT3_DUPLICATE_SECTION")).toBe(true);
	});

	test("sección faltante emite CT3_SECTION_MISSING", () => {
		const content = buildPage().replace("## Checklist", "## Otra cosa");
		const page = parsePage("x.md", content);
		expect(lintHeadings(page).some((i) => i.code === "CT3_SECTION_MISSING")).toBe(true);
	});

	test("prosa antes del primer ### bajo Detalles emite CT3_DETALLES_HAS_PROSA_BEFORE_SUBSECTION", () => {
		const content = buildPage().replace("## Detalles\n\n### Sub", "## Detalles\n\nAlgún párrafo\n\n### Sub");
		const page = parsePage("x.md", content);
		expect(lintHeadings(page).some((i) => i.code === "CT3_DETALLES_HAS_PROSA_BEFORE_SUBSECTION")).toBe(true);
	});
});

describe("SK pureza de sección", () => {
	test("SK-2: marcador + párrafo emite SK_MIXED_SECTION con línea", () => {
		const content = buildPage().replace(
			"## En una frase\n\n:::caution[PENDIENTE-D]\nfalta: x\nfuentes: README.md\nlineas: 1\n:::",
			"## En una frase\n\n:::caution[PENDIENTE-D]\nfalta: x\nfuentes: README.md\nlineas: 1\n:::\n\nPárrafo suelto residual.",
		);
		const page = parsePage("x.md", content);
		const issues = lintSectionPurity(page);
		const mixed = issues.find((i) => i.code === "SK_MIXED_SECTION");
		expect(mixed).toBeDefined();
		expect(typeof mixed?.line).toBe("number");
	});

	test("SK-3: sección redactada sin marcador no emite issue, state drafted", () => {
		const content = buildPage().replace(
			"## Checklist\n\n:::caution[PENDIENTE-D]\nfalta: x\nfuentes: README.md\nlineas: 1\n:::",
			"## Checklist\n\nYa redactado, tres párrafos de prosa aquí.",
		);
		const page = parsePage("x.md", content);
		const issues = lintSectionPurity(page);
		expect(issues.filter((i) => i.line !== undefined && page.sections.find((s) => s.heading === "Checklist" && i.line! >= s.startLine && i.line! <= s.endLine))).toEqual(
			issues.filter((i) => i.code !== "SK_MIXED_SECTION" && i.code !== "SK_EMPTY_SECTION" && false),
		);
		const checklist = page.sections.find((s) => s.heading === "Checklist");
		expect(checklist?.state).toBe("drafted");
	});

	test("SK-4: sección sin marcador y sin contenido emite SK_EMPTY_SECTION", () => {
		const content = buildPage().replace(
			"## Checklist\n\n:::caution[PENDIENTE-D]\nfalta: x\nfuentes: README.md\nlineas: 1\n:::",
			"## Checklist",
		);
		const page = parsePage("x.md", content);
		expect(lintSectionPurity(page).some((i) => i.code === "SK_EMPTY_SECTION")).toBe(true);
	});

	test("página con todo pending: state skeleton, ok true", () => {
		const ctxObj = ctx();
		const report = lintPage(buildPage(), ctxObj);
		expect(report.state).toBe("skeleton");
		expect(report.ok).toBe(true);
	});
});

describe("CT-4 bloques PENDIENTE-D", () => {
	test("bloque sin lineas: emite CT4_BLOCK_MISSING_KEY", () => {
		const content = buildPage().replace(
			":::caution[PENDIENTE-D]\nfalta: x\nfuentes: README.md\nlineas: 1\n:::\n\n## Para quién",
			":::caution[PENDIENTE-D]\nfalta: x\nfuentes: README.md\n:::\n\n## Para quién",
		);
		const page = parsePage("x.md", content);
		expect(lintPendingBlocks(page).some((i) => i.code === "CT4_BLOCK_MISSING_KEY")).toBe(true);
	});

	test("fuentes: con ruta ajena al frontmatter emite CT4_SOURCE_NOT_IN_FRONTMATTER", () => {
		const content = buildPage().replace("fuentes: README.md\nlineas: 1\n:::\n\n## Para quién", "fuentes: ruta/ficticia.md\nlineas: 1\n:::\n\n## Para quién");
		const page = parsePage("x.md", content);
		expect(lintPendingBlocks(page).some((i) => i.code === "CT4_SOURCE_NOT_IN_FRONTMATTER")).toBe(true);
	});
});

describe("CT-5 lista de Fuentes", () => {
	test("Fuentes desordenada/incompleta emite CT5_SOURCES_MISMATCH", () => {
		const content = buildPage({
			frontmatter: [
				"---",
				'title: "Overview · EIN"',
				'description: "Descripción corta"',
				'sources: ["a.md", "b.md"]',
				'verified_rev: "0ae709d"',
				"---",
			].join("\n"),
		}).replace("- `README.md` — descripción", "- `b.md` — descripción\n- `a.md` — descripción");
		const page = parsePage("x.md", content);
		expect(lintSourcesSection(page).some((i) => i.code === "CT5_SOURCES_MISMATCH")).toBe(true);
	});

	test("descripción vacía emite CT5_MISSING_DESCRIPTION", () => {
		const content = buildPage().replace("- `README.md` — descripción", "- `README.md` — ");
		const page = parsePage("x.md", content);
		expect(lintSourcesSection(page).some((i) => i.code === "CT5_MISSING_DESCRIPTION")).toBe(true);
	});
});

describe("CT-6 / CT-7 enlaces", () => {
	test("enlace a fichero inexistente emite CT6_BROKEN_LINK", () => {
		const page = parsePage("x.md", buildPage());
		const issues = lintLinks(page, ctx({ linkExists: () => false }));
		expect(issues.some((i) => i.code === "CT6_BROKEN_LINK")).toBe(true);
	});

	test("enlace que salta un elemento de la cadena emite CT7_CHAIN_MISMATCH", () => {
		const page = parsePage("x.md", buildPage());
		const issues = lintLinks(
			page,
			ctx({
				chain: { pages: ["overview.md", "context.md", "getting-started.md"], index: 0 },
				linkExists: () => true,
			}),
		);
		expect(issues.some((i) => i.code === "CT7_CHAIN_MISMATCH")).toBe(true);
	});

	test("enlace correcto en cadena no emite CT7_CHAIN_MISMATCH", () => {
		const page = parsePage("x.md", buildPage());
		const issues = lintLinks(
			page,
			ctx({
				chain: { pages: ["overview.md", "getting-started.md", "context.md"], index: 0 },
				linkExists: () => true,
			}),
		);
		expect(issues.some((i) => i.code === "CT7_CHAIN_MISMATCH")).toBe(false);
	});

	test("cierre en enlace cuando es el último elemento de la cadena emite CT7_CHAIN_MISMATCH", () => {
		const page = parsePage("x.md", buildPage());
		const issues = lintLinks(
			page,
			ctx({
				chain: { pages: ["a.md", "b.md", "overview.md"], index: 2 },
				linkExists: () => true,
			}),
		);
		expect(issues.some((i) => i.code === "CT7_CHAIN_MISMATCH")).toBe(true);
	});

	test("cierre en texto plano en el último elemento no emite issue", () => {
		const content = buildPage().replace(
			"[Getting Started](../00-start/getting-started.md)",
			"texto plano de cierre",
		);
		const page = parsePage("x.md", content);
		const issues = lintLinks(page, ctx({ chain: { pages: ["a.md", "b.md", "overview.md"], index: 2 } }));
		expect(issues.some((i) => i.code === "CT7_CHAIN_MISMATCH")).toBe(false);
	});
});

describe("CT-8 / CT-9 reglas por línea", () => {
	test("literal de versión emite CT8_VERSION_LITERAL", () => {
		const content = buildPage().replace("## En una frase", "## En una frase\n\nLa versión actual es v0.42.0.");
		const page = parsePage("x.md", content);
		expect(lintLineRules(page).some((i) => i.code === "CT8_VERSION_LITERAL")).toBe(true);
	});

	test("tag mal formado (minúsculas) emite CT9_TAG_MALFORMED", () => {
		const content = buildPage().replace("## En una frase", "## En una frase\n\nAlgo [beta-excluded] aquí.");
		const page = parsePage("x.md", content);
		expect(lintLineRules(page).some((i) => i.code === "CT9_TAG_MALFORMED")).toBe(true);
	});

	test("tag exacto [BETA-EXCLUDED] no emite issue", () => {
		const content = buildPage().replace("## En una frase", "## En una frase\n\nAlgo [BETA-EXCLUDED] aquí.");
		const page = parsePage("x.md", content);
		expect(lintLineRules(page).some((i) => i.code === "CT9_TAG_MALFORMED")).toBe(false);
	});
});

describe("lintPage agregador", () => {
	test("agrega todos los lints de una página", () => {
		const report = lintPage(buildPage(), ctx());
		expect(report.path).toBe("00-start/overview.md");
		expect(report.ok).toBe(true);
		expect(report.errors).toBe(0);
	});
});

describe("lintDocsTree sobre las 21 páginas reales", () => {
	test("las 21 páginas pasan con ok: true, census skeleton: 21", () => {
		const report = lintDocsTree(REPO_ROOT);
		if (!report.ok) {
			const failing = report.pages.filter((p) => !p.ok);
			const detail = failing
				.map((p) => `${p.path}: ${p.issues.filter((i) => i.level === "error").map((i) => `${i.code}@${i.line ?? "?"}`).join(", ")}`)
				.join("\n");
			throw new Error(`Páginas con errores:\n${detail}`);
		}
		expect(report.pages.length).toBe(21);
		expect(report.census).toEqual({ skeleton: 21, partial: 0, drafted: 0 });
	});

	test("lintDocsTree no escribe: los mtime de las 21 páginas no cambian", () => {
		const docsRoot = join(REPO_ROOT, "docs-site/src/content/docs");
		const pageFiles: string[] = [];
		const walk = (dir: string) => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const full = join(dir, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name.endsWith(".md")) pageFiles.push(full);
			}
		};
		walk(docsRoot);
		expect(pageFiles.length).toBe(21);

		const before = new Map(pageFiles.map((f) => [f, statSync(f).mtimeMs]));
		lintDocsTree(REPO_ROOT);
		const after = new Map(pageFiles.map((f) => [f, statSync(f).mtimeMs]));

		for (const f of pageFiles) {
			expect(after.get(f)).toBe(before.get(f) as number);
		}
	});
});
