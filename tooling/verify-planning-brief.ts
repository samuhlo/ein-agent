import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

const installed = process.env.EIN_INTENT_PILOT_AGENT_HOME ?? join(homedir(), ".pi-ein/agent");
const output = mkdtempSync("/tmp/ein-planning-brief-");
const agentDir = join(output, "agent");
mkdirSync(agentDir, { mode: 0o700 });
process.on("exit", () => rmSync(agentDir, { recursive: true, force: true }));
copyFileSync(join(installed, "auth.json"), join(agentDir, "auth.json"));
for (const file of ["models.json", "models-store.json"]) {
  if (existsSync(join(installed, file))) copyFileSync(join(installed, file), join(agentDir, file));
}
const settings = JSON.parse(readFileSync(join(installed, "settings.json"), "utf8"));
const runtime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"), modelsStorePath: join(agentDir, "models-store.json"), allowModelNetwork: !existsSync(join(agentDir, "models-store.json")) });
const model = runtime.getModel(settings.defaultProvider, settings.defaultModel);
assert(model, "Configured model unavailable");
const root = join(import.meta.dir, "..");
const base = Bun.spawnSync(["git", "show", "origin/main:runtime/assets/orchestrator.md"], { cwd: root, stdout: "pipe", stderr: "pipe" });
assert.equal(base.exitCode, 0);
const variants = { baseline: new TextDecoder().decode(base.stdout), revised: readFileSync(join(root, "runtime/assets/orchestrator.md"), "utf8") };
const cases = [
  {
    name: "after-map",
    context: "Acaba de terminar map. El acuerdo pide progreso solo sobre módulos del curso y, para docentes, de su asignación. El mapa demuestra que el calculador recibe todos los módulos del certificado. El curso guarda su selección, pero use-cursos.ts no la conserva al abrirlo. La propuesta es conservarla y filtrar antes del calculador existente. Hay protecciones contra respuestas tardías al cambiar de curso; deben mantenerse. Map es parcial: falta comprobar el estado sin módulos asignados. No hay código cambiado ni pruebas ejecutadas. El siguiente paso autorizado es design.",
  },
  {
    name: "before-apply",
    context: "Han terminado design y tasks. Diseño: conservar selectedModuleIds en use-cursos.ts; use-curso-panel.ts intersecta esa selección con módulos asignados al docente antes del calculador actual. Cabecera y progreso comparten selección; se conserva la protección frente a respuestas tardías. No cambia completitud. Vista sin módulos: Sin módulos asignados. Preview determinista: Grupo 1 app/composables/use-cursos.ts, verify bun run test tests/composables/use-cursos.test.ts; Grupo 2 app/composables/use-curso-panel.ts y app/pages/cursos/[id].vue, verify bun run test tests/composables/use-curso-panel.test.ts tests/pages/curso-panel.test.ts. Typecheck en ambos. Riesgo: mezclar alcances entre cursos. Sin pruebas ejecutadas ni código cambiado. Modo interactive: la siguiente acción es pedir Aplicar/Revisar/Ajustar tras explicar el plan.",
  },
  {
    name: "small-change",
    context: "Se ha autorizado corregir la etiqueta del botón Guardar para que diga Guardar curso. Solo cambia ese texto. No hay ambigüedad ni cadena SDD. Redacta la actualización previa a ejecutar este cambio mecánico.",
  },
];
const results: unknown[] = [];
console.log(`Pilot artifacts: ${output}`);
for (let sample = 1; sample <= 2; sample++) for (const [variant, prompt] of Object.entries(variants)) for (const scenario of cases) {
  const sm = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } });
  const loader = new DefaultResourceLoader({ cwd: output, agentDir, settingsManager: sm, noExtensions: true, noSkills: true, noPromptTemplates: true, noContextFiles: true,
    systemPrompt: `${prompt}\nThis is a read-only replay of a user-facing planning message. All phase evidence is supplied. Write only the message you would show at this point, in Spanish. No tools, no invented execution, no role-played user answers.` });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: output, agentDir, modelRuntime: runtime, model, thinkingLevel: settings.defaultThinkingLevel, settingsManager: sm, resourceLoader: loader, sessionManager: SessionManager.inMemory(output), tools: [] });
  const started = performance.now();
  const timer = setTimeout(() => void session.abort(), 120_000);
  try {
    await session.prompt(scenario.context);
    const last = [...session.messages].reverse().find((message) => message.role === "assistant");
    assert(last?.role === "assistant" && last.stopReason !== "error" && last.stopReason !== "aborted", "Model did not complete the replay");
    const answer = last.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    assert(answer.trim());
    results.push({ sample, variant, scenario: scenario.name, elapsedMs: Math.round(performance.now() - started), answer });
    writeFileSync(join(output, "results.json"), JSON.stringify({ model: `${settings.defaultProvider}/${settings.defaultModel}`, limitations: "Read-only prose replay with supplied evidence, not an end-to-end SDD run. Assess actual explanations manually; no claim of deterministic language quality.", results }, null, 2));
    console.log(`${sample}/${variant}/${scenario.name}: complete`);
  } finally { clearTimeout(timer); session.dispose(); }
}
if (process.argv[2]) writeFileSync(process.argv[2], readFileSync(join(output, "results.json")));
