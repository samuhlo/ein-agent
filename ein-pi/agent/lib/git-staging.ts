// =============================================================================
// GIT STAGING — pathspec cerrado
// =============================================================================
// Un commit debe contener EXACTAMENTE lo que se decidió entregar. El staging a
// granel no puede saber qué está metiendo: barre lo que haya en el árbol, y en
// un repo con trabajo en curso ajeno eso significa publicar ficheros de otro.
//
// Incidente real (jul 2026): un `git add -A tests/` se llevó un test sin
// trackear del usuario dentro de un PR. Hubo que abrir un segundo PR para
// sacarlo. El fallo no fue el comando: fue que NADA lo impedía.
//
// Dos capas:
//   1. VERBOS A GRANEL (puro, sin tocar el repo): `-A`, `--all`, `-u`,
//      `--update`, `git add .`, `git add :/`, `git commit -a`. Se rechazan
//      siempre — ninguno puede enumerar lo que entra. Se analizan también los
//      comandos envueltos en `bash -c '…'`, que es como un agente ejecuta
//      normalmente y por donde se colaba todo.
//   2. BARRIDO DE NO TRACKEADOS (contra el repo): incluso con pathspec
//      explícito, `git add dir/` arrastra lo que haya dentro sin trackear —y
//      con `-f`, hasta lo ignorado, que es donde viven los `.env`—. Se ejecuta
//      EL MISMO comando en seco y se comprueba si entra algo no trackeado que
//      nadie nombró.
//
// El bloqueo NO es un callejón: la salida siempre existe y es la correcta —
// nombrar las rutas. A diferencia de un gate de confirmación, aquí "arreglarlo"
// y "hacerlo bien" son lo mismo.
//
// ALCANCE HONESTO: esto evita ACCIDENTES, no a alguien decidido. El perímetro
// cubre invocaciones de git —directas o vía shell— con la sintaxis contemplada.
// Un script que llame a git por su cuenta, un alias o una librería de git no
// pasan por aquí. No es un límite de seguridad y no debe presentarse como tal.
// =============================================================================

import { execFileSync } from "node:child_process";

export type StagingVerdict =
	| { kind: "ok" }
	| { kind: "blocked"; reason: string };

// Un token de shell. `quoted` importa: `-a` DENTRO de comillas es texto del
// mensaje de commit, no un flag. Sin esta distinción,
// `git commit -m 'mensaje con -a dentro'` se bloqueaba — un falso positivo que
// tumba commits legítimos, que en un gate que bloquea es el peor fallo posible.
type Token = { value: string; quoted: boolean };

// Recorre el comando respetando comillas: trocea por separadores de shell y
// tokeniza a la vez. No es un parser de shell completo, pero sí entiende lo
// único que aquí cambia una decisión: qué está entrecomillado.
function segmentTokens(command: string): Token[][] {
	const segments: Token[][] = [];
	let current: Token[] = [];
	let buffer = "";
	let quoted = false;
	let quoteChar: string | null = null;

	const flushToken = () => {
		if (buffer.length > 0 || quoted) current.push({ value: buffer, quoted });
		buffer = "";
		quoted = false;
	};
	const flushSegment = () => {
		flushToken();
		if (current.length > 0) segments.push(current);
		current = [];
	};

	for (let index = 0; index < command.length; index += 1) {
		const char = command[index]!;
		if (quoteChar) {
			if (char === quoteChar) quoteChar = null;
			else buffer += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quoteChar = char;
			quoted = true;
			continue;
		}
		const pair = command.slice(index, index + 2);
		if (pair === "&&" || pair === "||") {
			flushSegment();
			index += 1;
			continue;
		}
		if (char === ";" || char === "|" || char === "\n") {
			flushSegment();
			continue;
		}
		if (/\s/.test(char)) {
			flushToken();
			continue;
		}
		buffer += char;
	}
	flushSegment();
	return segments;
}

// Un flag es un token que empieza por `-` y NO viene entrecomillado.
function isFlag(token: Token): boolean {
	return !token.quoted && token.value.startsWith("-");
}

