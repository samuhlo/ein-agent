# Hoja de ruta de producto de Ein

Este es el roadmap canónico de Ein. Ordena el trabajo futuro en un único
programa; no compite con el `MANIFIESTO.md`, que fija el rumbo y los límites, ni
con los documentos de valoración y dogfooding, que aportan evidencia.

Ein sigue siendo un arnés para una persona: convierte trabajo ambiguo en
cambios pequeños, verificables y explicados, con el estado en disco y no en la
conversación. Pi es el runtime de referencia; Claude es el relevo. El uso
propio gana cuando entra en conflicto con una ambición de producto más amplia.

## Veredicto actual

Ein tiene buenos cimientos deterministas y una historia de trabajo aceptada,
pero todavía no tiene un contrato de release ni una secuencia de producto
cerrada.

- **No existe hoy un contrato alpha/estable.** `isEligibleRelease` rechaza las
  prereleases y, por tanto, cada publicación acaba siendo efectivamente de
  producción (`docs/valoracion-estado-y-rumbo-2026-08.md:36-38,448-517`). El
  backup y rollback sobre el árbol real ya completados permiten corregir esto
  sin poner en riesgo el trabajo.
- **El resultado de apply aún se presenta como procedimiento.** La etiqueta
  actual de apply y la prosa de tareas/fases describen acciones del agente, no
  el resultado que debe quedar (`ein-pi/agent/lib/sdd-overlay.ts:45-153`). Eso
  no es una instrucción ejecutable suficiente para un modelo local.
- **La preflight ya persiste la postura TDD por cambio y la resuelve de forma
  determinista.** No debe volver a preguntarla en cada sesión o fase
  (`ein-pi/agent/lib/sdd-preflight.ts:1-18,220-240`).
- **La frontera de configuración de modelo y thinking por agente ya existe.**
  La mejora de esfuerzo debe ampliar esa frontera, no crear otra
  (`ein-pi/agent/lib/model-config.ts:1-65`).
- **La selección de cambios múltiples es ambigua por contrato.** El router
  representa la ambigüedad; no puede escoger un TODO arbitrario
  (`ein-pi/agent/lib/sdd-router.ts:35-125`).
- **La presentación tiene deuda visible.** Hay 18 herramientas de Ein sin
  renderer humano y el instalador mezcla dos gramáticas visuales
  (`docs/plan-hallazgos-dogfooding-2026-08.md:240-258,287-304`).

La prioridad de producto es convertir la salida de pre-apply en una instrucción
cerrada y medible para modelos baratos y futuros modelos locales. La seguridad
de release va inmediatamente antes o en paralelo a la ejecución local; no es un
prerrequisito de meses para empezar a medir, diseñar el packet o simplificar la
experiencia.

## Estado de ejecución — 2026-08-24

El veredicto de arriba se escribió antes de ejecutar. Esto es lo entregado
desde entonces, medido contra `origin/main` y no contra la memoria:

| Unidad | Estado | Evidencia |
|---|---|---|
| 1A contrato mínimo stable/alpha | **entregado** | PRs #224, #225, #226; preferencia persistida, resolución determinista, `artifactId`, rollback local auditable |
| 1B publicación remota determinista | **entregado** | PR #227 y tag `installer-v0.82.0-alpha.1`; coherencia tag/versión/changelog y `--prerelease` solo para alpha |
| 2A corpus, baseline y schema del packet | **entregado** | PR #228; carpeta `evals/` y `openspec/specs/apply-packet/` |
| Recibos humanos de las 18 tools (parte de 3A) | **entregado** | PR #229; puerta única `registerEinTool` |
| 2B ejecución del packet y modelo local | pendiente | espera a que 2A se use contra candidatos reales |
| 3A simplificación independiente | pendiente, menos los recibos | Team sigue siendo modo de primera clase; no hay selector de cambio activo |
| 3B overlays dependientes del packet | pendiente | depende de 2A, ya cerrado |
| 4A investigación del freeze | pendiente | sin reproducción ni clasificación de ownership |
| 5 superficie installer/launcher | pendiente | `@clack` en tres ficheros, segundo menú vivo, `pi-ein`/`cc-ein` sin renombrar |
| 6 logo | **entregado antes de tiempo** | `d3931d5`; la marca es un televisor con una terminal dentro |
| 7 estilo de código entregado | pendiente, abierto 2026-08-25 | las skills existen y no se aplican; el bloque entrega rutas y nada verifica el resultado |

La unidad 6 se adelantó a su dependencia. No reabre nada: la geometría se
decidió con evidencia visual y la gramática de 5 no la contradice.

