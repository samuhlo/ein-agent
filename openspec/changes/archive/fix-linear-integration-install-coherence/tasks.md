# Tasks — fix-linear-integration-install-coherence

status: ready
blocked_by: none

## // 001. Contrato fundacional de estado Linear

production files (edit): `ein-pi/agent/lib/linear-integration.ts`
test files (edit): `tests/linear-integration.test.ts`

- [x] 1.1 RED — ampliar la prueba del contrato canónico con path global basado en `agentDir`, precedencia de hogares aislados, prioridad de `linear` sobre `mode`, compatibilidad `solo/team`, ausencia válida e inspección fail-closed de JSON inválido, valor desconocido y lectura ilegible.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: fija autoridad, procedencia y estados diagnósticos antes de conectar deploy o doctors.
  - learn: el resolver operativo puede caer a `off`, pero el inspector debe conservar `invalid` y `unreadable`.
  - architecture: el módulo canónico posee tipos, paths, normalización e inspección; sus consumidores no reimplementan el parser.
  - avoid: convertir evidencia corrupta en un resultado válido o reescribir automáticamente un fichero heredado.
  - verify: `bun test tests/linear-integration.test.ts` debe fallar solo en las nuevas expectativas antes de editar producción.

- [x] 1.2 GREEN — ampliar mínimamente la autoridad canónica para aceptar el `agentDir` explícito del installer, conservar resolución aislada por entorno y exponer la inspección necesaria sin alterar `LinearIntegration = "off" | "on"`.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: proporciona una superficie compartida para escritura, lectura y diagnóstico.
  - learn: una API explícita de path evita que deploy escriba en un hogar distinto del que consume el runtime.
  - architecture: mantener funciones deterministas y E/S inyectada; la presentación permanece en los bordes.
  - avoid: crear otro módulo de modo, una clase de configuración o helpers específicos para cada doctor.
  - verify: `bun test tests/linear-integration.test.ts`

- [x] 1.3 TRIANGULATE/REFACTOR — comprobar que `off/on`, `solo/team`, prioridad, ausencia, inválido e ilegible siguen siendo casos distintos y eliminar solo duplicación nacida en este ciclo.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: protege compatibilidad y fallo cerrado antes de integrar consumidores.
  - learn: compatibilidad tolerante y diagnóstico estricto son dos vistas deliberadamente distintas de la misma evidencia.
  - architecture: conservar pequeña y explícita la superficie pública del contrato fundacional.
  - avoid: abstraer los doctors o ampliar la política de Linear durante este refactor.
  - verify: `bun test tests/linear-integration.test.ts`

## // 002. Persistencia canónica y entrada de archive en deploy

production files (edit): `installer/src/core/deploy.ts`
test files (edit): `tests/installed-agent-inventory.test.ts`

- [x] 2.1 RED — añadir casos parametrizados `off/on` que desplieguen el archive staged real y exijan el estado global con exactamente `{ "linear": <selección> }`, demostrando además que el payload procede de la entrada inyectada y no del árbol fuente.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: reproduce la persistencia incoherente de alpha.3 sobre la ruta real de bundle y deploy.
  - learn: extraer un tar no prueba una instalación; la regresión debe atravesar extracción, templating, limpieza y escritura reales.
  - architecture: el test inyecta únicamente el archive; deploy conserva propiedad sobre todo el proceso.
  - avoid: copiar lógica de deploy al test, simular el JSON persistido o ejecutar un build de producción.
  - verify: `bun test tests/installed-agent-inventory.test.ts` debe fallar en la clave `linear` o en la nueva costura antes de editar producción.

- [x] 2.2 GREEN — hacer que deploy reciba `LinearIntegration`, resuelva la autoridad global desde el `agentDir` efectivo, escriba `{ linear }` y use una costura mínima de archive compartida por el asset embebido y la fixture staged.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: alinea el valor desplegado con la autoridad consumida sin duplicar el pipeline.
  - learn: una dependencia binaria inyectable permite probar el camino real sin crear un segundo deploy de test.
  - architecture: deploy posee E/S y persistencia; el contrato fundacional posee significado y resolución del path.
  - avoid: renombrar el fichero de estado, reescribir estados heredados o abrir un refactor general del bundler.
  - verify: `bun test tests/installed-agent-inventory.test.ts tests/linear-integration.test.ts`

- [x] 2.3 TRIANGULATE/REFACTOR — cubrir ambos valores y limpiar solo duplicación local de selección/archive, manteniendo compatible la llamada de producción.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: evita que la costura de test se convierta en una ruta alternativa de despliegue.
  - learn: la inyección correcta cambia la fuente del archive, no el comportamiento posterior.
  - architecture: conservar un único pipeline de extracción, templating, persistencia y limpieza.
  - avoid: añadir flags de test al runtime o condicionar producción a `NODE_ENV`.
  - verify: `bun test tests/installed-agent-inventory.test.ts`

