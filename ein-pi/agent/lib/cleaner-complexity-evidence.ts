import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import typescript, {
	type FunctionLikeDeclaration, type Node, type SourceFile,
} from "typescript";

import type { CleanerEnvironmentEvidence } from "./cleaner-environment-evidence.ts";
import { cleanerScriptRegions, padCleanerScriptRegion, type CleanerScriptRegion } from "./cleaner-script-regions.ts";
import { projectProjectState } from "./project-state.ts";

export const CLEANER_COMPLEXITY_EVIDENCE_VERSION = "cleaner-complexity-evidence/v1" as const;
const { createSourceFile, forEachChild, ScriptTarget, SyntaxKind } = typescript;
export const CLEANER_COMPLEXITY_DEFINITION = Object.freeze({
	id: "cyclomatic-js-ts/v1",
	base: 1,
	increments: Object.freeze(["if", "loop", "case-non-default", "catch", "conditional", "logical-and", "logical-or", "nullish-coalescing"]),
	nestedFunctions: "excluded-from-parent",
	optionalChains: "not-counted",
	topLevel: "omitted",
	vue: "script-and-script-setup-only; lang js/jsx/ts/tsx; no template expressions",
	astro: "initial frontmatter and inline script only; lang js/jsx/ts/tsx; type absent/module; no template expressions",
} as const);

type Limits = { maxFiles: number; maxBytes: number; maxFunctions: number; maxAstNodes: number; maxDurationMs: number };
// maxDurationMs: 5000, no 500. Es el ÚNICO presupuesto que depende de la
// máquina — el resto (ficheros, bytes, tokens, ventanas, pares, nodos AST) son
// deterministas y son los que de verdad acotan el trabajo: a escala máxima,
// duplicación aborta por pares candidatos y complejidad tarda ~70 ms medidos.
// Con 500 ms, un runner de CI cargado (10x más lento) convertía una recogida
// correcta en un fallo: tres veces en una semana. La duración solo tiene que
// cazar patología que se cuele entre los presupuestos de conteo, y 5 s sobre un
// peor caso medido de 70 ms sigue haciéndolo.
const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({ maxFiles: 32, maxBytes: 1024 * 1024, maxFunctions: 10_000, maxAstNodes: 200_000, maxDurationMs: 5_000 });
type Category = typeof CLEANER_COMPLEXITY_DEFINITION.increments[number];
type Span = Readonly<{ startLine: number; startColumn: number; endLine: number; endColumn: number }>;
export type CleanerFunctionComplexity = Readonly<{ identity: string; displayName: string; path: string; span: Span; syntaxKind: string; complexity: number; decisions: Readonly<{ total: number; categories: Readonly<Partial<Record<Category, number>>> }>; coverageMapping: Readonly<{ declarationLine: number; confidence: "exact-ast-span"; ambiguous: boolean }> }>;
export type CleanerComplexityEvidence = Readonly<{
	version: typeof CLEANER_COMPLEXITY_EVIDENCE_VERSION; collectorKind: "function-cyclomatic-complexity"; definition: typeof CLEANER_COMPLEXITY_DEFINITION;
	sourceState: Readonly<{ kind: "git-state"; stateRef: string; freshness: "current" }>; scope: Readonly<{ identity: string; files: readonly Readonly<{ path: string; sha256: string }>[] }>;
	functions: readonly CleanerFunctionComplexity[]; aggregate: Readonly<{ count: number; max: number | null; distribution: readonly Readonly<{ complexity: number; count: number }>[] }>;
	budget: Readonly<Limits & { observedFiles: number; observedBytes: number; observedFunctions: number; observedAstNodes: number; durationExceeded: boolean }>;
	outputIdentity: Readonly<{ algorithm: "sha256"; digest: string }>;
}>;

