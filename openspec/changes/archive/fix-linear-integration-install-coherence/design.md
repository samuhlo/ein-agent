# Design — fix-linear-integration-install-coherence

## A. Proposal

### Intent

Restaurar la coherencia de instalación rota en `installer-v0.82.0-alpha.3`: el installer seleccionará, persistirá y reportará la integración Linear con el contrato canónico `off`/`on`, y ambos doctors verificarán el runtime dinámico actual sin depender de `mode.ts` ni de texto estático retirado. La corrección se protegerá con TDD estricto y una regresión que despliegue un bundle staged generado desde las fuentes reales.

### Scope

**Incluido**

- Superficie CLI, valor por defecto y resumen de Linear en el installer.
- Persistencia global `{ "linear": "off" | "on" }` en el directorio de agente Pi resuelto por el installer.
- Resolución del path global aislado y compatibilidad de lectura `solo → off`, `team → on` en `linear-integration.ts`.
- Checks equivalentes en el doctor del installer y el doctor del runtime para el módulo Linear, la costura dinámica del prompt y la evidencia persistida.
- Regresión de instalación limpia que genere y despliegue el template staged real, ejecute doctor en el flujo normal y alcance finalización.
- Punteros de release y entrada principal de changelog para `0.82.0-alpha.4`; comprobaciones previas y posteriores a la publicación por GitHub Actions.

**Fuera de alcance**

- Rediseñar la política de Linear, el board, secretos, billing o colaboración.
- Reintroducir `lib/mode.ts`, renombrar `ein-mode.json` o eliminar lectura heredada.
- Refactorizar de forma general doctors, install journal, plan, bundler o runtime Claude.
- Cambiar runtimes vanilla, publicar en npm o producir artefactos de release localmente.
- Etiquetar o publicar durante esta fase de diseño.

### Affected areas

- Selección y plan: `installer/src/cli/install.ts`, y únicamente el texto contractual de `installer/src/core/install-plan.ts` si conserva `solo/team` visible.
- Persistencia y autoridad canónica: `installer/src/core/deploy.ts`, `ein-pi/agent/lib/linear-integration.ts`.
- Doctors: `installer/src/core/verify.ts`, `ein-pi/agent/extensions/ein-doctor.ts`.
- Costura verificada, sin cambio esperado: `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/persona.ts`.
- Regresión: `tests/linear-integration.test.ts`, `tests/installed-agent-inventory.test.ts`, `tests/template-agent-inventory.test.ts`; tests CLI/plan existentes solo donde cambie su contrato observable.
- Release: `installer/package.json`, `installer/src/core/version.ts`, `CHANGELOG.md`. `tests/release-asset-contract.test.ts` debe verificar la coherencia existente, no fijar ni recibir el literal alpha.4.

### Risks

- El path global del runtime puede divergir del `agentDir` aislado elegido por el installer y dejar una escritura correcta sin consumo real.
- Los doctors pueden volver a divergir o aceptar un simple texto coincidente sin comprobar la costura dinámica completa.
- Confundir el resolver tolerante con la inspección de doctor puede convertir JSON inválido o ilegible en un falso OK.
- Una prueba que solo lea el árbol fuente o extraiga el tar sin usar la costura real de deploy no reproduce la regresión de alpha.3.
- Un tag cortado antes de que el cambio sea el tip de `main` puede publicar código obsoleto bajo alpha.4.

### Rollback

Revertir el commit de alpha.4 devuelve conjuntamente prompt, persistencia, doctors, pruebas y punteros a su estado anterior. Si el workflow aún no publicó, eliminar el tag remoto/local y crear uno nuevo solo desde el tip correcto; nunca mover ni forzar un tag publicado. Si alpha.4 ya fue publicada y resulta defectuosa, conservarla inmutable y preparar una versión posterior mediante el mismo flujo de Actions.

### Success criteria

- Ninguna superficie actual de instalación presenta `solo/team`; la selección, el JSON persistido y el resumen coinciden en `off` o `on`.
- El runtime consume el fichero global del `agentDir` aislado activo y conserva lectura heredada sin reescritura.
- Los dos doctors aceptan el bundle actual sin `mode.ts`, fallan si falta el módulo o la costura dinámica y fallan ante evidencia explícita inválida o ilegible.
- La regresión staged usa el bundle generado por `installer/scripts/bundle-template.ts`, la misma lógica de deploy/persistencia y el doctor real; no es una aserción de strings sobre el source tree.
- TDD estricto queda demostrado por RED antes de producción y GREEN posterior; suite raíz y ambos typechecks quedan verdes.
- Los tres punteros lideran con `0.82.0-alpha.4`, y la entrega remota produce y verifica los assets esperados.

