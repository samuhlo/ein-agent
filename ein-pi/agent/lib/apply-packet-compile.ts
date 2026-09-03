// =============================================================================
// [CORE] COMPILAR UN APPLY PACKET DESDE `tasks.md` + `design.md`
//
// La regla que da sentido a este módulo: la frontera de escritura sale de la
// ETIQUETA, nunca del cuerpo del grupo. `extractProductionFiles`
// (`sdd-router.ts:778`) barre el cuerpo entero y por eso un grupo que declara
// `none` le devuelve nueve ficheros — bien para avisar de un grupo grande,
// inaceptable como permiso de escritura.
//
// FAIL CLOSED -> etiqueta desconocida, ausente o ruta ambigua = no hay packet.
// Nunca se cae a adivinar.
//
// No lee disco: recibe el texto de los artefactos y sus digests ya calculados.
// =============================================================================

import {
	APPLY_PACKET_FORMAT,
	APPLY_PACKET_V2_FORMAT,
	type ApplyPacketDraft,
	type ApplyPacketV2Draft,
	type ApplyPacketV2Operation,
	isProductionLabel,
	normalizeFilesLabel,
} from "./apply-packet.ts";

export type CompileInput = Readonly<{
	change: string;
	designText: string;
	tasksText: string;
	taskId: string;
	sources: Readonly<Record<string, string>>;
}>;

export type CompileFailureCode = "task-not-found" | "unknown-grammar" | "ambiguous-path";

export type CompileResult =
	| Readonly<{
			ok: true;
			draft: ApplyPacketDraft;
			provenance: Readonly<{ allowedFilesLabel: string; labels: readonly string[] }>;
	  }>
	| Readonly<{ ok: false; code: CompileFailureCode; detail: string }>;

export type CompileV2Input = Readonly<{
	change: string;
	designText: string;
	tasksText: string;
	groupTitle: string;
	sources: Readonly<Record<string, string>>;
}>;

export type CompileV2FailureCode =
	| "group-not-found"
	| "no-pending-tasks"
	| "invalid-edit-grammar";

export type CompileV2Result =
	| Readonly<{ ok: true; draft: ApplyPacketV2Draft }>
	| Readonly<{ ok: false; code: CompileV2FailureCode; detail: string }>;

// Mismo corte de grupos que `oversizedGroupWarnings` (`sdd-guardrails.ts:151`).
// Se repite el literal porque aquel no expone el particionador; lo que no se
// repite es el PREDICADO de ficheros, que era la duplicación peligrosa.
const GROUP_SPLIT_RE = /^##\s+(.+)$/m;
const CHECKBOX_RE = /^\s*-\s*\[(?: |x|X)\]\s+(\d+(?:\.\d+)*)\s+(.+)$/;
const V2_CHECKBOX_RE = /^\s*-\s*\[( |x|X)\]\s+(\d+(?:\.\d+)*)\s+(.+)$/;
const FIELD_RE = /^\s*-\s*([a-z_/ ]+)\s*:\s*(.*)$/i;
// Candidata a etiqueta: cualquier `Algo:` al principio de línea, con o sin
// viñeta, negrita o blockquote. Quién es frontera lo decide el conjunto
// cerrado, no este regex: atarlo a las palabras "production"/"test" dejaba
// fuera `**Focused tests:**`, que SÍ está en el conjunto.
const LABEL_CANDIDATE_RE = /^\s*((?:>\s*)?(?:[-*]\s*)?(?:\*\*)?[A-Za-z][\w/ ()-]*:(?:\*\*)?)\s*(.*)$/;

type Group = { heading: string; body: string };

function splitGroups(tasksText: string): Group[] {
	const parts = tasksText.split(GROUP_SPLIT_RE);
	const groups: Group[] = [];
	for (let i = 1; i < parts.length; i += 2) {
		groups.push({ heading: (parts[i] ?? "").trim(), body: parts[i + 1] ?? "" });
	}
	return groups;
}

// Bloque de UNA tarea: desde su checkbox hasta el siguiente checkbox o el final
// del grupo. Sin este corte, los campos de una tarea contaminarían a su hermana.
function taskBlock(body: string, taskId: string): { title: string; block: string } | null {
	const lines = body.split("\n");
	let start = -1;
	let title = "";
	for (let i = 0; i < lines.length; i += 1) {
		const match = lines[i].match(CHECKBOX_RE);
		if (!match) continue;
		if (match[1] === taskId) {
			start = i;
			title = match[2].trim();
			continue;
		}
		if (start >= 0) return { title, block: lines.slice(start, i).join("\n") };
	}
	return start >= 0 ? { title, block: lines.slice(start).join("\n") } : null;
}

