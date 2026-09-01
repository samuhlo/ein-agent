// =============================================================================
// REVIEW FORECAST
// Mide el tamaño de un cambio para el Review Workload Guard: líneas y volumen
// de producción frente a líneas de tests (se reportan, no gatean). Git decide
// qué cambió mediante un único pathspec; este módulo traduce el diff a datos.
//
// Antes esta medición vivía como STRING DE PROMPT en TRES sitios (orchestrator,
// ein-git, preflight), ejecutada inline por el parent caro, con un test
// anti-drift vigilando que las 3 copias no se desincronizaran. Ahora el pathspec
// vive UNA vez, aquí, y el parent llama a la tool `ein_review_forecast` en vez
// de ejecutar git — el comandante manda, la tool mide.
// =============================================================================

import { execFileSync } from "node:child_process";

// Excluye tests y generados de la cuenta de PRODUCCIÓN. Fuente única del
// pathspec: si cambia, cambia aquí y en ningún otro sitio.
const PRODUCTION_EXCLUDES = [
	":(exclude)*.test.*",
	":(exclude)*.spec.*",
	":(exclude)**/tests/**",
	":(exclude)**/__tests__/**",
	":(exclude)**/e2e/**",
	":(exclude)*.snap",
	":(exclude)*-lock.*",
	":(exclude)dist/**",
	":(exclude).output/**",
	":(exclude).nuxt/**",
	":(exclude)coverage/**",
	":(exclude)*.min.*",
	":(exclude)openspec/**",
] as const;

// Solo tests: se reportan aparte (`+N en tests`), nunca cuentan para el budget.
const TEST_PATHSPEC = ["*.test.*", "*.spec.*", "**/tests/**"] as const;

export type ReviewForecast = {
	// insertions + deletions en ficheros de producción (lo que gatea el budget).
	production: number;
	// Bytes UTF-8 no blancos en líneas añadidas y eliminadas de producción.
	productionBytes: number;
	// Ficheros distintos de producción tocados por el rango.
	productionFiles: number;
	// Volumen localizado. Informa; en esta primera entrega no bloquea.
	fileVolumes: ReviewFileVolume[];
	// insertions + deletions en ficheros de test (reportado, no gatea).
	tests: number;
	// Rango medido: "<base>..HEAD" (comitado) o "working-tree" (staged+unstaged).
	range: string;
	// null si git falla (repo ausente, base inválida) — el llamante decide.
	ok: boolean;
};

export type ReviewFileVolume = {
	path: string;
	changedLines: number;
	changedBytes: number;
	bytesPerLine: number;
};

type DiffFile = {
	path: string;
	changedLines: number;
};

function gitDiff(
	cwd: string,
	range: string[],
	options: readonly string[],
	pathspec: readonly string[],
): string | null {
	try {
		return execFileSync("git", ["diff", ...options, ...range, "--", ...pathspec], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 10_000,
			maxBuffer: 16 * 1024 * 1024,
			shell: false,
		});
	} catch {
		return null;
	}
}

// `--numstat -z` deja las rutas sin escapar. En un rename, la primera entrada
// termina tras el segundo tab y Git añade origen y destino como dos campos NUL.
function parseNumstat(output: string): DiffFile[] | null {
	const entries = output.split("\0");
	const files: DiffFile[] = [];
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index];
		if (!entry) continue;
		const firstTab = entry.indexOf("\t");
		const secondTab = entry.indexOf("\t", firstTab + 1);
		if (firstTab < 0 || secondTab < 0) return null;

		const addedText = entry.slice(0, firstTab);
		const deletedText = entry.slice(firstTab + 1, secondTab);
		let path = entry.slice(secondTab + 1);
		if (!path) {
			const oldPath = entries[index + 1];
			const newPath = entries[index + 2];
			if (!oldPath || !newPath) return null;
			path = newPath;
			index += 2;
		}

		const added = /^\d+$/.test(addedText) ? Number(addedText) : 0;
		const deleted = /^\d+$/.test(deletedText) ? Number(deletedText) : 0;
		files.push({ path, changedLines: added + deleted });
	}
	return files;
}

