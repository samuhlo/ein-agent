# Plan de preparación de la beta pública de Ein

> Intención corta: adelgazar el orquestador, cerrar los riesgos del canal de instalación y publicar una beta personal que sea experimental, pero segura y veraz.

## // 000. OBJETIVO

Preparar la primera beta pública personal de Ein.

La beta podrá seguir siendo opinada para el stack y flujo de Samu. No necesita convertirse todavía en un producto generalista, pero debe cumplir estas garantías:

- El orquestador fuerte decide y sintetiza; no absorbe investigaciones amplias.
- Las operaciones read-only extensas se delegan sin crear estado SDD.
- El coste del SDD se mide con procedencia por run y fase, sin confundir input, output, caché ni billing.
- La instalación y actualización fallan de forma segura.
- Los binarios publicados corresponden exactamente a la versión anunciada.
- La configuración personal del usuario sobrevive a actualizaciones y rollbacks.
- Los assets redistribuidos tienen licencia y atribución conocidas.
- README, doctor, CHANGELOG y comportamiento real no se contradicen.
- La release candidate se prueba usando los mismos assets que descargará el usuario.

## // 001. DECISIONES FIJADAS

| Decisión | Contrato |
|---|---|
| Tipo de lanzamiento | Beta pública personal y experimental |
| Orquestador | Cerebro delgado: clasifica, delega, contrasta y decide |
| Investigación amplia | Nuevo carril `ein-scout`, sin artefactos OpenSpec |
| SDD | Sigue con siete fases; no se añade una fase de research |
| Fuente de verdad | OpenSpec para cambios SDD; Engram es memoria auxiliar |
| Unidad de trabajo | Un slice coherente equivale a un cambio SDD y una PR |
| Roadmap | Este documento coordina; no se crea un meta-SDD que implemente otros SDD |
| Modelos | Roles por capacidad/coste, sin nombres hardcodeados |
| Presupuestos de tokens | No se fijan gates numéricos hasta disponer de un ledger fiable y benchmarks comparables |
| Integridad beta | Checksum obligatorio; firma independiente queda para una fase posterior |
| Plataformas | Linux y macOS; Windows sigue mediante WSL |
| Trabajo ajeno | Nunca limpiar, incluir o modificar no trackeados sin autorización |

## // 002. BASELINE A REVALIDAR

Antes de crear el primer SDD, el agente principal debe hacer una valoración read-only y confirmar que estas observaciones siguen vigentes.

### Orquestación

- `ein-discipline` ordena delegar investigación de cuatro o más archivos y recomienda `scout/context-builder`.
- Los builtins están desactivados y el inventario no ofrece actualmente un scout.
- El orquestador prohíbe usar `sdd-map` antes del scope porque escribe `map.md`.
- El fan-out read-only recomienda contradictoriamente usar `sdd-map`.
- Engram ad-hoc y Context7 pueden terminar consumidos por el parent porque no existe un ejecutor read-only contractual.

Referencias iniciales:

- `ein-pi/core/skills/local/ein-discipline/SKILL.md`
- `ein-pi/agent/assets/orchestrator.md`
- `ein-pi/agent/settings.json`
- `ein-pi/agent/extensions/ein-ai.ts`
- `ein-pi/agent/extensions/ein-skill-registry.ts`

### Contratos y coste del SDD

- El runtime delega `sdd-apply` con `acceptance: none`, pero el prompt del agente todavía describe `acceptance: verified` y exige un `acceptance-report`.
- El cierre con `--force` puede omitir apply completo, verify fresco, summary fresco, tareas pendientes y estados OpenSpec no terminales; solo `conflict` permanece absoluto.
- El ledger actual atribuye runs porque el texto de la task contiene el nombre del cambio, por lo que una mención posterior puede contaminar el coste.
- El coste agregado suma input y output, pero no expone por separado cache read, cache write ni la procedencia de campos ausentes.
- El caso de PR #48 indica que verify y close pueden superar a apply como fuentes de coste; el diagnóstico histórico centrado en apply ya no basta.
- La reconciliación conservadora de artefactos tras timeout ya existe y no debe reimplementarse.

Referencias iniciales:

