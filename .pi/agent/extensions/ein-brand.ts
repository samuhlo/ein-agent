import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AGENT_DIR } from "./ein-paths";

export type AgentBrand = {
  agentName: string;
  commandPrefix: string;
  author: string;
};

export type AgentPersona = "samuhlo" | "neutral";

const DEFAULT_BRAND: AgentBrand = {
  agentName: "Ein",
  commandPrefix: "ein",
  author: "samuhlo",
};

const BRAND_PATH = join(AGENT_DIR, "brand.json");

function stateDir(): string {
  return join(homedir(), ".pi", loadBrand().commandPrefix);
}

function personaPath(): string {
  return join(stateDir(), "persona.json");
}

function cleanPrefix(value: string): string {
  return value.trim().toLowerCase().replace(/^\/+/, "").replace(/:+$/, "") || DEFAULT_BRAND.commandPrefix;
}

export function loadBrand(): AgentBrand {
  if (!existsSync(BRAND_PATH)) return DEFAULT_BRAND;
  try {
    const parsed = JSON.parse(readFileSync(BRAND_PATH, "utf8")) as Partial<AgentBrand>;
    return {
      agentName: DEFAULT_BRAND.agentName,
      commandPrefix: cleanPrefix(parsed.commandPrefix ?? DEFAULT_BRAND.commandPrefix),
      author: DEFAULT_BRAND.author,
    };
  } catch {
    return DEFAULT_BRAND;
  }
}

export function commandName(name: string): string {
  return `${loadBrand().commandPrefix}:${name}`;
}

export function slashCommand(name: string): string {
  return `/${commandName(name)}`;
}

function normalizePersona(value: string): AgentPersona {
  const token = value.trim().toLowerCase();
  if (token === "neutral") return "neutral";
  if (token === "architect") return "samuhlo";
  return "samuhlo";
}

export function loadPersona(): AgentPersona {
  const file = personaPath();
  if (!existsSync(file)) return "samuhlo";
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { active?: string };
    return normalizePersona(parsed.active ?? "samuhlo");
  } catch {
    return "samuhlo";
  }
}

export function savePersona(persona: AgentPersona): void {
  const dir = stateDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(personaPath(), JSON.stringify({ active: persona }, null, 2), "utf8");
}

export default function einBrand(_pi: ExtensionAPI): void {
  // modulo de branding compartido; no registra hooks
}
