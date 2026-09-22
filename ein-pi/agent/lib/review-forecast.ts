import { readReviewSnapshot, type ReviewRequest } from "./review-snapshot.ts";
export type { ReviewRequest } from "./review-snapshot.ts";

export type ReviewForecast = {
	mode?: ReviewRequest["mode"];
	baseOid?: string;
	headOid?: string;
	snapshotRef?: string;
	reason?: string;
	// insertions + deletions en ficheros de producción (lo que gatea el budget).
	production: number;
	// Bytes UTF-8 no blancos en líneas añadidas y eliminadas de producción.
	productionBytes: number;
	// Ficheros distintos de producción tocados por el rango.
	productionFiles: number;
	// Volumen localizado. Informa; nunca bloquea por sí solo.
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

export type ReviewBudget = {
	lines: number;
	bytes: number;
	densityBytesPerLine: number;
};

export type ReviewEvaluation = {
	overLines: boolean;
	overBytes: boolean;
	overBudget: boolean | null;
	decision: "within" | "over" | "unknown";
	densityNotices: ReviewFileVolume[];
};

export const DEFAULT_REVIEW_BUDGET_BYTES = 20_000;
export const DEFAULT_REVIEW_DENSITY_NOTICE_BYTES_PER_LINE = 160;

type DiffFile = {
	path: string;
	changedLines: number;
};

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

function formatInteger(value: number): string {
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function normalizeBudget(budget: number | ReviewBudget): ReviewBudget {
	if (typeof budget !== "number") return budget;
	return {
		lines: budget,
		bytes: DEFAULT_REVIEW_BUDGET_BYTES,
		densityBytesPerLine: DEFAULT_REVIEW_DENSITY_NOTICE_BYTES_PER_LINE,
	};
}

export function evaluateReviewForecast(
	forecast: ReviewForecast,
	budgetInput: number | ReviewBudget,
): ReviewEvaluation {
	const budget = normalizeBudget(budgetInput);
	const overLines = forecast.ok && forecast.production > budget.lines;
	const overBytes = forecast.ok && forecast.productionBytes > budget.bytes;
	return {
		overLines,
		overBytes,
		overBudget: forecast.ok ? overLines || overBytes : null,
		decision: !forecast.ok ? "unknown" : overLines || overBytes ? "over" : "within",
		densityNotices: forecast.ok
			? forecast.fileVolumes.filter((file) => file.bytesPerLine > budget.densityBytesPerLine)
			: [],
	};
}


function classify(path: string): "production" | "test" | "excluded" {
 if (/^(?:openspec|dist|\.output|\.nuxt|coverage)\//.test(path) || /(?:\.snap$|-lock\.|\.min\.)/.test(path)) return "excluded";
 return /(?:^|\/)(?:tests|__tests__|e2e)(?:\/|$)|\.(?:test|spec)\./.test(path) ? "test" : "production";
}

export function reviewForecast(cwd: string, request?: ReviewRequest): ReviewForecast;
export function reviewForecast(cwd: string, base?: string, head?: string): ReviewForecast;
export function reviewForecast(cwd: string, input?: ReviewRequest | string, head = "HEAD"): ReviewForecast {
 const request: ReviewRequest = typeof input === "string" ? { mode: "committed", base: input, head } : input ?? { mode: "working-tree" };
 const range = request.mode === "working-tree" ? "working-tree" : `${request.base ?? "HEAD"}..${request.head ?? "HEAD"}`;
 const snapshot = readReviewSnapshot(cwd, request);
 const unavailable = (reason: string): ReviewForecast => ({ ok: false, production: 0, productionBytes: 0, productionFiles: 0, fileVolumes: [], tests: 0, range, mode: request.mode, reason });
 if (!snapshot.ok) return unavailable(snapshot.reason);
 const files = parseNumstat(snapshot.numstatZ);
 const sections = snapshot.patch.length === 0 ? [] : snapshot.patch.split(/^diff --git /mu).slice(1);
 if (!files || files.length !== sections.length) return unavailable("snapshot diff is inconsistent");
 const volumes: ReviewFileVolume[] = [];
 let tests = 0;
 files.forEach((file, index) => {
  const kind = classify(file.path);
  if (kind === "test") tests += file.changedLines;
  if (kind !== "production") return;
  const bytes = changedBytes(sections[index] ?? "");
  volumes.push({ path: file.path, changedLines: file.changedLines, changedBytes: bytes, bytesPerLine: file.changedLines ? Math.round(bytes / file.changedLines * 100) / 100 : 0 });
 });
 return { ok: true, production: volumes.reduce((sum, f) => sum + f.changedLines, 0), productionBytes: volumes.reduce((sum, f) => sum + f.changedBytes, 0), productionFiles: volumes.length, fileVolumes: volumes, tests, range, mode: snapshot.mode, baseOid: snapshot.baseOid, headOid: snapshot.headOid, snapshotRef: snapshot.snapshotRef };
}

// Render compacto para el envelope del tool: el parent transporta esta decisión.
export function formatReviewForecast(
	forecast: ReviewForecast,
	budgetInput: number | ReviewBudget,
	evaluation = evaluateReviewForecast(forecast, budgetInput),
): string {
	if (!forecast.ok) {
		return `// review forecast — no medible: ${forecast.reason ?? "Git no disponible"}. No publicar hasta obtener una medida válida.`;
	}
	const budget = normalizeBudget(budgetInput);
	const productionUnit = forecast.productionFiles === 1 ? "fichero" : "ficheros";
	const volume = [
		`${forecast.production} líneas`,
		`${formatInteger(forecast.productionBytes)} bytes no blancos`,
		`${forecast.productionFiles} ${productionUnit}`,
	].join(" · ");
	const excess = [
		evaluation.overLines ? `${forecast.production} > ${budget.lines} líneas` : "",
		evaluation.overBytes
			? `${formatInteger(forecast.productionBytes)} > ${formatInteger(budget.bytes)} bytes`
			: "",
	].filter(Boolean).join(" · ");
	const noticePaths = evaluation.densityNotices.slice(0, 8).map((notice) => notice.path);
	const hiddenNotices = evaluation.densityNotices.length - noticePaths.length;
	const notice = noticePaths.length === 0
		? ""
		: `aviso de densidad: ${noticePaths.join(", ")}${hiddenNotices > 0 ? ` y ${hiddenNotices} más` : ""}`;
	return [
		`// review forecast (${forecast.range})`,
		`producción: ${volume}`,
		`tests: +${forecast.tests} líneas (reportado, no gatea)`,
		`budget: ${budget.lines} líneas · ${formatInteger(budget.bytes)} bytes`,
		notice,
		evaluation.overBudget
			? `SUPERA el budget (${excess}) → pregunta al usuario: PR único vs partir en PRs más pequeños.`
			: "dentro del budget de líneas y bytes → adelante con un PR.",
	].filter(Boolean).join("\n");
}