- `docs/sdd-cost-plan.md`
- `ein-pi/core/agents/sdd-apply.md`
- `ein-pi/core/agents/sdd-verify.md`
- `ein-pi/core/agents/sdd-close.md`
- `ein-pi/agent/lib/sdd-close.ts`
- `ein-pi/agent/lib/sdd-router.ts`
- `ein-pi/agent/lib/sdd-reconcile.ts`
- `tests/sdd-cost-block-e.test.ts`
- `tests/sdd-close.test.ts`
- `tests/sdd-real-cost-provenance.test.ts`

### Release

- La release debe verificar tests, typecheck, build y smoke antes de publicar.
- Tag, `package.json`, binario y template deben compartir versión.
- El workflow no debe depender de `bun-version: latest`.
- `workflow_dispatch` no debe publicar desde una referencia ambigua.

Referencias iniciales:

- `.github/workflows/ci.yml`
- `.github/workflows/installer-release.yml`
- `installer/package.json`
- `installer/src/core/version.ts`
- `CHANGELOG.md`

### Update e instalación

- El snapshot transaccional debe cubrir todos los paths modificados por el template.
- Un update debe preservar el modo Solo/Team y los campos user-owned.
- El rollback debe restaurar exactamente el estado anterior.
- El bootstrap no puede continuar sin checksum válido.
- El script público debe proceder de una release, no depender silenciosamente del `main` mutable.

Referencias iniciales:

- `installer/src/core/transaction.ts`
- `installer/src/core/template-transaction.ts`
- `installer/src/core/deploy.ts`
- `installer/src/core/backup.ts`
- `installer/install.sh`

### Distribución y documentación

- `skills/downloaded` se incluye en el bundle.
- Falta un inventario legal completo y `THIRD_PARTY_NOTICES`.
- El sync de skills locales puede conservar una ruta anterior a la separación `core/agent`.
- Existen documentos y contexto de proyecto con placeholders o claims antiguos.

Referencias iniciales:

- `ein-pi/core/skills/skills-lock.json`
- `ein-pi/agent/extensions/ein-skill-maintenance.ts`
- `installer/scripts/bundle-template.ts`
- `README.md`
- `EIN.md`
- `ein-pi/core/docs/`

## // 003. ARQUITECTURA OBJETIVO

```text
Petición del usuario
  ↓
Orquestador fuerte
  ├── clasifica el trabajo
  ├── hace como máximo dos lecturas de routing
  └── construye un research packet cerrado
        ↓
ein-scout · context:fresh · read-only
  ├── repositorio
  ├── Engram acotado
  └── documentación externa acotada
        ↓
Informe citado y comprimido
  ↓
Orquestador fuerte
  ├── spot-check de afirmaciones críticas
  ├── síntesis
  └── decisión de carril
        ├── respuesta read-only
        ├── apply ad-hoc
        └── SDD completo
```

El scout recopila evidencia; no toma decisiones de arquitectura ni crea OpenSpec.

## // 004. SLICES SDD

### Slice 01 — `sdd-apply-contract-drift`

**Resultado:** el contrato escrito de apply coincide con el comportamiento real del runtime.

Incluye:

- Eliminar del prompt la afirmación de que apply recibe normalmente `acceptance: verified`.
- Explicar que el runtime inyecta `acceptance: none` y que `sdd-verify` es el gate conductual.
- Mantener `acceptance: verified` únicamente como override explícito y excepcional.
- Eliminar la obligación general de producir `acceptance-report` cuando el nivel es `none`.
- Añadir tests contractuales que impidan reintroducir la deriva.

Aceptación:

- Prompt, orquestador, hook runtime y tests describen un único contrato.
- Un apply mecánico no genera un reporte de aceptación innecesario.
- Un override `verified` conserva la reejecución y evidencia exigidas.
- No cambia la frescura ni autoridad de `sdd-verify`.

### Slice 02 — `sdd-close-force-guard`

**Resultado:** `--force` sigue siendo una salida legacy explícita, pero no puede archivar un cambio sin evidencia crítica.

Incluye:

- Definir qué condiciones son absolutamente no forzables.
- Mantener `specState: conflict` como bloqueo absoluto.
- Impedir que `--force` omita apply incompleto, verify ausente/fallido/obsoleto o summary ausente/obsoleto.
- Resolver de forma explícita el tratamiento de `pending` y `unresolved` legacy sin volver a dejar el cierre muerto.
- Alinear runtime, spec canónica, ayuda y tests.
- Registrar en el resultado cuándo se utilizó un escape legacy y por qué.

