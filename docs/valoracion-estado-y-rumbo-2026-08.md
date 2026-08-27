# Valoración de Ein — estado, valor y rumbo (agosto 2026)

> Intención corta: mirar Ein entero, con números, y dejar sobre la mesa qué
> funciona, qué sobra, qué te diferencia y qué contrato fijo hace falta para que
> el proyecto deje de moverse debajo de tus pies mientras lo usas.

**Fecha de medición:** 2026-08-20, sobre `main` en `f5970ad`. Revisado el
2026-08-21 tras verificar en código la inyección del prompt (`// 009`), añadir la
discusión de granularidad y puertas (`// 010`) y cerrar la recomendación sobre la
superficie `ein` / installer / launchers (`// 011`).
**Autoridad:** por debajo de `MANIFIESTO.md`. Este documento no fija rumbo por sí
mismo: propone. Lo que se acepte se sube al manifiesto o al roadmap; lo que no,
se retira.

**Relación con otros documentos:** `docs/roadmap-features-ein.md` ordena el
trabajo ya decidido. `docs/plan-hallazgos-dogfooding-2026-08.md` tiene trece
fricciones con su plan. `docs/fricciones-dogfooding.md` es material en crudo para
el artículo. Este documento es el nivel de arriba: la decisión de producto que
esos tres dan por supuesta.

---

## // 000. VEREDICTO EN UNA PÁGINA

Ein está **técnicamente sano y estratégicamente sin cerrar**.

La salud es medible y es buena: 2319 tests en 173 ficheros, 0 fallos, 67
segundos; los dos typechecks en verde; 745 commits y 102 releases en 73 días;
un manifiesto que de verdad gobierna y que ya ha detectado sus propias
desviaciones antes que tú. Eso no es un proyecto de fin de semana: es
infraestructura.

Lo que no está cerrado es más incómodo, y son tres cosas distintas que se
confunden fácil:

1. **No hay contrato de estabilidad.** No existe carril estable ni carril alpha.
   `isEligibleRelease` (`installer/src/core/release-resolver.ts:39`) rechaza
   toda prerelease, así que *todo lo que publicas es producción*. Con 102 tags
   en 73 días, tu herramienta de trabajo cambia debajo de ti una vez cada 17
   horas. No es un problema de calidad: es que no tienes dónde poner lo que aún
   no sabes si funciona.

2. **La proposición de valor está escrita pero no está elegida.** El manifiesto
   dice qué es Ein. El roadmap dice qué se construye. El PDF dice otra cosa
   distinta (motor local + fábrica de webs). Las tres son coherentes por
   separado; juntas describen tres productos. Falta la frase que elige.

3. **El estilo está acoplado a la herramienta.** `ein-pi/core/docs/STYLE.md`
   mezcla en un solo documento la identidad de Ein (paleta, `// NNN`, gramática
   de terminal) con reglas que Ein impone a *cualquier proyecto que toca*
   (placas de cabecera en `.ts`, `[[TAG]]` en PRs, estilo de comentarios). Es
   exactamente lo que anotaste: tu estilo se está filtrando al trabajo del
   cliente.

Ninguna de las tres se arregla programando más. Las tres son decisiones.

---

## // 001. QUÉ ES EIN HOY, MEDIDO

Antes de opinar, el inventario. Los números son de hoy, no de memoria.

| Pieza | Tamaño | Qué es |
|---|---|---|
| `ein-pi/agent/` | 120 ficheros TS, **31.777 líneas** | El motor real: 97 módulos en `lib/`, 12 extensiones, 10 superficies |
| `tests/` | 172 ficheros, **35.524 líneas** | Ratio test:código ≈ **0,9:1** sobre motor + installer |
| `installer/` | 57 ficheros TS, **8.314 líneas** | CLI, TUI, deploy, backups, releases |
| `ein-pi/core/skills/downloaded/` | 767 ficheros, **89.548 líneas** | Documentación de terceros vendorizada (33 librerías) |
| `ein-pi/core/skills/local/` | 27 ficheros, **3.457 líneas** | Tus skills de estilo y workflow |
| `openspec/changes/archive/` | 463 ficheros, **51.218 líneas** | 51 cambios SDD cerrados |
| `docs-site/` | 22 páginas | Documentación pública (Astro + Starlight) |
| `ein-cc/` | 10 ficheros, **1.986 líneas** | Adaptador Claude |
| `ein-pi/` | 2 ficheros, **84 líneas** | Adaptador Pi (launcher) |

Tres lecturas que el inventario deja claras y que conviene tener presentes todo
el rato:

**El motor es pequeño.** 32k líneas de TypeScript. Lo que parece un proyecto de
127k líneas es en realidad un motor de 32k con 90k líneas de documentación
ajena pegada al lado. Eso es una buena noticia: el activo es abarcable, se puede
sostener una persona sola y se puede reescribir por partes.

**El archivo pesa más que el motor.** 51k líneas de artefactos SDD cerrados,
más 125 KB de CHANGELOG con 91 entradas. Es el registro de tu propio proceso, y
es legítimo — pero es también el 40% del repo, y es lo primero que va a
desconcertar a cualquiera que llegue de fuera.

**Los adaptadores están desequilibrados 16 a 1.** `ein-cc/` tiene 1.986 líneas;
`ein-pi/` tiene 84. Eso no es porque Claude haga más: es porque Pi consume el
motor directamente y Claude tiene que reimplementar una superficie propia
(`sync.ts` solo son 33 KB). Esa asimetría es la que hace cara la paridad, y es
un dato para la decisión de `// 006`.

---

## // 002. LO QUE FUNCIONA PERFECTO — NO TOCAR

Esto es lo que hay que proteger de cualquier replanteamiento. Si un rediseño
pone en riesgo algo de esta lista, el rediseño está mal.

### El estado en disco, no en la conversación

Es la decisión estructural más acertada del proyecto y la que más se nota
usándolo. `openspec/changes/<cambio>/` con un artefacto por fase, más el router
determinista que calcula la fase siguiente en vez de recordarla, resuelve un
problema real: **reabrir una sesión cuesta cero**. `ein_sdd_status` y ya.

Comparado con el resto del mercado, esto es lo que casi nadie hace. Claude Code,
Cursor, Aider: el estado del trabajo vive en la conversación, y al cerrarla se
va. Ein lo escribe.

### El determinismo con procedencia y fail-closed

`// 002` del manifiesto no es un eslogan: está implementado. Los contratos
llevan `provenance` y `freshness`; un probe que falla se representa como
`unavailable`, nunca como `current`. Los 97 módulos de `lib/` son funciones puras
que reciben la evidencia como parámetro. La E/S se queda en el borde.

Esto es lo que hace que el mismo cálculo dé el mismo resultado en Pi, en Claude y
dentro de un año. Es el cimiento del horizonte de IA local del PDF: un modelo
local solo puede ejecutar fases mecánicas si esas fases son verificables por
herramienta. Ya lo son.

### La disciplina de test

0,9 líneas de test por línea de código (35.524 frente a 40.091), 2319 tests en 67 segundos, cero fallos.
Y no son tests de fachada: `tests/terminal-brand.test.ts` obliga a que las cinco
copias duplicadas de la paleta coincidan con `brand.json`, lo que convierte una
duplicación deliberada en algo mecánicamente seguro de cambiar.

Ese patrón — duplicar a propósito y atar las copias con un test — es de las cosas
mejor resueltas del repo.

### El manifiesto como autoridad real

