// =============================================================================
// FORMA DE LA DELEGACIÓN
// Traduce el input del tool `subagent` a una lista de items {agent, task, tdd},
// sea cual sea la forma en que llegó. Es la ÚNICA capa de Ein que conoce la
// forma del input; todo lo que decide sobre una delegación (gate de entrega,
// gate de TDD, inyección de acceptance/turnBudget, reconciliación de fase,
// contrato del scout) lee items, no claves.
//
// Por qué existe: `pi-subagents` 0.44 movió la ejecución a `workflowScript`
// ("every execution is a workflow"), un cuerpo de JavaScript donde el agente y
// la task viven DENTRO del script:
//   runs.run("deliver", { agent: "ein-git", task: "haz push y abre PR" })
// Las formas antiguas (`agent`/`task` sueltos, `tasks[]`, `steps[]`, `chain[]`)
// dejaron de llegar, y cada inspector de Ein las leía por su cuenta: todos
// pasaron a ver una delegación vacía a la vez. El gate de entrega dejó de
// emitir el grant (todo push delegado bloqueado, y ninguna confirmación),
// el gate de TDD dejó de preguntar, las fases de planificación perdieron su
// `acceptance: none` y el scout su contrato acotado. Un solo parser, un solo
// sitio que actualizar la próxima vez que cambie el runtime.
//
// Módulo puro (cero imports) para testear la forma sin arrancar Pi.
// =============================================================================