// Envoltorios de shell: `bash -lc '…'` mete un comando ENTERO dentro de un
// token entrecomillado. Sin desenvolverlo, `bash -lc 'git add -A'` no parecía
// una operación git y se colaba entera — y `bash -c` es la forma normal en que
// un agente ejecuta cosas, no un truco. El incidente original podía reaparecer
// con una envoltura rutinaria.
const SHELL_BINARIES = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish", "busybox"]);
const MAX_WRAPPER_DEPTH = 4;

// Payloads de comando que un segmento ejecuta a través de un shell.
function shellPayloads(segment: Token[]): string[] {
	const payloads: string[] = [];
	for (let index = 0; index < segment.length; index += 1) {
		const token = segment[index]!;
		if (token.quoted) continue;
		const binary = token.value.split("/").pop() ?? "";
		if (!SHELL_BINARIES.has(binary)) continue;
		// Busca el flag que introduce un comando (`-c`, y agrupados como `-lc`).
		for (let cursor = index + 1; cursor < segment.length; cursor += 1) {
			const arg = segment[cursor]!;
			if (isFlag(arg) && /^-[a-z]*c$/i.test(arg.value)) {
				const payload = segment[cursor + 1];
				if (payload) payloads.push(payload.value);
				break;
			}
			if (!isFlag(arg)) break;
		}
	}
	return payloads;
}

// El comando dado más todo lo que ejecute a través de shells anidados. La
// profundidad está acotada: un `bash -c 'bash -c "…"'` es legítimo desenvolverlo
// un par de veces, pero no hay que perseguir anidamientos infinitos.
function expandCommands(command: string, depth = 0): Token[][] {
	const segments = segmentTokens(command);
	if (depth >= MAX_WRAPPER_DEPTH) return segments;
	const expanded = [...segments];
	for (const segment of segments) {
		for (const payload of shellPayloads(segment)) {
			expanded.push(...expandCommands(payload, depth + 1));
		}
	}
	return expanded;
}

// ¿El segmento invoca `git <sub>`? Tolera flags globales (`git -C x add …`).
function gitSubcommand(segment: Token[], sub: string): Token[] | null {
	const gitAt = segment.findIndex((token) => !token.quoted && (token.value === "git" || token.value.endsWith("/git")));
	if (gitAt === -1) return null;
	let index = gitAt + 1;
	while (index < segment.length) {
		const token = segment[index]!;
		// Flags globales de git que consumen un valor.
		if (!token.quoted && ["-C", "-c", "--git-dir", "--work-tree"].includes(token.value)) {
			index += 2;
			continue;
		}
		if (isFlag(token)) {
			index += 1;
			continue;
		}
		break;
	}
	if (segment[index]?.value !== sub) return null;
	return segment.slice(index + 1);
}

// Expuesto para que otros guards (la puerta de entrega) reutilicen ESTE
// tokenizador en vez de escribir el suyo: un segundo parser volvería a dejar el
// agujero de los wrappers `bash -c` que aquí ya está cerrado.
export function invokesBinarySubcommand(command: string, binary: string, sub: string): boolean {
	for (const segment of expandCommands(command)) {
		const at = segment.findIndex((token) => !token.quoted && (token.value === binary || token.value.endsWith(`/${binary}`)));
		if (at === -1) continue;
		for (let index = at + 1; index < segment.length; index += 1) {
			const token = segment[index]!;
			if (isFlag(token)) continue;
			if (!token.quoted && token.value === sub) return true;
			break;
		}
	}
	return false;
}

export function invokesGitSubcommand(command: string, sub: string): boolean {
	return expandCommands(command).some((segment) => gitSubcommand(segment, sub) !== null);
}

// Argumentos crudos de `git <sub>` en el primer segmento que lo invoca. Lo usa
// la puerta de entrega para ver los pathspecs de `git commit`, que no pasan por
// el índice y por tanto son invisibles a `git diff --cached`.
export function gitSubcommandArgs(command: string, sub: string): string[] | null {
	for (const segment of expandCommands(command)) {
		const args = gitSubcommand(segment, sub);
		if (args) return args.map((token) => token.value);
	}
	return null;
}