const FUNCTION_KINDS = new Set([SyntaxKind.FunctionDeclaration, SyntaxKind.FunctionExpression, SyntaxKind.ArrowFunction, SyntaxKind.MethodDeclaration, SyntaxKind.GetAccessor, SyntaxKind.SetAccessor, SyntaxKind.Constructor]);
function hash(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
// El presupuesto de duración se REPORTA al terminar; no se lanza. Antes el check
// final juntaba dos hechos distintos en un solo `throw`:
//   · el stateRef cambió = la evidencia describe un árbol que ya no existe.
//     Es correctitud, y sigue siendo fatal (fail closed).
//   · tardó de más = rendimiento. Al llegar al final el trabajo YA está hecho y
//     es válido para el estado que midió; tirarlo solo desperdicia lo gastado, y
//     en un runner cargado convertía una ejecución correcta en un fallo.
// La protección contra runaway no cambia: sigue lanzando DENTRO de los bucles,
// que es donde abortar aún ahorra algo. Mismo patrón que cleaner-test-evidence,
// que ya reportaba `durationExceeded` como booleano.
function expired(started: number, limits: Limits): boolean { return performance.now() - started > limits.maxDurationMs; }
function inside(root: string, target: string): boolean { const value = relative(root, target); return value !== "" && value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value); }
function functionName(node: FunctionLikeDeclaration, file: SourceFile): string {
	const named = "name" in node && node.name ? node.name.getText(file) : undefined; if (named) return named; if (node.kind === SyntaxKind.Constructor) return "constructor";
	const parent = node.parent; if (parent && (parent.kind === SyntaxKind.VariableDeclaration || parent.kind === SyntaxKind.PropertyAssignment || parent.kind === SyntaxKind.PropertyDeclaration)) { const contextual = (parent as Node & { name?: Node }).name?.getText(file); if (contextual) return contextual; }
	const point = file.getLineAndCharacterOfPosition(node.getStart(file)); return `<anonymous@${point.line + 1}:${point.character + 1}>`;
}
function analyze(path: string, digest: string, source: string, region: CleanerScriptRegion, limits: Limits, counters: { nodes: number; functions: number }, started: number): CleanerFunctionComplexity[] {
	const file = createSourceFile(path, padCleanerScriptRegion(source, region), ScriptTarget.Latest, true, region.kind); const diagnostics = (file as SourceFile & { readonly parseDiagnostics: readonly unknown[] }).parseDiagnostics; if (diagnostics.length) throw new Error(`Malformed source prevents reliable function boundaries: ${path}`); const output: CleanerFunctionComplexity[] = [];
	const visit = (node: Node): void => { if (++counters.nodes > limits.maxAstNodes || expired(started, limits)) throw new Error("Cleaner complexity AST or duration budget exceeded"); if (FUNCTION_KINDS.has(node.kind)) { const fn = node as FunctionLikeDeclaration; if (!fn.body) return; if (++counters.functions > limits.maxFunctions) throw new Error("Cleaner complexity function budget exceeded"); const categories: Partial<Record<Category, number>> = {}; let decisions = 0; const count = (category: Category): void => { decisions += 1; categories[category] = (categories[category] ?? 0) + 1; };
		const body = (child: Node): void => { if (++counters.nodes > limits.maxAstNodes || expired(started, limits)) throw new Error("Cleaner complexity AST or duration budget exceeded"); if (child !== fn && FUNCTION_KINDS.has(child.kind)) return; if (child.kind === SyntaxKind.IfStatement) count("if"); else if ([SyntaxKind.ForStatement, SyntaxKind.ForInStatement, SyntaxKind.ForOfStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement].includes(child.kind)) count("loop"); else if (child.kind === SyntaxKind.CaseClause) count("case-non-default"); else if (child.kind === SyntaxKind.CatchClause) count("catch"); else if (child.kind === SyntaxKind.ConditionalExpression) count("conditional"); else if (child.kind === SyntaxKind.AmpersandAmpersandToken) count("logical-and"); else if (child.kind === SyntaxKind.BarBarToken) count("logical-or"); else if (child.kind === SyntaxKind.QuestionQuestionToken) count("nullish-coalescing"); forEachChild(child, body); }; body(fn.body);
		const start = fn.getStart(file), end = fn.end, begin = file.getLineAndCharacterOfPosition(start), finish = file.getLineAndCharacterOfPosition(end), displayName = functionName(fn, file); output.push({ identity: `function-v1:sha256:${hash(`${path}\0${digest}\0${start}\0${end}\0${fn.kind}`)}`, displayName, path, span: { startLine: begin.line + 1, startColumn: begin.character + 1, endLine: finish.line + 1, endColumn: finish.character + 1 }, syntaxKind: SyntaxKind[fn.kind]!, complexity: decisions + 1, decisions: { total: decisions, categories }, coverageMapping: { declarationLine: begin.line + 1, confidence: "exact-ast-span", ambiguous: false } }); }
		forEachChild(node, visit); }; forEachChild(file, visit); return output;
}