Aceptación:

- `--force` no archiva tasks pendientes, apply parcial ni verify inválido.
- `--force` no archiva un conflicto OpenSpec.
- Los cambios legacy recuperables conservan una ruta explícita y testeada.
- El cierre normal y el cierre legacy producen resultados distinguibles.

### Slice 03 — `sdd-cost-ledger-provenance`

**Resultado:** el coste de cada cambio se atribuye mediante identidad estructurada y se reporta sin mezclar magnitudes.

Incluye:

- Introducir `flowId`, `changeId`, `phase` y `runId` en los metadatos disponibles.
- Dejar de atribuir runs mediante `task.includes(change)`.
- Registrar timestamps y procedencia de cada métrica.
- Exponer input, output, cache read y cache write por separado cuando existan.
- Mantener el coste reportado por el proveedor separado de cualquier estimación.
- Representar campos no disponibles como desconocidos, nunca como cero inventado.
- Agregar por fase, retry y cambio sin doble conteo.

Aceptación:

- Los cambios `foo` y `foo-bar` no comparten runs.
- Una mención textual posterior no contamina el ledger.
- Input, output y caché se muestran como campos distintos.
- Un proveedor sin datos de caché o billing produce `unavailable`, no una cifra falsa.
- El ledger puede reproducir el conjunto exacto de runs que agregó.

### Slice 04 — `readonly-scout-contract`

**Resultado:** existe un ejecutor de investigación read-only fuera de la máquina de estados SDD.

Incluye:

- Añadir `ein-scout` al inventario autoritativo.
- Modelo recomendado económico con esfuerzo medio.
- Allowlist estricta de herramientas de lectura.
- Prohibir write, edit, shell mutante, git mutante y subagentes.
- Ejecutar siempre con `context: fresh`.
- Limitar lecturas, runtime y tamaño del informe.
- Mantenerlo fuera de `PHASE_ORDER`, router, reconciliación y chain SDD.
- Añadirlo a doctor, configuración de modelos y tests de inventario.

Aceptación:

- El scout no puede crear ni modificar archivos.
- No crea `openspec/changes/<change>`.
- El inventario coincide exactamente con los agentes instalados.
- Un informe excedido o sin referencias se rechaza.
- El flujo SDD existente no cambia.

### Slice 05 — `thin-parent-research-routing`

**Depende de:** `readonly-scout-contract`.

**Resultado:** el parent deja de realizar exploraciones amplias.

Incluye:

- Enrutar al scout cuando la comprensión requiere cuatro o más archivos.
- Enrutar cuando se combinan dos fuentes: repositorio, memoria o documentación externa.
- Limitar el parent a dos lecturas de routing antes de delegar.
- Permitir después uno o dos spot-checks de afirmaciones materiales.
- Sustituir el fan-out de `sdd-map` por hasta tres scouts con ángulos independientes.
- Mantener `sdd-map` reservado a cambios ya scoped.
- Definir el `RESEARCH PACKET`.

Formato mínimo:

```yaml
question: resultado concreto que debe investigar
roots: rutas permitidas
memory_query: consulta opcional y específica
documentation_topics: lista opcional y acotada
budget:
  max_reads: 20
  max_output_bytes: 12288
  max_runtime_ms: 300000
output:
  findings: severity + source
  uncertainties: explicit
  alternatives: bounded
  candidate_slices: optional
```

Aceptación:

- El caso “documento + Engram + documentación externa + propuesta de slices” usa scout.
- El parent no repite la investigación del scout.
- Una valoración read-only no crea estado SDD.
- Se elimina la contradicción entre exploración pre-scope y fan-out con `sdd-map`.

### Slice 06 — `scout-context-adapters`

**Depende de:** `readonly-scout-contract` y `thin-parent-research-routing`.

**Resultado:** Engram y Context7 llegan al scout de forma acotada sin inflar el parent.

Incluye:

- Una recuperación Engram project-scoped por investigación.
- Consulta explícita, caché y límite de bytes.
- Inyección directa al contexto fresh del scout.
- Receipt E2 para cualquier claim de memoria recuperada.
- Verificar el contrato real de allowlists con tools dinámicas de Context7.
- Si Pi no admite Context7 en allowlists, diseñar un adapter determinista; no simular soporte.
- Limitar Context7 a una librería y un concepto por consulta.
- No volcar documentación completa al parent.