## // 003. Texto contractual del plan de instalación

production files (edit): `installer/src/core/install-plan.ts`
test files (edit): `tests/install-plan.test.ts`

- [x] 3.1 RED — exigir razones `Linear integration off/on` y rechazar `solo/team` como vocabulario actual, conservando `skipLinear` solo como detalle interno del plan.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: impide que el plan siga exponiendo el contrato retirado aunque la persistencia ya sea correcta.
  - learn: un booleano heredado puede sobrevivir internamente si la traducción ocurre una sola vez en la frontera.
  - architecture: el plan conserva su schema; solo cambia su texto observable.
  - avoid: migrar journals, handlers o schemas sin necesidad para este fix.
  - verify: `bun test tests/install-plan.test.ts` debe fallar en las nuevas expectativas de texto antes de editar producción.

- [x] 3.2 GREEN/REFACTOR — alinear únicamente el texto contractual del plan con `off/on`, sin ampliar su modelo.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: elimina el último vocabulario obsoleto del flujo planeado con el cambio más pequeño.
  - learn: preservar una representación interna estable reduce migración cuando no afecta al contrato exterior.
  - architecture: el plan describe pasos; no pasa a ser autoridad del estado Linear.
  - avoid: renombrar todos los flags `skipLinear` o modificar el journal por estética.
  - verify: `bun test tests/install-plan.test.ts`

## // 004. Prompt, default y resumen del installer

production files (edit): `installer/src/cli/install.ts`
test files (edit): `tests/installer-runtime-menu.test.ts`

- [x] 4.1 RED — exigir una selección “Integración Linear” `off/on`, default y `--yes` en `off`, y un resumen con el mismo valor, sin “Modo Solo/Team” ni instrucciones del contrato retirado.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: fija la frontera de usuario que origina el valor canónico entregado a deploy.
  - learn: prompt, default, persistencia y resumen deben expresar una sola decisión, no traducciones independientes.
  - architecture: la CLI posee interacción y presentación; entrega `LinearIntegration` al borde de deploy.
  - avoid: mantener `teamMode` como valor principal y traducirlo repetidamente a distintos booleanos.
  - verify: `bun test tests/installer-runtime-menu.test.ts` debe fallar solo en el contrato nuevo antes de editar producción.

- [x] 4.2 GREEN — manejar `LinearIntegration`, derivar `skipLinear` una sola vez si el plan aún lo requiere y reportar exactamente `off` u `on`.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: alinea selección, llamada de deploy y resumen sin ensanchar schemas heredados.
  - learn: la traducción única en la frontera evita estados imposibles entre UI y persistencia.
  - architecture: la CLI no escribe configuración ni redefine opciones; consume la autoridad canónica.
  - avoid: presentar `solo/team`, cambiar Claude Ein o tocar runtimes vanilla.
  - verify: `bun test tests/installer-runtime-menu.test.ts tests/install-plan.test.ts tests/installed-agent-inventory.test.ts`

- [x] 4.3 TRIANGULATE/REFACTOR — ejercitar interactivo/default para ambos valores y simplificar solo ramas obsoletas cubiertas por los tests.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: confirma que no queda una ruta silenciosa que produzca vocabulario o valores antiguos.
  - learn: triangulación útil prueba fronteras distintas, no repite el mismo ejemplo con otro texto.
  - architecture: mantener la superficie CLI delgada y delegar despliegue al core.
  - avoid: refactorizar el flujo completo de instalación o prompts no relacionados.
  - verify: `bun test tests/installer-runtime-menu.test.ts tests/install-plan.test.ts`

## // 005. Doctor del installer sobre bundle staged

production files (edit): `installer/src/core/verify.ts`
test files (edit): `tests/template-agent-inventory.test.ts`, `tests/installed-agent-inventory.test.ts`

- [x] 5.1 RED — actualizar el inventario para exigir el módulo canónico, la entrada dinámica y el constructor de prompt, y ausencia del módulo de modo retirado; ampliar la regresión staged para ejecutar el doctor real del installer, fallar al retirar módulo/read/directiva o aportar evidencia inválida/ilegible, y completar para `off/on`.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: reproduce los falsos FAIL de alpha.3 y fija a la vez los fallos cerrados reales.
  - learn: el inventario estático es apoyo; la aceptación exige deploy, doctor y finalización en orden normal.
  - architecture: el doctor del installer conserva formato propio, consume el inspector canónico y verifica la cadena dinámica completa.
  - avoid: aceptar solo una coincidencia de texto, simular el doctor o usar únicamente el árbol fuente.
  - verify: `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts` debe fallar en los checks obsoletos antes de editar producción.

