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
//      siempre — ninguno puede enumerar lo que entra.
//   2. BARRIDO DE UNTRACKED (contra el repo): incluso con pathspec explícito,
//      `git add dir/` arrastra los ficheros SIN TRACKEAR que haya dentro. Se
//      compara lo que git dice que añadiría contra los untracked reales; si
//      alguno entra sin estar nombrado, se rechaza.
//
// El bloqueo NO es un callejón: la salida siempre existe y es la correcta —
// nombrar las rutas. A diferencia de un gate de confirmación, aquí "arreglarlo"
// y "hacerlo bien" son lo mismo.
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

const BULK_ADD_FLAGS = new Set(["-A", "--all", "-u", "--update", "--no-ignore-removal"]);
// Pathspecs que significan "todo": el punto y la raíz mágica de git.
const BULK_PATHSPECS = new Set([".", "./", ":/", ":/*", "*"]);

const REMEDY =
	"Nombra las rutas exactas (`git add ruta/a.ts ruta/b.ts`). Es la única forma de garantizar que el commit contiene lo que se decidió entregar y nada más.";

// Capa 1: verbos que barren el árbol. Puro — no toca el repo.
export function classifyStagingCommand(command: string): StagingVerdict {
	for (const segment of segmentTokens(command)) {
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
	for (const segment of segmentTokens(command)) {
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

function git(cwd: string, args: string[]): string | null {
	try {
		return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
	} catch {
		return null;
	}
}

// Capa 2 (impura): pregunta a git qué haría y contrasta con los untracked
// reales. Ante cualquier fallo de git devuelve `ok`: este gate previene un
// descuido, no es un control de seguridad, y no debe romper el flujo si el
// repo no está en un estado consultable.
export function inspectUntrackedSweep(cwd: string, command: string): StagingVerdict {
	const specs = addPathspecs(command);
	if (specs.length === 0) return { kind: "ok" };
	const dryRun = git(cwd, ["add", "--dry-run", "--", ...specs]);
	if (dryRun === null) return { kind: "ok" };
	const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard"]);
	if (untracked === null) return { kind: "ok" };
	const swept = sweptUntracked(
		parseDryRunPaths(dryRun),
		untracked.split("\n").map((line) => line.trim()).filter(Boolean),
		specs,
	);
	if (swept.length === 0) return { kind: "ok" };
	const list = swept.slice(0, 8).join(", ");
	const more = swept.length > 8 ? ` (+${swept.length - 8} más)` : "";
	return {
		kind: "blocked",
		reason: `Ein staging gate: ese \`git add\` arrastraría ficheros SIN TRACKEAR que no has nombrado: ${list}${more}. Puede ser trabajo en curso de otro. Si de verdad forman parte de la entrega, nómbralos uno a uno; si no, acota el pathspec.`,
	};
}

// Punto de entrada del hook: capa 1 (barata, pura) y luego capa 2.
export function evaluateStaging(cwd: string, command: string): StagingVerdict {
	const bulk = classifyStagingCommand(command);
	if (bulk.kind === "blocked") return bulk;
	return inspectUntrackedSweep(cwd, command);
}