Aceptación:

- El parent recibe conclusiones y referencias, no el contenido bruto.
- Engram unavailable/empty/failed sigue siendo un resultado válido.
- No se afirma recuperación sin receipt.
- Context7 falla cerrado si su tool contract no está disponible.
- El informe total conserva el límite configurado.

### Gate de medición SDD

**Depende de:** `sdd-cost-ledger-provenance`, `readonly-scout-contract`, `thin-parent-research-routing` y `scout-context-adapters`.

Antes de continuar con optimizaciones internas, ejecutar tres cambios SDD comparables con el runtime final y registrar:

- runs y retries por fase;
- input, output, cache read y cache write;
- coste reportado y duración;
- tamaño de artefactos y contexto leído;
- causa de cualquier timeout, reconciliación o reejecución.

Este gate no fija todavía presupuestos numéricos. Su resultado decide si verify y close necesitan optimización antes de la beta:

- Si verify domina repetidamente el coste por redescubrimiento o ejecución duplicada, abrir `sdd-bounded-verification`.
- Si close domina repetidamente el coste o vuelve a explorar/mutar fuera de su responsabilidad, abrir `sdd-close-pure-summary`.
- Si ninguno domina de forma repetida, continuar con los gates de release y dejar el hardening adicional para después de la beta.

#### Slice condicional — `sdd-bounded-verification`

**Resultado:** verify ejecuta una entrada autoritativa y acotada sin perder independencia frente a tasks/apply.

Incluye:

- Construir un manifiesto desde baseline determinista del proyecto, criterios observables de design y comandos declarados en tasks.
- Ligar el manifiesto mediante digest y fallar cerrado si falta, cambia o queda obsoleto.
- Permitir checks adicionales de verify cuando sean necesarios para demostrar el comportamiento.
- Ejecutar cada comando requerido una sola vez, con timeout y resultado estructurado.
- Limitar el reporte sin truncar evidencia necesaria.
- Restringir verify a escribir su propio `verify-report.md`.

Aceptación:

- Apply no puede omitir silenciosamente un check necesario.
- Un manifiesto incompleto, corrupto u obsoleto bloquea.
- Un timeout solo se reconcilia si todos los comandos requeridos terminaron y el artefacto es verificable.
- Se conserva la clasificación de cobertura conductual y TDD estricto.

#### Slice condicional — `sdd-close-pure-summary`

**Resultado:** close condensa artefactos existentes sin remapear el repositorio ni modificar contexto de proyecto.

Incluye:

- Generar `summary.md` únicamente desde artefactos declarados.
- Mantener el resumen compacto y humanamente revisable.
- Mover la actualización de `EIN.md` a una operación determinista separada.
- Mantener readiness y movimiento de archive bajo autoridad del runtime.
- No mezclar todavía integridad global del archive ni receipts sidecar.

Aceptación:

- Close no lee código ni ejecuta búsquedas abiertas.
- Close solo escribe `summary.md`.
- `EIN.md` no se modifica desde el agente close.
- La matriz de bloqueos de cierre permanece idéntica o más estricta.

### Slice 07 — `release-identity-gate`

**Resultado:** una release no puede publicar versiones o assets incoherentes.

Incluye:

- Fijar versión de Bun en el workflow.
- Ejecutar tests, typecheck, build y smoke antes de publicar.
- Validar igualdad entre tag, `package.json`, binario y template.
- Validar que el manifest embebido pertenece a esa versión.
- Eliminar `workflow_dispatch` ambiguo o exigir un tag explícito válido.
- Probar los entrypoints del binario compilado.
- Bloquear publicación si falta un asset o checksum.

Aceptación:

- Un tag con versión divergente falla antes de crear la release.
- Los cuatro targets compilan y responden con la misma versión.
- Ningún asset se publica si tests o smoke fallan.
- Los checksums cubren exactamente los assets publicados.

### Slice 08 — `transactional-update-state`

**Depende de:** `release-identity-gate`.

**Resultado:** update y rollback preservan instalación y preferencias.

Incluye:

- Inventariar todos los paths modificados por el template.
- Alinear `MANAGED_DIRS`, root files, skills y manifest.
- Crear backup persistente antes de actualizar.
- Mantener snapshot transaccional para rollback automático.
- Preservar modo Solo/Team.
- Preservar campos user-owned.
- Restaurar eliminando residuos introducidos por la versión fallida.
- Probar fallos en adquisición, swap, deploy, marker y validación.