La siguiente unidad en ejecución es la **puerta pública única**, que absorbe
C1 del plan de dogfooding y el recorte de superficie de `// 011` de la
valoración: un nombre, una entrada, y el segundo menú retirado.

## Historia aceptada y cimientos que no se reabren

Se conserva esta historia como estado, no como una segunda lista de prioridades:

- **Pi Cleaner y Architect:** aceptados en escenarios deterministas empaquetados.
  Cleaner puede auditar y hacer mejoras acotadas; Architect sigue siendo de solo
  lectura. Las invocaciones naturales y los controles explícitos siguen siendo
  superficies del mismo workflow. El smoke semántico con credenciales es
  opcional y no reabre la aceptación.
- **SDD y continuidad:** la participación de Pi, el orden
  `sdd-apply → ein-cleaner → ein-architect → sdd-verify`, los perfiles de
  activación y el checkpoint bidireccional Pi↔Claude están construidos y
  probados. El estado del trabajo continúa viviendo en
  `openspec/changes/<cambio>/`.
- **Claude:** sigue siendo relevo, no segundo producto. Cleaner y Architect en
  Claude permanecen aplazados; si se retoman, serán invocación explícita,
  compartirán la implementación y no introducirán un registro genérico de
  proveedores.
- **Instalador:** ya existen inventario parcial de ciclo de vida, adquisición,
  backups, journal, transacciones, rollback, doctor y uninstall. El backup y
  rollback sobre el árbol real están completados. El inventario autoritativo,
  el planner común y el dry-run exacto siguen siendo unidades de cierre del
  ciclo de vida local.
- **Launcher y superficies:** el launcher conserva su controlador y renderer
  legado. La migración a OpenTUI está detenida: pasó la aceptación funcional,
  pero no las puertas de arranque y distribución. No se autoriza reabrirla.
- **Coste del prompt y carril ligero:** el programa anterior de presupuesto de
  prompt, diagnósticos accionables y el carril `micro` ya están construidos como
  baseline. Eso no demuestra que `micro` resuelva cambios de una línea ni cierra
  la pregunta de adelgazar el prompt; ambas decisiones quedan medidas más
  adelante sin relajar `verify` ni `close`.
- **Collectors y contratos deterministas:** el programa de collectors de
  Cleaner y la aceptación empaquetada de Pi están completos. Los hechos
  computables siguen calculándose antes de gastar razonamiento del modelo.

Estos cimientos se protegen: un runtime vanilla no se modifica, el estado no se
mueve a la conversación, la incertidumbre sigue siendo `unknown`/`unavailable`,
y ningún agente sustituye una garantía que puede calcular una herramienta.

## Programa único y secuencia ejecutable

Las letras son subtracks del mismo programa, no otra cola ni otra prioridad.
Cada unidad debe ser pequeña, reversible, con un outcome observable, archivos
acotados y una frontera de rollback explícita.

```text
Inicio en paralelo:
  1A contrato mínimo stable/alpha ───────┐
  2A corpus + baseline + schema packet ──┼─→ 1B publicación remota determinista
  3A simplificación independiente ───────┤       ║
  4A investigar freeze y ownership ──────┘       ║
                                                   └─→ 2B ejecución del packet y
                                                       promoción de modelo local
Después de 2A: 3B overlays de outcome/stop rules
Después de 3A/3B: 4B arreglo UX integrado, si la evidencia lo atribuye a Ein
Después de 1A y 3A: 5 superficie installer/launcher y ciclo de vida local
Al final de la gramática estable: 6 logo
```

`2A` puede empezar sin esperar a todo el release system: congela corpus,
línea base, métricas y schema. `1B` debe quedar validada inmediatamente antes
o en paralelo a `2B`; así la ejecución local se prueba con un carril seguro, sin
bloquear la medición y el diseño iniciales.

### Fronteras de autoridad: publicación remota y ciclo de vida local

No existe una transacción ni un rollback compartido entre estas dos
autoridades. Pueden compartir el identificador inmutable de artefacto, pero no
suponer que una operación deshace la otra.

- **Autoridad remota de publicación:** CI y el sistema de artefactos poseen la
  versión publicada, canales, promoción, firmas, checksums y read-back de los
  bytes y metadatos. Promover significa mover un canal de `alpha` a `stable`
  después de sus gates. Hacer rollback remoto significa devolver el canal a un
  artefacto publicado anterior y verificable; no restaura árboles de máquinas
  locales.
- **Autoridad local de installer:** la CLI y el installer poseen install,
  update, repair, uninstall, restore, el inventario de lo gestionado y el
  planner local. El rollback local significa recuperar el árbol local anterior
  desde backups y journal de la transacción afectada; no mueve canales ni
  reescribe un release remoto.