Documentos así suelen ser decoración. Este no: `docs/plan-hallazgos-dogfooding-2026-08.md`
cita artículos concretos (`// 006`, señal 5, señal 9) para *rechazar* decisiones
propias, incluyendo una corrección explícita fechada al día siguiente
("Corrección del 2026-08-19… queda anulado"). El sistema de gobierno funciona.

### El aislamiento

`pi` y `claude` vanilla intactos, hogares propios (`~/.pi-ein`, `~/.claude-ein`),
superficies explícitas. Es la razón por la que puedes experimentar sin miedo, y
es también el cimiento sobre el que se apoya el carril alpha de `// 007`.

### La honestidad del sistema consigo mismo

`docs/fricciones-dogfooding.md` documenta seis fricciones del propio harness con
evidencia, incluyendo una nota de honestidad admitiendo que una conclusión es
inferencia y no lectura del código. Un proyecto que registra así sus propios
fallos es un proyecto que puede corregirse. Esto es un activo, no un pasivo.

---

## // 003. LO QUE FUNCIONA PERO CUESTA MÁS DE LO QUE RINDE

Aquí no hay nada roto. Hay cosas que están bien construidas y cuya factura no
está justificada.

### El prompt del orquestador

`ein-pi/agent/assets/orchestrator.md` mide **42.926 caracteres / 6.512 palabras**
≈ 11.000 tokens. Se inyecta en cada sesión, del primer turno al último.

