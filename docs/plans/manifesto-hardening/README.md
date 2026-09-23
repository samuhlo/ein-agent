# Correcciones del manifiesto · diseño y ejecución acotada

Estado del diseño original: **13 paquetes preparados sobre alpha.9**. La
implementación posterior se entrega como [cadena de PRs](estado-ejecucion-2026-09-22.md);
esta ficha conserva las decisiones iniciales y no sustituye el estado actual de
GitHub.
Fecha del diseño: 16 de septiembre de 2026. Base de código inspeccionada:
`3b9fa420f8cd18480bee6a19dd1ed14b99bc483e` (alpha.9).

Fuente: [auditoría de 13 hallazgos](../../audits/2026-09-16-manifiesto.md).
La [evidencia histórica](../../audits/2026-09-16-manifiesto-evidencias.md) conserva
los probes que demostraron los defectos. Sus expectativas antiguas no son tests
de aceptación: después de corregir, algunos probes deben dejar de reproducir el fallo.

Este es un plan de trabajo solicitado por Samu. No es un cambio SDD activo,
una afirmación de checks pasados ni permiso para modificar una instalación.
Usa la estructura Proposal/Spec/Decisions/Acceptance de `sdd-design` y añade
paquetes de implementación al estilo `sdd-tasks` para que el ejecutor reciba
decisiones cerradas. Ninguna ficha depende de archivos que solo existan en `/tmp`.

## Objetivo y límites

La misma evidencia debe producir la misma decisión al validar, enrutar, cerrar,
reanudar y presentar el trabajo. Las correcciones conservan evidencia útil sin
convertir incertidumbre en éxito ni hacer reparar prosa sin consumidor mecánico.

Se reutilizan el núcleo compartido, puertos, escritor de checkpoint, CLI, guards
y límites del runtime existentes. Los registros nuevos son específicos de una
garantía y tienen productor/consumidor definidos; no se crea un motor genérico
de workflows, almacenamiento o presupuestos. Modelos locales y nuevos proveedores
no pertenecen a este alcance. Tampoco se implementa el bloque 07 de Planificador.

## Índice y trazabilidad

Cada número coincide con el hallazgo de la auditoría. La tabla describe el
alcance previsto, no el estado de ejecución de cada PR.

| ID | Diseño entregable al ejecutor | Dependencias de implementación | Resultado observable |
| --- | --- | --- | --- |
| 01 | [Resultado de verify](01-verify-outcome.md) | — | Un ejemplo pass no domina un fail global |
| 02 | [Frescura verificada](02-verification-freshness.md) | 01 | Ediciones/borrados invalidan el recibo, sin autorreferencia |
| 03 | [Reconciliación de fase](03-phase-reconciliation.md) | 01, 02, 05; #452 integrada | Solo recupera la ejecución y artefacto esperados |
| 04 | [Rollback completo](04-template-rollback.md) | — | Toda ruta gestionada vuelve a su preimage o se declara fallo |
| 05 | [Contrato de delegación](05-delegation-contract.md) | #452 integrada antes de editar hooks compartidos | Ninguna forma parcialmente reconocida omite política |
| 06 | [Intent pendiente](06-pending-intent.md) | 05, 07; integrar 08 antes si ya se empezó | El borrador y sus respuestas atraviesan Pi/Claude |
| 07 | [Objetivo de continuidad](07-continuity-objective.md) | — | Una respuesta no sustituye al objetivo semántico |
| 08 | [Operaciones inciertas](08-mutation-uncertainty.md) | 05 y 07 en el orden recomendado | Reiniciar/refresh no borra el resultado incierto |
| 09 | [Tareas terminadas](09-tasks-readiness.md) | Integrar después de 01/02 para no solapar routing | Lint y router coinciden sobre tareas completadas |
| 10 | [Presupuesto de investigación](10-phase-budget.md) | 05; coordinar 11 en el mismo gateway | Límite real de llamadas; tokens orientativos explícitos |
| 11 | [TDD y presupuesto](11-apply-tdd-budget.md) | 05 | Postura persistida y presupuesto usan la misma decisión |
| 12 | [Tamaño real de la entrega](12-review-forecast.md) | — | Cuenta nuevos archivos y mide el commit que se publicará |
| 13 | [Dry-run sin mutaciones](13-update-dry-run.md) | —; conservar los cambios de 04 al integrar transaction | Simular no limpia ni finaliza recuperación |

