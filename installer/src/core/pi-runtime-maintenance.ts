import { installDeclaredPackages, installPi, type InstallStep } from "./deps.ts";

export type PiRuntimeResult = { pi: InstallStep; packages: InstallStep };

export async function refreshPiRuntime(): Promise<PiRuntimeResult> {
  const attempt = async (run: () => Promise<InstallStep>, label: string): Promise<InstallStep> => {
    try { return await run(); }
    catch { return { ok: false, detail: `${label}: la actualización lanzó un error` }; }
  };
  const pi = await attempt(installPi, "Pi latest");
  const packages = await attempt(installDeclaredPackages, "Extensiones Pi latest");
  return { pi, packages };
}
