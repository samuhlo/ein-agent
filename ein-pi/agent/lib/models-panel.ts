// =============================================================================
// MODELS PANEL
// Panel TUI de /ein:models: tabla agente/modelo/esfuerzo con paleta de marca,
// picker de modelos con búsqueda, picker de esfuerzo y fila especial del
// orquestador (persiste en settings.json global, no en models.json).
// =============================================================================

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { loadPalette } from "../extensions/ein-brand";
import {
	type AgentModelConfig,
	type ThinkingLevel,
	AGENT_RECOMMENDATIONS,
	SDD_AGENT_NAME_SET,
	applyModelConfigAsync,
	cloneModelConfig,
	describeModelConfig,
	listDiscoverableAgents,
	modelConfigPath,
	readOrchestratorModel,
	readSavedModelConfigAsync,
	updateGlobalDefaultModel,
	writeModelConfig,
} from "./model-config";
import { t, tf } from "./i18n/strings";

const KEEP_CURRENT = t("models.keep_current", "Mantener actual");
const INHERIT_MODEL = t("models.inherit_model", "Heredar modelo activo/por defecto");
const CUSTOM_MODEL = t("models.custom_model", "Id de modelo personalizado");
// Ciclo de esfuerzo inline: `e` avanza al siguiente en la propia fila
// (undefined = heredar). Antes era un picker de pantalla propia; inline es más
// rápido y las barras del nivel elegido ya se ven en la tabla.
const EFFORT_CYCLE: (ThinkingLevel | undefined)[] = [
	undefined, "off", "minimal", "low", "medium", "high", "xhigh",
];

const MODEL_CONTROL_OPTIONS = [
	KEEP_CURRENT,
	INHERIT_MODEL,
	CUSTOM_MODEL,
] as const;

async function getPiModelOptions(ctx: ExtensionContext): Promise<string[]> {
	const models = await ctx.modelRegistry.getAvailable();
	const modelIds = models
		.map((model) => `${model.provider}/${model.id}`)
		.sort((left, right) => left.localeCompare(right));
	return [...MODEL_CONTROL_OPTIONS, ...modelIds];
}

interface OverlayComponent {
	render(width: number): string[];
	handleInput(data: string): void;
	invalidate(): void;
}

type ModelPanelResult =
	| { type: "save"; config: AgentModelConfig }
	| { type: "custom"; agent: string | "all"; config: AgentModelConfig }
	| { type: "cancel" };

const SET_ALL_AGENTS = t("models.set_all", "Configurar todos los agentes");
const ORCHESTRATOR_ROW = "__orchestrator__";

// ─── Models panel visual helpers ─────────────────────────────────────────────
// Truecolor desde la paleta de marca (brand.json). Sin matices fuera de marca:
// la jerarquía se expresa con bold/dim, no con más colores.
const BRAND = loadPalette();
function fg(c: { r: number; g: number; b: number }): string {
	return `\x1b[38;2;${c.r};${c.g};${c.b}m`;
}
// Paleta HONESTA: la marca solo aporta 3 colores (amarillo, concrete, gris).
// Antes había 5 alias, pero `grn`/`gold` eran ambos amarillo y `cyan`/`wht`
// ambos concrete — nombres que mentían sobre lo que pintaban.
const AP = {
	r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m',
	yellow: fg(BRAND.yellow), concrete: fg(BRAND.concrete), gray: fg(BRAND.structure),
} as const;

