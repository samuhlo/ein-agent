# Scope — fix-linear-integration-install-coherence

## SCOPE PACKET

scope: Corregir la regresión de coherencia entre installer y runtime introducida en `installer-v0.82.0-alpha.3`: alinear selección, persistencia y doctors con el contrato canónico de integración Linear `off`/`on`, conservando compatibilidad heredada y fallo cerrado. Añadir la regresión acotada de instalación limpia, sincronizar `0.82.0-alpha.4` y entregar la release exclusivamente mediante GitHub Actions tras superar las puertas de verificación.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 180000

## Problema y resultado esperado

El runtime ya sustituyó el modo de trabajo `solo`/`team` por la integración opcional con Linear `off`/`on`, pero el installer todavía pregunta, persiste e informa con el vocabulario anterior. Además, los doctors del installer y del runtime exigen el módulo eliminado `lib/mode.ts` y texto estático del orchestrator, aunque la directiva actual se inyecta dinámicamente desde `linear-integration.ts`. Por ello una instalación limpia de alpha.3 despliega el runtime pero termina incompleta con dos falsos fallos de coherencia.

El cambio debe conseguir que una instalación limpia construida desde las fuentes actuales persista la selección Linear canónica y pase doctor sin reintroducir artefactos retirados. La evidencia heredada válida seguirá resolviéndose de forma compatible y la evidencia malformada o ilegible no podrá producir un resultado de doctor exitoso.

## Alcance incluido

1. Sustituir en la superficie del installer la pregunta y el resumen `solo`/`team` por una selección clara de integración Linear `off`/`on`, con `off` como estado por defecto donde ya corresponda.
2. Persistir el estado global que consume `linear-integration.ts` con la clave y valores canónicos, manteniendo alineados selección, escritura y reporte.
3. Actualizar el doctor del installer para comprobar el módulo actual de integración Linear y la costura real de inyección dinámica del prompt, no `lib/mode.ts` ni una frase estática retirada.
4. Aplicar el mismo contrato de coherencia al doctor del runtime.
5. Conservar la traducción compatible de estado heredado `solo` → `off` y `team` → `on`, sin convertir estado malformado o ilegible en evidencia válida para doctor.
6. Añadir una regresión enfocada que prepare una instalación limpia staged desde el bundle de fuentes actuales y demuestre que el doctor permite completar la instalación.
7. Sincronizar `installer/package.json`, `installer/src/core/version.ts` y la entrada principal de `CHANGELOG.md` a `0.82.0-alpha.4`.
8. Tras implementación, revisión y verificación, publicar `installer-v0.82.0-alpha.4` por el workflow de GitHub Actions y comprobar el workflow y sus assets. El scope no etiqueta, publica ni ejecuta esos pasos.

## No objetivos

- Rediseñar la integración Linear o sus políticas de board, billing o trabajo en equipo.
- Reintroducir `mode.ts` o volver a presentar `solo`/`team` como configuración actual.
- Eliminar la compatibilidad de lectura heredada.
- Refactorizar de forma general los doctors, el bundler o el flujo de instalación.
- Cambiar Claude Ein, runtimes vanilla o destinos ajenos a la instalación Pi Ein administrada.
- Publicar en npm, producir una release local, mover tags publicados o forzar un tag.
- Ejecutar tests, typechecks, builds, tag/push o publicación durante la fase scope.

## Superficie esperada del cambio

- `installer/src/cli/install.ts` — pregunta, valor seleccionado y resumen de instalación.
- `installer/src/core/deploy.ts` — persistencia global canónica de Linear.
- `installer/src/core/verify.ts` — contrato del doctor ejecutado por el installer.
- `ein-pi/agent/extensions/ein-doctor.ts` — contrato del doctor del runtime.
- `ein-pi/agent/extensions/ein-ai.ts` — costura dinámica existente que los doctors deben reconocer; no se presupone cambio salvo que map demuestre una carencia real.
- `ein-pi/agent/lib/linear-integration.ts` — contrato canónico y compatibilidad; debe preservarse y solo cambiar si map demuestra una necesidad acotada.
- Tests enfocados bajo `tests/`, incluyendo el inventario/template y una prueba staged de instalación limpia; map debe elegir los ficheros exactos y reutilizar helpers existentes.
- `installer/package.json`, `installer/src/core/version.ts`, `CHANGELOG.md` — punteros de release `0.82.0-alpha.4`.

Esta lista es una frontera para map, no permiso para editar todos los ficheros ni crear una abstracción transversal.

## Criterios de aceptación

