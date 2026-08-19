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

export type RGB = { r: number; g: number; b: number };

export type BrandPalette = {
  carbon: RGB;
  concrete: RGB;
  structure: RGB;
  yellow: RGB;
};

const DEFAULT_BRAND: AgentBrand = {
  agentName: "Ein",
  commandPrefix: "ein",
  author: "samuhlo",
};

// Paleta brutalista samuhlo (fallback si brand.json no define colors).
const DEFAULT_PALETTE: BrandPalette = {
  carbon: { r: 11, g: 11, b: 11 },   // #0B0B0B
  concrete: { r: 250, g: 243, b: 240 }, // #FAF3F0
  structure: { r: 115, g: 115, b: 115 }, // #737373
  yellow: { r: 255, g: 202, b: 64 },  // #FFCA40
};

function parseHex(value: unknown): RGB | null {
  if (typeof value !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

let paletteCache: BrandPalette | null = null;

export function loadPalette(): BrandPalette {
  if (paletteCache) return paletteCache;
  const palette = { ...DEFAULT_PALETTE };
  try {
    const parsed = JSON.parse(readFileSync(BRAND_PATH, "utf8")) as {
      colors?: Record<string, unknown>;
    };
    if (parsed.colors && typeof parsed.colors === "object") {
      for (const key of ["carbon", "concrete", "structure", "yellow"] as const) {
        const rgb = parseHex(parsed.colors[key]);
        if (rgb) palette[key] = rgb;
      }
    }
  } catch {
    // brand.json ausente o roto: paleta de fábrica
  }
  paletteCache = palette;
  return palette;
}

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

export default function einBrand(_pi: ExtensionAPI): void {}