export type DelegationItem = {
	agent?: string;
	task?: string;
	tdd?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Claves de array de ejecución de las formas legacy (pi-subagents ≤ 0.43). Se
// siguen leyendo: una instalación puede quedarse atrás y un downgrade no debe
// apagar los gates.
const LEGACY_ITEM_KEYS = ["tasks", "steps", "chain"] as const;

// Propiedades que Ein necesita de cada child del script. `tdd` no es del
// runtime: es el hint que pasa el orquestador de Ein.
const CAPTURED_KEYS = new Set(["agent", "task", "tdd"]);

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;

type Literal = { value: string; next: number };

// Lee un literal de string que empieza en `start` (comilla simple, doble o
// backtick) y devuelve su contenido crudo. Los `${…}` de un template se
// consumen como texto: la prosa de la task sigue ahí, que es lo que se evalúa.
function readStringLiteral(src: string, start: number): Literal | null {
	const quote = src[start];
	if (quote !== "'" && quote !== '"' && quote !== "`") return null;
	let index = start + 1;
	let value = "";
	while (index < src.length) {
		const char = src[index];
		if (char === "\\") {
			// Se preserva el carácter escapado, no la barra: `\'` es una comilla en
			// la prosa, y `\n` no aporta nada a las señales que se buscan.
			value += src[index + 1] ?? "";
			index += 2;
			continue;
		}
		if (char === quote) return { value, next: index + 1 };
		value += char;
		index += 1;
	}
	// Literal sin cerrar: script roto. No es asunto de Ein — lo rechaza el
	// runtime. Aquí solo se para de leer.
	return null;
}

function skipWhitespace(src: string, from: number): number {
	let index = from;
	while (index < src.length && /\s/.test(src[index] as string)) index += 1;
	return index;
}

// Consume el valor de una clave capturada y lo escribe en el frame abierto.
// Devuelve la posición tras el valor, o null si el valor no es un literal de
// string (una variable, una llamada, un objeto): en ese caso no hay nada que
// leer estáticamente y el item queda sin esa propiedad.
function assignCapturedValue(
	src: string,
	colon: number,
	key: string,
	frame: DelegationItem,
): number | null {
	const valueStart = skipWhitespace(src, colon + 1);
	const literal = readStringLiteral(src, valueStart);
	if (!literal) return null;
	if (key === "agent") frame.agent = literal.value;
	else if (key === "task") frame.task = literal.value;
	else frame.tdd = literal.value;
	return literal.next;
}

// Extrae los children de un `workflowScript`. Escáner con pila de literales de
// objeto: cada `{…}` es un frame, y un frame que cierra con alguna clave
// capturada es un item. Así `{agent:'a', task:'t', turnBudget:{maxTurns:5}}`
// produce UN item (el objeto anidado cierra vacío y no emite), y dos
// `runs.run` distintos nunca mezclan el agente de uno con la task del otro.
export function parseWorkflowScriptDelegations(script: string): DelegationItem[] {
	const items: DelegationItem[] = [];
	const stack: DelegationItem[] = [];
	let index = 0;
	while (index < script.length) {
		const char = script[index] as string;
		if (char === "/" && script[index + 1] === "/") {
			const newline = script.indexOf("\n", index);
			index = newline === -1 ? script.length : newline + 1;
			continue;
		}
		if (char === "/" && script[index + 1] === "*") {
			const close = script.indexOf("*/", index + 2);
			index = close === -1 ? script.length : close + 2;
			continue;
		}
		if (char === "'" || char === '"' || char === "`") {
			const literal = readStringLiteral(script, index);
			if (!literal) break;
			// Clave entrecomillada (`{"agent": "x"}`): el literal que acaba de
			// leerse puede ser la clave, no el valor.
			const afterLiteral = skipWhitespace(script, literal.next);
			const frame = stack[stack.length - 1];
			if (
				script[afterLiteral] === ":" &&
				frame &&
				CAPTURED_KEYS.has(literal.value)
			) {
				const next = assignCapturedValue(script, afterLiteral, literal.value, frame);
				index = next ?? afterLiteral + 1;
				continue;
			}
			index = literal.next;
			continue;
		}
		if (char === "{") {
			stack.push({});
			index += 1;
			continue;
		}
		if (char === "}") {
			const frame = stack.pop();
			if (frame && (frame.agent !== undefined || frame.task !== undefined || frame.tdd !== undefined))
				items.push(frame);
			index += 1;
			continue;
		}
		if (IDENTIFIER_START.test(char)) {
			let end = index + 1;
			while (end < script.length && IDENTIFIER_CHAR.test(script[end] as string)) end += 1;
			const identifier = script.slice(index, end);
			const afterIdentifier = skipWhitespace(script, end);
			const frame = stack[stack.length - 1];
			if (
				script[afterIdentifier] === ":" &&
				frame &&
				CAPTURED_KEYS.has(identifier)
			) {
				const next = assignCapturedValue(script, afterIdentifier, identifier, frame);
				index = next ?? afterIdentifier + 1;
				continue;
			}
			index = end;
			continue;
		}
		index += 1;
	}
	return items;
}

// ¿Cuántos children lanza el script? `runs.all` es fan-out por definición, así
// que cuenta como varios aunque el array se construya en tiempo de ejecución.
export function workflowScriptFansOut(script: string): boolean {
	if (/\bruns\s*\.\s*all\b/.test(script)) return true;
	return parseWorkflowScriptDelegations(script).length > 1;
}

export function delegationWorkflowScript(input: unknown): string | undefined {
	if (!isRecord(input)) return undefined;
	return typeof input.workflowScript === "string" ? input.workflowScript : undefined;
}

// Items de la delegación, en orden: primero los del script (forma actual),
// después los de las formas legacy. Un mismo input no trae ambas.
export function collectDelegationItems(input: unknown): DelegationItem[] {
	if (!isRecord(input)) return [];
	const items: DelegationItem[] = [];
	const script = delegationWorkflowScript(input);
	if (script) items.push(...parseWorkflowScriptDelegations(script));
	for (const key of LEGACY_ITEM_KEYS) {
		const entries = input[key];
		if (!Array.isArray(entries)) continue;
		for (const entry of entries) {
			if (!isRecord(entry)) continue;
			const item: DelegationItem = {};
			if (typeof entry.agent === "string") item.agent = entry.agent;
			if (typeof entry.task === "string") item.task = entry.task;
			if (entry.tdd !== undefined) item.tdd = entry.tdd;
			if (item.agent !== undefined || item.task !== undefined || item.tdd !== undefined)
				items.push(item);
		}
	}
	// Forma single legacy. Con `action` presente el input es una llamada de
	// GESTIÓN (get/update/delete/models) y su `agent` es el objeto gestionado, no
	// un lanzamiento: leerlo ahí inyectaba acceptance y abría gates sobre algo
	// que no ejecuta nada.
	if (typeof input.action !== "string") {
		const single: DelegationItem = {};
		if (typeof input.agent === "string") single.agent = input.agent;
		if (typeof input.task === "string") single.task = input.task;
		if (single.agent !== undefined || single.task !== undefined) items.push(single);
	}
	return items;
}

export function collectDelegationAgentNames(input: unknown): string[] {
	return collectDelegationItems(input)
		.map((item) => item.agent)
		.filter((agent): agent is string => typeof agent === "string");
}

export function collectDelegationTaskTexts(input: unknown): string[] {
	return collectDelegationItems(input)
		.map((item) => item.task)
		.filter((task): task is string => typeof task === "string");
}

// ¿La delegación lanza este agente y NADA más? Lo piden los inyectores que
// escriben defaults a nivel de workflow (`acceptance`, `turnBudget`): en
// pi-subagents ≥ 0.44 esos campos bajan a TODOS los children, así que fijarlos
// por un solo child de una delegación mixta se los aplicaría a los demás.
export function delegationTargetsOnly(input: unknown, agent: string): boolean {
	const agents = collectDelegationAgentNames(input);
	return agents.length > 0 && agents.every((name) => name === agent);
}

export function delegationIncludes(input: unknown, agent: string): boolean {
	return collectDelegationAgentNames(input).includes(agent);
}

// Canario de drift del runtime: una llamada de EJECUCIÓN cuya forma no produce
// ni un child. Es exactamente lo que pasó con 0.44 — y lo que hizo que costara
// tanto verlo: los gates no fallan, se quedan mirando a un sitio vacío. Un
// bloqueo de push sin confirmación previa parecía un problema de permisos, no
// de forma. Se avisa, no se bloquea: un script que construye agente y task en
// runtime es legítimo y también cae aquí.
export function delegationShapeIsUnrecognized(input: unknown): boolean {
	if (!isRecord(input)) return false;
	// Con `action` la llamada gestiona agentes (get/update/models): no ejecuta.
	if (typeof input.action === "string") return false;
	return collectDelegationItems(input).length === 0;
}
