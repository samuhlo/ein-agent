// =============================================================================
// CLI: install
// Full flow: detect → check deps → install missing → deploy template →
// secrets wizard → context7 export → marker → doctor.
// =============================================================================

import * as p from "@clack/prompts";
import { describePlatform, detectPlatform, type Platform } from "../core/platform.ts";
import { checkDeps, installBun, installEngramDep, installGh, installPi } from "../core/deps.ts";
import { deployTemplate } from "../core/deploy.ts";
import {
  ensureContext7Export,
  hasSecret,
  writeSecret,
  type SecretName,
} from "../core/secrets.ts";
import { writeMarker } from "../core/version.ts";
import { runDoctor } from "../core/verify.ts";
import { renderReport } from "./doctor.ts";
import { playBanner } from "../tui/banner.ts";
import { bold, gold } from "../tui/theme.ts";

export type InstallFlags = {
  yes: boolean;
  noEngram: boolean;
  noSecrets: boolean;
};

export function parseInstallFlags(args: string[]): InstallFlags {
  return {
    yes: args.includes("--yes") || args.includes("-y"),
    noEngram: args.includes("--no-engram"),
    noSecrets: args.includes("--no-secrets"),
  };
}

async function confirm(message: string, flags: InstallFlags, fallback = true): Promise<boolean> {
  if (flags.yes) return fallback;
  const res = await p.confirm({ message });
  if (p.isCancel(res)) {
    p.cancel("Instalacion cancelada.");
    process.exit(1);
  }
  return res;
}

async function maybeSecret(name: SecretName, label: string, flags: InstallFlags): Promise<void> {
  if (flags.noSecrets || flags.yes) return;
  if (hasSecret(name)) {
    p.log.info(`${label}: ya configurado, se mantiene.`);
    return;
  }
  const value = await p.password({ message: `${label} (enter para saltar)` });
  if (p.isCancel(value) || !value) return;
  const written = await writeSecret(name, value);
  if (written) p.log.success(`${label} guardado.`);
}

export async function runInstall(args: string[]): Promise<number> {
  const flags = parseInstallFlags(args);
  const platform: Platform = detectPlatform();

  await playBanner();
  p.intro(bold(gold("Instalador Ein")));
  p.log.info(`Plataforma: ${describePlatform(platform)}`);

  // 1. Check dependencies.
  let deps = checkDeps(platform);
  const depLines = deps.map(
    (d) => `  ${d.present ? "✓" : "✗"} ${d.id.padEnd(8)} ${d.present ? (d.path ?? "") : `(falta) ${d.hint}`}`,
  );
  p.log.message(["Dependencias:", ...depLines].join("\n"));

  // 2. Install required missing (bun, pi).
  const needBun = !deps.find((d) => d.id === "bun")?.present;
  const needPi = !deps.find((d) => d.id === "pi")?.present;

  if (needBun) {
    if (await confirm("Instalar bun?", flags)) {
      const s = p.spinner();
      s.start("Instalando bun");
      const r = await installBun();
      s.stop(r.detail);
      if (!r.ok) return fail("bun es obligatorio.");
    } else {
      return fail("bun es obligatorio.");
    }
  }

  if (needPi) {
    if (await confirm("Instalar pi (@earendil-works/pi-coding-agent)?", flags)) {
      const s = p.spinner();
      s.start("Instalando pi");
      const r = await installPi();
      s.stop(r.detail);
      if (!r.ok) return fail("pi es obligatorio.");
    } else {
      return fail("pi es obligatorio.");
    }
  }

  // 3. Optional: engram.
  const needEngram = !deps.find((d) => d.id === "engram")?.present;
  if (needEngram && !flags.noEngram) {
    if (await confirm("Instalar engram (memoria persistente)?", flags)) {
      const s = p.spinner();
      s.start("Instalando engram");
      const r = await installEngramDep(platform);
      s.stop(r.detail);
    }
  }

  // 4. Optional: gh.
  const needGh = !deps.find((d) => d.id === "gh")?.present;
  if (needGh && !flags.yes) {
    if (await confirm("Instalar gh (GitHub CLI)?", flags, false)) {
      const s = p.spinner();
      s.start("Instalando gh");
      const r = await installGh(platform);
      s.stop(r.detail);
    }
  }

  // 5. Deploy template (re-resolve engram after possible install).
  const s = p.spinner();
  s.start("Desplegando Ein en ~/.pi/agent");
  const deployed = await deployTemplate(platform);
  s.stop(
    `Ein desplegado (engram: ${deployed.engramFound ? deployed.engramCommand : "no resuelto, usando PATH"})`,
  );

  // 6. Secrets wizard.
  if (!flags.noSecrets && !flags.yes) {
    p.log.step("Configuracion de secrets (todo opcional)");
    await maybeSecret("context7", "Context7 API key", flags);
    await maybeSecret("linear", "Linear API key", flags);
    await maybeSecret("minimax", "MiniMax API key", flags);
  }

  // 7. Context7 shell export.
  if (!flags.noSecrets) {
    const exp = ensureContext7Export(platform);
    if (exp.changed) p.log.success(`Export CONTEXT7_API_KEY anadido a ${exp.rc} (reinicia el shell).`);
  }

  // 8. Marker.
  writeMarker();

  // 9. Doctor.
  deps = checkDeps(platform);
  const report = runDoctor(platform);
  p.log.message(renderReport(report));

  if (report.result === "FAIL") {
    p.outro("Instalacion con errores. Revisa los FAIL del doctor.");
    return 1;
  }
  p.outro("Ein listo. Ejecuta `pi` para empezar (reinicia el shell si pi no esta en PATH).");
  return 0;
}

function fail(message: string): number {
  p.log.error(message);
  p.outro("Instalacion incompleta.");
  return 1;
}