1. El installer ofrece e informa integración Linear `off`/`on`; no presenta el modo actual como `solo`/`team`.
2. La selección queda persistida en el estado global canónico que lee el runtime y el reporte coincide con el valor escrito.
3. Ambos doctors validan `linear-integration.ts` y la inyección dinámica real del prompt, sin exigir `lib/mode.ts` ni texto estático retirado.
4. Un módulo canónico ausente, una costura dinámica ausente o evidencia Linear malformada/ilegible siguen produciendo fallo de coherencia.
5. Los valores heredados válidos `solo` y `team` conservan su mapeo compatible a `off` y `on`.
6. Una fixture staged de instalación limpia, construida por la ruta de bundle actual y probada con una selección Linear válida, pasa el doctor posterior y alcanza finalización.
7. Las pruebas cubren al menos el contrato canónico, la compatibilidad heredada, el fallo cerrado y la ausencia de los dos falsos positivos de alpha.3.
8. Los tres punteros de versión coinciden exactamente en `0.82.0-alpha.4` y el changelog describe la corrección.
9. Antes de tag se superan pruebas enfocadas, `bun test`, `bun run typecheck` y `cd installer && bun run typecheck`; Bun no sustituye el typecheck.
10. La publicación usa el tag anotado `installer-v0.82.0-alpha.4`, nunca force-push ni publicación local/npm, y los assets producidos por `.github/workflows/installer-release.yml` se verifican después.

## Verificación y entrega para fases posteriores

`strict_tdd` queda fijado por decisión del usuario y deberá declararse en el preflight del cambio. Apply debe seguir RED/GREEN con pruebas Bun enfocadas antes de modificar producción. Verify debe ejecutar la suite raíz y los dos typechecks indicados por `EIN.md`, además de las comprobaciones de release enfocadas. La publicación es una acción de entrega posterior a código verificado y a que el commit etiquetado sea el tip válido de `main`; GitHub Actions es la única ruta de artefactos de producción.

## Configuración SDD existente

- `openspec/config.yaml` ya existe y se preservó sin cambios.
- Stack: TypeScript ESM sobre Bun; publicación mediante GitHub Actions.
- Runner: `bun test`; `strict_tdd: true`.
- Typechecks requeridos por el proyecto: `bun run typecheck` y `cd installer && bun run typecheck`.
- Almacén de artefactos: OpenSpec canónico bajo `openspec/changes/<change>/`.

## Contexto OpenSpec canónico

No se inyectaron hints de dominio ni referencias exactas a `openspec/specs/<domain>/spec.md`. Uso canónico de esta fase: **0 ficheros y 0 bytes UTF-8**; no hay paths, SHA-256 ni tamaños que preservar.

## Delta de comportamiento

La preflight del conjunto persistido encontró que el cambio aún no existía y, por tanto, no había deltas previos que preservar o validar. Se creó mediante el writer estructurado el delta validado:

- `openspec/changes/fix-linear-integration-install-coherence/specs/installer-runtime-coherence/spec.md`

El delta acota cuatro comportamientos observables: selección/persistencia canónica, doctors alineados con el runtime actual, compatibilidad fail-closed y finalización de una instalación limpia staged. No se incluye declaración `spec_delta: none` porque el delta es la declaración.

## Evidencia de alcance

- `ein-pi/agent/lib/linear-integration.ts` define `LinearIntegration = "off" | "on"`, da prioridad a `linear`, traduce `mode: solo/team`, distingue evidencia inválida/ilegible e inyecta la directiva dinámica.
- La evidencia scout validada sitúa el vocabulario obsoleto en `installer/src/cli/install.ts` y la persistencia obsoleta en `installer/src/core/deploy.ts`.
- Los dos checks obsoletos están acotados a `installer/src/core/verify.ts` y `ein-pi/agent/extensions/ein-doctor.ts`.
- `ein-pi/agent/extensions/ein-ai.ts` ya contiene la inyección dinámica; `installer/scripts/bundle-template.ts` empaqueta fuentes actuales y `installer/scripts/build-all.ts` ordena el build.
- `tests/template-agent-inventory.test.ts` deja visible el hueco de regresión staged.
- Los punteros observados están en `0.82.0-alpha.3`; no hay cambios previos en las superficies objetivo y el único estado nuevo es este directorio OpenSpec.

## Riesgos y controles

- **Duplicación entre doctors:** dos implementaciones pueden volver a derivar. Control: fijar un mismo contrato observable sin convertir este fix en refactor amplio.
- **Compatibilidad frente a fallo cerrado:** el resolver tolerante y la inspección con estado tienen propósitos distintos. Control: map/design deben conservar esa separación y probar doctor con evidencia inválida.
- **Fixture staged engañosa:** probar solo el source tree no reproduce el fallo de alpha.3. Control: ejercer la ruta de bundle/deploy que usa una instalación limpia.
- **Entrega prematura:** taggear antes de merge/main o sustituir Actions por build local invalida la release. Control: aplicar la secuencia del skill `release` y verificar assets remotos.

## Aplicación de skills

- `release`: aplicado; gobierna los tres punteros, checks previos, formato de tag y publicación exclusiva por Actions.
- `bun`: aplicado como contexto de runner y gates posteriores; scope no ejecuta pruebas ni builds.
- `ein-discipline`: aplicado para alcance SDD, TDD estricto y límites de fase.
- `architecture`: aplicado para mantener el fix en las costuras propietarias mínimas y evitar un refactor general.
- `vitest`: omitido porque este repositorio usa `bun:test`, no Vitest.
- `nuxt-modules`: omitido porque la superficie es installer/runtime TypeScript y no módulos Nuxt.