El `artifactId` común permite trazar ambas historias. La publicación remota no
promete rollback local, y una reparación o rollback local no altera la
promoción remota.

### 1. Contrato de releases y control de riesgo

**Propósito.** Crear una distribución que permita probar cambios sin convertir
cada publicación en producción. El release system lo poseen el código, la CLI
de publicación y CI; no una skill de agente.

#### 1A. Contrato mínimo stable/alpha

- Persistir la preferencia de canal y resolverla de forma determinista.
  `stable` nunca acepta prereleases; `alpha` es el carril de experimentación y
  dogfooding de Ein.
- Mostrar honestamente el canal efectivo, la versión y cualquier estado de
  expiración. Clientes permanecen en `stable`; Ein puede usar `alpha`.
- Definir una política comprobable de expiración, promoción y retirada de alpha:
  edad y uso se miden, una alpha expirada no se presenta como current y la
  promoción exige la evidencia de publicación de 1B.

**Aceptación de 1A.** Fixtures de settings, resolución, prerelease, expiración
y canal efectivo prueban que el camino estable no consume alpha y que la
incertidumbre es `unknown`/`unavailable`, nunca `current`.

#### 1B. Publicación remota determinista

- CI publica artefactos con versión, tag, changelog, checksums y firma
  coherentes; lee de vuelta bytes y metadatos antes de declarar éxito.
- Promoción alpha→stable y rollback remoto operan sobre el identificador de
  artefacto y el canal, con una frontera explícita y auditable.
- Los fallos de adquisición, staging, publicación, firma y read-back dejan el
  canal remoto en su estado anterior. La tecnología de firma y la rotación de
  trust roots se eligen con evidencia dentro de este subtrack.

**Aceptación de 1B.** CI demuestra cero discrepancias entre versión, tag,
changelog, checksum, firma y read-back; fault injection demuestra que una
publicación fallida no promociona el canal y que el rollback remoto devuelve el
artefacto anterior. Esto no afirma nada sobre restaurar un árbol local.

**No objetivos de 1.** No publicar desde una máquina local, no delegar releases
a una skill, no introducir un registro de proveedores, no usar alpha para
clientes y no decidir aquí la geometría del logo.

### 2. Apply Packet/IR y ejecución local

**Propósito.** Hacer que el output de pre-apply sea ejecutable por modelos de
bajo coste y, después, por un modelo local con ventana limitada. La valoración
mide el coste de papeleo y sitúa el límite en el contexto de apply/verify:
mejorar la calidad del plan, no dividir apply en más agentes
(`docs/valoracion-estado-y-rumbo-2026-08.md:195-209,676-792`).

#### 2A. Corpus, baseline y schema del packet

Este subtrack empieza en paralelo con 1A y no puede hacer circular la decisión
de promoción:

1. congelar un corpus representativo de cambios archivados, con outcome
   conocido, slices permitidos y checks enfocados;
2. ejecutar la línea base con el flujo actual y registrar éxito de tarea,
   desviaciones, preguntas al supervisor, turnos, contexto pico y señales de
   razonamiento;
3. fijar métricas, presupuesto y umbrales a partir de esa línea base;
4. solo después comparar candidatos y decidir si alguno se promociona.

En paralelo a los pasos 1–3 se puede diseñar y validar el schema de un **Apply
Packet/IR** compilado determinísticamente desde `design.md` y `tasks.md`. Como
mínimo contiene outcome exacto, archivos permitidos, ediciones ordenadas o una
intención acotada, invariantes, comando enfocado, condiciones de parada y
evidencia esperada. No contiene decisiones pendientes que el ejecutor deba
inventar.

**Aceptación de 2A.** El corpus y la línea base quedan versionados con sus
métricas y umbrales; una segunda ejecución reproduce la medición. El schema
rechaza packet sin invariante, ambiguo, obsoleto o fuera de alcance. La tabla de
umbrales existe antes de evaluar o promocionar cualquier modelo local.

#### 2B. Ejecución del packet y promoción de modelo local

`2B` espera a que `2A` haya congelado corpus, baseline, métricas y thresholds, y
a que `1B` esté validada o se ejecute en paralelo como protección de
publicación. Incluye:

- validar frescura, alcance, consistencia, stop rules y evidencia antes de
  escribir;
- ejecutar solo el slice y el comando enfocado declarados, con parada
  fail-closed ante una decisión ausente;
- comparar candidatos locales contra la misma línea base y corpus, usando éxito
  de outcome, desviación cero o clasificada, preguntas al supervisor y contexto
  dentro del presupuesto;