function vaStrip(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function vaPad(s: string, w: number): string {
	const vis = vaStrip(s).length;
	return vis < w ? s + ' '.repeat(w - vis) : s;
}

// Un solo color de marca para todos los modelos. Antes se coloreaba por familia
// con regex de nombre (gpt/claude/minimax…) — eso se pudre en cuanto salen o
// mueren modelos, justo lo que `model-config.ts` evita al no hardcodear nombres.
// La jerarquía (activo vs heredado) la da bold/dim, no más colores.
function vaModelColor(id: string | undefined): string {
	if (!id) return `${AP.d}${AP.gray}inherit${AP.r}`;
	const short = id.includes('/') ? id.split('/').pop()! : id;
	return `${AP.concrete}${short}${AP.r}`;
}

function vaEffortColor(lvl: ThinkingLevel | undefined): string {
	if (!lvl) return `${AP.d}${AP.gray}─${AP.r}`;
	const MAP: Record<ThinkingLevel, string> = {
		off:     `${AP.gray}○  off${AP.r}`,
		minimal: `${AP.d}▪  minimal${AP.r}`,
		low:     `${AP.concrete}▪▪  low${AP.r}`,
		medium:  `${AP.concrete}▪▪▪  medium${AP.r}`,
		high:    `${AP.yellow}▪▪▪▪  high${AP.r}`,
		xhigh:   `${AP.b}${AP.yellow}▪▪▪▪▪  xhigh${AP.r}`,
	};
	return MAP[lvl];
}
// ─────────────────────────────────────────────────────────────────────────────

class SddModelPanel implements OverlayComponent {
	private cursor = 0;
	private mode: "agents" | "models" = "agents";
	private selectedRow = SET_ALL_AGENTS;
	private modelCursor = 0;
	private query = "";
	private readonly draft: AgentModelConfig;
	private readonly rows: string[];
	private readonly modelOptions: string[];
	private readonly done: (result: ModelPanelResult) => void;

	constructor(
		initialConfig: AgentModelConfig,
		modelOptions: string[],
		agents: string[],
		done: (result: ModelPanelResult) => void,
	) {
		this.draft = cloneModelConfig(initialConfig);
		this.rows = [ORCHESTRATOR_ROW, SET_ALL_AGENTS, ...agents];
		this.modelOptions = modelOptions;
		this.done = done;
	}

	invalidate(): void {}

	handleInput(data: string): void {
		if (this.mode === "models") {
			this.handleModelInput(data);
			return;
		}
		this.handleAgentInput(data);
	}

	render(width: number): string[] {
		if (this.mode === "models") return this.renderModelPicker(width);
		return this.renderAgentList(width);
	}

	private handleAgentInput(data: string): void {
		const maxCursor = this.rows.length + 1;
		if (matchesKey(data, "ctrl+c") || matchesKey(data, "escape")) {
			this.done({ type: "cancel" });
			return;
		}
		if (matchesKey(data, "ctrl+s")) {
			this.done({ type: "save", config: this.draft });
			return;
		}
		if (matchesKey(data, "down") || data === "j") {
			this.cursor = Math.min(maxCursor, this.cursor + 1);
			return;
		}
		if (matchesKey(data, "up") || data === "k") {
			this.cursor = Math.max(0, this.cursor - 1);
			return;
		}
		if (data === "i") {
			this.applyInherit();
			return;
		}
		if (data === "e") {
			this.cycleEffort();
			return;
		}
		if (data === "c") {
			const row = this.rows[this.cursor];
			if (row === SET_ALL_AGENTS)
				this.done({ type: "custom", agent: "all", config: this.draft });
			else if (row)
				this.done({ type: "custom", agent: row, config: this.draft });
			return;
		}
		if (!matchesKey(data, "return")) return;
		if (this.cursor === this.rows.length) {
			this.done({ type: "save", config: this.draft });
			return;
		}
		if (this.cursor === this.rows.length + 1) {
			this.done({ type: "cancel" });
			return;
		}
		this.selectedRow = this.rows[this.cursor] ?? SET_ALL_AGENTS;
		this.mode = "models";
		this.modelCursor = 0;
		this.query = "";
	}

	private handleModelInput(data: string): void {
		const options = this.filteredModelOptions();
		if (matchesKey(data, "ctrl+c")) {
			this.done({ type: "cancel" });
			return;
		}
		if (matchesKey(data, "escape")) {
			this.mode = "agents";
			this.query = "";
			return;
		}
		if (matchesKey(data, "backspace")) {
			this.query = this.query.slice(0, -1);
			this.modelCursor = Math.min(
				this.modelCursor,
				Math.max(0, this.filteredModelOptions().length - 1),
			);
			return;
		}
		if (matchesKey(data, "down") || data === "j") {
			this.modelCursor = Math.min(
				Math.max(0, options.length - 1),
				this.modelCursor + 1,
			);
			return;
		}
		if (matchesKey(data, "up") || data === "k") {
			this.modelCursor = Math.max(0, this.modelCursor - 1);
			return;
		}
		if (matchesKey(data, "return")) {
			const selected = options[this.modelCursor];
			if (!selected) return;
			if (selected === CUSTOM_MODEL) {
				this.done({
					type: "custom",
					agent: this.selectedRow === SET_ALL_AGENTS ? "all" : this.selectedRow,
					config: this.draft,
				});
				return;
			}
			if (selected === KEEP_CURRENT) {
				this.mode = "agents";
				return;
			}
			this.applyModelSelection(
				selected === INHERIT_MODEL ? undefined : selected,
			);
			this.mode = "agents";
			return;
		}
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.query += data;
			this.modelCursor = 0;
		}
	}

	private get agentNames(): string[] {
		return this.rows.filter(r => r !== ORCHESTRATOR_ROW && r !== SET_ALL_AGENTS);
	}

	private applyModelSelection(model: string | undefined): void {
		const row = this.rows[this.cursor];
		if (row === SET_ALL_AGENTS) {
			for (const name of this.agentNames) this.setModel(name, model);
			// "Todos" incluye al orquestador.
			this.setModel(ORCHESTRATOR_ROW, model);
			return;
		}
		if (!row) return;
		this.setModel(row, model);
	}

	private applyThinkingSelection(thinking: ThinkingLevel | undefined): void {
		const row = this.selectedRow;
		if (row === SET_ALL_AGENTS) {
			for (const name of this.agentNames) this.setThinking(name, thinking);
			return;
		}
		if (row === ORCHESTRATOR_ROW) return; // Orquestador no tiene ajuste de esfuerzo.
		this.setThinking(row, thinking);
	}

	// Esfuerzo del set "Todos": el común si coincide, undefined si es mixto.
	private commonEffort(): ThinkingLevel | undefined {
		const efforts = [...new Set(this.agentNames.map((name) => this.draft[name]?.thinking))];
		return efforts.length === 1 ? efforts[0] : undefined;
	}

	// `e` avanza el esfuerzo de la fila enfocada al siguiente del ciclo, in situ.
	private cycleEffort(): void {
		const row = this.rows[this.cursor] ?? SET_ALL_AGENTS;
		if (row === ORCHESTRATOR_ROW) return; // Orquestador no tiene ajuste de esfuerzo.
		const current = row === SET_ALL_AGENTS ? this.commonEffort() : this.draft[row]?.thinking;
		const idx = EFFORT_CYCLE.findIndex((level) => level === current);
		const next = EFFORT_CYCLE[(idx + 1) % EFFORT_CYCLE.length];
		this.selectedRow = row;
		this.applyThinkingSelection(next);
	}

	private applyInherit(): void {
		const row = this.rows[this.cursor];
		if (row === SET_ALL_AGENTS) {
			for (const name of this.agentNames) this.clearEntry(name);
			this.clearEntry(ORCHESTRATOR_ROW);
			return;
		}
		if (row) this.clearEntry(row);
	}

	private setModel(name: string, model: string | undefined): void {
		const current = this.draft[name] ?? {};
		if (model === undefined) delete current.model;
		else current.model = model;
		if (!current.model && !current.thinking) delete this.draft[name];
		else this.draft[name] = current;
	}

	private setThinking(name: string, thinking: ThinkingLevel | undefined): void {
		const current = this.draft[name] ?? {};
		if (thinking === undefined) delete current.thinking;
		else current.thinking = thinking;
		if (!current.model && !current.thinking) delete this.draft[name];
		else this.draft[name] = current;
	}

	private clearEntry(name: string): void {
		delete this.draft[name];
	}

	private static addBorder(title: string, lines: string[], width: number): string[] {
		const inner = Math.max(4, width - 2);
		const titleVis = vaStrip(title).length;
		const leftDash = 2;
		const rightDash = Math.max(1, inner - 2 - leftDash - titleVis);
		const top =
			`${AP.d}${AP.gray}┌${'─'.repeat(leftDash)}${AP.r} ${title} ` +
			`${AP.d}${AP.gray}${'─'.repeat(rightDash)}┐${AP.r}`;
		const bottom = `${AP.d}${AP.gray}└${'─'.repeat(inner)}┘${AP.r}`;
		const result: string[] = [top];
		for (const line of lines) {
			const pad = Math.max(0, inner - vaStrip(line).length);
			result.push(`${AP.d}${AP.gray}│${AP.r}${line}${' '.repeat(pad)}${AP.d}${AP.gray}│${AP.r}`);
		}
		result.push(bottom);
		return result;
	}

	private filteredModelOptions(): string[] {
		const query = this.query.trim().toLowerCase();
		if (!query) return this.modelOptions;
		return this.modelOptions.filter((option) =>
			option.toLowerCase().includes(query),
		);
	}

	private renderAgentList(width: number): string[] {
		const inner = Math.max(4, width - 2);
		const tr = (t = '') => truncateToWidth(t, inner, '…', true);
		const C1 = 18;
		const C2 = 16;
		const lines: string[] = [];

		lines.push(tr(''));
		lines.push(tr(
			` ${AP.d}${AP.gray}${t("models.col.agent", "AGENTE").padEnd(C1)}  ${t("models.col.model", "MODELO").padEnd(C2)}  ${t("models.col.effort", "ESFUERZO")}${AP.r}`
		));
		lines.push(tr(` ${AP.d}${AP.gray}${'─'.repeat(C1 + C2 + 12)}${AP.r}`));
		lines.push(tr(''));

		let prevGroup = '';

		for (let i = 0; i < this.rows.length; i++) {
			const row = this.rows[i] ?? SET_ALL_AGENTS;
			const focused = i === this.cursor;
			const cur = focused ? `${AP.yellow}▸${AP.r}` : ' ';

			if (row === ORCHESTRATOR_ROW) {
				const model = this.draft[ORCHESTRATOR_ROW]?.model;
				const orchLabel = t("models.row.orchestrator", "Orquestador");
				const nameStr = focused
					? `${AP.b}${AP.yellow}◈ ${orchLabel}${AP.r}`
					: `${AP.concrete}◈ ${orchLabel}${AP.r}`;
				lines.push(tr(
					`${cur} ${vaPad(nameStr, C1)}  ${vaPad(vaModelColor(model), C2)}  ${AP.d}${AP.gray}─${AP.r}`
				));
				lines.push(tr(` ${AP.d}${AP.gray}${'─'.repeat(C1 + C2 + 10)}${AP.r}`));
				continue;
			}

			if (row === SET_ALL_AGENTS) {
				const allModels = this.agentNames.map(n => this.draft[n]?.model);
				const allEfforts = this.agentNames.map(n => this.draft[n]?.thinking);
				const uniqM = [...new Set(allModels)];
				const uniqE = [...new Set(allEfforts)];
				const mStr = uniqM.length === 1 ? vaModelColor(uniqM[0]) : `${AP.yellow}mixed${AP.r}`;
				const eStr = uniqE.length === 1 ? vaEffortColor(uniqE[0]) : `${AP.yellow}mixed${AP.r}`;
				const allLabel = t("models.row.all_agents", "Todos los agentes");
				const label = focused
					? `${AP.b}${AP.concrete}⊞  ${allLabel}${AP.r}`
					: `${AP.d}⊞  ${allLabel}${AP.r}`;
				lines.push(tr(`${cur} ${vaPad(label, C1)}  ${vaPad(mStr, C2)}  ${eStr}`));
				lines.push(tr(''));
				continue;
			}

			const group = SDD_AGENT_NAME_SET.has(row) ? 'SDD'
				: (row === 'ein-linear' || row === 'ein-git') ? t("models.group.delivery", "ENTREGA")
				: t("models.group.other", "OTROS");

			if (group !== prevGroup) {
				const sep = `─── ${group} `;
				lines.push(tr(
					` ${AP.d}${AP.gray}${sep}${'─'.repeat(Math.max(2, C1 + C2 + 6 - sep.length))}${AP.r}`
				));
				prevGroup = group;
			}

			const model = this.draft[row]?.model;
			const effort = this.draft[row]?.thinking;
			const nameStr = focused ? `${AP.b}${AP.yellow}${row}${AP.r}` : row;
			// Marcador de desviación: solo cuando el esfuerzo está FIJADO y no
			// coincide con el recomendado. El tier del modelo no se puede clasificar
			// (un nombre no dice si es barato o capaz), así que no se marca.
			const rowRec = AGENT_RECOMMENDATIONS[row];
			const deviates = Boolean(rowRec && effort && effort !== rowRec.thinking);
			const mark = deviates ? `  ${AP.yellow}${AP.b}!${AP.r}` : "";
			lines.push(tr(
				`${cur} ${vaPad(nameStr, C1)}  ${vaPad(vaModelColor(model), C2)}  ${vaEffortColor(effort)}${mark}`
			));
		}

		// Recomendación para el agente enfocado: nivel de modelo (barato/capaz) +
		// thinking + por qué. Ayuda a elegir sin memorizar la arquitectura.
		const focusedRow = this.rows[this.cursor];
		const recKey = focusedRow === ORCHESTRATOR_ROW ? "orchestrator" : focusedRow;
		const rec = recKey ? AGENT_RECOMMENDATIONS[recKey] : undefined;
		if (rec) {
			const tier = rec.tier === "cheap" ? t("models.rec.cheap", "barato") : t("models.rec.capable", "capaz");
			// Si el esfuerzo fijado se desvía, dilo explícito (el `!` de la fila).
			const focusedEffort = focusedRow && focusedRow !== ORCHESTRATOR_ROW ? this.draft[focusedRow]?.thinking : undefined;
			if (focusedEffort && focusedEffort !== rec.thinking) {
				lines.push(tr(''));
				lines.push(tr(
					` ${AP.yellow}${AP.b}!${AP.r} ${AP.yellow}${t("models.rec.deviates", "Fuera de recomendación")}: ${AP.r}${AP.concrete}${focusedEffort}${AP.r}${AP.d}${AP.gray} → recomendado ${AP.r}${AP.concrete}${rec.thinking}${AP.r}`
				));
			}
			lines.push(tr(''));
			lines.push(tr(
				` ${AP.d}${AP.gray}${t("models.rec.label", "Recomendado")}: ${AP.r}${AP.concrete}${tier} · ${rec.thinking}${AP.r}${AP.d}${AP.gray} — ${rec.reason}${AP.r}`
			));
		}

		lines.push(tr(''));
		const saveFoc = this.cursor === this.rows.length;
		const cancelFoc = this.cursor === this.rows.length + 1;
		lines.push(tr(
			` ${saveFoc ? `${AP.yellow}▸${AP.r}` : ' '} ${AP.yellow}✓ ${t("models.btn.save", "Guardar")}${AP.r}` +
			`        ` +
			`${cancelFoc ? `${AP.yellow}▸${AP.r}` : ' '} ${AP.d}${AP.gray}✗ ${t("models.btn.cancel", "Cancelar")}${AP.r}`
		));
		lines.push(tr(''));
		lines.push(tr(
			` ${AP.d}${AP.gray}${t("models.hint.main", "↑↓ · Enter modelo · e esfuerzo (cicla) · i heredar · Ctrl+S guardar")}${AP.r}`
		));
		lines.push(tr(''));

		const title = `${AP.yellow}${AP.b}■ ${t("models.title.agents", "MODELOS DE AGENTES")}${AP.r}`;
		return SddModelPanel.addBorder(title, lines, width);
	}

	private renderModelPicker(width: number): string[] {
		const inner = Math.max(4, width - 2);
		const tr = (t = '') => truncateToWidth(t, inner, '…', true);
		const options = this.filteredModelOptions();
		const lines: string[] = [];
		const isControlOpt = (s: string) => (MODEL_CONTROL_OPTIONS as readonly string[]).includes(s);

		const agentLabel = this.selectedRow === SET_ALL_AGENTS ? t("models.row.all_agents", "todos los agentes") : this.selectedRow;
		lines.push(tr(''));

		const searchText = this.query
			? `${AP.concrete}${this.query}${AP.r}`
			: `${AP.d}${AP.gray}${t("models.search.placeholder", "buscar...")}${AP.r}`;
		lines.push(tr(` ${AP.gray}◎${AP.r}  ${searchText}`));
		lines.push(tr(` ${AP.d}${AP.gray}${'─'.repeat(Math.max(10, inner - 2))}${AP.r}`));
		lines.push(tr(''));

		if (options.length === 0) {
			lines.push(tr(` ${AP.d}${AP.gray}${t("models.no_matches", "sin modelos coincidentes")}${AP.r}`));
		} else {
			const maxVisible = 12;
			const start = Math.max(
				0,
				Math.min(
					this.modelCursor - Math.floor(maxVisible / 2),
					Math.max(0, options.length - maxVisible),
				),
			);
			const end = Math.min(options.length, start + maxVisible);
			let addedSep = false;

			for (let i = start; i < end; i++) {
				const opt = options[i] ?? '';
				const focused = i === this.modelCursor;
				const cur = focused ? `${AP.yellow}▸${AP.r}` : ' ';

				if (!addedSep && !isControlOpt(opt)) {
					addedSep = true;
					lines.push(tr(` ${AP.d}${AP.gray}${'─'.repeat(Math.max(10, inner - 2))}${AP.r}`));
				}

				let label: string;
				if (opt === KEEP_CURRENT) {
					label = focused ? `${AP.b}${AP.concrete}${opt}${AP.r}` : `${AP.d}${opt}${AP.r}`;
				} else if (opt === INHERIT_MODEL) {
					label = focused ? `${AP.b}${AP.concrete}${opt}${AP.r}` : `${AP.d}${opt}${AP.r}`;
				} else if (opt === CUSTOM_MODEL) {
					label = focused
						? `${AP.b}${AP.concrete}${opt}…${AP.r}`
						: `${AP.d}${AP.gray}${opt}…${AP.r}`;
				} else {
					const parts = opt.split('/');
					if (parts.length >= 2) {
						const provider = parts.slice(0, -1).join('/');
						const modelPart = parts[parts.length - 1]!;
						const colored = vaModelColor(modelPart);
						label = focused
							? `${AP.d}${AP.gray}${provider}/${AP.r}${AP.b}${colored}`
							: `${AP.d}${AP.gray}${provider}/${AP.r}${colored}`;
					} else {
						label = focused ? `${AP.b}${vaModelColor(opt)}` : vaModelColor(opt);
					}
				}
				lines.push(tr(` ${cur} ${label}`));
			}

			if (end < options.length) {
				lines.push(tr(` ${AP.d}${AP.gray}··· ${tf("models.more", "{0} más", options.length - end)}${AP.r}`));
			}
		}

		lines.push(tr(''));
		lines.push(tr(
			` ${AP.d}${AP.gray}${t("models.hint.select", "↑↓ navegar · Enter seleccionar · tipo buscar · Esc volver")}${AP.r}`
		));
		lines.push(tr(''));

		const title = `${AP.yellow}${AP.b}■ ${t("models.title.model", "MODELO")}${AP.r}  ${AP.d}${AP.gray}${t("models.for", "para:")}${AP.r}  ${AP.concrete}${agentLabel}${AP.r}`;
		return SddModelPanel.addBorder(title, lines, width);
	}

}

