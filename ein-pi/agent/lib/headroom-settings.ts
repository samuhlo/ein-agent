import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

export const HEADROOM_OPTIONS = ["on", "observe", "off"] as const;
export type HeadroomMode = (typeof HEADROOM_OPTIONS)[number];
export const headroomConfigPath = (cwd: string): string => join(cwd, ".pi", "ein", "headroom.json");
export function headroomConfigured(cwd: string): boolean { return existsSync(headroomConfigPath(cwd)) || existsSync(join(cwd, ".pi", "ein", "hypa.json")); }
export function readHeadroomMode(cwd: string): HeadroomMode {
	const path = headroomConfigPath(cwd);
	if (existsSync(path)) {
		const value = JSON.parse(readFileSync(path, "utf8"));
		if (value?.version !== 1 || !HEADROOM_OPTIONS.includes(value.mode)) throw new Error("headroom.json no válido; usa /ein:headroom on|observe|off");
		return value.mode;
	}
	// Read-through migration: never enables a project that explicitly opted out.
	// Hypa's auto/on now selects verified Headroom, without rewriting old files.
	const legacy = join(cwd, ".pi", "ein", "hypa.json");
	if (existsSync(legacy)) {
		try { return ["on", "auto"].includes(JSON.parse(readFileSync(legacy, "utf8"))?.mode) ? "on" : "off"; }
		catch { return "off"; }
	}
	return "on";
}
export function writeHeadroomMode(cwd: string, mode: HeadroomMode): void {
	if (!HEADROOM_OPTIONS.includes(mode)) throw new Error("Headroom mode no válido");
	let dir = realpathSync(cwd);
	for (const part of [".pi", "ein"]) {
		dir = join(dir, part); if (!existsSync(dir)) mkdirSync(dir, { mode: 0o700 });
		if (!lstatSync(dir).isDirectory()) throw new Error("La configuración de Headroom no sigue enlaces simbólicos");
	}
	const path = join(dir, "headroom.json"), temp = `${path}.${randomUUID()}.tmp`;
	writeFileSync(temp, JSON.stringify({ version: 1, mode }) + "\n", { mode: 0o600, flag: "wx" });
	try { renameSync(temp, path); } finally { if (existsSync(temp)) unlinkSync(temp); }
}

export type HeadroomAvailability = "unknown" | "ready" | "unavailable" | "invalid";
const availability = new Map<string, HeadroomAvailability>();
export function noteHeadroomAvailability(cwd: string, state: HeadroomAvailability): void { availability.set(resolve(cwd), state); }
export function headroomAvailability(cwd: string): HeadroomAvailability { return availability.get(resolve(cwd)) ?? "unknown"; }
export function headroomLabel(cwd: string): string {
	try {
		const mode = process.env.EIN_HEADROOM_MODE ?? readHeadroomMode(cwd);
		if (!HEADROOM_OPTIONS.includes(mode as HeadroomMode)) return "config inválida";
		if (mode === "off") return "off";
		const state = headroomAvailability(cwd);
		return state === "ready" ? mode : `${mode}·${state === "unavailable" ? "sin servicio" : state === "invalid" ? "config inválida" : "pendiente"}`;
	} catch { return "config inválida"; }
}