- promocionar un candidato solo cuando los umbrales previamente fijados se
  cumplen por el corpus acordado. La promoción del modelo no es promoción de un
  canal remoto ni rollback del installer.

**Aceptación de 2B.** Un executor no escribe fuera de sus archivos ni puede
saltarse el check enfocado. Las métricas se leen por cambio y por modelo; un
candidato no se declara mejor antes de la comparación contra baseline. Una
demostración local cumple el presupuesto medido sin degradar ningún gate
determinista y su fallo deja evidencia, no un éxito implícito.

**No objetivos de 2.** No partir apply o verify en más agentes, no comprar
hardware por adelantado, no construir un RAG o un proveedor genérico, no hacer
que un modelo local decida arquitectura y no reemplazar el juicio de design por
heurísticas débiles.

### 3. Modos, esfuerzo y ciclo de vida legibles

**Propósito.** Reducir decisiones de producto duplicadas y hacer que una sesión
nueva sepa qué cambio está activo, qué se ha hecho y qué queda. La interfaz
debe mostrar el cálculo del sistema, no una interpretación libre del agente.

#### 3A. Simplificación independiente

Puede ejecutarse sin Apply Packet:

- retirar **Team** como modo de primera clase; **Solo/OpenSpec+git** queda como
  contrato normal y Linear como integración opcional, explícitamente activada,
  nunca como fuente paralela de estado;
- definir presets seguros para el esfuerzo del orquestador usando solo la
  frontera existente de modelo/thinking por agente. Un preset cambia el modelo
  o thinking previsto, no reduce silenciosamente la prosa fija del
  orquestador ni altera un blocker, check, scope o resultado determinista;
- añadir selector de cambio activo con fixtures de cero, uno y varios cambios;
  ante ambigüedad se pide selección explícita y nunca se elige un TODO
  arbitrario;
- garantizar una sola pregunta TDD por cambio, respetando la postura persistida
  por preflight en reanudaciones y fases;
- extender los renderers humanos de preflight, `ask_user_question`, selector,
  singular/plural y bloqueos, sin depender todavía del packet.

**Aceptación de 3A.** La selección explícita sobrevive a una reanudación, Team no
aparece como modo visible, Linear no es requisito, los presets no cambian gates
y cada cambio produce como máximo una pregunta TDD. Los fixtures de renderer
cubren estado vacío, selección ambigua, `1 bloqueo` y error.

Se conserva como **decisión para evaluación**, no como aprobación de
implementación, la propuesta de una sola comprobación opcional o auto-skippeable
de enfoque inmediatamente después de design y antes de tasks. La evaluación
debe medir si evita trabajo mal orientado sin añadir otra ceremonia obligatoria;
no se puede convertir en gate por esta frase del roadmap.

#### 3B. Overlays dependientes del Apply Packet

Después de que 2A cierre el schema, los overlays pueden mostrar el outcome del
bloque, la tarea completada, las fases restantes, las invariantes y las stop
rules del packet. Los títulos de tareas describen outcomes de usuario; RED,
GREEN, TRIANGULATE y REFACTOR permanecen como evidencia y estado bajo la tarea.

**Aceptación de 3B.** Fixtures demuestran que el overlay coincide con el estado
calculado por router y packet, no inventa una decisión pendiente y muestra con
claridad por qué se detiene. El overlay no es una segunda fuente de verdad ni
permite escribir fuera del alcance.

**No objetivos de 3.** No mantener Team por compatibilidad como modo visible,
no obligar a Linear, no crear otra configuración de modelo, no añadir puertas
humanas entre cada fase y no resolver la ambigüedad escogiendo por el usuario.

### 4. Actividad de runtime y continuidad visible

**Propósito.** Hacer útil la actividad durante una sesión y corregir la
experiencia de reanudación sin atribuir prematuramente un defecto a Ein o a Pi.

#### 4A. Investigación inmediata del freeze

Empieza en paralelo con 1A, 2A y 3A. Hay que reproducir el freeze de
live-refresh de TODO/subagente en una sesión reanudada y clasificar ownership
como Ein, integración o upstream de Pi antes de parchear. El resultado puede
ser `unknown` mientras falte una reproducción; en ese caso se registra qué
lado puede corregirlo. Esta investigación no depende de milestone 3.

#### 4B. UX integrada y continuidad

Solo el arreglo de UX que integre la investigación con selector, overlays o
renderers depende de 3A/3B. Incluye corrección de la presentación que sea
propiedad de Ein, manteniendo el estado persistido y sin falsear freshness, y
reanudar continuidad Pi↔Claude sin una segunda implementación de
Cleaner/Architect ni una nueva fuente de estado.

El progreso de subagentes tiene un contrato mínimo medible:

- estados observables: `queued`, `running`, `blocked`, `complete`;
- eventos ordenados por secuencia monotónica, con cambio de estado, tarea o
  subagente, momento y resumen accionable de qué/por qué/siguiente paso;
- después de resume, el overlay marca el dato anterior como stale hasta recibir
  un evento posterior al resume y muestra su freshness; no puede presentar un
  estado antiguo como current;
- `complete` y `blocked` son estados terminales del run; un nuevo trabajo abre
  otra secuencia y no reescribe la anterior;
- no se muestran logs crudos, transcripts ni razonamiento privado.

**Aceptación de 4A/4B.** Un caso reproducible identifica la frontera de
ownership. Fixtures de cada estado y transición comprueban orden, freshness
posterior a resume, terminalidad y renderizado sin datos privados. Si el
freeze es de Ein, una prueba evita su regresión; si es upstream, queda un
informe verificable y no una afirmación de arreglo.

**No objetivos de 4.** No parchear Pi por conjetura, no rediseñar el runtime
entero, no mostrar conversaciones privadas y no reactivar la paridad automática
de Claude.

### 5. Installer y launcher como superficie de producto, sin perder CI

**Propósito.** Pasar de una acumulación de output de comandos a un frame
estable, legible y app-like, unificando la gramática visual sin confundir la
autoridad remota con el ciclo de vida local.

**Ciclo de vida local.** El installer es dueño de install, update, repair,
restore, uninstall, inventario autoritativo, planner común, dry-run exacto,
staging, checksum/estructura, reemplazo atómico, read-back, journal, backups,
doctor y rollback local. Todas las operaciones pasan por esa frontera. Un fallo
local restaura el árbol local afectado; no modifica el canal remoto.

**Entrada pública única.** La arquitectura de UX conserva una única entrada
pública `ein`. El lifecycle passthrough (`install`, `update`, `repair`,
`restore`, `doctor`, `uninstall`) delega al installer sin duplicar su autoridad.
Se retira el segundo menú de installer; la elección no puede aparecer dos veces.
Antes de cambiar binarios, aliases o comandos se toma y documenta una decisión
explícita de shims y naming, incluidos los caminos de compatibilidad que se
conservan o retiran. No se deja que los nombres emerjan accidentalmente de dos
entradas.

**TTY y no-TTY.** TTY, no-TTY y CI tienen la misma semántica, estados, códigos
de salida y evidencia de lifecycle; la presentación puede adaptar el formato,
pero no ocultar comandos, fallos, checksums, firmas, read-back o rollback.

**Invariantes visuales objetivos.** La aceptación usa snapshots reproducibles en
anchos de terminal fijados (incluidos 80 y 120 columnas), una matriz de estados
completos/incompletos y errores de adquisición, checksum, read-back y rollback.
Cada error tiene estado observable, acción y código de salida, y los writes de
configuración y los artefactos se leen de vuelta antes de presentarse como
correctos. La geometría del logo no se decide aquí: queda como decisión
posterior explícita de 6.

**Dependencias.** El ciclo de vida local consume el contrato mínimo de 1A; la
publicación remota sigue siendo CI/1B. Selector, renderers y overlays de 3
pueden alimentar la gramática común, pero el installer no se convierte en dueño
del router ni el launcher en dueño del installer.

**Aceptación de 5.** Escenarios TTY, no-TTY y CI demuestran el mismo resultado de
lifecycle; snapshots en los anchos fijados, errores observables y read-back
confirman las invariantes. Fault injection conserva el runtime no afectado en
un uninstall selectivo y restaura el árbol local solo dentro de la frontera
correspondiente. La segunda entrada/menu ya no ofrece una ruta alternativa.

**No objetivos de 5.** No hacer una reescritura en Go, no migrar a OpenTUI, no
retirar el renderer legado soportado, no crear otra transacción con CI y no
sacrificar la salida de CI por una experiencia TTY.

### 6. Logo, al final

**Propósito.** Refinar la marca solo cuando los contratos, la experiencia y la
gramática estén estables.

**Entregables.** Revisar la geometría del logo, en particular quitar o
replantear la antena si la evidencia visual lo justifica, y actualizar las
copias de marca sin romper los bootstrap copies ni la coherencia de terminal.
La decisión de geometría y su sustitución permanecen explícitamente abiertas;
no se infieren de la aceptación de installer.

**Dependencias y aceptación.** Requiere la gramática visual de 5 y una decisión
explícita sobre la forma. La comparación visual en las superficies instaladas,
la sincronización de copias y un bootstrap limpio no deben depender de una copia
antigua ni perder legibilidad.