Aceptación:

- Un usuario Solo sigue en Solo después del update.
- Un fallo en cualquier etapa restaura bytes y configuración anteriores.
- Un update exitoso deja un backup utilizable por `ein restore`.
- Restore no deja archivos nuevos de la versión revertida.
- Secrets, auth y sesiones nunca entran en el backup.

### Slice 09 — `bootstrap-integrity`

**Depende de:** `release-identity-gate`.

**Resultado:** el canal público no ejecuta un binario sin verificar.

Incluye:

- Hacer `checksums.txt` obligatorio.
- Exigir una utilidad SHA-256 soportada.
- Exigir exactamente una entrada para el asset.
- Verificar antes de `chmod` y `mv`.
- Aplicar límites de descarga.
- Descargar `install.sh` desde el asset de la release o un canal versionado.
- Fallar cerrado ante red, checksum, asset o plataforma desconocida.
- Mantener firma criptográfica independiente fuera del alcance de esta beta.

Aceptación:

- Sin checksum no se instala.
- Checksum incorrecto no modifica la instalación existente.
- Un asset ausente o duplicado falla.
- El bootstrap y el binario proceden de la misma release resuelta.
- La documentación pública usa únicamente ese canal verificado.

### Slice 10 — `third-party-redistribution`

**Resultado:** todo asset incluido tiene procedencia y licencia conocida.

Incluye:

- Inventariar skills bundled.
- Registrar repositorio, revisión/commit, licencia y atribución.
- Añadir `THIRD_PARTY_NOTICES`.
- Conservar licencias upstream requeridas.
- Bloquear el bundle si una skill no tiene metadata legal suficiente.
- Separar claramente código MIT propio de contenido externo.

Aceptación:

- Cada skill distribuida tiene licencia verificable.
- El binario contiene los notices requeridos.
- Una entrada con licencia desconocida falla en CI.
- El README explica el alcance real de la licencia raíz.

### Slice 11 — `public-beta-truth-pass`

**Depende de:** slices 07–10.

**Resultado:** la documentación describe únicamente comportamiento enviado.

Incluye:

- Corregir la ruta de actualización de skills locales.
- Limpiar placeholders y caracteres corruptos de `EIN.md`.
- Revisar documentación SDD antigua.
- Diferenciar `ein doctor` terminal y `/ein:doctor` dentro de Pi.
- Documentar que la beta es personal, opinada y experimental.
- Documentar defaults de GitHub/Linear y personalización necesaria.
- Verificar requisitos mínimos de Bun, Pi, Git, tar y gh.
- Añadir una sección clara de limitaciones conocidas.
- Actualizar CHANGELOG y versión solo cuando los productores estén verificados.

Aceptación:

- Cada comando del README se ejecuta como está escrito.
- No hay claims sobre canales pendientes.
- No se promete portabilidad general.
- La ruta de skills locales existe realmente.
- Doctor y documentación coinciden.

### Slice 12 — `published-assets-rc`

**Depende de:** slices 07–11.

**Resultado:** la beta se prueba usando assets publicados reales.

Matriz mínima:

| Flujo | Linux x64 | Linux ARM64 | macOS x64 | macOS ARM64 |
|---|---:|---:|---:|---:|
| Fresh install | Requerido | Requerido | Requerido | Requerido |
| Update desde release anterior | Requerido | Requerido | Requerido | Requerido |
| Rollback por fallo inyectado | Requerido | Requerido | Requerido | Requerido |
| Restore | Requerido | Requerido | Requerido | Requerido |
| Uninstall | Requerido | Requerido | Requerido | Requerido |
| Doctor | Requerido | Requerido | Requerido | Requerido |

Aceptación:

- Las pruebas descargan la release publicada, no un binario local.
- Version, template y marker coinciden.
- Update preserva modo y configuración.
- Rollback y restore dejan un estado exacto.
- Doctor pasa después de install/update/restore.
- Los resultados se registran sin secretos ni rutas personales.

### Hardening SDD diferido después de la beta

Estos mecanismos permanecen registrados, pero no bloquean la primera beta salvo que el gate de medición aporte evidencia nueva:

