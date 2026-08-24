// Una sola puerta pública: `ein` es el producto, `ein-install` es el arranque y
// la escotilla de reparación. Este contrato existe porque el fallo repetido de
// este repositorio no fue código incorrecto, sino superficies contando mundos
// distintos: el código ya declaraba la jerarquía y el README, la ayuda y los
// mensajes seguían en el mundo anterior.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const read = (relative: string): string => readFileSync(join(ROOT, relative), "utf8");

describe("the story every surface tells", () => {
  test("the README names one public entry and the repair hatch", () => {
    const readme = read("README.md");
    const deck = readme.slice(readme.indexOf("COMMAND_DECK"), readme.indexOf("## // 06_"));

    expect(deck).toContain("ein-install");
    // `ein` sin argumentos abre la aplicación; el menú de acciones ya no existe.
    expect(deck).not.toContain("menú interactivo");
  });

  test("the installer's help calls itself by its own name", () => {
    const main = read("installer/src/main.ts");
    const help = main.slice(main.indexOf("function printHelp"), main.indexOf("async function main"));

    expect(help).toContain("ein-install");
    expect(help).not.toMatch(/uso: ein </);
  });

  test("the app's help mentions the verbs it delegates", () => {
    const entry = read("ein-pi/agent/surfaces/terminal-app-entrypoint.ts");
    const help = entry.slice(entry.indexOf("const HELP"), entry.indexOf("/** Short enough"));

    for (const verb of ["update", "doctor"]) expect(help).toContain(verb);
  });

  test("no surface still describes the installer as `ein`", () => {
    expect(read("installer/src/main.ts")).not.toContain('console.log("ein — instalador');
  });
});