**No objetivos de 6.** No hacer ahora un rebranding completo, no cambiar
contratos de instalación y no tocar el bootstrap sin una prueba de
compatibilidad.

### 7. El estilo de código, entregado y comprobado

**Propósito.** Las skills `comment-style` y `logging-style` definen la voz del
código de Samu con mucho detalle —tags, vocabulario acotado, bloques visuales,
formato de log grepeable— y no se aplican. Ni en el código de Ein ni en el que
Ein escribe para otros proyectos. Es el mismo patrón del bloque A una vez más:
el contrato existe, correcto y escrito, y la superficie que debía entregarlo no
lo hace.

**Diagnóstico, en tres capas.** Medido sobre el árbol, no supuesto:

1. **La entrega es una promesa, no un contenido.** `codeConventionSkillBlock`
   (`ein-pi/agent/extensions/ein-skill-registry.ts:376`) construye un bloque que
   dice «lee y sigue estas skills» seguido de **tres rutas**. El cableado es
   correcto —llega al padre y a `sdd-apply`
   (`ein-ai.ts:850,872`)— pero lo que llega es un puntero. `comment-style` tiene
   258 líneas: abrirla cuesta contexto, y un ejecutor con presupuesto ajustado
   escribe el código sin haberla leído. Nada distingue «no la leyó» de «la leyó
   y la ignoró».
2. **En Claude ni siquiera es un bloque: es una frase.** `cc-ein/CLAUDE.md:17`
   pide «load `comment-style` and enforce it», una línea entre diez mil bytes de
   política. No hay entrega del contenido ni mecanismo que la respalde.
3. **Nada comprueba el resultado.** Cero gates. Las dos únicas menciones en
   `tests/` son a la palabra dentro de una directiva y de un fixture de texto;
   ninguna mira un comentario real. El rigor que el motor tiene a 1,1:1 no llegó
   al estilo, igual que no había llegado a la interfaz.

**7A. Entregar el contenido, no la ruta.** Un extracto normativo compilado
determinísticamente desde cada skill —las reglas operativas y el vocabulario,
no las 258 líneas— inyectado a quien escribe código. Compilado, no copiado: dos
fuentes divergen, y la skill sigue siendo la canónica. El coste en bytes se mide
contra el baseline del prompt antes de adoptarlo.

**7B. Paridad de entrega en Claude.** El mismo extracto llega a los agentes de
`cc-ein`, por el mismo compilador. Claude es relevo, no un segundo estándar: hoy
recibe una frase donde Pi recibe un bloque.

**7C. El gate que lo hace medible.** Un linter determinista sobre las líneas
tocadas, no sobre el repositorio entero. Solo lo mecánicamente comprobable, que
es más de lo que parece:

- `logging-style` es casi enteramente verificable: el formato
  `[TAG] SEP ACTION :: key: value`, tag de hasta 6 caracteres en mayúsculas,
  acción de hasta 12, separadores del catálogo, cero emojis, cero frases.
- De `comment-style` se comprueban los emojis, los comentarios decorativos, los
  tags fuera del catálogo, el formato de los bloques de cabecera y el patrón
  `MAYÚSCULA ->` de los inline de causa/efecto.
- Lo que **no** se comprueba con una máquina se declara: si un comentario
  explica de verdad el porqué es juicio, y un linter que lo finja sería otra
  pantalla que afirma lo que no ha calculado.

**Alcance permanente.** El estilo se aplica a **bloques tocados**. No se
autoriza una pasada global sobre el repositorio: sería el arnés reescribiendo
sus propios artefactos por estética, que es la señal 2 del manifiesto.

**Dependencia con 2.** El Apply Packet ya declara invariantes por tarea. El
estilo es una invariante, no una recomendación: cuando 7A exista, el packet la
lleva y el ejecutor local la recibe con el resto del contrato en vez de tener
que ir a buscarla.

**Aceptación de 7.** El extracto se compila desde la skill y un test lo prueba
divergente-cero. Los dos runtimes reciben el mismo bloque. El linter falla sobre
un fixture con emoji, log fuera de formato y comentario decorativo, y pasa sobre
el estilo correcto. Y la evidencia que de verdad cuenta: un cambio real, escrito
después de 7A, cuyos comentarios y logs pasan el gate sin edición posterior.

**No objetivos de 7.** No reescribir comentarios existentes en masa, no aplicar
el estilo estético de Samu a proyectos cliente sin su perfil (eso es la tanda 4
de la valoración), no juzgar con un modelo lo que no puede comprobar una
máquina, y no convertir el gate en una puerta que bloquee el apply antes de
tener medido su ruido.

## Medición común

La medición sirve para decidir promoción, bloqueo o aplazamiento; no para crear
otra cola de trabajo.