## B. Spec

### Requirement 1 — Selección y persistencia canónicas

El sistema **MUST** presentar Linear como integración opcional `off`/`on`, usar `off` como default no interactivo o cancelable ya establecido, persistir la selección como `{ "linear": <valor> }` y reportar exactamente ese valor. El sistema **MUST NOT** presentar `solo/team` como configuración actual. Un booleano heredado como `skipLinear` **MAY** permanecer exclusivamente dentro del plan existente, siempre que se traduzca una sola vez en la frontera y no se persista ni se muestre.

**Scenario**

- **Given** una instalación Pi interactiva o con defaults y una selección Linear válida.
- **When** el installer construye el plan, despliega y muestra el resumen.
- **Then** la selección, el fichero `ein-mode.json` y el resumen expresan el mismo `off` u `on`, sin vocabulario `solo/team`.

### Requirement 2 — Path global aislado y compatibilidad

El sistema **MUST** resolver el estado global desde el directorio de agente Pi activo: el `agentDir` explícito del installer y, en runtime, el hogar aislado anunciado por `EIN_PI_AGENT_HOME`/`PI_CODING_AGENT_DIR`, conservando `~/.pi/agent` como fallback heredado. El sistema **MUST** dar prioridad a `linear` sobre `mode`, **MUST** traducir `solo → off` y `team → on`, y **MUST NOT** reescribir evidencia heredada durante una lectura.

**Scenario**

- **Given** un runtime aislado con estado canónico o un fichero heredado válido.
- **When** el installer escribe o el runtime resuelve la integración.
- **Then** ambos operan sobre el mismo `ein-mode.json`, obtienen el valor canónico esperado y dejan intacta la evidencia heredada.

### Requirement 3 — Doctors alineados con el prompt dinámico

El doctor del installer y el doctor del runtime **MUST** validar la presencia de `lib/linear-integration.ts` y la costura dinámica completa: `ein-ai.ts` obtiene el estado mediante `readLinearIntegration`, lo entrega a `buildEinPrompt`, y `buildEinPrompt` incorpora `linearDirective(linear)`. Los doctors **MUST NOT** exigir `lib/mode.ts` ni una frase estática `work mode`/`solo` en el orchestrator.

**Scenario**

- **Given** un template staged construido desde las fuentes actuales y sin `mode.ts`.
- **When** cualquiera de los doctors ejecuta sus checks de coherencia.
- **Then** el contrato actual pasa; si falta el módulo canónico o se rompe cualquiera de los enlaces de inyección dinámica, el doctor reporta FAIL.

### Requirement 4 — Verificación fail-closed de evidencia

Los resolutores de uso normal **MAY** caer a `off` cuando la evidencia no se pueda resolver, pero la inspección usada por doctor **MUST** conservar procedencia y distinguir `missing`, `valid`, `invalid` y `unreadable`. Evidencia canónica o heredada válida **MUST** poder pasar; evidencia explícita malformada, con valor desconocido o ilegible **MUST NOT** producir un resultado de doctor exitoso. La ausencia total **MAY** representar el default conocido `off`, como ya define el contrato actual.

**Scenario**

- **Given** estado canónico, heredado, inválido o ilegible en la autoridad efectiva.
- **When** el runtime resuelve el valor y un doctor inspecciona la misma evidencia.
- **Then** los casos válidos mapean a `off/on`, mientras los casos inválidos o ilegibles permanecen diagnosticables y causan FAIL aunque el resolver operativo caiga a `off`.

### Requirement 5 — Regresión staged de instalación limpia

La suite **MUST** construir un template mediante `installer/scripts/bundle-template.ts` con las fuentes actuales y una app fixture ejecutable, y **MUST** alimentar ese archive a la misma lógica de extracción, templating, persistencia y limpieza que usa `deployTemplate`. Para `off` y `on`, el flujo **MUST** ejecutar el doctor real después del deploy y alcanzar estado completado. Una prueba que inspeccione solo fuentes, allowlists o el tar extraído **MUST NOT** satisfacer por sí sola este requisito.