async function showSddModelPanel(
	ctx: ExtensionContext,
	config: AgentModelConfig,
): Promise<ModelPanelResult> {
	const modelOptions = await getPiModelOptions(ctx);
	const agents = listDiscoverableAgents(ctx.cwd).map((agent) => agent.name);
	return ctx.ui.custom<ModelPanelResult>(
		(_tui, _theme, _keybindings, done) =>
			new SddModelPanel(config, modelOptions, agents, done),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "70%",
				minWidth: 72,
				maxHeight: "85%",
			},
		},
	);
}

export async function handleModelsCommand(ctx: ExtensionContext): Promise<void> {
	const savedConfig = await readSavedModelConfigAsync(ctx.cwd);
	if (savedConfig.status === "invalid") {
		ctx.ui.notify(
			tf(
				"models.invalid",
				`Ein no puede abrir la config de modelos: ${savedConfig.path} no es JSON valido u objeto. Corrigelo o eliminalo y vuelve a ejecutar /ein:models.`,
				savedConfig.path,
			),
			"warning",
		);
		return;
	}
	// Sembrar el modelo actual del orquestador para que aparezca en el panel.
	const orchModelStr = readOrchestratorModel();
	let config: AgentModelConfig = {
		...(savedConfig.status === "valid" ? savedConfig.config : {}),
		...(orchModelStr ? { [ORCHESTRATOR_ROW]: { model: orchModelStr } } : {}),
	};
	let result = await showSddModelPanel(ctx, config);
	while (result.type === "custom") {
		config = cloneModelConfig(result.config);
		const isOrch = result.agent === ORCHESTRATOR_ROW;
		const current =
			result.agent === "all" || isOrch
				? "inherit"
				: (config[result.agent]?.model ?? "inherit");
		const label = result.agent === "all"
			? t("models.row.all_agents", "todos los agentes")
			: isOrch ? t("models.row.orch", "Orquestador (formato: proveedor/modelo)")
			: result.agent;
		const custom = await ctx.ui.input(
			tf("models.input.custom", `${label} — id de modelo personalizado`, label),
			current === "inherit" ? t("models.input.placeholder", "proveedor/modelo") : current,
		);
		if (custom === undefined) return;
		const trimmed = custom.trim();
		if (trimmed.length > 0) {
			if (result.agent === "all") {
				const next: AgentModelConfig = { ...config };
				for (const agent of listDiscoverableAgents(ctx.cwd)) {
					next[agent.name] = {
						...(next[agent.name] ?? {}),
						model: trimmed,
					};
				}
				// "Todos" incluye al orquestador.
				next[ORCHESTRATOR_ROW] = { model: trimmed };
				config = next;
			} else {
				config = {
					...config,
					[result.agent]: {
						...(config[result.agent] ?? {}),
						model: trimmed,
					},
				};
			}
		}
		result = await showSddModelPanel(ctx, config);
	}
	if (result.type !== "save") return;

	// El orquestador persiste aparte: settings.json global, no models.json.
	const orchEntry = result.config[ORCHESTRATOR_ROW];
	const subagentConfig = Object.fromEntries(
		Object.entries(result.config).filter(([k]) => k !== ORCHESTRATOR_ROW),
	);
	writeModelConfig(ctx.cwd, subagentConfig);
	const applyResult = await applyModelConfigAsync(ctx.cwd, subagentConfig);

	const notifyLines: string[] = [t("models.saved", "Config de modelos guardada.")];
	if (orchEntry?.model) {
		const slash = orchEntry.model.indexOf('/');
		const provider = slash > 0 ? orchEntry.model.slice(0, slash) : "";
		const model = slash > 0 ? orchEntry.model.slice(slash + 1) : orchEntry.model;
		if (provider && model) {
			updateGlobalDefaultModel(provider, model);
			notifyLines.push(tf("models.orch.applied", `Orquestador → ${orchEntry.model} (reinicia Pi para aplicar)`, orchEntry.model));
		}
	}
	notifyLines.push(
		tf("models.global.config", `Config global: ${modelConfigPath(ctx.cwd)}`, modelConfigPath(ctx.cwd)),
		tf("models.agents.updated", `Agentes actualizados: ${applyResult.updated}`, applyResult.updated),
		...describeModelConfig(ctx.cwd, subagentConfig),
	);
	ctx.ui.notify(notifyLines.join("\n"), "info");
}