// Preámbulo del grupo: lo que hay ANTES del primer checkbox. La frontera del
// grupo se lee solo de aquí — leer el cuerpo entero colaba la frontera de una
// tarea en su hermana, que es la misma clase de fuga que este módulo existe
// para cerrar.
function groupPreamble(body: string): string {
	const lines = body.split("\n");
	const first = lines.findIndex((line) => CHECKBOX_RE.test(line));
	return first < 0 ? body : lines.slice(0, first).join("\n");
}

function fieldValues(block: string, name: string): string[] {
	return rawFieldValues(block, name).map(stripTicks).filter(Boolean);
}

function rawFieldValues(block: string, name: string): string[] {
	const out: string[] = [];
	for (const line of block.split("\n")) {
		const match = line.match(FIELD_RE);
		if (!match) continue;
		if (match[1].trim().toLowerCase() !== name) continue;
		const value = match[2].trim();
		if (value) out.push(value);
	}
	return out;
}

function stripTicks(value: string): string {
	return value.replace(/^`+|`+$/g, "").trim();
}

// Rutas del VALOR de una etiqueta. Prefiere lo que va entre backticks: es como
// el repo escribe rutas y evita arrastrar prosa ("(delete)", "only if ...").
function pathsOf(value: string): string[] {
	if (/^\s*(none|ninguno)\b/i.test(value)) return [];
	const ticked = [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
	const raw = ticked.length > 0 ? ticked : value.split(/[,;]/).map((chunk) => chunk.trim());
	return raw.filter((path) => path.length > 0 && !/\s/.test(path));
}

type Frontier = { files: string[]; labels: string[] };

function frontierOf(text: string): Frontier | null {
	const files: string[] = [];
	const labels: string[] = [];
	for (const line of text.split("\n")) {
		const match = line.match(LABEL_CANDIDATE_RE);
		if (!match) continue;
		const label = match[1].trim();
		// Una etiqueta no reconocida es otro campo (`why:`, `skills:`), no una
		// frontera rota. Si al final no hay NINGUNA reconocida, el grupo no declara
		// frontera y eso sí es `unknown-grammar`.
		if (!normalizeFilesLabel(label)) continue;
		labels.push(label);
		files.push(...pathsOf(match[2]));
	}
	return labels.length > 0 ? { files: [...new Set(files)], labels } : null;
}

/**
 * [CORE] COMPILAR UNA TAREA A PACKET
 * ---------------------------------------------------------
 * La frontera de la tarea gana sobre la del grupo: una tarea que declara sus
 * propios ficheros es más precisa que el grupo que la contiene.
 */
export function compileApplyPacket(input: CompileInput): CompileResult {
	for (const group of splitGroups(input.tasksText)) {
		const task = taskBlock(group.body, input.taskId);
		if (!task) continue;

		const frontier = frontierOf(task.block) ?? frontierOf(groupPreamble(group.body));
		if (!frontier) {
			return {
				ok: false,
				code: "unknown-grammar",
				detail: `la tarea ${input.taskId} no declara su frontera con una etiqueta reconocida`,
			};
		}

		const ambiguous = frontier.files.find((path) => !path.includes("/"));
		if (ambiguous) {
			return { ok: false, code: "ambiguous-path", detail: `${ambiguous} no nombra una ruta, solo un fichero` };
		}

		const productionLabel = frontier.labels.find(isProductionLabel) ?? frontier.labels[0];
		const draft: ApplyPacketDraft = {
			format: APPLY_PACKET_FORMAT,
			change: input.change,
			group: group.heading,
			outcome: task.title,
			allowedFiles: frontier.files,
			allowedFilesGrammar: frontier.labels,
			edits: [],
			// Las invariantes viven repartidas entre `architecture:` (lo que debe
			// seguir siendo cierto) y `avoid:` (lo que no puede pasar). El packet
			// las junta; ninguna de las dos sola describe la frontera lógica.
			invariants: [...fieldValues(task.block, "architecture"), ...fieldValues(task.block, "avoid")],
			focusedCheck: fieldValues(task.block, "verify")[0] ?? "",
			stopConditions: fieldValues(task.block, "stop"),
			// No hay campo de evidencia esperada en la gramática actual: 0 de 51
			// `tasks.md` archivados lo declaran. Se deja vacío A PROPÓSITO para que
			// la validación lo diga, en vez de inventarlo desde `verify:`.
			expectedEvidence: fieldValues(task.block, "evidence")[0] ?? "",
			sources: { ...input.sources },
		};

		return { ok: true, draft, provenance: { allowedFilesLabel: productionLabel, labels: frontier.labels } };
	}

	return { ok: false, code: "task-not-found", detail: `no hay tarea ${input.taskId} en tasks.md` };
}

type V2TaskBlock = Readonly<{ id: string; title: string; done: boolean; block: string }>;

function normalizeGroupTitle(value: string): string {
	return value.trim().replace(/^\/\/\s*\d+\.\s*/, "").trim();
}

function v2TaskBlocks(body: string): V2TaskBlock[] {
	const lines = body.split("\n");
	const starts: Array<{ index: number; id: string; title: string; done: boolean }> = [];
	for (let index = 0; index < lines.length; index += 1) {
		const match = lines[index]?.match(V2_CHECKBOX_RE);
		if (!match) continue;
		starts.push({
			index,
			done: match[1].toLowerCase() === "x",
			id: match[2],
			title: match[3].trim(),
		});
	}
	return starts.map((start, index) => ({
		id: start.id,
		title: start.title,
		done: start.done,
		block: lines.slice(start.index, starts[index + 1]?.index ?? lines.length).join("\n"),
	}));
}

function orderedUnion(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function parseV2Edit(value: string, taskId: string):
	| { ok: true; step: ApplyPacketV2Draft["steps"][number] }
	| { ok: false; detail: string } {
	const cells = value.split("|").map((cell) => cell.trim());
	if (cells.length !== 3) {
		return { ok: false, detail: `edit de ${taskId} debe tener ruta | operación | intención` };
	}
	const path = stripTicks(cells[0] ?? "");
	const operation = (cells[1] ?? "").toLowerCase();
	const intent = cells[2] ?? "";
	if (!path || !(["create", "modify", "delete"] as const).includes(operation as ApplyPacketV2Operation) || !intent) {
		return { ok: false, detail: `edit de ${taskId} contiene una ruta, operación o intención inválida` };
	}
	return {
		ok: true,
		step: { taskId, path, operation: operation as ApplyPacketV2Operation, intent },
	};
}

/**
 * [CORE] COMPILAR EL GRUPO DELEGADO A APPLY-PACKET/V2
 * ---------------------------------------------------------
 * Conserva el orden de los checkboxes pendientes. Un grupo reanudado no vuelve
 * a incluir pasos ya marcados como completos.
 */
export function compileApplyPacketV2(input: CompileV2Input): CompileV2Result {
	const wanted = normalizeGroupTitle(input.groupTitle);
	const group = splitGroups(input.tasksText).find((candidate) => normalizeGroupTitle(candidate.heading) === wanted);
	if (!group) return { ok: false, code: "group-not-found", detail: `no hay grupo ${input.groupTitle} en tasks.md` };

	const pending = v2TaskBlocks(group.body).filter((task) => !task.done);
	if (pending.length === 0) {
		return { ok: false, code: "no-pending-tasks", detail: `el grupo ${wanted} no tiene tareas pendientes` };
	}

	const steps: ApplyPacketV2Draft["steps"][number][] = [];
	const readContext: string[] = [];
	const invariants: string[] = [];
	const behaviorSeams: string[] = [];
	const checks: ApplyPacketV2Draft["checks"][number][] = [];
	const stopConditions: string[] = [];

	for (const task of pending) {
		for (const value of rawFieldValues(task.block, "read")) readContext.push(...pathsOf(value));
		for (const value of rawFieldValues(task.block, "edit")) {
			const parsed = parseV2Edit(value, task.id);
			if (!parsed.ok) return { ok: false, code: "invalid-edit-grammar", detail: parsed.detail };
			steps.push(parsed.step);
		}
		const behaviors = fieldValues(task.block, "behavior");
		behaviorSeams.push(...behaviors);
		invariants.push(...fieldValues(task.block, "architecture"), ...fieldValues(task.block, "avoid"));
		stopConditions.push(...fieldValues(task.block, "stop"));
		for (const command of fieldValues(task.block, "verify")) checks.push({ command, covers: [...behaviors] });
	}

	const writable = orderedUnion(steps.map((step) => step.path));
	const draft: ApplyPacketV2Draft = {
		format: APPLY_PACKET_V2_FORMAT,
		change: input.change,
		group: wanted,
		outcome: fieldValues(groupPreamble(group.body), "outcome")[0] ?? "",
		readContext: orderedUnion([...readContext, ...writable]),
		writeAllowlist: writable,
		steps,
		invariants: orderedUnion(invariants),
		behaviorSeams: orderedUnion(behaviorSeams),
		checks,
		stopConditions: orderedUnion(stopConditions),
		sources: { ...input.sources },
	};

	// designText es parte explícita de la fuente de compilación aunque las
	// decisiones consumibles lleguen normalizadas a tasks.md. Su digest sella el
	// packet y cualquier cambio posterior lo vuelve obsoleto en el borde de E/S.
	void input.designText;
	return { ok: true, draft };
}