| Señal | Medición | Uso de la evidencia |
|---|---|---|
| Integridad de publicación remota | Concordancia de versión, tag, changelog, checksums, firmas y read-back | Cero discrepancias antes de promoción |
| Edad/uso de alpha | Edad de cada prerelease y uso por Ein frente a proyectos cliente | Expirar o promover alpha; cliente permanece en stable |
| Separación de rollback | Identificador de artefacto, canal remoto y árbol local afectado | Ningún rollback cruza la frontera equivocada |
| Éxito de tarea de apply | Tareas del corpus que alcanzan el outcome y pasan su check enfocado | Criterio principal del modelo local |
| Preguntas/desviaciones de apply | Preguntas al supervisor, decisiones no planificadas y archivos fuera de slice | Detectar plan insuficiente y bloquear promoción |
| Contexto pico | Máximo contexto observado dentro de apply y verify | Compararlo con el presupuesto del ejecutor local |
| Promoción de modelo local | Resultado de cada candidato contra corpus, baseline y thresholds congelados | Solo promover después de la comparación completa |
| Coste fijo del orquestador | Bytes de prosa fija cargados por turno frente a baseline 42.693 | Activar thinning si crece; buscar reducción medida sin mover reglas |
| Carril verdaderamente ligero | Al menos 10 cambios de una línea, outcome, checks, scope escapes y tiempo de ceremonia | No implementar apply→verify sin OpenSpec si no pasa el gate |
| Preguntas TDD duplicadas | Número de prompts TDD por cambio y por reanudación | Esperado: una decisión por cambio, no una por sesión |
| Progreso de subagentes | Estados, secuencias, freshness posterior a resume y terminalidad | Cero estados antiguos como current; cero logs privados |
| Incidentes de live-refresh | Freeze reproducido en sesiones reanudadas, con ownership clasificado | Separar regresión de Ein, integración y upstream |
| Ambigüedad de cambio activo | Sesiones con varios cambios sin selección explícita o con TODO arbitrario | Esperado: cero elección implícita |
| Invariantes de installer UX | Snapshots a 80/120 columnas, matriz de errores, códigos y read-back | TTY/no-TTY equivalentes y sin segunda entrada |
| Estilo aplicado sin recordatorio | Cambios cuyos comentarios y logs pasan el gate sin edición posterior, por runtime | Adoptar 7A solo si el extracto reduce las correcciones; medir el coste en bytes contra el baseline |

## Baseline medido: prompt y carril ligero

El programa anterior de presupuesto de prompt se conserva como baseline ya
completado: el orquestador pasó aproximadamente de 45.321 a 42.693 bytes, se
fijó un ceiling, se intentó y corrigió el paquete por fase, se deduplicó el
schema de envelopes, se completaron diagnósticos accionables y se construyó el
carril `micro`. La reescritura completa de la escalera de routing quedó
archivada por coste y riesgo. Esa historia no se borra ni se convierte en una
nueva prioridad.

La pregunta de **prompt thinning** se reabre como trabajo medido, no como una
promesa de poda. El trigger es cualquier crecimiento de la prosa fija del
orquestador por encima del baseline congelado de 42.693 bytes (o una nueva
ceremonia que añada coste fijo). El primer target es un experimento acotado que
reduzca al menos un 5% de esa prosa fija sin trasladarla a los prompts de los
agentes, romper reglas load-bearing ni aumentar preguntas o desviaciones; si la
medición demuestra un suelo, se registra el suelo y se detiene. El coste fijo
cargado en cada turno es distinto de los presets de esfuerzo: estos eligen
modelo/thinking por agente y no son una forma encubierta de reducir prosa.

El `micro` existente sigue siendo `scope → design → apply → verify → close` y
mantiene `verify` y `close` como gates. No se afirma que resuelva cambios de una
línea. La propuesta de un carril verdaderamente no ceremonial
`apply → verify`, sin crear OpenSpec, queda **aceptada para evaluación**, no
aprobada para implementación automática. Su gate exige al menos 10 cambios
reales de una línea: outcome correcto, checks enfocados y verify completos,
cero escapes de scope, cero pérdida de evidencia/rollback y una reducción de
ceremonia medida frente a `micro`. Un fallo bloquea la adopción; ningún router
elige este carril por heurística mientras la evaluación no termine.

## Decisiones de producto

