import type { Result, UpdateStageError } from "./release-types.ts";
import type { UpdateCaps } from "./update-caps.ts";

export type BinaryIdentity = {
  binaryVersion: string;
  templateVersion: string;
};

export type BinaryProbeError = UpdateStageError;

function probeError(code: string, message: string): BinaryProbeError {
  return { stage: "verifying", code, message };
}

// SemVer ENTERO, sufijos incluidos. Antes esto exigía fin de línea justo tras
// `X.Y.Z`, así que `0.90.0-alpha.1` casaba `0.90.0`, se topaba con el `-alpha.1`
// y devolvía null: la actualización moría en `verifying` con `identity-missing`
// y `ein-install update` no podía saltar a una alpha, solo reinstalarse.
//
// Capturar el CORE tampoco valdría: `verifyBinaryIdentity` compara con la
// versión del release seleccionado, y `0.90.0` nunca es `0.90.0-alpha.1`.
const SEMVER = "[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?";

function versionFromOutput(label: "ein-installer" | "template-version", stdout: string): string | null {
  const match = stdout.match(new RegExp(`(?:^|\\n)${label}\\s+(${SEMVER})\\s*$`, "m"));
  return match?.[1] ?? null;
}

/** Reads identity from the staged binary; byte strings are never treated as identity. */
export async function probeBinaryVersion(
  candidatePath: string,
  caps: UpdateCaps,
): Promise<Result<BinaryIdentity, BinaryProbeError>> {
  try {
    const child = await caps.child.spawn(candidatePath, ["--version"]);
    if (child.code !== 0) return { ok: false, error: probeError("probe-exit", `Binary probe exited with ${child.code}`) };
    const binaryVersion = versionFromOutput("ein-installer", child.stdout);
    const templateVersion = versionFromOutput("template-version", child.stdout);
    if (!binaryVersion || !templateVersion) {
      return { ok: false, error: probeError("identity-missing", "Binary probe did not report installer and template versions") };
    }
    return { ok: true, value: { binaryVersion, templateVersion } };
  } catch (error) {
    return { ok: false, error: probeError("probe-failed", error instanceof Error ? error.message : "Could not probe staged binary") };
  }
}

export function verifyBinaryIdentity(
  identity: BinaryIdentity,
  expectedVersion: string,
): Result<BinaryIdentity, BinaryProbeError> {
  if (identity.binaryVersion !== expectedVersion || identity.templateVersion !== expectedVersion) {
    return { ok: false, error: probeError("identity-mismatch", "Staged binary does not match the selected release") };
  }
  return { ok: true, value: identity };
}