export function collectCleanerComplexityEvidence(environment: CleanerEnvironmentEvidence, paths?: readonly string[], budget: Partial<Limits> = {}): CleanerComplexityEvidence {
	const limits = { ...DEFAULT_LIMITS, ...budget }; if (Object.values(limits).some((value) => !Number.isInteger(value) || value < 1)) throw new Error("Cleaner complexity budget must contain positive integers"); const started = performance.now(); const current = projectProjectState({ cwd: environment.scope.root }); if (current.git.stateRef !== environment.sourceState.stateRef || current.git.quality !== "current") throw new Error("Cleaner complexity source state is stale");
	const available = new Map(environment.scope.files.map((file) => [file.path, file.sha256])); const selected = paths ? [...paths] : [...available.keys()]; if (!selected.length || selected.length > limits.maxFiles || new Set(selected).size !== selected.length) throw new Error("Cleaner complexity file scope is empty, duplicate, or over budget"); selected.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))); const files = selected.map((path) => { const sha256 = available.get(path); if (!sha256) throw new Error("Complexity source is outside current bounded environment evidence"); return { path, sha256 }; });
	let bytes = 0; const counters = { nodes: 0, functions: 0 }; const functions: CleanerFunctionComplexity[] = []; for (const file of files) { const target = resolve(environment.scope.root, file.path); if (!inside(environment.scope.root, target)) throw new Error("Complexity source path escapes environment scope"); const stat = lstatSync(target); if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(target) !== target) throw new Error("Complexity source is not a current regular file"); const content = readFileSync(target); bytes += content.byteLength; if (bytes > limits.maxBytes) throw new Error("Cleaner complexity byte budget exceeded"); if (hash(content) !== file.sha256) throw new Error("Complexity source digest is stale"); const source = content.toString("utf8"); if (!Buffer.from(source, "utf8").equals(content)) throw new Error("Complexity source is not valid UTF-8"); for (const region of cleanerScriptRegions(file.path, source)) functions.push(...analyze(file.path, file.sha256, source, region, limits, counters, started)); }
	functions.sort((a, b) => Buffer.compare(Buffer.from(`${a.path}\0${String(a.span.startLine).padStart(10, "0")}\0${String(a.span.startColumn).padStart(10, "0")}`), Buffer.from(`${b.path}\0${String(b.span.startLine).padStart(10, "0")}\0${String(b.span.startColumn).padStart(10, "0")}`))); const lineCounts = new Map<string, number>(); const nameCounts = new Map<string, number>(); for (const fn of functions) { lineCounts.set(`${fn.path}\0${fn.span.startLine}`, (lineCounts.get(`${fn.path}\0${fn.span.startLine}`) ?? 0) + 1); nameCounts.set(`${fn.path}\0${fn.displayName}`, (nameCounts.get(`${fn.path}\0${fn.displayName}`) ?? 0) + 1); } for (const fn of functions) if (lineCounts.get(`${fn.path}\0${fn.span.startLine}`)! > 1 || nameCounts.get(`${fn.path}\0${fn.displayName}`)! > 1) (fn.coverageMapping as { ambiguous: boolean }).ambiguous = true;
	const distribution = [...new Set(functions.map((fn) => fn.complexity))].sort((a, b) => a - b).map((complexity) => ({ complexity, count: functions.filter((fn) => fn.complexity === complexity).length })); const scopeIdentity = `complexity-scope-v1:sha256:${hash(JSON.stringify(files))}`; const base = { version: CLEANER_COMPLEXITY_EVIDENCE_VERSION, collectorKind: "function-cyclomatic-complexity" as const, definition: CLEANER_COMPLEXITY_DEFINITION, sourceState: environment.sourceState, scope: { identity: scopeIdentity, files }, functions, aggregate: { count: functions.length, max: functions.length ? Math.max(...functions.map((fn) => fn.complexity)) : null, distribution }, budget: { ...limits, observedFiles: files.length, observedBytes: bytes, observedFunctions: counters.functions, observedAstNodes: counters.nodes, durationExceeded: expired(started, limits) } }; const after = projectProjectState({ cwd: environment.scope.root }); if (after.git.stateRef !== environment.sourceState.stateRef) throw new Error("Cleaner complexity source state changed"); return freeze({ ...base, outputIdentity: { algorithm: "sha256" as const, digest: hash(JSON.stringify(base)) } });
}
