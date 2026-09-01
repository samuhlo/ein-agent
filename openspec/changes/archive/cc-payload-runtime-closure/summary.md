status: complete
change: cc-payload-runtime-closure
work_groups: 2
verification_status: pass

## // 000. RESUMEN

El payload de Claude calcula su cierre con la sintaxis de TypeScript, conserva sólo dependencias de ejecución y falla cerrado ante fuentes dudosas. El modelo `Setting` vuelve a pertenecer al dominio que lo produce.

## // 001. QUÉ CAMBIÓ

- `project-settings.ts` posee `Setting`; terminal, controlador, entrypoint y tests lo importan directamente.
- `bundle-ein-cc.ts` sustituye `IMPORT_RE` por un collector sintáctico de imports, exports y `import()` runtime.
- `cc-payload-bundle.test.ts` fija tipos puros, mezclas, laterales, dinámicos, transitividad y parseo inválido; `installer-runtime-menu.test.ts` comprueba la exclusión exacta sobre el payload canónico que ya instala aislado.
- `claude-payload-transport` incorpora tres escenarios; el roadmap avanza al núcleo SDD neutral.

## // 002. CÓMO FUNCIONA POR DENTRO

Cada source del cierre se analiza como TypeScript con el parser integrado de Bun. Imports laterales, valores, reexports runtime, estrellas y dinámicos literales alimentan el resolvedor existente; declaraciones y elementos marcados exclusivamente `type` se omiten. Un diagnóstico de parseo aborta antes de escribir el tar.

La comparación real pasa de 914 a 906 rutas: desaparecen ocho ficheros y 1.744 líneas que sólo llegaban por tipos, sin añadidos. Las cuatro entradas siguen compilando desde el archive aislado.

## // 003. DECISIONES

- Parser sintáctico, no `Program` ni typecheck: la distinción explícita de tipos no necesita resolver el proyecto.
- Dos PRs: primero propiedad del modelo, después comportamiento del empaquetador. La primera no se presentó falsamente como poda; otra arista type-only conservaba el archive.
- Sin fallback regex, reexport temporal ni nueva dependencia; el analizador viaja con el Bun que ya ejecuta el empaquetador.
- Sin puerta CI nueva: fixtures y suite fijan la semántica; el release conserva su smoke Linux bloqueante.

## // 004. VERIFICACIÓN

- verify: `bun test tests/architecture-boundaries.test.ts tests/terminal-app.test.ts tests/terminal-app-controller.test.ts`
- verify: `bun test tests/cc-payload-bundle.test.ts tests/cc-payload-entrypoints.test.ts tests/installer-runtime-menu.test.ts`
- verify: `bun test tests/installer-runtime-menu.test.ts`
- verify: `bun test`
- verify: `bun run typecheck`
- verify: `cd installer && bun run typecheck`
- verify: `payload_smoke_source="$PWD/installer/scripts/cc-payload-smoke.ts"; (cd installer && bun run scripts/bundle-ein-cc.ts) && (cd /tmp && bun build "$payload_smoke_source" --compile --target=bun-darwin-arm64 --outfile /tmp/ein-cc-payload-smoke-verify && /tmp/ein-cc-payload-smoke-verify)`
- verify: `bun test tests/repository-hygiene.test.ts`
- Resultado: 2.933 pruebas globales, ambos typechecks, 906 rutas, cuatro entradas aisladas y smoke compilado en pass.

## // 005. PENDIENTE / RIESGOS

- El smoke local usa Darwin ARM64; `installer-release.yml` repite Linux x64 antes de publicar.
- Un import no marcado `type` se conserva de forma deliberadamente segura aunque sólo se use como tipo.
- Siguiente fase: diseñar `shared/sdd/`; liberar prompt sólo si ese diseño demuestra que lo necesita.