const BULK_ADD_FLAGS = new Set(["-A", "--all", "-u", "--update", "--no-ignore-removal"]);
// Pathspecs que significan "todo": el punto y la raíz mágica de git.
const BULK_PATHSPECS = new Set([".", "./", ":/", ":/*", "*"]);

const REMEDY =
	"Nombra las rutas exactas (`git add ruta/a.ts ruta/b.ts`). Es la única forma de garantizar que el commit contiene lo que se decidió entregar y nada más.";

// Capa 1: verbos que barren el árbol. Puro — no toca el repo.
export function classifyStagingCommand(command: string): StagingVerdict {
	for (const segment of expandCommands(command)) {
		const addArgs = gitSubcommand(segment, "add");
		if (addArgs) {
			for (const token of addArgs) {
				const arg = token.value;
				if (isFlag(token) && BULK_ADD_FLAGS.has(arg)) {
					return {
						kind: "blocked",
						reason: `Ein staging gate: \`git add ${arg}\` hace staging a granel y no puede enumerar lo que entra; en un árbol con trabajo en curso ajeno publica ficheros de otro. ${REMEDY}`,
					};
				}
				// Flags cortos agrupados: `-Au`, `-uA`.
				if (isFlag(token) && /^-[A-Za-z]+$/.test(arg) && !arg.startsWith("--") && /[Au]/.test(arg.slice(1))) {
					return {
						kind: "blocked",
						reason: `Ein staging gate: \`git add ${arg}\` incluye staging a granel (-A/-u). ${REMEDY}`,
					};
				}
				if (!token.quoted && BULK_PATHSPECS.has(arg)) {
					return {
						kind: "blocked",
						reason: `Ein staging gate: \`git add ${arg}\` mete TODO el árbol de trabajo. ${REMEDY}`,
					};
				}
			}
		}
		const commitArgs = gitSubcommand(segment, "commit");
		if (commitArgs) {
			for (const token of commitArgs) {
				if (!isFlag(token)) continue;
				const arg = token.value;
				if (arg === "-a" || arg === "--all") {
					return {
						kind: "blocked",
						reason: `Ein staging gate: \`git commit ${arg}\` hace staging de todo lo modificado y se salta el \`git add\` explícito. Haz el add de las rutas exactas y luego \`git commit\` sin ${arg}.`,
					};
				}
				// `-am "msg"` y similares.
				if (/^-[A-Za-z]+$/.test(arg) && arg.includes("a") && !arg.startsWith("--")) {
					return {
						kind: "blocked",
						reason: `Ein staging gate: \`git commit ${arg}\` incluye \`-a\` (staging de todo lo modificado). Haz el \`git add\` explícito y luego commitea sin \`-a\`.`,
					};
				}
			}
		}
	}
	return { kind: "ok" };
}

// Salida de `git add --dry-run`: líneas `add 'ruta'`. Puro.
export function parseDryRunPaths(output: string): string[] {
	const paths: string[] = [];
	for (const line of output.split("\n")) {
		const match = line.match(/^(?:add|remove) '(.+)'$/);
		if (match?.[1]) paths.push(match[1]);
	}
	return paths;
}

// Capa 2 (pura): de lo que git añadiría, qué está SIN TRACKEAR y no fue
// nombrado tal cual. Nombrar un fichero nuevo es deliberado y se permite;
// arrastrarlo dentro de un directorio, no.
export function sweptUntracked(
	wouldAdd: readonly string[],
	untracked: readonly string[],
	pathspecs: readonly string[],
): string[] {
	const untrackedSet = new Set(untracked);
	const named = new Set(pathspecs.map((spec) => spec.replace(/^\.\//, "").replace(/\/+$/, "")));
	return wouldAdd
		.filter((path) => untrackedSet.has(path))
		.filter((path) => !named.has(path))
		.sort();
}

// Argumentos de `git add` que son pathspecs (no flags). Tras `--` todo lo es.
export function addPathspecs(command: string): string[] {
	const specs: string[] = [];
	for (const segment of expandCommands(command)) {
		const args = gitSubcommand(segment, "add");
		if (!args) continue;
		let literal = false;
		for (const token of args) {
			if (!token.quoted && token.value === "--") {
				literal = true;
				continue;
			}
			if (!literal && isFlag(token)) continue;
			if (token.value) specs.push(token.value);
		}
	}
	return specs;
}

// `LC_ALL=C` fija el idioma de la salida. `git add --dry-run` imprime `add
// '<ruta>'`, y ese texto pasa por la capa de traducción de git: en un entorno
// localizado una traducción futura dejaría la lista VACÍA y el guard diría que
// todo está bien. Hoy no se traduce en ningún locale probado, pero anclarlo
// cuesta una línea y elimina la clase de fallo entera.
function git(cwd: string, args: string[]): string | null {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			env: { ...process.env, LC_ALL: "C", LANGUAGE: "C" },
		});
	} catch {
		return null;
	}
}