| Propuesta | Decisión | Condición o alcance |
|---|---|---|
| Prompt thinning | Aceptada para evaluación | Baseline ya completado; se reabre solo con el trigger y target de coste fijo |
| Carril verdaderamente ligero | Aceptada para evaluación | Evaluar `apply → verify` sin OpenSpec con el gate de 10 cambios; no está aprobado |
| Gate posterior a design | Aceptada para evaluación | Una sola approach-check opcional/auto-skippeable antes de tasks; no es implementación aprobada |
| Entrada pública única `ein` | Aceptada para ejecución | Lifecycle passthrough, naming y shims explícitos, una sola superficie pública |
| Retirada del segundo menú de installer | Aceptada para ejecución | No duplicar selección ni autoridad; TTY y no-TTY conservan semántica |
| Orphan modules, archivo OpenSpec y hygiene de downloaded skills | Aplazada con trigger medible | Inventario acotado cuando aparezca un huérfano o una nueva superficie; no abre una prioridad paralela |
| Separación de project profile y style | Aplazada con trigger medible | Solo si adopción externa o una fricción demostrada exige separar disciplina y estética |
| Expiración/promoción de alpha | Aceptada para ejecución | Edad/uso, prerelease eligibility y gates de 1B; nunca promoción por intuición |

La tabla conserva decisiones, no las convierte en trabajo simultáneo. Una
propuesta marcada para evaluación requiere evidencia antes de cambiar el
contrato. Lo ya completado sigue en la historia aceptada y no se reaudita por
aparecer aquí.

## Trabajo válido aplazado o detenido

Estos temas no se borran; quedan fuera del programa ejecutable para que no
compitan con él:

- **Claude Cleaner/Architect parity:** aplazado hasta que el workflow probado
  en Pi tenga evidencia de uso real. Cuando vuelva, será explícito, disabled by
  default para participación automática y compartirá el cerebro de Pi.
- **Pi task panel:** aplazado a una evaluación de dependencia. Si se adopta,
  será una proyección de `tasks.md` y del router, nunca un store escribible.
- **Perfil de proyecto y separación de estilo:** aplazados con el trigger de la
  tabla. La disciplina de ingeniería puede propagarse; la estética de Ein no se
  impone a proyectos externos.
- **Design system:** aplazado hasta contar con dos o tres webs reales y
  patrones repetidos; es otro producto, no una feature del arnés.
- **Go installer-only spike:** solo elegible si el asset descargable, latencia,
  Windows o defectos repetidos aportan evidencia suficiente. No se autoriza una
  reescritura por preferencia.
- **OpenTUI:** detenido por sus gates de arranque y distribución. No hay nueva
  dependencia ni migración autorizada.
- **OpenCode, tercer runtime y provider registry:** explícitamente fuera del
  roadmap actual. Una abstracción futura exige duplicación concreta y probada.
- **Reescritura de la escalera de routing:** archivada; solo vuelve si una
  medición nueva supera el trigger del programa de prompt y justifica su coste.
- **Smoke semántico con credenciales y decisiones sobre hardware local:**
  opcionales o posteriores a los evals; no se presentan como evidencia de
  aceptación ni se compran modelos o GPU a ciegas.

## Decisiones abiertas que conservan su dueño

- La política de ubicación, retención, frescura y versionado de progress
  records se resuelve donde el estado de ciclo de vida demuestre que hace falta.
- El adapter seguro de CodeGraph, el conjunto mínimo de facts y las etiquetas de
  confianza quedan con la futura parity de Architect, no con el Apply Packet.
- Las sugerencias de property tests siguen siendo específicas de cada ecosistema
  y no se convierten en una plataforma general.
- La tecnología de firma y la rotación de trust roots se deciden dentro de 1B
  con evidencia de CI, no por una suposición de este documento.
- La geometría final del logo y la política exacta de compatibilidad de shims y
  nombres conservan una decisión explícita antes de ejecutar sus cambios.

## Límites permanentes

- Pi primero; Claude como relevo; runtimes vanilla aislados.
- Un único Cleaner y un único Architect compartidos; ningún motor duplicado por
  runtime.
- Estado, routing, alcance, freshness y seguridad deterministas cuando puedan
  serlo; fail-closed ante incertidumbre.
- Architect de solo lectura hasta una decisión posterior con evidencia.
- No CLI pública independiente para Cleaner o Architect, no API JSON pública, no
  plataforma genérica de capacidades y no mutación autónoma entre proyectos.
- Cada unidad conserva un outcome observable, archivos permitidos, verificación
  enfocada, evidencia de fallo y frontera de rollback.
- Publicación remota y ciclo de vida local comparten identidad trazable, nunca
  una transacción ni una promesa de rollback.

Este archivo sigue siendo la única hoja de ruta canónica. La historia aceptada,
los aplazamientos y las decisiones se mantienen aquí para que una sesión futura
no confunda trabajo terminado, trabajo detenido y trabajo que realmente tiene
prioridad.