- [x] 5.2 GREEN — sustituir los checks retirados por presencia del módulo canónico, la cadena `readLinearIntegration → buildEinPrompt(..., linear) → linearDirective(linear)` y la inspección de la autoridad efectiva del `agentDir`.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: permite completar instalaciones actuales y conserva FAIL ante módulo, seam o evidencia realmente defectuosos.
  - learn: un doctor verifica estructura y procedencia desplegadas; no debe depender de wording incidental del prompt.
  - architecture: el doctor posee presentación/checks del installer y reutiliza el contrato semántico sin absorber lógica del runtime.
  - avoid: reintroducir el módulo retirado, aceptar JSON corrupto por fallback `off` o cambiar las seams válidas sin un RED que lo exija.
  - verify: `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts tests/linear-integration.test.ts`

- [x] 5.3 TRIANGULATE/REFACTOR — confirmar en el staged bundle `off/on`, módulo ausente, read ausente, directiva ausente, inválido e ilegible, manteniendo una sola ejecución real de deploy/doctor por caso relevante.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: evita falsos positivos por checks de strings demasiado débiles y mantiene acotado el coste de la fixture.
  - learn: mutar una seam por vez hace que cada FAIL señale la causa contractual exacta.
  - architecture: la fixture posee mutaciones controladas; producción no incorpora hooks específicos de doctor.
  - avoid: convertir esta corrección en un framework compartido de doctors o una suite staged monolítica.
  - verify: `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts`

## // 006. Doctor del runtime con paridad observable

production files (edit): `ein-pi/agent/extensions/ein-doctor.ts`
test files (edit): `tests/installed-agent-inventory.test.ts`

- [x] 6.1 RED — añadir casos equivalentes para el doctor runtime sobre el payload staged: contrato actual válido, módulo ausente, read dinámico ausente, directiva ausente y evidencia inválida/ilegible; comparar decisiones PASS/FAIL con el doctor del installer.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: fija paridad observable sin acoplar la implementación de los dos doctors.
  - learn: paridad significa las mismas decisiones PASS/FAIL, no compartir formato ni una abstracción.
  - architecture: el doctor runtime sigue siendo dueño de grupos y salida; comparte solo la autoridad Linear.
  - avoid: extraer una jerarquía transversal de doctors o probar únicamente el doctor del installer.
  - verify: `bun test tests/installed-agent-inventory.test.ts` debe fallar en el doctor runtime antes de editar producción.

- [x] 6.2 GREEN — alinear el doctor runtime con los tres checks del contrato actual y la inspección fail-closed de la autoridad efectiva, eliminando requisitos del módulo y wording retirados.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: evita que el diagnóstico del runtime contradiga al doctor posterior a la instalación.
  - learn: dos adaptadores conservan presentación propia si consumen una semántica común y pruebas de paridad.
  - architecture: el doctor presenta el diagnóstico; el contrato fundacional decide path, normalización y estado de evidencia.
  - avoid: usar el resolver tolerante como prueba de salud o cambiar la construcción normal del prompt.
  - verify: `bun test tests/installed-agent-inventory.test.ts tests/linear-integration.test.ts`

- [x] 6.3 TRIANGULATE/REFACTOR — ejecutar juntos ambos doctors sobre las mismas mutaciones staged y reducir solo duplicación local introducida en el doctor runtime.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: demuestra que una misma rotura no obtiene respuestas opuestas de installer y runtime.
  - learn: los casos compartidos protegen mejor la paridad que forzar una abstracción prematura.
  - architecture: mantener independencia de presentación y dependencia unidireccional hacia la autoridad canónica.
  - avoid: mover inspección de archivos desplegados al módulo puro o ampliar alcance a Claude.
  - verify: `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts tests/linear-integration.test.ts`

## // 007. Punteros inmutables de alpha.4

production files (edit): `installer/package.json`, `installer/src/core/version.ts`
documentation files (edit): `CHANGELOG.md`

- [x] 7.1 sincronizar los dos punteros ejecutables exactamente a `0.82.0-alpha.4`, añadir la primera entrada de changelog describiendo selección/persistencia, doctors y regresión staged, y no editar la prueba de contrato de release para pinnear el literal.
  - skills: `release`, `bun`, `ein-discipline`
  - why: los tres punteros deben describir la misma release publicable sin crear una cuarta fuente de versión.
  - learn: el contrato de release prueba coherencia y forma; fijar la versión concreta en el test solo crea deriva.
  - architecture: metadata y constante son punteros; GitHub Actions sigue siendo propietario del build y publicación.
  - avoid: editar `tests/release-asset-contract.test.ts`, publicar en npm o generar binarios localmente.
  - verify: `bun test tests/release-asset-contract.test.ts && test "$(bun -e 'console.log(require("./installer/package.json").version)')" = "0.82.0-alpha.4" && grep -q 'INSTALLER_VERSION = "0.82.0-alpha.4"' installer/src/core/version.ts && grep -m1 '^## ' CHANGELOG.md | grep -q '0.82.0-alpha.4'`