**Scenario**

- **Given** un HOME temporal limpio, un bundle staged real y una selección Linear `off` u `on`.
- **When** el flujo ejecuta deploy, persistencia y `pi.verify-doctor` en el orden del plan, aislando únicamente dependencias externas no relacionadas.
- **Then** el doctor no emite los dos falsos FAIL de alpha.3, la evidencia persistida coincide con la selección y la ejecución/journal alcanza completado.

### Requirement 6 — Preparación y entrega de alpha.4

`installer/package.json`, `INSTALLER_VERSION` y la primera entrada de `CHANGELOG.md` **MUST** coincidir exactamente en `0.82.0-alpha.4`. La release **MUST** usar el tag anotado `installer-v0.82.0-alpha.4`, **MUST** publicarse exclusivamente mediante `.github/workflows/installer-release.yml` desde el tip válido de `main`, y **MUST NOT** publicarse desde local/npm ni mediante force-push.

**Scenario**

- **Given** código revisado y verificado con los tres punteros alpha.4 coherentes en el tip de `main`.
- **When** se crea y envía el tag anotado y termina el workflow de release.
- **Then** GitHub publica cuatro binarios, `checksums.txt` e `install.sh`, y la ejecución y los assets quedan comprobados remotamente.

## C. Decisions

### 1. `linear-integration.ts` sigue siendo la única autoridad semántica

`LinearIntegration`, `LINEAR_INTEGRATION_OPTIONS`, normalización heredada, precedencia e inspección fail-closed pertenecen a `ein-pi/agent/lib/linear-integration.ts`. Installer y ambos doctors reutilizarán esa autoridad en vez de volver a declarar `solo/team` o parsers paralelos.

El helper de path global aceptará el `agentDir` explícito cuando lo invoque el installer y resolverá el hogar de agente aislado desde el entorno cuando lo invoque el runtime, con fallback legado. La API de inspección admitirá la autoridad global explícita necesaria para que `runDoctor(context)` examine el mismo fichero que acaba de escribir el deploy.

**Trade-off:** se amplía de forma acotada una API pura existente, pero se evita un nuevo módulo de modo y se corrige la divergencia real entre instalación aislada y fallback `~/.pi/agent`.

### 2. El valor canónico nace en la CLI; el booleano queda confinado

La decisión de usuario se representará como `LinearIntegration` desde el prompt y el resumen hasta `DeployOptions`. `deployTemplate` escribirá `{ linear }` en el path global canónico. Si `skipLinear` sigue siendo necesario para no ampliar el schema del plan/journal, será un detalle interno derivado (`off ↔ true`, `on ↔ false`) y el texto del plan se expresará como `Linear integration off/on`.

**Alternativa rechazada:** renombrar en esta corrección todos los flags, schemas y journals. Aumentaría migración y review sin cambiar el comportamiento pedido.

### 3. Paridad observable entre doctors, no refactor transversal

Cada doctor seguirá siendo dueño de su formato y grupos, pero ambos usarán la inspección canónica de Linear y aplicarán los mismos tres checks observables: módulo presente, cadena dinámica completa y evidencia no inválida/no ilegible. La paridad se fijará con casos compartidos de aceptación; no se crea una jerarquía, servicio o framework común de doctors.

La costura válida no es una frase del orchestrator: es `readLinearIntegration(ctx.cwd) → buildEinPrompt(..., linear) → linearDirective(linear)`. `ein-ai.ts` y `persona.ts` no cambian salvo que una prueba RED demuestre que esa cadena real está incompleta.

**Alternativas rechazadas:** comprobar solo que aparece el texto `linearDirective` (falso positivo débil), o mover lógica de doctor al módulo de dominio (mezcla inspección de despliegue con resolución de configuración).

### 4. La regresión usa archive real con una costura mínima de entrada

La lógica interna de deploy tendrá una entrada inyectable para bytes/path de archive, usada tanto por el wrapper de producción con el asset embebido como por la prueba con el tar generado por `bundle-template.ts`. No se duplicarán extracción, limpieza, templating ni persistencia en el test.

