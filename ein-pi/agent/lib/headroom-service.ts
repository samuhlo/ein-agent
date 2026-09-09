import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants, mkdirSync, openSync, closeSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { HeadroomConfig } from "./headroom.ts";

export function headroomHomeForAgent(agent: string): string {
  if (!isAbsolute(agent)) throw new Error("El hogar Pi debe ser absoluto");
  // External dependency, outside the tree copied by Ein snapshots/restores.
  return `${resolve(agent)}.headroom`;
}
export function headroomServiceHome(env: NodeJS.ProcessEnv = process.env): string {
	if (env.EIN_HEADROOM_SERVICE_DIR) { if (!isAbsolute(env.EIN_HEADROOM_SERVICE_DIR)) throw new Error("EIN_HEADROOM_SERVICE_DIR debe ser absoluto"); return env.EIN_HEADROOM_SERVICE_DIR; }
	const agent = env.EIN_PI_AGENT_HOME ?? env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi-ein", "agent");
	if (!isAbsolute(agent)) throw new Error("El hogar Pi debe ser absoluto");
	return headroomHomeForAgent(agent);
}
export function resolveHeadroomBinary(env: NodeJS.ProcessEnv = process.env): string | undefined {
	let home: string;
	try { home = headroomServiceHome(env); } catch { return undefined; }
	const candidates = [env.EIN_HEADROOM_BIN, join(home, "active", "venv", "bin", "headroom"), join(home, "venv", "bin", "headroom"), ...(env.PATH ?? "").split(delimiter).filter(isAbsolute).map((path) => join(path, "headroom"))];
	return candidates.find((path): path is string => { if (!path || !isAbsolute(path)) return false; try { accessSync(path, constants.X_OK); return true; } catch { return false; } });
}

export async function inspectHeadroomService(config: Pick<HeadroomConfig, "endpoint">): Promise<{ ready: boolean; version?: string; pid?: number }> {
	try {
		const response = await fetch(`${config.endpoint}/health`, { signal: AbortSignal.timeout(600), redirect: "error" });
		if (!response.ok) return { ready: false };
		const text = await response.text(); if (text.length > 32_000) return { ready: false };
		const value = JSON.parse(text);
		return { ready: value.service === "headroom-proxy" && value.ready === true, version: typeof value.version === "string" ? value.version : undefined, pid: Number.isSafeInteger(value.config?.pid) ? value.config.pid : undefined };
	} catch { return { ready: false }; }
}

/** Owns only the process it started. A shared/external server is never stopped. */
export class HeadroomService {
	constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}
	private child: ChildProcess | undefined;
	private starting: Promise<string> | undefined;
	private stopping = false;
	get owned(): boolean { return !!this.child && this.child.exitCode === null && this.child.signalCode === null; }
	get ownedPid(): number | undefined { return this.owned ? this.child?.pid : undefined; }
	async start(config: HeadroomConfig): Promise<string> {
		if (this.starting) return this.starting;
		this.starting = this.launch(config);
		try { return await this.starting; } finally { this.starting = undefined; }
	}
	private async launch(config: HeadroomConfig): Promise<string> {
		this.stopping = false;
		const current = await inspectHeadroomService(config);
		if (current.ready) return `Headroom ${current.version ?? ""} disponible (${this.owned ? "gestionado por esta sesión" : "servicio externo"}).`;
		const binary = resolveHeadroomBinary(this.environment);
		if (!binary) return "Headroom no está instalado. Configura EIN_HEADROOM_BIN o instala el servicio siguiendo la guía de Headroom de Ein. Los comandos siguen funcionando sin compresión.";
		if (this.stopping) return "Arranque cancelado.";
		if (this.owned) return "El proceso de Headroom está arrancando o no responde; consulta /ein:headroom status.";
		const home = headroomServiceHome(this.environment); mkdirSync(home, { recursive: true, mode: 0o700 });
		const logPath = join(home, "service.log");
		const log = openSync(logPath, "a", 0o600);
		const url = new URL(config.endpoint);
		const env: NodeJS.ProcessEnv = {};
		for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "SSL_CERT_FILE", "SSL_CERT_DIR", "SYSTEMROOT"]) if (this.environment[key]) env[key] = this.environment[key];
		Object.assign(env, { PYTHONUNBUFFERED: "1", HEADROOM_WORKSPACE_DIR: join(home, "state"), HEADROOM_BEACON: "off", DO_NOT_TRACK: "1", HEADROOM_TELEMETRY: "off", HEADROOM_CODE_AWARE_ENABLED: "0", HEADROOM_NO_SUBSCRIPTION_TRACKING: "1", HEADROOM_OUTPUT_SHAPER: "0", HEADROOM_EFFORT_ROUTER: "0" });
		let failed = false;
		try {
			this.child = spawn(binary, ["proxy", "--host", url.hostname === "[::1]" ? "::1" : url.hostname, "--port", url.port || "80", "--disable-kompress", "--compressor", "smart_crusher", "--compressor", "log", "--compressor", "search", "--compressor", "tabular", "--no-ccr", "--no-cache", "--no-rate-limit"], { env, stdio: ["ignore", log, log] });
			this.child.on("error", () => { failed = true; });
		} finally { closeSync(log); }
		const deadline = Date.now() + 20_000;
		while (Date.now() < deadline && !failed && !this.stopping) {
			if ((await inspectHeadroomService(config)).ready) return `Headroom disponible. Registro local: ${logPath}`;
			if (!this.owned) break;
			await new Promise((resolve) => setTimeout(resolve, 150));
		}
		await this.stop();
		return `Headroom no arrancó. La salida se conserva sin comprimir. Registro: ${logPath}`;
	}
	async stop(): Promise<string> {
		this.stopping = true;
		const child = this.child; this.child = undefined;
		if (!child || child.exitCode !== null || child.signalCode !== null) return "Esta sesión no tiene un servicio propio que detener.";
		child.kill("SIGTERM");
		await new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, 1500);
			child.once("exit", () => { clearTimeout(timer); resolve(); });
		});
		if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
		return "Servicio de esta sesión detenido. Los originales siguen disponibles.";
	}
}