## // 008. Puertas finales de apply y verify

production files (edit): none

- [x] 8.1 ejecutar la suite enfocada completa de comportamiento y release, sin ejecutar ningún build de producción.
  - skills: `bun`, `release`, `ein-discipline`
  - why: comprueba conjuntamente selección, persistencia, plan, doctors, staged bundle e invariantes de release.
  - learn: un bundle staged de fixture es evidencia de integración; no sustituye ni implica un build publicable local.
  - architecture: tests verifican contratos en sus fronteras y el workflow remoto conserva propiedad de artefactos.
  - avoid: usar `bun build`, el script de build de release o un binario local como puerta de apply.
  - verify: `bun test tests/linear-integration.test.ts tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts tests/install-plan.test.ts tests/installer-runtime-menu.test.ts tests/release-asset-contract.test.ts`

- [x] 8.2 ejecutar la suite completa y el typecheck raíz desde la raíz del repositorio.
  - skills: `bun`, `ein-discipline`
  - why: detecta regresiones fuera de los tests enfocados y errores TypeScript que Bun test no comprueba.
  - learn: pasar tests de Bun no demuestra corrección de tipos.
  - architecture: la raíz valida los adaptadores Pi y Claude según la puerta canónica del repositorio.
  - avoid: sustituir el typecheck por transpilar, bundlear o ejecutar solo tests.
  - verify: `bun test && bun run typecheck`

- [x] 8.3 ejecutar el typecheck independiente del installer y confirmar que apply no produjo artefactos de build.
  - skills: `bun`, `release`, `ein-discipline`
  - why: CI mantiene un segundo grafo TypeScript que la puerta raíz no cubre.
  - learn: monorepos con configuraciones separadas necesitan puertas separadas aunque compartan runtime.
  - architecture: el installer conserva validación propia; la producción de binarios queda en Actions.
  - avoid: omitir este typecheck porque la suite raíz esté verde o ejecutar publicación/build local.
  - verify: `cd installer && bun run typecheck`

## // 009. Entrega remota posterior a merge y verificación

Fuera de apply: este seguimiento de entrega se ejecuta solo después de que `sdd-verify` pase y no bloquea el estado `apply: complete`.

- 9.1 después de revisión/merge, inspeccionar las puertas de GitHub, confirmar árbol limpio y que `HEAD` es el tip de `origin/main`; crear y enviar una sola vez el tag anotado `installer-v0.82.0-alpha.4`.
  - skills: `github-workflow`, `release`, `ein-discipline`
  - why: el workflow rechaza tags cortados desde código obsoleto y la release debe ser inmutable.
  - learn: se etiqueta el commit publicado; nunca se mueve un tag para hacer coincidir el código después.
  - architecture: git identifica la fuente exacta y Actions posee construcción y publicación.
  - avoid: taggear desde una rama no fusionada, force-push, mover un tag publicado o publicar local/npm.
  - verify: `git fetch origin main --tags && test -z "$(git status --porcelain)" && test "$(git branch --show-current)" = "main" && test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" && git tag -a installer-v0.82.0-alpha.4 -m "installer-v0.82.0-alpha.4" && git push origin installer-v0.82.0-alpha.4`

- 9.2 localizar y esperar con estado exitoso el run de `.github/workflows/installer-release.yml` disparado por el tag.
  - skills: `github-workflow`, `release`, `ein-discipline`
  - why: la release solo existe válidamente si el workflow remoto completa sus propias puertas.
  - learn: subir el tag inicia la entrega, pero no prueba que los artefactos se hayan publicado.
  - architecture: GitHub Actions es la única ruta de build y publicación.
  - avoid: compensar un fallo del workflow con build local, npm o un tag movido.
  - verify: `gh run list --workflow installer-release.yml --limit 3` y después `gh run watch <run-id> --exit-status`

- 9.3 comprobar en la release remota los cuatro binarios, `checksums.txt` e `install.sh`, e inspeccionar logs si falta alguno.
  - skills: `github-workflow`, `release`, `ein-discipline`
  - why: un workflow verde sin el conjunto contractual de assets no satisface la entrega.
  - learn: la verificación posterior cubre el producto publicado, no solo el job que intentó producirlo.
  - architecture: los assets de GitHub Release son la superficie pública; el repositorio local no los genera.
  - avoid: dar por publicada alpha.4 solo por ver el tag o reemplazar assets manualmente.
  - verify: `gh release view installer-v0.82.0-alpha.4 --json assets --jq '.assets[].name' | sort` debe listar `checksums.txt`, `ein-installer-darwin-arm64`, `ein-installer-darwin-x64`, `ein-installer-linux-arm64`, `ein-installer-linux-x64` e `install.sh`.
