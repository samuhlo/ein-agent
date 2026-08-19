// =============================================================================
// REVIEW FORECAST
// Mide el tamaño de un cambio para el Review Workload Guard: líneas de
// producción (lo que gatea) vs líneas de TESTS/generados (se reportan, no
// gatean). Es determinista — un `git diff --shortstat` con un pathspec fijo.
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
	// insertions + deletions en ficheros de test (reportado, no gatea).
	tests: number;
	// Rango medido: "<base>..HEAD" (comitado) o "working-tree" (staged+unstaged).
	range: string;
	// null si git falla (repo ausente, base inválida) — el llamante decide.
	ok: boolean;
};

// Suma insertions + deletions de la salida de `git diff --shortstat`:
//   " 3 files changed, 45 insertions(+), 12 deletions(-)"
function sumShortstat(output: string): number {
	const insertions = /(\d+) insertion/.exec(output);
	const deletions = /(\d+) deletion/.exec(output);
	return (insertions ? Number(insertions[1]) : 0) + (deletions ? Number(deletions[1]) : 0);
}

function diffShortstat(cwd: string, range: string[], pathspec: readonly string[]): number | null {
	try {
		const out = execFileSync("git", ["diff", "--shortstat", ...range, "--", ...pathspec], {
			cwd,
			encoding: "utf8",
			timeout: 10_000,
			maxBuffer: 1024 * 1024,
			shell: false,
		});
		return sumShortstat(out);
	} catch {
		return null;
	}
}

/**
 * Mide producción y tests de un cambio. Con `base`, mide `base..HEAD` (lo
 * comitado hacia un PR); sin él, el árbol de trabajo (staged + unstaged vs HEAD).
 */
export function reviewForecast(cwd: string, base?: string): ReviewForecast {
	// `base..HEAD` para lo comitado; `HEAD` a secas = staged + unstaged.
	const range = base && /^[\w./-]+$/.test(base) ? [`${base}..HEAD`] : ["HEAD"];
	const rangeLabel = base ? `${base}..HEAD` : "working-tree";
	const production = diffShortstat(cwd, range, [".", ...PRODUCTION_EXCLUDES]);
	const tests = diffShortstat(cwd, range, TEST_PATHSPEC);
	return {
		production: production ?? 0,
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
	return [
		`// review forecast (${forecast.range})`,
		`producción: ${forecast.production} · tests: +${forecast.tests} (reportado, no gatea) · budget: ${budget}`,
		over
			? `SUPERA el budget (${forecast.production} > ${budget}) → pregunta al usuario: PR único vs partir en PRs más pequeños.`
			: `dentro del budget (${forecast.production} ≤ ${budget}) → adelante con un PR.`,
	].join("\n");
}