// Argumentos crudos de `git add`, tal cual los escribió quien llama. El dry-run
// debe ejecutarse con ELLOS, no con una reconstrucción: reconstruir solo los
// pathspecs descartaba flags que cambian QUÉ entra —sobre todo `-f`, que mete
// ficheros ignorados— y el guard daba `ok` a un `git add -f dist/` capaz de
// publicar un `.env`. La regla es simple: si no puedes reproducir el comando,
// no puedes predecir su efecto.
function rawAddArgs(command: string): string[] | null {
	for (const segment of expandCommands(command)) {
		const args = gitSubcommand(segment, "add");
		if (args) return args.map((token) => token.value);
	}
	return null;
}

// Flags interactivos: no pueden correr headless y colgarían el dry-run.
const INTERACTIVE_ADD = new Set(["-i", "--interactive", "-p", "--patch", "-e", "--edit"]);

// Capa 2 (impura): pregunta a git qué haría EJECUTANDO EL MISMO COMANDO en seco
// y comprueba si algo que no está trackeado entra sin haber sido nombrado.
// Ante cualquier fallo de git devuelve `ok`: este gate previene un descuido, no
// es un control de seguridad, y no debe romper el flujo si el repo no está en
// un estado consultable.
export function inspectUntrackedSweep(cwd: string, command: string): StagingVerdict {
	const args = rawAddArgs(command);
	if (args === null || args.length === 0) return { kind: "ok" };
	if (args.some((arg) => INTERACTIVE_ADD.has(arg))) return { kind: "ok" };
	const specs = addPathspecs(command);
	const dryRun = git(cwd, ["add", "--dry-run", ...args]);
	if (dryRun === null) return { kind: "ok" };
	const wouldAdd = parseDryRunPaths(dryRun);
	if (wouldAdd.length === 0) return { kind: "ok" };
	// "No trackeado" se decide preguntando cuáles SÍ lo están, en vez de listar
	// los untracked: así un fichero IGNORADO —que `ls-files --others
	// --exclude-standard` nunca devuelve— también cuenta como no trackeado.
	const tracked = git(cwd, ["ls-files", "--", ...wouldAdd]);
	if (tracked === null) return { kind: "ok" };
	const trackedSet = new Set(tracked.split("\n").map((line) => line.trim()).filter(Boolean));
	const swept = sweptUntracked(
		wouldAdd,
		wouldAdd.filter((path) => !trackedSet.has(path)),
		specs,
	);
	if (swept.length === 0) return { kind: "ok" };
	const list = swept.slice(0, 8).join(", ");
	const more = swept.length > 8 ? ` (+${swept.length - 8} más)` : "";
	return {
		kind: "blocked",
		reason: `Ein staging gate: ese \`git add\` arrastraría ficheros NO TRACKEADOS (o ignorados) que no has nombrado: ${list}${more}. Puede ser trabajo en curso de otro. Si de verdad forman parte de la entrega, nómbralos uno a uno; si no, acota el pathspec.`,
	};
}

// Punto de entrada del hook: capa 1 (barata, pura) y luego capa 2.
export function evaluateStaging(cwd: string, command: string): StagingVerdict {
	const bulk = classifyStagingCommand(command);
	if (bulk.kind === "blocked") return bulk;
	return inspectUntrackedSweep(cwd, command);
}