El manifiesto tiene un artículo entero dedicado a esto (`// 004`, "Presupuesto de
prompt: la mayor factura fija del sistema. Crece solo si algo sale a cambio") y
una señal de deriva explícita (señal 3). El documento actual es la prueba de que
esa regla ha perdido varias veces.

Y se nota qué lo hizo crecer: son cicatrices. "Measured over 230 runs", "one
strict-TDD group took 135 turns / 1.5M tokens", "a trivial commit once measured
382k this way". Cada párrafo es un incidente real convertido en prosa. Cada uno
está justificado por separado. Juntos son 11k tokens de peaje permanente.

La pregunta del manifiesto — *"¿esto puede ser código?"* — no se ha hecho sobre
la mayoría. Tres ejemplos concretos donde la respuesta es sí:

- **El *hard stop* de presupuesto de subagente agotado** (3 párrafos): es una
  condición detectable. Un hook que corta al detectar la pared de cuota hace
  cumplir la regla; el párrafo solo la sugiere.
- **La disciplina de lectura del padre** ("dos routing reads como máximo, dos
  spot-checks"): son cuentas. Un contador que avisa al tercero es una garantía;
  un párrafo pidiendo autocontrol al modelo es una esperanza.
- **`context: "fork"` vs `"fresh"`**: la tabla ya existe por agente. La elección
  puede ser un default del runtime, no una decisión que el modelo toma cada vez
  leyendo un párrafo.

**Diagnóstico:** el prompt está haciendo el trabajo que debería hacer el runtime.
Un objetivo de 4.000 palabras es agresivo pero alcanzable si cada retirada se
compensa con un mecanismo, no con confianza.

### La ceremonia SDD sobre cambios pequeños

Siete fases, un artefacto por fase, un gatekeeper y un router. Para un cambio
grande y ambiguo es exactamente lo que quieres. Para el 80% de lo que haces en
un día no lo es, y el propio sistema lo ha medido: *"28% de todo el tiempo de
apply/tasks/verify se fue en el harness reescribiendo sus propios documentos"*,
y *"un `sdd-apply` de 7 turnos para borrar una línea en blanco"*.

El carril `micro` existe (salta `map` y `tasks`) y el orchestrator dice
explícitamente "Simple code change = one `sdd-apply`. Not a chain." Pero la
gravedad del sistema empuja hacia la cadena completa: es el camino documentado,
el que tiene tooling y el que el router conoce.

**Diagnóstico:** falta un carril de verdad ligero — que no sea "la cadena con
dos fases menos" sino otra cosa: apply + verify, sin `openspec/changes/`, sin
artefactos, sin gatekeeper. Y que sea el **default**, con la cadena como
escalada explícita.

La granularidad de las fases y las puertas humanas del flujo se tratan aparte,
en `// 010`.

### La paridad con Claude

El manifiesto es claro: Claude es el relevo, no un segundo producto, y la
continuidad tiene que ser bidireccional. Está construido y tiene tests.

Pero la factura real es la asimetría del `// 001`: 1.986 líneas de adaptador
frente a 84, y `sync.ts` de 33 KB reimplementando superficie. Y el hallazgo A4
del plan de dogfooding demuestra que la asimetría ya produjo una mentira:
`ein-cc/CLAUDE.md:55` remite cinco veces a `orchestrator.md`, un fichero que
`sync.ts` nunca despliega y que en `~/.claude-ein/` no existe. Señal 5 del
manifiesto, disparada.

**Diagnóstico:** la razón de existir de Claude (continuar cuando Pi se agota) es
buena y no está en discusión. Lo que está en discusión es cuánta superficie
merece. Ver `// 006`.

### El archivo de OpenSpec dentro del repo vivo

51.218 líneas de artefactos de 51 cambios cerrados, versionadas junto al código.
Sirven — el propio plan de hallazgos las cita como frontera dura que no se
reescribe, y tiene razón. Pero también son el 40% del repo, distorsionan
cualquier búsqueda (`grep` de `ein-cc` da 680 resultados, "la mayoría en
`archive/`") y multiplican el ruido de cada herramienta que recorre el árbol.

**Diagnóstico:** no borrar. Mover a una rama huérfana de archivo o a un
directorio excluido de índices y búsquedas. El archivo debe ser consultable, no
transitable.

---

## // 004. LO QUE ESTÁ ROTO O ES MENTIRA

Esto ya lo tienes localizado en `docs/plan-hallazgos-dogfooding-2026-08.md` con
línea exacta, así que no lo repito. Lo que añado es la **lectura de producto**,
que es distinta de la lista de arreglos.

Los cinco hallazgos del bloque A no son cinco bugs sueltos: son **el mismo bug
cinco veces**. En los cinco casos hay código correcto detrás de una superficie
que dice algo falso.

- El tema de marca se despliega bien y nunca se selecciona (A3).
- El índice de Pagefind se construye bien y nadie lo remonta al navegar (A5).
- El instalador escribe el launcher correcto y te manda al comando equivocado
  tres líneas después (A2).
- El contrato de voz existe y Claude nunca lo ve (A4).
- El overlay tiene el dato del raíl de fases calculado y pinta "12/12 hecho"
  cuando quedan dos fases (B2).

**La causa común es que la capa de presentación no tiene tests de verdad.** El
motor los tiene a razón de 1,1:1. La superficie, no: los tests que existen fijan
el aspecto (`sdd-overlay.test.ts`, `terminal-chrome.test.ts`) pero ninguno
comprueba que lo pintado *corresponda con el estado real del sistema*.

Esa es la conclusión que va más allá de la lista de arreglos: **el mismo rigor
que aplicaste al motor no llegó a la interfaz**, y por eso la interfaz es donde
está toda la deuda. El manifiesto `// 006` pide honestidad en pantalla y la
señal 9 la vigila, pero no hay un mecanismo que la haga cumplir — es prosa donde
podía ser código. Un contrato de "lo que la pantalla afirma tiene que venir de
un cálculo, no de una constante" es implementable y ahora mismo no existe.

Y un hallazgo propio que no está en tu lista: **cuatro módulos de `lib/` no
tienen ningún consumidor en producción**, solo tests.

| Módulo | Líneas | Situación |
|---|---|---|
| `startup-provenance-classifier.ts` | 360 | Construido para una investigación cerrada; nunca se cableó |
| `docs-site-drift-detector.ts` | 273 | Solo se invoca a mano desde `troubleshooting.md` |
| `subagent-envelope-contract.ts` | 218 | Guardarraíl solo-test, por diseño |
| `ein-tv-preview.ts` | — | Script de preview, invocable a mano |

Unas 1.000 líneas mantenidas, con sus tests, sin un consumidor que las use.
`subagent-envelope-contract` está bien así (es un guard deliberado). Los otros
tres son candidatos a retirada — y son el ejemplo pequeño de una tentación
grande: `// 004` del manifiesto pide que **todo guardarraíl nazca con su
condición de retirada**, y estos nacieron sin ella.

---

## // 005. QUÉ TE DIFERENCIA DE VERDAD

Es la pregunta que anotaste y la que más cuesta contestar sin engañarse. Voy por
descarte, que es como se contesta bien.

### Lo que NO te diferencia

**El flujo spec-driven.** OpenSpec existe, spec-kit de GitHub existe, Kiro de AWS
existe. "Convertir una petición ambigua en fases con artefactos" es en 2026 una
categoría, no una idea.

**Los subagentes acotados.** Claude Code los tiene nativos. Pi los tiene. Todos
los harness serios los tienen.

**El principio económico.** "Modelo caro decide, modelos baratos ejecutan" está
en el material de marketing de medio sector.

**La calidad de la ejecución.** Es real, pero no es diferenciación: es coste de
entrada. Nadie elige una herramienta porque tenga buenos tests.

### Lo que SÍ te diferencia

Tres cosas, en orden de fuerza.

**1. El estado del trabajo es un artefacto de disco, no una conversación.**

Esta es la fuerte, y es una diferencia de *arquitectura*, no de features. En Ein
puedes cerrar la sesión, cambiar de máquina, cambiar de runtime y de proveedor, y
retomar sin reconstruir nada — porque no hay nada que reconstruir, está escrito.
`ein_sdd_status` y sigues.

Casi todo el resto del mercado va en dirección contraria: contextos más largos,
compactación automática, memoria del asistente. Todo eso son formas de guardar
mejor la conversación. Ein decidió no depender de la conversación.

Y hay una consecuencia que la mayoría no ve: **eso es lo único que hace posible
lo del PDF**. Un modelo local de 27B no puede sostener una sesión larga y
ambigua. Sí puede ejecutar una fase con contrato cerrado y estado en disco. La
continuidad Pi↔Claude que ya construiste es, literalmente, el mismo mecanismo que
haría falta para Pi↔local. No es una feature más: es el puente al horizonte.

**2. El determinismo es una garantía, no una promesa.**

Nadie más trata "el estado de la fase" como un cálculo. En el resto de harness
es el modelo el que dice dónde está y se le cree. Que el enrutado lo decida una
función, que un dato lleve procedencia, que la incertidumbre se represente como
desconocida en vez de como buena — eso es infrecuente y es *verificable*, que es
lo que lo hace defendible.

**3. La opinión.**

Ein no es neutral y no quiere serlo. Enseña en proporción al cambio, habla
español, no pone emojis, tiene una paleta de cuatro colores y una gramática de
terminal propia. En un mercado donde todas las herramientas convergen en la misma
estética de chat gris, tener criterio es diferenciación.

Con un matiz importante que conecta con `// 008`: **la opinión sobre cómo se
presenta Ein es un activo; la opinión sobre cómo se escribe el código del cliente
es un pasivo.**

### La frase que falta

Si hubiera que escribir una sola:

> **Ein es el harness donde el trabajo vive en disco, el enrutado es un cálculo y
> el modelo es reemplazable.**

Lo importante de esa frase es que **no menciona el modelo ni el runtime**. Es la
única formulación que sobrevive a que Pi cambie, a que Claude cambie de precio y
a que el motor pase a ser local. Y es exactamente la tesis del PDF, dicha desde
el software en vez de desde el hardware.

---

## // 006. QUÉ RECORTAR

Ordenado por lo que libera dividido por lo que duele.

### Recorte 1 — El prompt del orquestador, a la mitad

**Libera:** ~5.000 tokens por sesión, cada sesión, para siempre.
**Duele:** poco, si cada retirada se sustituye por un mecanismo. Mucho, si se
hace borrando prosa.

Método, que el manifiesto ya fija (`// 004`, "parte de la prosa es portante" y
"una reubicación se verifica intentándola"): para cada párrafo, tres preguntas.
¿Puede ser código? → hazlo código. ¿Hay un consumidor mecánico que busca esta
frase literal? → no se toca. ¿Ninguna de las dos? → fuera, y se mide si algo se
rompe.

**Riesgo real:** este es el trabajo donde más fácil es engañarse. La estimación
sobre el papel de cuánto se puede mover no cuenta como evidencia — el propio
manifiesto lo dice. Hazlo con el prompt desplegado y una sesión de prueba, no con
un contador de palabras.

### Recorte 2 — Los tres módulos huérfanos

**Libera:** ~900 líneas de producción y sus tests.
**Duele:** nada.

`startup-provenance-classifier` y `docs-site-drift-detector` se retiran o se
cablean. `ein-tv-preview` se va a `spikes/`. Y la regla que evita la
reincidencia: **un módulo de `lib/` sin consumidor en producción no entra**; si
existe para una investigación, vive en `spikes/` y muere con ella.

### Recorte 3 — El archivo de OpenSpec, fuera del árbol vivo

**Libera:** 51k líneas de ruido en cada búsqueda, índice y recorrido.
**Duele:** poco. Se consulta con `git show` o desde una rama.

### Recorte 4 — La superficie de Claude, a lo mínimo que cumple su razón de ser

**Libera:** buena parte de 1.986 líneas y, sobre todo, la obligación permanente
de mantener dos superficies sincronizadas.
**Duele:** hay que decidir, y la decisión es tuya.

La razón de existir de Claude, según el manifiesto, es **continuar trabajo cuando
Pi se agota**. Eso necesita exactamente tres cosas: leer el checkpoint, ejecutar
las fases, escribir el checkpoint. No necesita `/ein:settings`, ni superficies
propias de configuración, ni una segunda voz, ni paridad de skills.

La propuesta concreta: **Claude se reduce a `ein-cc-sdd` + el contrato de voz
compartido + el checkpoint.** Todo lo demás se retira. Eso arregla A4 por
construcción (no puede prometer un fichero que no despliega si no promete nada) y
convierte la paridad de "objetivo permanente" en "superficie cerrada".

**Esta es la decisión de recorte más importante del documento**, porque es la
única que reduce trabajo *futuro* y no solo peso actual.

### Recorte 5 — Los skills descargados, fuera del repo

**Libera:** 767 ficheros y 89.548 líneas, el 70% de lo que parece ser Ein.
**Duele:** hay que resolver la distribución.

33 librerías de documentación de terceros versionadas en tu repo. No es tu
código, no lo mantienes tú, y ya tienes `/ein:skills` para actualizarlo. Debería
descargarse en la instalación o bajo demanda, no vivir en `git`.

Efecto secundario que importa: **hace que Ein *parezca* lo que es**, un motor de
32k líneas, en vez de un monstruo de 127k. Cuando decidas enseñarlo, esto cambia
la primera impresión más que cualquier README.

### Lo que NO recortaría, aunque tenga pinta

- **La cadena SDD completa.** Es la razón de ser del proyecto. Lo que hay que
  cambiar es cuándo se activa (`// 003`), no que exista.
- **El instalador como infraestructura.** 8.3k líneas para bootstrap, backups,
  journal, rollback y doctor parece mucho para un producto de un usuario. Pero es
  justo lo que hace posible el carril alpha de `// 007`: sin backup y rollback
  fiables, no hay experimento seguro. **Lo que sí sobra es que se presente como
  una segunda puerta de producto con su propio menú interactivo**; esa separación
  se trata en `// 011`.
- **El archivo como registro.** Se mueve, no se borra. Es tu evidencia.

---

## // 007. EL CONTRATO FIJO: CARRIL ESTABLE Y CARRIL ALPHA

Tu primera nota, y la más urgente de las tres. Hoy el problema es literal: **no
existe la distinción**. `isEligibleRelease` (`installer/src/core/release-resolver.ts:39`)
descarta draft y prerelease, así que solo hay un canal y todo lo que publicas es
producción. 102 tags en 73 días sobre ese único canal.

### La forma correcta del contrato

No es "una opción para activar el modo alpha". Es **dos definiciones de qué es
Ein**, y la segunda solo puede añadir.

**Carril estable — el contrato que no se rompe.** Un conjunto cerrado y pequeño
de garantías, escritas, con test que las fija:

- El bootstrap limpio con `ein-install` funciona y no pierde datos; una vez Ein
  está instalado, `ein update`, `ein doctor`, `ein restore` y `ein uninstall`
  funcionan como superficie pública y delegan la fontanería al installer
  (`// 011`).
- El ciclo `scope → map → design → tasks → apply → verify → close` produce sus
  artefactos y el router calcula la fase siguiente.
- `ein_sdd_status` y `ein_sdd_check` responden con el contrato publicado.
- El checkpoint de continuidad se escribe y se lee en los dos sentidos.
- La sesión arranca, el banner no miente y el estado desconocido se dibuja
  desconocido.

Eso es el contrato. Cabe en una página y **se testea como contrato**, no como
implementación: un fichero `tests/contrato-estable.test.ts` que falle si
cualquiera de esas garantías deja de cumplirse, independientemente de cómo esté
implementada por dentro.

**Carril alpha — donde vive lo que aún no sabes si funciona.** Con tres reglas
duras:

1. **Solo puede añadir, nunca alterar.** Una feature alpha no cambia el
   comportamiento de una estable. Si necesita hacerlo, no es alpha: es un cambio
   del contrato, y eso pasa por una decisión tuya.
2. **Se anuncia en pantalla.** Si la sesión corre con alpha activo, se ve. El
   manifiesto `// 006` pide honestidad: una sesión que se comporta distinto y no
   lo dice es una pantalla que miente.
3. **Nace con fecha de caducidad.** O se promueve al contrato estable, o se
   retira. Una feature alpha que lleva tres meses en alpha es una feature que no
   convence a nadie, empezando por ti.

### Cómo implementarlo con lo que ya tienes

La buena noticia es que la infraestructura está casi entera. Lo que falta es
poco:

| Pieza | Estado | Qué falta |
|---|---|---|
| Canal de release | `installer/src/core/release-resolver.ts` ya distingue prerelease | Dejar de rechazarla: aceptarla **solo** si el canal es alpha |
| Selección de canal | `installer/src/core/settings.ts` ya gestiona settings | Un campo `channel: "stable" \| "alpha"` |
| Rollback | `backup.ts`, `transaction.ts`, `install-journal.ts` existen y están probados | Nada. Ya funciona |
| Aviso en pantalla | El banner ya pinta estado | Una línea en el chrome inferior |
| Puerta por feature | — | Un `isAlpha(feature)` que las extensiones consulten |

**El coste real está en la tercera fila y ya está pagado.** Backups, journal y
rollback son lo caro de un sistema de canales, y los tienes construidos y
testeados. Lo que queda es fontanería.

### La decisión de producto que hay debajo

Un carril alpha solo sirve si **de verdad usas el estable**. Si acabas corriendo
alpha siempre porque ahí está lo interesante, has renombrado el problema.

La regla que lo evita, y es una regla sobre ti, no sobre el código: **el
proyecto que pagas — trabajo de cliente — corre estable siempre. Ein sobre Ein
corre alpha.** Es la separación natural, encaja con el dogfooding que ya haces, y
te da una señal honesta: si algo lleva un mes en alpha y nunca te has atrevido a
llevarlo al proyecto que pagas, ya sabes lo que vale.

---

## // 008. EL ESTILO: EIN Y LOS PROYECTOS QUE EIN CONSTRUYE

Tu tercera nota. Y es correcta: el acoplamiento existe y es concreto.

`ein-pi/core/docs/STYLE.md` tiene 100 líneas y mezcla dos contratos distintos:

| Sección | Qué es | A quién debe aplicar |
|---|---|---|
| `// 001. PALETA` | Carbon, Concrete, Structure, Yellow | **Solo a Ein** |
| `// 002. GRAMÁTICA DE TERMINAL` | `// NNN`, `▏`, `·`, cero recuadros | **Solo a Ein** |
| `// 003. MARKDOWN PUBLICADO` | `[[TAG]]`, `> Intención corta`, `## // NNN` | Discutible |
| `// 004. CÓDIGO` | Placa de cabecera en cada `.ts`, comentarios | **Al proyecto, y ahí está el problema** |
| `// 005. VOZ` | Enseñar antes que reportar | **Solo a Ein** |

Y no está solo en `STYLE.md`. `ein-pi/core/skills/local/` tiene cinco skills que
son opinión estética tuya aplicada a cualquier repo que toques:
`comment-style` (258 líneas), `logging-style`, `readme-style`, `file-naming`,
`cognitive-doc-design`.

Todo eso se despliega a `~/.pi-ein/agent/` y aplica a **cada proyecto que abres**.
Cuando construyas la landing de una peluquería, Ein va a poner placas de
cabecera de 3 líneas en cada `.ts`, escribir el README en tu voz y nombrar los
ficheros con tus reglas.

### La distinción correcta

Son **tres** contratos, no dos, y separarlos bien importa:

1. **Identidad de Ein** — cómo se presenta la herramienta. Paleta, gramática de
   terminal, `// NNN`, voz. No es negociable y no sale de Ein. Vive donde vive.

2. **Disciplina de ingeniería** — determinismo, fail-closed, tests, tamaño de
   cambio, commits convencionales, sin atribución de IA. **Esto sí debe
   propagarse a todo proyecto**, porque no es estética: es calidad. Un cliente se
   beneficia de que su código tenga tests aunque no sepa qué es un test.

3. **Preferencia estética de código** — placas de cabecera, estilo de
   comentarios, formato de logs, naming, tono del README. **Esto no debería
   propagarse por defecto.** Es tuyo, no es mejor que las convenciones de
   destino, y en un proyecto de cliente que otro tome mañana es un pasivo.

El error actual es que las tres viven mezcladas en el mismo sitio y se despliegan
juntas.

### Y la idea del design system

Tu nota dice "montar algo para el diseño", y el PDF lo desarrolla entero
(sección 07: design system, componentes aprobados, patrones por sector, tokens).
Es la parte comercialmente más interesante de todo el material.

**Pero es un producto distinto de Ein, y confundirlos sería el error más caro que
puedes cometer ahora.**

- Ein es un harness de proceso. Su unidad es el cambio verificado.
- Un design system es una biblioteca de producto. Su unidad es el componente.

Lo que los une es una interfaz estrecha y muy concreta: **un perfil de proyecto**.
Un fichero en el repo destino que declara qué convenciones rigen ahí, y que Ein
lee en vez de imponer las suyas.

```jsonc
// .ein/profile.json  — en el repo del cliente, no en Ein
{
  "conventions": "vue-3-tailwind",   // qué skills de estilo cargar, si alguna
  "design_system": "samuhlo/web-kit@2",
  "language": "en",
  "voice": "neutral"                  // ← NO la voz de Ein
}
```

Con esa pieza, tres cosas se resuelven a la vez:

- **Ein deja de imponer tu estilo** y pasa a aplicar el declarado, con "ninguno"
  como opción legítima y como default para proyectos externos.
- **El design system puede crecer aparte**, con su propio repo, su versión y su
  ciclo — sin arrastrar el peso de Ein ni ser arrastrado por él.
- **La disciplina de ingeniería (grupo 2) sigue aplicando siempre**, porque no
  está en el perfil: es del harness.

Y una advertencia sobre el orden, porque el PDF la invita a saltarse: el design
system es la **fase 6** de su propio plan de implantación, y con razón. Un design
system sin proyectos reales encima es una biblioteca de componentes que nadie ha
usado. Extráelo cuando tengas dos o tres webs hechas y veas qué se repitió de
verdad — el manifiesto ya lo dice para el código (`// 005`: "tres líneas
parecidas son mejores que una abstracción equivocada") y aplica igual aquí.

**Lo que sí puedes hacer ya, y es barato:** el perfil de proyecto. Sin design
system, sin componentes, solo el fichero y que Ein lo respete. Eso desacopla tu
estilo hoy y deja el hueco preparado para cuando el design system exista.

---

## // 009. EL HORIZONTE DEL PDF: QUÉ ENCAJA Y QUÉ NO

El documento propone RX 7900 XTX (24 GB) + Qwen ~27B cuantizado como motor local
para el trabajo de volumen, con la nube reservada para arquitectura y revisión.

### Lo que encaja, y encaja bien

**La tesis coincide con la del manifiesto.** `// 001`: "el modelo caro decide el
mapa, los modelos baratos recorren rutas cortas". El PDF dice lo mismo cambiando
"barato" por "local". No es una idea nueva que haya que injertar: es la que ya
está implementada.

**El horizonte ya está declarado.** El manifiesto `// 001` dice literalmente:
*"las fases mecánicas deben poder ejecutarse en un modelo local especializado.
Eso solo es posible si los contratos de fase siguen siendo pequeños, cerrados y
verificables por herramienta."* Eso no es aspiración: es una restricción de
diseño que llevas meses cumpliendo.

**Los cimientos están puestos, y son justo los caros.** Contratos de fase
cerrados, verificación por herramienta, estado en disco, continuidad entre
runtimes. Un cuarto runtime local reutiliza el 90% de esto.

**El PDF acierta en lo que suele fallar.** Dice explícitamente: no perseguir
modelos, fijar uno y medir; RAG antes que fine-tuning; evals propios antes que
benchmarks públicos; el modelo es reemplazable, el activo es el sistema. Todo eso
es correcto y es la parte que la mayoría se salta.

### Lo que no encaja todavía

**Falta la pieza que el PDF nombra y tú no tienes: los evals.** Su fase 4. Es la
que decide si un modelo local sirve, si un cambio de cuantización mejora o
empeora, y si merece la pena actualizar. Sin ella, la decisión de comprar
hardware se toma a ciegas y la de cambiar de modelo también.

Y es la pieza que **debería existir aunque nunca compres la GPU**, porque tiene
valor inmediato: hoy no puedes contestar con datos si `sdd-apply` va mejor con un
modelo u otro, ni qué le cuesta a Ein una fase. La batería que el PDF propone —
`inspect-repo`, `fix-css/vue`, `tests`, `refactor`, `git-handoff` — es
construible ya, sobre los cambios que tienes en `openspec/changes/archive/`, que
son 51 casos reales con su resultado conocido.

**El RAG del PDF se solapa con lo que ya usas.** Sus cinco capas son
documentación, mapa del código, búsqueda híbrida, decisiones y errores conocidos.
Las capas 2 y 3 son CodeGraph, que ya tienes indexado y cableado
(`ein-pi/agent/lib/codegraph.ts`). La capa 4 son los `summary.md` del archivo.
No hay que construir un RAG: hay que conectar dos cosas que ya existen y añadir
la capa 5.

**La forma de la cadena ya es local-friendly, y conviene decirlo explícitamente
porque es fácil confundirse.** El prompt de 11k tokens del orquestador **no toca
a los ejecutores de fase**: `ein-pi/agent/extensions/ein-ai.ts:821-823` lo inyecta
solo cuando el destinatario no es un agente nombrado ni de fase
(`isNamedAgent || isSddAgent ? "" : buildEinPrompt(...)`). Un ejecutor arranca con
su propio contrato — entre 72 y 126 líneas — más contexto fresco, y lee sus
entradas del disco por referencia, no por contenido. La cadena de siete fases no
acumula: cada eslabón empieza casi de cero.

Eso significa que el reparto correcto para lo local es el que ya está construido:
**el padre (caro, en la nube) decide el mapa; las fases (baratas, y en el
horizonte locales) recorren rutas cortas.** No hay que rediseñar nada para que un
27B pueda ser el ejecutor.

**El límite real está dentro de una fase, no entre fases.** `apply` y `verify` son
multiturno: abren ficheros, editan, corren tests y leen su salida, e iteran. Ahí
sí se acumula contexto, y ahí está el techo de un modelo local con ventana
ajustada — el caso medido de *135 turnos / 1,5M tokens* fue **un solo grupo de
apply**, no una cadena.

La consecuencia para el orden del PDF es más modesta de lo que parece: el recorte
del prompt (`// 006`) es una decisión de coste del padre y **no es prerrequisito
de lo local**. Lo que sí conviene medir antes de comprar hardware es el
**contexto de trabajo pico dentro de `apply` y `verify`** sobre cambios reales.
Ese número — no el tamaño del prompt ni el número de fases — es el que dice si un
27B cuantizado en 24 GB da la talla. Y sale de los evals de la tanda 5.

**La fábrica de landings es un negocio, no una feature.** Tiene sentido y encaja
con lo que sabes hacer. Pero es una decisión de qué haces con tu tiempo, no de
qué construyes en Ein. Ein sería la herramienta; el producto sería la web. No la
mezcles con el rumbo del harness.

### Sobre la compra

Del PDF: *"No comprar la tarjeta para un modelo concreto. Comprar una plataforma
de 24 GB y validar qué modelo ofrece el mejor equilibrio para los benchmarks de
EIN."* Es la formulación correcta, y tiene una consecuencia que el propio
documento no remata: **los benchmarks de Ein no existen todavía**. Constrúyelos
primero. Son baratos, valen aunque no compres nada, y convierten la compra en una
decisión con datos.

---

## // 010. LA FORMA DEL FLUJO: GRANULARIDAD Y PUERTAS

Dos preguntas que salieron al discutir el horizonte local y que son de diseño
del flujo, no de coste: **¿hay que trocear más?** y **¿falta una puerta humana
antes?**. Van juntas porque las dos son la misma pregunta desde lados opuestos
— cuánto se le da al modelo de una vez, y cuándo miras tú.

### La regla: no más pasos, pasos más cerrados

La intuición de que menos contexto da menos fallos es correcta, y no es
folclore: un contexto largo diluye la atención, acumula distractores y arrastra
información obsoleta que el modelo sigue tratando como vigente.

Pero el lever **no es el número de pasos**. Partir un paso ambiguo en tres pasos
ambiguos no reduce errores: los multiplica y añade tres fronteras donde perder
información. F4 y F6 de `docs/fricciones-dogfooding.md` son exactamente eso —
pérdidas en el traspaso, no fallos de razonamiento.

El criterio correcto ya está escrito en el manifiesto `// 001`: *"Si un ejecutor
necesita pensar para hacer su trabajo, el fallo está en la fase anterior."*

No preguntes *"¿cuántos pasos?"*. Pregunta **"¿tuvo que razonar el ejecutor?"**.
Si `apply` decidió algo, el fallo es de `tasks.md`, y la corrección es masticar
más el plan — no partir el apply, y desde luego no subirle el thinking.

**Y el límite que no se cruza:** el trabajo de juicio no trocea. Decidir si un
diseño es correcto, un refactor transversal, una decisión de arquitectura: eso
exige tener muchas cosas a la vista **a la vez**. Partirlo no lo hace más fácil,
lo hace imposible. Por eso el manifiesto lo manda al modelo caro. El reparto no
es "todo más pequeño": es *trabajo mecánico → trocea todo lo fino que quieras;
trabajo de juicio → no trocea*.

**Efecto colateral que vale por sí solo:** la restricción local funciona como
detector de contratos flojos. Una ventana de 24 GB no se negocia. Si una fase
solo funciona porque el modelo de la nube tiene 200k tokens para tragarse lo que
la fase anterior no escribió bien, el contrato está mal y el contexto grande lo
tapa por fuerza bruta. Diseñar para lo local revela ese fallo — razón suficiente
para hacerlo aunque nunca compres la GPU.

### `apply` y `verify` NO se parten en más agentes

Descartado, y con motivo.

El número de agentes no controla el contexto; **el tamaño del slice sí**. Tres
agentes de apply seguirían leyendo los mismos ficheros y corriendo los mismos
tests: no baja el pico, añade tres traspasos.

Los fallos reales de `apply` nunca fueron "hizo demasiados tipos de cosa". Fueron
dos, y los dos se arreglan aguas arriba en `sdd-tasks`:

- grupo demasiado grande — `ein_sdd_check` ya avisa `oversized-group` a >4
  ficheros de producción;
- `tasks.md` poco masticado — el ejecutor tuvo que pensar.

Y bajo strict TDD la división sería activamente peor: escribir test → correr →
leer salida → corregir es un bucle entrelazado, y partirlo obliga a serializar a
disco el estado intermedio en cada vuelta. `verify` son 107 líneas y hace una
cosa; no hay nada que partir.

**Calibración que sí falta**, y es barata:

1. **`oversized-group` pasa de aviso a señal de trabajo.** Hoy es información.
   Con objetivo local es el umbral que dice "vuelve a `sdd-tasks`".
2. **Medir el contexto de trabajo pico por fase**, no solo turnos y tokens
   totales (`// 009`).
3. **Un contador de «el ejecutor razonó»** — si `apply` pregunta, se desvía del
   plan o abre ficheros fuera de su slice, eso es un fallo de `tasks.md` que hoy
   no se registra en ninguna parte. Es la que más daría y la que no existe.

### La puerta humana: lo que ya tienes

Más de lo que parece. `orchestrator.md:121` lo fija, y está razonado:

> **Execution mode — ONE human gate, before apply.** Las fases de planificación
> de solo lectura (`scope → map → design → tasks`) corren **de forma continua,
> sin una pregunta entre cada una** — no mutan código, así que parar a preguntar
> "¿sigo a map?" es fricción pura. `interactive` (default): después de `tasks`,
> presenta un **brief docente** y **entonces pregunta una vez** antes del primer
> `sdd-apply`. `auto`: se salta incluso esa puerta.

O sea: la puerta existe, el camino automático existe, y hay una decisión
explícita en contra de poner puertas entre las fases de planificación.

### Comparación con `gentle-ai`, y el dato del historial

[`Gentleman-Programming/gentle-ai`](https://github.com/Gentleman-Programming/gentle-ai)
ordena su SDD así: **Explore → Propose (¿el usuario aprueba?) → Spec → Design →
Tasks → Apply**. Si el usuario rechaza, vuelve a Explore.

El mapeo con Ein es casi uno a uno — `Explore` ≈ `scope` + `map`, `Spec` +
`Design` ≈ `design`, y el resto igual. **La única diferencia real es el
`Propose` con aprobación, y va antes de especificar.**

Y aquí está el dato que decide. Los tres primeros commits de este repo,
2026-06-08:

```
chore: snapshot Ein as-is before ein-sdd simplification
refactor(sdd): remove ein-design, archive full-SDD phases and chains
feat(sdd): unify proposal+spec+tasks into single sdd-design planning phase
```

**Esta decisión ya se tomó, y se tomó en la dirección contraria.** Reintroducir
la fase es revertirla, y revertirla porque otro proyecto la tiene dividida no es
evidencia.

Lo que salva la intuición: **lo que se colapsó fue el artefacto, no la puerta.**
Son separables. El contenido de la propuesta sigue existiendo dentro de
`design.md`. Lo que no existe es el momento en que te preguntan si ese enfoque es
el correcto.

### La puerta que sí falta: después de `design`, antes de `tasks`

No antes de `design` — ahí no hay nada que aprobar todavía: `scope.md` y `map.md`
son insumos, no una propuesta. Después, y el motivo lo da el manifiesto `// 001`:
diseñar *"es donde se decide si el cambio es correcto"*. Si ahí se decide la
corrección, ahí tiene que mirar un humano.

**Dónde discrepo de la decisión actual.** El argumento *"no mutan código, así que
preguntar es fricción"* mide el coste equivocado. Es verdad que no se pierde nada
en disco, pero sí se pierden dos cosas:

1. **Los tokens de `tasks` corriendo sobre un diseño equivocado.** No es gratis,
   y en un ejecutor local con presupuesto ajustado menos todavía.
2. **El anclaje.** En la puerta de pre-apply, `design.md` y `tasks.md` ya
   existen. Estás revisando un plan, no reconsiderando un enfoque. Decir "esto
   está mal planteado de raíz" cuesta mucho más con dos artefactos escritos que
   con uno.

Las dos puertas responden preguntas distintas, y por eso no se sustituyen:

| Puerta | Pregunta | Qué evita |
|---|---|---|
| Post-design (nueva) | ¿es este el enfoque correcto? | planificar lo que no era |
| Pre-apply (existe) | ¿aplico este plan? | escribir código malo |

**Propuesta concreta: una puerta más, cero fases más, cero artefactos más.**

Después de `design`, en modo `interactive`: mostrar la sección de propuesta de
`design.md` más las decisiones y las alternativas descartadas, y preguntar
Aprobar / Ajustar / Replantear. "Replantear" vuelve a `design` con la corrección,
no a `scope`.

Con dos condiciones que la mantienen barata:

- **Solo en el carril completo.** El carril `micro` ya se salta `map` y `tasks`;
  también se salta esta. Un cambio pequeño no pasa por dos puertas.
- **`auto` se la salta**, igual que se salta la de pre-apply. El camino
  automático que ya existe como modo no se toca.

Coste: una pregunta en el orquestador y una rama en el router. No toca contratos
de fase ni el gatekeeper.

Y la consecuencia que conecta con el horizonte local: **cuanto antes está la
puerta humana, más barato es el error del modelo barato.** Es el mismo principio
que el de trocear, aplicado al juicio en vez de al contexto.

---

## // 011. UNA SOLA PUERTA: `ein`, INSTALLER Y SHIMS

La duda de producto era legítima: hoy existen `ein`, `ein-install`, `ein-pi` y
`ein-cc`, y a simple vista parece que hay **dos launchers compitiendo**. Después
de mirar qué hace realmente cada pieza, la conclusión es más concreta: **la
arquitectura de dos binarios es correcta; lo que está a medias es la superficie
que ve el humano.**

No hay que fusionar el installer con la app. Hay que hacer que **solo una de las
dos piezas se comporte como puerta de entrada**.

### Por qué los dos binarios no se deben fusionar

Hay tres razones estructurales, no estéticas.

**1. Bootstrap.** El installer tiene que poder ejecutarse cuando Ein todavía no
existe. Es un binario autónomo compilado — hoy, del orden de **90–95 MB por
plataforma** — con la plantilla embebida, pensado para desplegar la app desde
cero. La app, en cambio, corre *después* desde esa plantilla ya
desplegada. Fusionarlos haría que el binario de arranque cargase la aplicación
entera y que la aplicación cargase lógica de instalación que en el uso normal no
necesita.

**2. Autorreemplazo.** `update` sustituye el binario de la app. El flujo actual
ya refleja que eso necesita dos procesos: `promoteCommandNames` hace staging y
`rename`, y el relevo usa `--ein-continuation` sobre el binario recién puesto.
Que el proceso que se está ejecutando sea también el que intenta reemplazarse a
sí mismo convierte una separación limpia en un problema de actualización en
caliente.

**3. Entorno no interactivo.** El installer tiene que servir bajo `curl | bash` y
en CI. `menu.ts` ya protege el camino no-TTY con `!process.stdin.isTTY`. La app,
por definición, es una superficie TTY interactiva. Son responsabilidades
operativas diferentes y merece la pena que sigan separadas.

**Conclusión:** dos binarios es correcto. **Dos puertas para el usuario, no.**

### El problema real: un renombrado que empezó y no terminó

`installer/src/core/command-names.ts:3` ya declara el modelo nuevo:

```ts
// `ein` is the terminal app; `ein-install` is this installer.
export const APP_COMMAND = "ein";
export const INSTALLER_COMMAND = "ein-install";
```

Es decir: en el código ya existe una jerarquía clara. **`ein` es el producto;
`ein-install` es infraestructura de ciclo de vida.**

Pero la documentación y algunos mensajes todavía cuentan el mundo anterior.
`README.md:89-94` sigue presentando:

```text
ein                 # menú interactivo
ein install         # instala o repara
ein update          # actualiza Ein y su template con backup
```

Eso no es una discusión de naming: es otro caso del patrón de `// 004`, **código
correcto detrás de una superficie que cuenta algo distinto**. A1 y A2 del plan de
dogfooding ya apuntan a la misma migración incompleta: `install.sh` termina
orientando al usuario hacia `ein` en un punto donde el bootstrap todavía depende
de `ein-install`, e `install.ts:507` dice `pi` donde la superficie aislada que
quiere señalar es `ein-pi`. Son síntomas distintos del mismo renombrado sin
cerrar.

Y la buena noticia es que la relación correcta ya está cableada.
`terminal-app-entrypoint.ts:221,267` ya trata al installer como fontanería
subordinada: las acciones de actualización y diagnóstico salen de la app hacia
`ein-install`. No falta inventar una arquitectura; falta **cerrar la migración y
contar una sola historia en todas las superficies**.

### La propuesta: una puerta pública

La forma que deja cada pieza con una responsabilidad clara es esta:

1. **`ein` es el único comando de producto.** Es el nombre que aparece en el
   README, en la documentación principal y en la memoria muscular del usuario.

2. **Los verbos de ciclo de vida pasan por `ein`.** `ein update`, `ein doctor`,
   `ein restore` y `ein uninstall` hacen passthrough/exec a
   `ein-install <verbo>`. La app ya usa esa relación desde su superficie de
   Sistema; la CLI debe contar exactamente la misma historia.

3. **`ein-install` se queda como bootstrap y escotilla de reparación.** Tiene que
   seguir en el `PATH`, porque si lo roto es `ein` no puedes obligar a repararlo a
   través de `ein`. Pero deja de ser un comando que el usuario normal tenga que
   recordar: aparece en instalación inicial y en troubleshooting.

4. **El menú interactivo de acciones del installer se retira.** No se reestiliza.
   Tener `install / doctor / update / uninstall / restore` en un segundo menú es
   duplicar el dashboard y mantener dos gramáticas visuales para la misma
   administración. La pregunta de **runtime (Pi / Claude / Both)** sí se queda,
   porque es una decisión real del bootstrap. `ein-install` a secas pasa a ser
   esencialmente *instalar, preguntando solo el runtime*.

5. **Los launchers de runtime sobreviven como shims, no como puertas.** `ein-pi`
   y `ein-cc` son, en esencia, shims de variables de entorno con passthrough.
   Siguen siendo útiles para uso directo y scripts, pero
   dejan de anunciarse como la forma principal de entrar. El dashboard ya puede
   ofrecer “Arrancar Pi” y “Arrancar Claude” sin convertir esos shims en producto.

### El naming que cae por su propio peso

C1 del plan ya proponía `ein-pi` → `ein-pi` y `ein-cc` → `ein-cc`. Esta discusión
le da un segundo motivo independiente: no es solo coherencia interna, es
**jerarquía visual del producto**.

Hoy el humano ve:

```text
ein · ein-install · ein-pi · ein-cc
```

Con C1 aplicado:

```text
ein · ein-install · ein-pi · ein-cc
```

Un prefijo, un orden y una lectura inmediata: `ein` es la raíz; lo demás son
piezas subordinadas. Por eso el renombrado deja de ser un cambio mecánico que
conviene hacer “algún día” y pasa a formar parte natural del cierre de esta
superficie.

### Lo único que no conviene decidir por inercia: qué hace `ein` sin argumentos

Que `ein` sea la puerta pública **no demuestra que el dashboard sea siempre la
puerta correcta**. Si abrir `ein` para empezar a trabajar obliga a atravesar un
menú administrativo antes de arrancar Pi o Claude, el dashboard se convierte en
un *keystroke* de peaje.

La defensa del dashboard es buena: enseña estado de proyecto, canal, cambio
activo y runtime antes de arrancar. Esa información sí tiene valor. Pero entonces
la acción de empezar a trabajar tiene que ser **la primera y más obvia**, no una
fila más entre muchas.

Eso deja una decisión de producto pendiente, no una decisión de arquitectura:
**¿`ein` sin argumentos abre siempre el dashboard, o debe existir un camino aún
más directo al runtime habitual?** Se recoge en `// 013` porque solo la puede
contestar el uso real.

### Qué cambia y qué no

No cambia el installer profundo, ni el sistema de backups, ni rollback, ni el
handshake de actualización. Tampoco desaparecen los shims. **Solo se reduce la
superficie humana:** una marca, una puerta, una jerarquía.

Y esto conecta con dos hallazgos que ya existían por separado:

- **D1:** dos gramáticas visuales peleando se arreglan retirando el segundo menú,
  no diseñándolo otra vez.
- **C1:** el renombrado `ein-pi` / `ein-cc` deja de ser cosmética y pasa a cerrar
  la jerarquía de comandos.

Es una mejora de producto barata porque la arquitectura correcta ya está debajo.

---

## // 012. RUMBO PROPUESTO

Cinco tandas. El orden importa: cada una hace más barata la siguiente.

### Tanda 1 — El contrato fijo (`// 007`)

Escribir el contrato estable en una página. `tests/contrato-estable.test.ts` que
lo fije. Campo `channel` en settings. Aceptar prereleases solo en alpha. Aviso en
pantalla. Regla personal: cliente en estable, Ein en alpha.

*Por qué primera:* todo lo demás son cambios en el sistema, y hasta que no exista
el carril seguro, cada cambio es un riesgo sobre tu herramienta de trabajo.

### Tanda 2 — Que la interfaz deje de mentir

Los bloques A y B de `docs/plan-hallazgos-dogfooding-2026-08.md`. Y encima, el
mecanismo que falta: un contrato de "lo que la pantalla afirma viene de un
cálculo", con test, que convierta la señal 9 del manifiesto en código.

Aquí entra también el cierre de `// 011`: **una sola puerta pública**. README,
mensajes post-instalación y CLI cuentan que `ein` es la app; `ein update`,
`ein doctor`, `ein restore` y `ein uninstall` delegan a `ein-install`; C1 se
aplica en esta misma pasada
(`ein-pi`→`ein-pi`, `ein-cc`→`ein-cc`) para que toda la superficie use una sola
jerarquía de nombres.

*Por qué segunda:* es barato, está localizado con línea exacta, y es lo que más
confianza devuelve por hora invertida.

### Tanda 3 — El adelgazamiento

Prompt del orquestador a la mitad, con mecanismo por cada párrafo retirado. Los
tres módulos huérfanos. El archivo de OpenSpec fuera del árbol vivo. Los skills
descargados fuera de `git`. El carril ligero como default. Y el recorte de
superficie de `// 011`: **fuera el segundo menú interactivo del installer**,
manteniendo solo la pregunta de runtime durante el bootstrap.

Y con ello, lo de `// 010`, que es la misma cirugía sobre la forma del flujo: la
**puerta post-design** en el carril completo (`auto` y `micro` se la saltan), y
`oversized-group` ascendido de aviso a señal de trabajo. Nada de partir `apply`
ni `verify` en más agentes — descartado con motivo en `// 010`.

*Por qué tercera:* con el contrato fijo (1) puedes hacerlo sin miedo, y con la
interfaz honesta (2) puedes ver si algo se rompe.

### Tanda 4 — El desacoplamiento del estilo (`// 008`)

`STYLE.md` partido en tres. Perfil de proyecto (`.ein/profile.json`) leído por
Ein. Skills de estética condicionados al perfil, con "ninguno" como default en
proyectos externos. Sin design system todavía.

*Por qué cuarta:* necesita el adelgazamiento hecho, porque separar contratos
mezclados es más fácil cuando hay menos que separar.

### Tanda 5 — Los evals (`// 009`)

La batería del PDF sobre los 51 cambios archivados. Métrica: corrección, turnos,
tokens, tiempo — y, específicamente para la decisión de hardware, **el contexto
de trabajo pico dentro de `apply` y `verify`**, que es el número que decide si un
27B cuantizado en 24 GB da la talla (`// 009`). Correrla contra los modelos que
ya usas.

Con la instrumentación que hoy no existe y que es la que más daría: **un contador
de «el ejecutor razonó»** — apply que pregunta, se desvía del plan o abre
ficheros fuera de su slice. Es la medida directa de si `tasks.md` está bien
masticado (`// 010`).

*Por qué quinta y por qué sí:* es la pieza que convierte "creo que Ein va mejor"
en un número, y es el prerrequisito de cualquier decisión sobre IA local o sobre
comprar hardware.

### Lo que queda fuera de las cinco tandas, a propósito

- **La decisión sobre Claude** (recorte 4). No es trabajo: es una decisión que
  tomas tú, y hasta que la tomes no sé si la tanda 3 debe tocarlo.
- **El design system.** Después de dos o tres webs reales, no antes.
- **El runtime local.** Después de los evals. Sin ellos es una compra a ciegas.

---

## // 013. LAS PREGUNTAS QUE SOLO PUEDES CONTESTAR TÚ

Ninguna de estas la puede contestar el código. Las seis cambian el rumbo.

**1. ¿Ein se enseña o se publica?** No es lo mismo. "Se enseña" (un repo público
que demuestra cómo trabajas, sin promesa de soporte) es coherente con el
manifiesto y no cuesta nada. "Se publica" (gente instalándolo, issues, expectativa
de estabilidad) contradice el `// 000` — "no es un producto para todo el mundo" —
y cambia cada decisión de este documento. El README dice `BETA` y el instalador es
público: hoy estás a medio camino sin haberlo decidido.

**2. ¿Claude es un relevo o un segundo producto?** El manifiesto dice relevo. La
superficie construida (1.986 líneas, comandos propios, `sync.ts` de 33 KB) dice
otra cosa. Si es relevo, el recorte 4 es obvio y libera trabajo futuro. Si es
segundo producto, hay que decirlo en el manifiesto y asumir la factura de
mantener dos superficies.

**3. ¿La fábrica de landings es el objetivo o un subproducto?** Si es el
objetivo, el design system sube de prioridad y Ein se optimiza para trabajo web
repetitivo. Si es un subproducto, Ein sigue siendo un harness general y el design
system es otro proyecto. El PDF asume lo primero; el manifiesto asume lo segundo.

**4. ¿Cuánto Ein estás dispuesto a no usar?** El carril estable solo funciona si
aceptas trabajar meses con una versión que no tiene lo último que construiste.
Es una disciplina personal, y es la que hace o rompe `// 007`.

**5. ¿Cuál es el ritmo sostenible?** 745 commits y 102 releases en 73 días es un
ritmo de sprint. Ein es una herramienta que tienes que usar durante años; el
ritmo actual es el de un proyecto que se está construyendo, no el de uno que se
está usando. La transición de lo primero a lo segundo es la señal de que Ein está
terminado en el sentido que importa — y no es una pregunta técnica.

**6. ¿El dashboard es entrada o peaje?** `// 011` deja claro que `ein` debe ser la
puerta pública, pero no que `ein` sin argumentos tenga que obligarte siempre a
pasar por el dashboard. Si el estado de proyecto, cambio y runtime te ahorra
errores antes de arrancar, el dashboard se gana ese paso. Si casi siempre entras
solo para pulsar "Arrancar Pi", se ha convertido en fricción. Esa decisión no se
resuelve mirando la arquitectura: se resuelve usándolo y midiendo si la pantalla
aporta una decisión o solo un keystroke.

---

## // 014. SEÑALES DE DERIVA, MEDIBLES

El manifiesto `// 009` tiene diez señales cualitativas, y funcionan. Estas seis
son numéricas y complementan: se pueden comprobar con un comando.

| # | Señal | Cómo se mide | Umbral |
|---|---|---|---|
| 1 | El prompt del orquestador crece | `wc -w ein-pi/agent/assets/orchestrator.md` | > 4.000 tras la tanda 3 |
| 2 | Hay módulos sin consumidor | Barrido de importadores no-test en `lib/` | > 0 |
| 3 | El carril alpha no se promueve | Features en alpha con más de 60 días | > 0 |
| 4 | El estable no se usa | Días seguidos con el proyecto de cliente en alpha | > 7 |
| 5 | El archivo pesa más que el motor | Líneas de `openspec/changes/archive` / líneas de `ein-pi/agent` | > 1,0 (hoy: **1,61**) |
| 6 | El ejecutor razona en vez de ejecutar | Applies que preguntan, se desvían o salen de su slice (`// 010`) | > 1 de cada 5 |

La quinta ya está disparada. Es el recorte 3. La sexta no se puede medir
todavía: la instrumentación es trabajo de la tanda 5.

---

## // 015. LO QUE NO SE TOCA

Cierro con la lista corta, porque un documento como este invita a rehacerlo todo
y eso sería el peor resultado posible.

- El estado del trabajo vive en disco.
- El enrutado y las garantías son cálculos, no opiniones.
- La incertidumbre se representa como desconocida.
- Los runtimes vanilla no se tocan.
- El manifiesto gobierna, y se corrige con evidencia medida, nunca se ignora.

Todo lo demás de este documento es negociable, incluida la propuesta de rumbo.