function changedBytes(section: string): number {
	let inHunk = false;
	let bytes = 0;
	for (const line of section.split("\n")) {
		if (line.startsWith("@@")) {
			inHunk = true;
			continue;
		}
		if (!inHunk || (line[0] !== "+" && line[0] !== "-")) continue;
		const content = line.slice(1).replace(/\s/gu, "");
		bytes += Buffer.byteLength(content, "utf8");
	}
	return bytes;
}

function measureProduction(
	cwd: string,
	range: string[],
): { lines: number; bytes: number; files: ReviewFileVolume[] } | null {
	const pathspec = [".", ...PRODUCTION_EXCLUDES];
	const numstat = gitDiff(cwd, range, ["--numstat", "-z"], pathspec);
	const patch = gitDiff(cwd, range, ["--no-color", "--no-ext-diff", "--unified=0"], pathspec);
	if (numstat === null || patch === null) return null;

	const diffFiles = parseNumstat(numstat);
	if (diffFiles === null) return null;
	const sections = patch.length === 0 ? [] : patch.split(/^diff --git /mu).slice(1);
	if (sections.length !== diffFiles.length) return null;

	const files = diffFiles.map((file, index) => {
		const bytes = changedBytes(sections[index] ?? "");
		const bytesPerLine = file.changedLines === 0
			? 0
			: Math.round((bytes / file.changedLines) * 100) / 100;
		return {
			path: file.path,
			changedLines: file.changedLines,
			changedBytes: bytes,
			bytesPerLine,
		};
	});

	return {
		lines: files.reduce((sum, file) => sum + file.changedLines, 0),
		bytes: files.reduce((sum, file) => sum + file.changedBytes, 0),
		files,
	};
}

function measureTestLines(cwd: string, range: string[]): number | null {
	const output = gitDiff(cwd, range, ["--numstat", "-z"], TEST_PATHSPEC);
	if (output === null) return null;
	const files = parseNumstat(output);
	return files?.reduce((sum, file) => sum + file.changedLines, 0) ?? null;
}

function formatInteger(value: number): string {
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Mide producción y tests de un cambio. Con `base`, mide `base..HEAD` (lo
 * comitado hacia un PR); sin él, el árbol de trabajo (staged + unstaged vs HEAD).
 */
export function reviewForecast(cwd: string, base?: string): ReviewForecast {
	// `base..HEAD` para lo comitado; `HEAD` a secas = staged + unstaged.
	const range = base && /^[\w./-]+$/.test(base) ? [`${base}..HEAD`] : ["HEAD"];
	const rangeLabel = base ? `${base}..HEAD` : "working-tree";
	const production = measureProduction(cwd, range);
	const tests = measureTestLines(cwd, range);
	return {
		production: production?.lines ?? 0,
		productionBytes: production?.bytes ?? 0,
		productionFiles: production?.files.length ?? 0,
		fileVolumes: production?.files ?? [],
		tests: tests ?? 0,
		range: rangeLabel,
		ok: production !== null && tests !== null,
	};
}

// Render compacto para el envelope del tool: una línea que el parent lee.
export function formatReviewForecast(forecast: ReviewForecast, budget: number): string {
	if (!forecast.ok) {
		return "// review forecast — no medible (¿repo git?, ¿base válida?). Mide a ojo o nombra un base.";
	}
	const over = forecast.production > budget;
	const productionUnit = forecast.productionFiles === 1 ? "fichero" : "ficheros";
	const volume = [
		`${forecast.production} líneas`,
		`${formatInteger(forecast.productionBytes)} bytes no blancos`,
		`${forecast.productionFiles} ${productionUnit}`,
	].join(" · ");
	return [
		`// review forecast (${forecast.range})`,
		`producción: ${volume}`,
		`tests: +${forecast.tests} líneas (reportado, no gatea) · budget: ${budget} líneas`,
		over
			? `SUPERA el budget (${forecast.production} > ${budget}) → pregunta al usuario: PR único vs partir en PRs más pequeños.`
			: `dentro del budget (${forecast.production} ≤ ${budget}) → adelante con un PR.`,
	].join("\n");
}