- `sdd-context-reference-contract`: reducir bytes releídos mediante referencias y digests sin sustituir el contenido que una fase necesita comprender.
- `sdd-closed-record-integrity`: publicar un manifest de hashes para artefactos canónicos y separar receipts o sidecars que deban seguir creciendo.
- Límites de artefactos: combinar líneas y bytes, avisar pronto y fallar solo ante tamaños extremos que impidan revisión o contexto seguro.
- Regresiones de seguridad: mantenerlas como requisito transversal de cada slice, no como un SDD independiente.
- Reconciliación de timeout: extender la existente únicamente si el manifiesto de verify permite demostrar que todos los comandos requeridos terminaron.

## // 005. ORDEN

```text
PR #48 mergeada/reconciliada
  ↓
01 sdd-apply-contract-drift
  ↓
02 sdd-close-force-guard
  ↓
03 sdd-cost-ledger-provenance
  ↓
04 readonly-scout-contract
  ↓
05 thin-parent-research-routing
  ↓
06 scout-context-adapters
  ↓
gate de medición SDD
  ├── sdd-bounded-verification (condicional)
  └── sdd-close-pure-summary (condicional)
        ↓
07 release-identity-gate
  ├── 08 transactional-update-state
  └── 09 bootstrap-integrity
        ↓
10 third-party-redistribution
        ↓
11 public-beta-truth-pass
        ↓
12 published-assets-rc
        ↓
tag de beta + verificación final
```

Los slices 08, 09 y 10 pueden desarrollarse en paralelo únicamente mediante worktrees aislados y PRs independientes.

## // 006. PROTOCOLO PARA EL AGENTE PRINCIPAL

1. Leer este documento, `README.md`, `EIN.md`, OpenSpec vigente y contexto Engram.
2. Revalidar el baseline read-only; no confiar ciegamente en líneas o estados históricos.
3. No crear un SDD maestro para ejecutar todos los slices.
4. Crear solo el siguiente cambio de la secuencia.
5. Ejecutar `scope → map → design → tasks`.
6. Presentar el plan antes de apply.
7. Aplicar por grupos pequeños.
8. Verificar comportamiento y contratos.
9. Cerrar y archivar el cambio.
10. Entregar una PR por slice.
11. Actualizar este roadmap únicamente con evidencia ya publicada.
12. Si map pronostica más de 400 líneas de producción, dividir antes de design/apply.

## // 007. NO OBJETIVOS

- No convertir Ein en un producto generalista.
- No añadir una octava fase SDD.
- No incorporar Homebrew todavía.
- No implementar Windows nativo.
- No añadir firma Minisign en esta beta.
- No crear multi-perfil.
- No fijar presupuestos o gates numéricos de tokens antes de completar el ledger y el gate de medición.
- No reimplementar la reconciliación de timeout ya existente.
- No hacer inmutable todo el archive sin separar antes artefactos canónicos y sidecars mutables.
- No cambiar package manager ni dependencias centrales sin aprobación.
- No refactorizar el installer fuera de los seams necesarios.
- No publicar documentación por adelantado.
- No mezclar varios slices en una PR.

## // 008. DEFINITION OF DONE

La beta está lista cuando:

- El caso de investigación amplia mantiene delgado el contexto del parent.
- Ninguna valoración preliminar crea artefactos SDD.
- El prompt de apply coincide con el contrato `acceptance` real del runtime.
- Ningún cierre, incluido el escape legacy, omite evidencia crítica de apply y verify.
- El ledger atribuye cada run por identidad estructurada y separa input, output y caché.
- El gate de medición deja una decisión explícita sobre verify y close sin inventar presupuestos.
- La release demuestra identidad única de versión y payload.
- El bootstrap falla cerrado sin integridad.
- Update y rollback preservan configuración y modo.
- Todos los assets redistribuidos tienen licencia conocida.
- README, doctor, CHANGELOG y runtime coinciden.
- La matriz RC pasa usando assets publicados.
- No quedan P0 conocidos abiertos.
- La release final tiene tag, checksums, notas y read-back verificados.

## // 009. SALIDA FINAL

Tras completar la matriz RC:

1. Preparar versión beta y CHANGELOG.
2. Crear tag `installer-v<semver>`.
3. Verificar workflow y assets.
4. Ejecutar fresh install desde el canal público.
5. Ejecutar `ein doctor`.
6. Confirmar versión instalada y template.
7. Publicar el anuncio solo después del read-back final.