Orden recomendado de puntos completos:
**01 → 02 → 04 → 13 → 05 → 03 → 09 → 11 → 10 → 07 → 08 → 06 → 12**.
Para minimizar conflictos se ejecuta un paquete a la vez; no lanzar dos
implementadores sobre routing, hooks, transaction, checkpoint o CLI simultáneamente.
Dentro de 04, el orden explícito es 04.1 → 04.2 → 04.4 → 04.3.

Las PR #451/#452 estaban abiertas al redactar. Este plan no las fusiona ni
autoriza repetir sus cambios. El coordinador prepara una base que ya las integre
para los puntos indicados. Los puntos independientes pueden empezar antes.

## Preparación del coordinador

1. Preparar un checkout aislado desde la base acordada. El workspace original
   de esta conversación está en una revisión antigua y tiene cambios del usuario;
   **no aplicar las fichas de alpha.9 directamente sobre él ni resetearlo**.
2. Transferir estos documentos al checkout de trabajo y registrar commit real,
   puntos previos integrados y paquete exacto autorizado. Un hash distinto por
   cambios anteriores previstos no es un bloqueo: comparar las anclas/API relevantes.
3. Proporcionar al ejecutor este índice y una ficha completa mediante los
   [13 prompts con entrega por PR](prompts.md). Ejecuta sus paquetes en orden,
   sin pedir autorización entre ellos; cada paquete conserva sus límites de escritura.
4. Las decisiones de arquitectura de C ya están tomadas. El ejecutor resuelve
   detalles normales de código, nombres locales y formato; no crea otro diseño,
   cambia dependencias o amplía el producto por iniciativa propia.
5. Si una ancla/API fue sustituida y el cambio invalida la receta, el coordinador
   adapta ese tramo del plan. No exigir que el modelo barato redescubra el proyecto.

Los hashes y números de línea de la auditoría son procedencia, no una puerta
que obligue a repetir investigación por cualquier cambio cosmético del repositorio.

## Convenciones de los paquetes

- Cada paquete toca como máximo cuatro archivos de producción; incluye sus
  pruebas asociadas. Una base nueva se implementa antes que sus consumidores.
- `stop/parar` en cada ficha indica tanto el criterio de terminación como la
  discrepancia específica que obliga a devolver el control. No pide otra aprobación
  por cada transición ya autorizada ni por corregir una regresión dentro del paquete.
- Un archivo marcado nuevo se crea; un archivo existente se edita de forma
  localizada. No borrar módulos enteros para sustituirlos por una implementación paralela.
- Un test nuevo se escribe con la conducta correcta, no esperando perpetuar el bug.
  Incluir control positivo y fallos de frontera; invocar el consumidor real cuando
  la garantía esté entre varias capas. Un assert sobre una frase no acredita conducta.
- Nada de instalar sobre `~/.pi-ein`, cambiar modelos, credenciales, servicios remotos,
  actualizaciones de paquetes no requeridas, commits, PRs, merge o release, salvo
  autorización adicional explícita en el encargo de ejecución.
- Los helpers compartidos no importan interiores de adaptadores. Git/procesos se
  ejecutan en el adaptador/puerto nombrado, no desde `shared/contracts` o `shared/sdd`.
- No editar `.gitignore`, snapshots o journals de proyectos reales para hacer pasar
  un fixture. Las migraciones se prueban con raíces temporales y lectura posterior.
- No tratar recibos de frescura/finalización como prueba de calidad semántica.
  Verify sigue ejecutando los checks y revisando el comportamiento independiente.

## Validación proporcional

Preparación de un checkout nuevo, una vez, por el coordinador: instalar dependencias
de raíz e installer según sus lockfiles y generar el template host que exige la
suite. Usar los comandos de `EIN.md` del checkout preparado. No volver a instalar
ni recompilar en cada paquete si los prerrequisitos siguen válidos.

