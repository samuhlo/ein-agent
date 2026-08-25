// =============================================================================
// [CORE] LINTER DE ESTILO SOBRE LINEAS TOCADAS
//
// POR QUE -> el estilo estaba escrito y nadie comprobaba el resultado, asi que
// "no leyo la skill" y "la leyo y la ignoro" eran indistinguibles.
//
// ALCANCE -> solo lo que una maquina puede comprobar de verdad: emojis y el
// formato base del log. Si un comentario explica el porque, si esta obsoleto o
// si el acento vandal se gana su sitio es JUICIO, y un linter que lo fingiera
// seria otra pantalla afirmando lo que no calculo. Por eso el informe dice que
// comprobo: su silencio no es un aprobado general.
//
// Informativo, no puerta: no bloquea una entrega mientras su ruido no este
// medido.
//
// CORTE -> recibe lineas, nunca recorre el arbol. El limite de "solo lo tocado"
// es estructural, no una promesa: no puede reescribir lo que no ve.
//
// Modulo PURO.
// =============================================================================

// NOTE -> aqui NO hay lista de tags de comentario, y es a proposito. La skill
// dice "use these tags only when useful": SUGIERE, no cierra. Ella misma usa
// [FEATURE] y [CRITICAL] fuera del catalogo universal. Tratarla como whitelist
// marcaba comentarios correctos, que es peor que no comprobar nada.

/** Tags documentados en `logging-style`. */
export const LOG_TAGS: readonly string[] = [
	"INFO", "WARN", "ERR", "HOOK", "INGEST", "ANLZ",
	"DATA", "DB", "API", "AUTH", "CACHE",
];

/** Separadores del formato base: general, arranque, exito, saliente. */
export const LOG_SEPARATORS: readonly string[] = ["::", ">>", "++", "->"];

/** Lo que este linter mira. Se publica para que su silencio no se sobreinterprete. */
export const PERFORMED_CHECKS: readonly string[] = [
	"emojis en comentarios y logs",
	"formato base de las lineas de log con tag",
];

export type StyleFinding = Readonly<{
	line: number;
	rule: "emoji" | "log-format";
	message: string;
}>;

export type StyleLintReport = Readonly<{
	findings: readonly StyleFinding[];
	/** Lo comprobado, para que un informe limpio no se lea como "el estilo es correcto". */
	checked: readonly string[];
}>;

// Pictogramas de verdad. El bloque 2600-27BF queda FUERA a proposito: ahi viven
// los dingbats tipograficos que la propia gramatica de Ein usa —el `GLYPH.done`
// es un `\u2713`— y marcarlos daba nueve falsos positivos sobre codigo correcto.
// Solo cuentan como emoji si llevan el selector de presentacion detras.
const PICTOGRAM = /[\u{1F000}-\u{1FAFF}]/u;
const DINGBAT_AS_EMOJI = /[\u{2600}-\u{27BF}]\u{FE0F}/u;

// HACK -> dos expresiones en vez de una con `|`. Bun 1.3.14 devuelve false al
// alternar un rango astral con otra rama: el rango suelto encuentra el
// pictograma y la misma alternancia no. Comprobado antes de dar el rodeo.
function hasEmoji(text: string): boolean {
	return PICTOGRAM.test(text) || DINGBAT_AS_EMOJI.test(text);
}

const LINE_COMMENT = /(^|\s)\/\/(.*)$/;
const BLOCK_COMMENT_BODY = /^\s*\*?\s?(.*)$/;

// `console.<nivel>("[...`: solo se juzga el log que ya intenta llevar tag, para
// no exigir el formato a un `console.log` de texto libre que no lo pretende.
const TAGGED_LOG = /console\.(log|info|warn|error|debug)\(\s*[`"']\s*(\[[^\]]*\][^`"']*)/;

function commentBodyOf(line: string): string | null {
	const inline = LINE_COMMENT.exec(line);
	if (inline) return inline[2] ?? "";
	if (/^\s*\*/.test(line)) return BLOCK_COMMENT_BODY.exec(line)?.[1] ?? "";
	return null;
}

/** ¿La cabecera del log respeta `[TAG] SEP ACTION`? */
function logFormatProblem(payload: string): string | null {
	const match = /^\[([^\]]*)\]\s*(\S+)?\s*(\S+)?/.exec(payload);
	if (!match) return "no empieza por un tag entre corchetes";

	const [, tag, separator, action] = match;
	if (!tag || tag.length > 6 || tag !== tag.toUpperCase()) {
		return `tag "${tag ?? ""}" invalido: hasta 6 caracteres en mayusculas`;
	}
	if (!LOG_TAGS.includes(tag)) return `tag "${tag}" fuera del catalogo`;
	if (!separator || !LOG_SEPARATORS.includes(separator)) {
		return `separador "${separator ?? ""}" invalido: ${LOG_SEPARATORS.join(" ")}`;
	}
	if (!action || action.length > 12 || action !== action.toUpperCase()) {
		return `accion "${action ?? ""}" invalida: hasta 12 caracteres en mayusculas`;
	}
	return null;
}

/** Revisa las lineas dadas. `offset` es el numero de la primera, para citar bien. */
export function lintStyle(lines: readonly string[], offset = 1): StyleLintReport {
	const findings: StyleFinding[] = [];

	lines.forEach((line, index) => {
		const number = offset + index;
		const comment = commentBodyOf(line);

		if (comment !== null) {
			if (hasEmoji(comment)) {
				findings.push({ line: number, rule: "emoji", message: "comentario con emoji: la skill los prohibe" });
			}
		}

		const log = TAGGED_LOG.exec(line);
		if (log) {
			const payload = log[2] ?? "";
			if (hasEmoji(payload)) {
				findings.push({ line: number, rule: "emoji", message: "log con emoji: la skill los prohibe" });
			}
			const problem = logFormatProblem(payload);
			if (problem) findings.push({ line: number, rule: "log-format", message: `log fuera de formato: ${problem}` });
		}
	});

	return { findings, checked: PERFORMED_CHECKS };
}