La regresión vivirá en `tests/installed-agent-inventory.test.ts` —el arnés que ya construye el bundle real— y ejecutará el plan/handlers reales para deploy y doctor en HOME temporal. Solo se sustituirán efectos externos ajenos (instalación de paquetes, secretos, launcher o promoción); la evidencia Linear, el payload staged y los checks de coherencia no se simulan. `tests/template-agent-inventory.test.ts` conservará el inventario complementario (`linear-integration.ts`, `ein-ai.ts`, `persona.ts` presentes; `mode.ts` ausente), pero ese test estático no será la prueba principal.

### 5. TDD estricto gobierna apply

`preflight.json` declara `tdd: strict`. La primera evidencia de apply deberá ser RED en los tests enfocados de CLI/persistencia, doctors fail-closed y staged install; producción solo cambia después. GREEN debe incluir ambos valores canónicos, los dos legados, al menos un JSON inválido y un caso ilegible, además de módulo/seam ausentes. Refactor solo procede con esas pruebas verdes.

### 6. Release inmutable y remota

Los únicos punteros editables son `installer/package.json`, `installer/src/core/version.ts` y la entrada líder de `CHANGELOG.md`. `tests/release-asset-contract.test.ts` ya verifica forma y coherencia y no debe pinnear alpha.4. El tag y la publicación son posteriores a merge/verificación; GitHub Actions construye los artefactos.

### Boundaries

- CLI posee pregunta, default y resumen.
- `linear-integration.ts` posee tipos, opciones, paths, traducción, precedencia, inspección y directiva.
- Deploy posee la escritura del estado global junto al despliegue del template.
- Cada doctor posee presentación; ambos consumen el mismo contrato semántico.
- Bundler posee composición del payload; la prueba staged posee la evidencia de que payload, deploy y doctor conectan.
- Workflow de release posee build y publicación.

### Canonical spec context

`scope.md` no registró referencias canónicas ni `map.md` añadió hints explícitos a `openspec/specs/<domain>/spec.md`: **0 ficheros, 0 bytes UTF-8**. Por tanto no existen paths, SHA-256 ni conteos de bytes que registrar para specs canónicas. El delta local leído es `openspec/changes/fix-linear-integration-install-coherence/specs/installer-runtime-coherence/spec.md`; no se trata como spec canónica de dominio.

## D. Success Criteria

### Observable acceptance

- La CLI muestra “Integración Linear” y `off/on`; default y `--yes` producen `off`. No quedan mensajes actuales “Modo Solo/Team” ni `/ein:mode team` en el flujo Pi.
- Tras deploy, `<context.agentDir>/ein-mode.json` contiene exactamente `{ "linear": "off" }` o `{ "linear": "on" }`, y el runtime aislado resuelve ese mismo valor.
- `linear` prevalece sobre `mode`; `solo/team` siguen resolviendo sin mutación; JSON inválido, valor desconocido o lectura fallida causan FAIL de doctor.
- Los grupos de coherencia de ambos doctors pasan con el template actual sin `mode.ts` y fallan de manera focal al retirar `linear-integration.ts`, el read dinámico de `ein-ai.ts` o la llamada a `linearDirective` desde `buildEinPrompt`.
- La regresión staged parametrizada para `off/on` genera el tar actual, usa la lógica real de deploy, ejecuta `pi.verify-doctor` y termina; además demuestra que no depende del árbol fuente después de staging.
- La primera versión en changelog y los dos punteros ejecutables son `0.82.0-alpha.4`; el changelog describe prompt/persistencia, doctors y regresión staged.

### Required verification

Comandos enfocados esperados durante apply/verify:

```bash
bun test tests/linear-integration.test.ts tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts tests/install-plan.test.ts tests/installer-runtime-menu.test.ts tests/release-asset-contract.test.ts
```

Puertas completas obligatorias antes del tag:

```bash
bun test
bun run typecheck
cd installer && bun run typecheck
```

Comprobaciones de entrega posteriores al merge y tag:

```bash
git tag -a installer-v0.82.0-alpha.4 -m "installer-v0.82.0-alpha.4"
git push origin installer-v0.82.0-alpha.4
gh run list --workflow installer-release.yml --limit 3
gh run watch <run-id> --exit-status
```

La aceptación remota exige comprobar en la release `installer-v0.82.0-alpha.4` los assets `ein-installer-darwin-arm64`, `ein-installer-darwin-x64`, `ein-installer-linux-arm64`, `ein-installer-linux-x64`, `checksums.txt` e `install.sh`, y que el workflow verificó previamente tip de `main` y coherencia de metadatos.