Por paquete: ejecutar los tests exactos listados y `bun run typecheck` desde la
raíz. Si cambia installer, ejecutar también `(cd installer && bun run typecheck)`.
La ficha puede agrupar una transición de interfaces explícitamente dependiente;
no declarar esa transición aceptada hasta que todos sus consumidores compilen.

Al cerrar cada punto: ejecutar sus escenarios B/D y los tests de los consumidores
tocados. Para nuevos módulos compartidos, tools o dependencias de payload:
`(cd installer && bun run bundle-template:host)` y pruebas de cierre del payload.
La regeneración Claude se hace en memoria con `compileClaudeSurface()` y se aplica
al fichero generado del repositorio; nunca ejecutar `sync` contra el hogar personal.

En cada corte de integración para entrega, el responsable de verificación ejecuta:

```sh
bun test --timeout 15000
bun run typecheck
(cd installer && bun run typecheck)
git diff --check
```

Los checks de runtime instalado se ejecutan cuando cambie esa frontera, usando
hogares temporales. Una prueba que requiere modelo/proveedor no se sustituye por
un mock y se anuncia como si fuera real: registrar ambas coberturas por separado.
No se pide un build completo de aplicación a cada worker ni se repiten pruebas
verdes sin cambios, fallos o lagunas concretas que lo justifiquen.

## Encargo copiable para un ejecutor barato

La entrega autorizada el 17 de septiembre es **una PR por punto completo**, no
una por paquete. Los [prompts actualizados](prompts.md) autorizan rama, commit,
push y apertura/actualización de PR; no autorizan merge ni release. Las PRs
dependientes pueden encadenarse sobre una rama anterior verificada aún abierta,
con diff limitado al punto nuevo. Un punto con fallos pendientes se publica
como borrador y no cuenta como dependencia completada.

La plantilla siguiente queda para una delegación interna de un solo paquete;
la entrega del punto completo la gobierna el prompt actualizado.

```text
Implementa únicamente el paquete <ID> de docs/plans/manifesto-hardening/<ficha>.md.
Checkout preparado: <ruta>. Commit de partida: <SHA>. Dependencias integradas: <IDs>.
Lee README.md de esa carpeta y las secciones A-D de la ficha; ejecuta solo el paquete indicado.
Las decisiones están cerradas: no remapees el repositorio ni rediseñes la solución.
Lee los archivos enumerados y escribe únicamente las rutas edit/create y tests del paquete.
Aplica los pasos, comprueba los casos negativos y el control positivo y ejecuta los comandos.
Si la receta ya está satisfecha, compruébalo y devuelve evidencia; no rehagas el cambio.
Si una API real contradice el diseño, devuelve la ruta, firma y diferencia concreta.
No edites fuera de alcance ni hagas entrega Git, despliegue o release por inferencia.
Devuelve: estado; paquete completado; archivos cambiados; comandos y códigos de salida;
comportamiento probado; lagunas o bloqueo específico. No pegues logs completos.
```

Primer encargo recomendado: **01A**, después de preparar el checkout.
Al terminar, el coordinador verifica y entrega el siguiente paquete con evidencia
de sus dependencias. No pasar las trece fichas como una orden de implementar todo.

## Integración sin contradicciones

- 01 es dueño del resultado global; 02 de frescura; 03 de atribución de ejecución.
  El recibo de 03 referencia el de 02, no copia otro verificador.
- 05 es dueño de la forma admitida. 10 y 11 consumen sus items completos y su
  serializador; no añaden regex paralelas para descubrir agentes/tasks.
- 07 mantiene objetivo y procedencia en el checkpoint; 06 mantiene el borrador
  de entrevista; 08 mantiene solo operaciones. No crear tres copias del objetivo.
- 04 define el inventario de rollback; 13 consulta recuperación sin efectos.
  Ambos usan el journal real del instalador; dry-run no adelanta su estado.
- 12 mide la entrega y no la autoriza. Los consentimientos Git y decisiones de
  tamaño existentes permanecen separados del cálculo.

La documentación de cada punto incluye compatibilidad y reversión. Revertir
código no autoriza borrar evidencia privada ni ignorar estados desconocidos.
Las correcciones solo se dan por terminadas con sus resultados observables,
no por haber creado los archivos o por el número de tests ejecutados.
