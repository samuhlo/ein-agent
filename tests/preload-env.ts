// =============================================================================
// TEST PRELOAD — fija el AGENT_DIR/CONFIG_HOME temporal ANTES de que cargue
// cualquier módulo de test.
//
// Por qué: `ein-paths` congela `AGENT_DIR` (y `sessions.ts` congela
// `SESSIONS_DIR = join(AGENT_DIR, "sessions")`, `model-config.ts` importa
// AGENT_DIR...) en el PRIMER import del proceso. Varios tests fijan
// `EIN_PI_AGENT_HOME` en su cabecera, pero si otro fichero de test importa
// `ein-paths` (transitivo) ANTES de fijarlo, `AGENT_DIR` cachea el home real.
// El orden de descubrimiento de ficheros difiere entre bun local y CI (que usa
// `bun-version: latest`), así que la suite era flaky: en CI `AGENT_DIR` acababa
// siendo `~/.pi/agent` (inexistente) y `listRecentSessions` devolvía 0.
//
// Este preload corre antes que todos los ficheros de test → el env está puesto
// cuando `ein-paths` se importa por primera vez, sea cual sea el orden. Usa
// `??=` para no pisar un valor ya fijado (los tests fijan el mismo).
// =============================================================================

import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.EIN_PI_AGENT_HOME ??= join(tmpdir(), "ein-agent-tests", "agent");
process.env.EIN_PI_CONFIG_HOME ??= join(tmpdir(), "ein-agent-tests", "ein");
