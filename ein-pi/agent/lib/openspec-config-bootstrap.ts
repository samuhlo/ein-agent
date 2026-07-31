import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// =============================================================================
// OPEN SPEC CONFIG BOOTSTRAP
// Garantiza que `openspec/config.yaml` existe con un scaffold útil para el flujo
// SDD. NO adivina el stack con heurísticas multi-lenguaje: eso lo hacía peor que
// el modelo y que EIN.md, y en la práctica dejaba el `test_command` vacío en
// proyectos que sí tenían tests.
//
// En su lugar rellena los comandos desde la fuente AUTORITATIVA —los `scripts`
// de package.json— más un puñado de fallbacks para runners que no declaran
// script (bunfig/bun.lockb → `bun test`, vitest.config → `vitest run`,
// tsconfig → `tsc --noEmit`). Lo que no puede determinar lo deja vacío con un
// marcador explícito; el `sdd-scope` (el cerebro) lo completa leyendo el
// proyecto. El `context` apunta a EIN.md en vez de duplicar su detección.
//
// El único requisito duro del código determinista es que el fichero EXISTA; su
// contenido lo consumen los agentes (el modelo), no lógica de TS.
// =============================================================================

const CONFIG_REL_PATH = "openspec/config.yaml";

interface PackageJson {
	name?: string;
	scripts?: Record<string, string>;
}

export interface Detection {
	projectName: string;
	packageManager: string;
	testCommand: string;
	buildCommand: string;
	typecheckCommand: string;
	lintCommand: string;
	formatCommand: string;
	coverageCommand: string;
	source: string;
}

function readJson<T>(path: string): T | undefined {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		return undefined;
	}
}

function hasFile(cwd: string, rel: string): boolean {
	return existsSync(join(cwd, rel));
}

function yamlString(value: string): string {
	return JSON.stringify(value);
}

// bun | pnpm | yarn | npm, por el lockfile/marcador presente.
function detectPackageManager(cwd: string): string {
	if (hasFile(cwd, "bun.lockb") || hasFile(cwd, "bunfig.toml")) return "bun";
	if (hasFile(cwd, "pnpm-lock.yaml")) return "pnpm";
	if (hasFile(cwd, "yarn.lock")) return "yarn";
	if (hasFile(cwd, "package-lock.json") || hasFile(cwd, "package.json")) return "npm";
	return "";
}

// Primer script que exista de una lista de alias, como `<pm> run <script>`.
function scriptCommand(pm: string, scripts: Record<string, string> | undefined, names: string[]): string {
	if (!scripts) return "";
	const name = names.find((n) => typeof scripts[n] === "string" && scripts[n].trim().length > 0);
	return name ? `${pm || "npm"} run ${name}` : "";
}

// Runner implícito para proyectos que corren tests sin declarar un script.
function detectTestFallback(cwd: string): string {
	if (hasFile(cwd, "bunfig.toml") || hasFile(cwd, "bun.lockb")) return "bun test";
	for (const config of ["vitest.config.ts", "vitest.config.js", "vitest.config.mjs", "vitest.config.mts"]) {
		if (hasFile(cwd, config)) return "vitest run";
	}
	if (hasFile(cwd, "jest.config.ts") || hasFile(cwd, "jest.config.js")) return "jest";
	return "";
}

function detectProject(cwd: string): Detection {
	const pm = detectPackageManager(cwd);
	const pkg = readJson<PackageJson>(join(cwd, "package.json"));
	const scripts = pkg?.scripts;

	const testFromScript = scriptCommand(pm, scripts, ["test"]);
	const testCommand = testFromScript || detectTestFallback(cwd);
	const typecheckFromScript = scriptCommand(pm, scripts, ["typecheck", "type-check", "tsc"]);
	const typecheckCommand = typecheckFromScript || (hasFile(cwd, "tsconfig.json") ? "tsc --noEmit" : "");

	const source = testFromScript
		? "package.json scripts"
		: testCommand
			? "package.json scripts + runner implícito"
			: pkg
				? "package.json (sin script de test)"
				: "sin package.json en la raíz";

	return {
		projectName: pkg?.name ?? basename(cwd),
		packageManager: pm,
		testCommand,
		buildCommand: scriptCommand(pm, scripts, ["build"]),
		typecheckCommand,
		lintCommand: scriptCommand(pm, scripts, ["lint"]),
		formatCommand: scriptCommand(pm, scripts, ["format", "fmt"]),
		coverageCommand: scriptCommand(pm, scripts, ["coverage", "test:coverage"]),
		source,
	};
}

function renderConfig(detection: Detection): string {
	// FAIL CLOSED -> strict_tdd solo si hay un test runner real; sin él, prometer
	// RED/GREEN sería mentir. Lo que quede vacío lo completa el sdd-scope.
	const test = detection.testCommand;
	const strictTdd = Boolean(test);
	const today = new Date().toISOString().slice(0, 10);
	// Un valor rellenado se escribe tal cual; uno vacío deja marcador explícito.
	const line = (key: string, value: string): string =>
		value ? `${key}: ${yamlString(value)}` : `${key}: ""  # vacío: el sdd-scope lo rellena leyendo el proyecto`;

	return [
		`strict_tdd: ${strictTdd}`,
		"context: |",
		"  Verdad de base del proyecto: ver EIN.md (stack, comandos, arquitectura, convenciones).",
		`  Bootstrap detectó: package manager ${detection.packageManager || "desconocido"}; comandos desde ${detection.source}.`,
		"rules:",
		"  design:",
		"    require_problem_statement: true",
		"    require_acceptance_criteria: true",
		"  apply:",
		`    ${line("test_command", test)}`,
		"  verify:",
		`    ${line("test_command", test)}`,
		"testing:",
		`  detected: ${yamlString(today)}`,
		"  runner:",
		`    ${line("command", test)}`,
		"quality:",
		`  ${line("typecheck", detection.typecheckCommand)}`,
		`  ${line("lint", detection.lintCommand)}`,
		`  ${line("format", detection.formatCommand)}`,
		`  ${line("coverage", detection.coverageCommand)}`,
		`  ${line("build", detection.buildCommand)}`,
		"",
	].join("\n");
}

function ensureOpenSpecDirs(cwd: string): void {
	mkdirSync(join(cwd, "openspec", "specs"), { recursive: true });
	mkdirSync(join(cwd, "openspec", "changes", "archive"), { recursive: true });
}

export type OpenSpecConfigBootstrapResult =
	| { kind: "created"; detection: Detection }
	| { kind: "preserved" };

export function bootstrapOpenSpecConfig(cwd: string): OpenSpecConfigBootstrapResult {
	const configPath = join(cwd, CONFIG_REL_PATH);
	if (existsSync(configPath)) return { kind: "preserved" };

	const detection = detectProject(cwd);
	ensureOpenSpecDirs(cwd);
	mkdirSync(dirname(configPath), { recursive: true });
	try {
		writeFileSync(configPath, renderConfig(detection), { flag: "wx" });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") return { kind: "preserved" };
		throw error;
	}
	return { kind: "created", detection };
}
