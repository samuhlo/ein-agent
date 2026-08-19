# Hallazgos de dogfooding y plan de ejecución — agosto 2026

> Intención corta: ordenar las trece fricciones encontradas usando `ein-pi` en
> sesión real, dejar la evidencia de cada una localizada en el código, y fijar
> el orden en que se atacan.

**Origen:** sesión de uso real de `ein-pi`, 2026-08-18. Las notas llegaron
desordenadas; este documento es su versión analizada.

**Autoridad:** por debajo de `MANIFIESTO.md`. Cuando este plan choque con el
manifiesto, gana el manifiesto. Los artículos citados a lo largo del texto
(`// 00N`) son los suyos.

**Relación con otros documentos:** `docs/fricciones-dogfooding.md` recoge
material en crudo para el artículo de lanzamiento, acotado al cambio
`docs-content-inventory`. Este documento es otra cosa: hallazgos de interfaz y
producto con su plan de ejecución. No se solapan.

---

## // 000. QUÉ SALIÓ DEL ANÁLISIS

De trece notas: **cinco son mentiras de la interfaz** (afirma algo falso),
**tres son ruido** (dice la verdad pero ilegible), **una es naming** y **cuatro
son diseño**.

Las cinco primeras se arreglan en horas y cuatro tienen la línea exacta
localizada. El diseño era lo único que necesitaba una decisión de producto, y
está tomada (`// 003`).

---

## // 001. ORDEN

| # | Hallazgo | Bloque | Coste |
|---|---|---|---|
| A1 | `install.sh` manda ejecutar `ein` | Miente | 1 línea |
| A2 | El instalador dice "para el agente, `pi`" | Miente | 1 línea |
| A3 | Los colores vuelven al azul en cada update | Miente | 1 línea + test |
| A4 | Claude no usa `// 00N` ni voz de profesor | Miente | medio |
| A5 | El buscador de la documentación no va | Miente | repro + medio |
| B1 | `ein_sdd_status` / `ein_sdd_check` ensucian el chat | Ruido | medio |
| B2 | El TODO se queda mudo al completar tasks | Ruido | bajo |
| B3 | Títulos de tarea largos e ilegibles | Ruido | bajo |
| C1 | `pi-ein`/`cc-ein` → `ein-pi`/`ein-cc` | Nombres | mecánico, ancho |
| D1 | El instalador es feo | Diseño | alto |
| D2 | La TUI de Pi tiene que ser más bonita | Diseño | alto |
| D3 | Coherencia visual entre superficies | Diseño | alto |

---

## // 002. HALLAZGOS CON EVIDENCIA

### Bloque A — La interfaz miente

Van primero porque son lo más barato y lo que más daño hace. Una pantalla que
afirma falsedades gasta la confianza en todo lo demás (`// 006`: *honesta*;
`// 009` señal 9).

#### A1 — `install.sh` te manda a un comando que aún no existe

`installer/install.sh:14` define `BINARY_NAME="ein-install"`, y la última línea
del script imprime:

```
Listo. Ejecuta ein para empezar.
```

Pero `ein` todavía no existe. Lo crea `promoteCommandNames()`
(`installer/src/core/command-names.ts`) **al ejecutar el instalador**. En ese
punto lo único instalado es `ein-install`.

Detalle de nombres: el binario se llama `ein-install`. `ein-installer` es solo
el nombre del asset de release (`installer/install.sh:55`), nunca un comando.

**Arreglo:** el mensaje final nombra `ein-install`.

#### A2 — El instalador te manda a Pi vanilla creyendo que es Ein

`installer/src/cli/install.ts:507`:

```
Ein listo. Para la aplicación, ejecuta `ein`; para el agente, `pi`.
```

`pi` a secas es Pi vanilla contra `~/.pi/agent`, que en la máquina de
desarrollo está prácticamente vacío de Ein. El agente de Ein es `pi-ein`, cuyo
launcher exporta `PI_CODING_AGENT_DIR=~/.pi-ein/agent` y `EIN_PI_AGENT_HOME`
**antes** de llamar a `command pi`. Sin esas variables no hay cerebro.

El instalador acaba de escribir ese launcher tres líneas antes
(`install.ts:467-479`, `name: "pi-ein.fish"`) y luego manda al comando
equivocado.

**Arreglo:** el outro nombra el launcher que acaba de instalar.

#### A3 — Los colores: causa raíz confirmada

`installer/src/core/settings.ts:17` lista `"theme"` entre los campos que
pertenecen al usuario, y `mergeUserSettings` hace `{...plantilla, ...guardado}`
— gana lo guardado.

Evidencia medida en la máquina:

- `~/.pi-ein/agent/themes/ein.json` → **existe**, desplegado hoy.
- `~/.pi-ein/agent/settings.json:2` → `"theme": "dark"`, no `"ein"`.

El tema de marca se despliega correctamente y **nunca se selecciona**. Cada
`ein update` vuelve a imponer `dark`, que es el tema azul de fábrica de Pi. No
es que los colores "se cambien en cada actualización": es que nunca llegan a
activarse, y el update reafirma esa situación.

**Arreglo:** sacar `theme` de `USER_SETTINGS_KEYS` para que la plantilla gane
siempre, más un test que falle si vuelve a entrar en la lista. El tema no es
una preferencia de usuario en este producto: es identidad de marca (`// 006`,
coherencia entre superficies).

**Contrapartida asumida:** cambiar de tema pasa a requerir tocar la plantilla.
Es el intercambio correcto para un producto de una sola persona con marca
propia, pero es una libertad que se retira a conciencia.

#### A4 — El adaptador de Claude promete un fichero que en Claude no existe

`cc-ein/CLAUDE.md:55` dice que el formato docente lo define "the orchestrator
prompt". Pero:

- `cc-ein/sync.ts` tiene **cero** referencias a `orchestrator.md`; nunca lo
  despliega.
- `~/.claude-ein/` no tiene directorio `assets/`.
- En Pi sí se carga: `ein-pi/agent/lib/persona.ts:70`.

La tabla real del formato vive en `ein-pi/agent/assets/orchestrator.md:199-213`
(las siete secciones `// 000` a `// 006`, más el antipatrón del informe de
estado sin mecanismo). Claude nunca la ve. `CLAUDE.md` remite cinco veces a ese
documento fantasma: routing, delegación, política de Linear y voz.

Es exactamente la señal 5 del manifiesto: *"Un adaptador promete una ruta o un
fichero que no existe en ese runtime."* Y el `// 003`: *"La paridad es
funcional, no textual."*

**Arreglo:** extraer el contrato de voz a un asset compartido que **ambos**
runtimes desplieguen, y que `sync.ts` incluya. No copiar el bloque a
`CLAUDE.adapter.md`: eso duplica prosa portante en dos sitios que se
desincronizan.

Además, un test que falle cuando `CLAUDE.md` remita a un fichero ausente del
destino de Claude. Es convertir la señal 5 en código, que es lo que pide el
`// 002`: *"Un guardarraíl que puede ser código no puede ser un párrafo de
prompt."*

#### A5 — El buscador: la maquinaria está bien, el envoltorio no

Descartado con evidencia:

- El índice Pagefind **sí** se construye: `docs-site/dist/pagefind/` existe con
  `pagefind-entry.json`, `index/` y `fragment/`.
- El script cliente **sí** reactiva el botón: `t.disabled=!1` en
  `dist/_astro/Search.astro_astro_type_script_index_0_lang.*.js`.
- **Sí** usa `showModal()`, o sea que el diálogo va al top layer.

Lo único propio entre el usuario y el buscador es
`docs-site/src/components/Header.astro`: esconde el `<Search />` real dentro de
`.sl-search-host` (`position:absolute; width:1px; height:1px; overflow:hidden;
clip-path: inset(50%)`), pinta un botón señuelo `[B]` y le hace `.click()` por
debajo al botón auténtico.

Ese diseño depende de un atributo interno de un componente de terceros
(`data-open-modal`) y de que el diálogo escape del recorte del ancestro. Es
frágil por construcción.

**Pendiente antes de tocar:** diez minutos de reproducción en navegador para
separar "el modal se abre recortado" de "el click llega antes de la
hidratación". El arreglo robusto es el mismo en ambos casos.

**Arreglo:** dejar de esconder y proxear. Estilar el botón propio de Starlight
como la entrada `[B]` del menú.

**Descartado como causa:** `astro dev` no genera índice Pagefind, así que una
prueba en desarrollo siempre da cero resultados. Si la comprobación se hizo en
`dev`, ese comportamiento es esperado y no es este bug. Merece confirmarse en
la reproducción.

---

### Bloque B — Dice la verdad, pero ilegible

#### B1 — Dieciocho herramientas, cero renderers

`ein-pi/agent/extensions/ein-ai.ts` registra 18 tools y **ninguna** define
`renderCall` / `renderResult`, que es la API que Pi ofrece justo para esto
(`node_modules/@earendil-works/pi-coding-agent/docs/extensions.md:2208`).

Resultado: `formatSddStatus` (`ein-ai.ts:459`) vuelca unas veinte líneas densas
al chat en cada decisión de ruta — mínimo una por fase — y `formatChangeLint`
(`ein-ai.ts:417`) otro tanto tras cada fase.

El diagnóstico correcto es que ese texto tiene **dos públicos confundidos en
uno**: el modelo, que necesita los hechos para enrutar, y el humano, que
necesita saber dónde está. Pi permite separarlos sin perder nada: `content`
sigue yendo íntegro al modelo, `renderResult` colapsa a una línea en pantalla.

Y el estado humano ya tiene su sitio propio: el widget del overlay.

Esto abarata contexto además de píxeles. El `// 001` es explícito: *"El
contexto del padre es el recurso escaso. Cada byte que imprime un comando se
queda ahí para toda la sesión."*

#### B2 — El TODO se queda mudo porque no sabe que existen más fases

`ein-pi/agent/lib/sdd-overlay.ts` solo proyecta `status.tasks.items`. Cuando
todas están marcadas, `nextPending` es `null`, no hay tarea actual, y el widget
se queda enseñando las últimas tareas hechas con un `12/12` — verdadero e
inútil.

Lo importante: **el dato que falta ya está calculado**. `SddChangeStatus`
(`ein-pi/agent/lib/sdd-router.ts:86`) trae `LANE_PHASES[lane]` con la secuencia
completa y `present: Record<SddPhase, boolean>` con qué artefactos existen.

Pintar el raíl `scope → map → design → tasks → apply → verify → close` con
hecha / actual / pendiente es **puro renderizado sobre estado que ya existe**:
sin herramienta nueva, sin agente, sin gasto de modelo. Es el `// 002` en su
forma más literal.

Hoy la pantalla enseña "todo hecho" cuando quedan dos fases. Señal 9 del
manifiesto: *"Una pantalla muestra como verdad algo que no ha verificado."*

`tests/sdd-overlay.test.ts` ya fija el aspecto del widget, así que el cambio
tiene red.

#### B3 — Los títulos largos

`taskRow` (`sdd-overlay.ts:62`) recorta a `width - 10` con un
`DEFAULT_WIDTH = 72` fijo que la extensión nunca sobrescribe: el overlay **no
se adapta al ancho real del terminal**.

Pero el problema de fondo está aguas arriba: `sdd-tasks` escribe títulos-frase.
El recorte es el síntoma; el contrato de `tasks.md` es la causa.

**Arreglo en dos mitades:** pasar el ancho real al overlay, y añadir al
contrato de `tasks.md` un título corto de una frase, conservando el largo como
descripción en lugar de borrarlo.

#### B4 — El check como progreso, no como volcado

Registrado aquí porque nació de la misma observación que B1: la idea de que
`ein_sdd_check` se vea "como un todo que se va completando" encaja con el raíl
de fases de B2. Es el mismo raíl, con el estado del gatekeeper por fase. No es
un hallazgo aparte: es la forma que toma el arreglo.

---

### Bloque C — Nombres

#### C1 — `pi-ein`/`cc-ein` → `ein-pi`/`ein-cc`

La propuesta es correcta y además **el directorio fuente ya se llama
`ein-pi/`**: la incoherencia es interna hoy mismo (fuente en `ein-pi/`, launcher
en `pi-ein/`, adaptador en `cc-ein/`).

Superficie medida: unas 350 referencias a `pi-ein` y unas 680 a `cc-ein`. La
mayoría están en `openspec/changes/archive/`.

**Frontera dura:** no se tocan `openspec/changes/archive/**` ni `CHANGELOG.md`.
Son registro histórico. Reescribirlos para que cuadren con el nombre de hoy es
el sistema reescribiendo sus propios artefactos — señal 2 del manifiesto, y
`// 004`: *"El arnés no se audita a sí mismo."*

Se renombra código vivo, launchers, `docs-site/`, `README.md` y tests. El
archivo se queda como está, que es lo que un archivo debe hacer.

---

### Bloque D — Diseño

#### D1 — El instalador: dos gramáticas visuales peleando

No es falta de pulido. Son dos sistemas de diseño en el mismo binario:

1. `installer/src/tui/frame.ts` y `banner.ts` implementan una gramática
   brutalista propia: marco doble `╔═╗`, pestañas invertidas, líneas de puntos
   hasta el valor.
2. Los cinco ficheros de `installer/src/cli/` imprimen con `@clack/prompts`,
   que trae su propio canalón `│ ◆` con sus propios colores.

Lo que se ve en pantalla —`◆ Launcher: /Users/…/pi-ein.fish`— **es** el clack.
Tras un banner de marca cuidado, el instalador vuelca líneas de log de
desarrollador (rutas de launcher, inventario de comandos) en un estilo que no
es el de Ein.

El manifiesto pide justo lo contrario (`// 006`): *"Coherente entre
superficies: launcher, instalador y sesión son el mismo producto."*

Aparte del estilo, el contenido también sobra: la ruta absoluta del fichero
`.fish` no responde a ninguna pregunta que el usuario tenga en ese momento.

#### D2 y D3 — La TUI y la coherencia

Ver `// 003`, que es donde se fija la dirección.

---

## // 003. DECISIÓN DE DISEÑO

**Tomada el 2026-08-18, concretada con capturas el 2026-08-19.** Referencia:
[`renatoworks/oh-my-reddit`](https://github.com/renatoworks/oh-my-reddit)
(Bubble Tea + Lip Gloss). La dirección no sale del README —que no habla de
estética— sino de tres capturas de la app en marcha: pantalla de conexión,
feed de comentarios y pantalla de carga.

### El principio: adaptar, no arrasar

**Corrección del 2026-08-19.** Una primera lectura de las capturas llevó a
proponer retirar la numeración de sección y pasar todo a minúsculas. Es
incorrecto y queda anulado: el `// 00N` es el gesto de marca, no chrome
sobrante, y sobrevive. Lo que se retira es el **peso**: cajas, placas y líneas
de puntos. Lo que se conserva es la **identidad**: paleta y numeración.

La referencia aporta densidad, aire y ausencia de bordes. No aporta vocabulario.

### Qué se conserva

La paleta de `STYLE.md // 001`, con **un único ajuste**:

| Token | Hex | Cambio | Uso |
|---|---|---|---|
| Carbon | `#0B0B0B` | **antes `#0C0011`** | Fondos |
| Concrete | `#FAF3F0` | sin cambio | Texto principal, valores |
| Structure | `#737373` | sin cambio | Etiquetas, texto secundario |
| Yellow | `#FFCA40` | sin cambio | Acento, foco |

El negro pasa de tener una carga morada (`#0C0011` es azul-morado muy oscuro,
no negro) a un negro neutro. El amarillo y el blanco no se tocan.

Y sus reglas duras siguen: cuatro colores y ya; plano siempre, sin gradientes ni
animación en bucle; honrar `NO_COLOR` y non-TTY con fallback monocromo.

**La numeración `// 00N` se conserva** como marcador de sección, en terminal y
en respuestas. Es lo que hace que una salida de Ein se reconozca de un vistazo,
y ninguna consideración estética la retira.

### El cambio de negro, en detalle

`brand.json` es la fuente de verdad, pero el color está duplicado **a propósito**
en cinco sitios más, porque el instalador y la app pintan antes de saber dónde
está el home del agente:

| Fichero | Forma |
|---|---|
| `ein-pi/agent/brand.json:6` | fuente de verdad |
| `ein-pi/agent/lib/theme.ts:14` | hex |
| `ein-pi/agent/surfaces/terminal-theme.ts:22` | hex |
| `ein-pi/agent/extensions/ein-brand.ts:32` | RGB `{12, 0, 17}` |
| `installer/src/tui/theme.ts:8` | RGB `{12, 0, 17}` |
| `ein-pi/agent/themes/ein.json:5` y `:81` | var + `pageBg` |

Más `ein-pi/core/docs/STYLE.md:11` y el comentario de cabecera de
`ein-pi/agent/extensions/ein-banner.ts:3`.

**Esa duplicación ya tiene guardarraíl.** `tests/terminal-brand.test.ts:88` y
`:165` comprueban que la paleta de la superficie y la copia del instalador
coincidan con `brand.json`. Cambiar el color y correr los tests dice exactamente
qué copias faltan. El cambio es mecánicamente seguro.

**Lo que NO tiene guardarraíl, y es la trampa:** `themes/ein.json` deriva ocho
tintes del carbon morado, y ningún test los cubre. Si el carbon pasa a neutro y
estos se quedan, **el resultado es peor que hoy**: una base negra neutra con
todos los paneles tintados de morado.

### Los tintes, re-derivados sobre `#0B0B0B`

Dos reglas, para que esto sea reproducible y no una lista de números elegidos a
ojo:

- **Superficie neutra** = gris puro escalonado sobre la base.
- **Superficie semántica** = su color mezclado sobre la base a alfa baja,
  `mix(c, α) = 11 + α · (c − 11)` por canal.

| Var | Antes | Ahora | Derivación |
|---|---|---|---|
| `carbon` / `pageBg` | `#0C0011` | **`#0B0B0B`** | base |
| `customMsgBg` | `#191221` | **`#121212`** | neutro +1 |
| `toolPendingBg` | `#16101D` | **`#121212`** | neutro +1 |
| `userMsgBg` | `#1C1524` | **`#161616`** | neutro +2 |
| `export.cardBg` | `#171021` | **`#161616`** | neutro +2 |
| `darkGray` | `#3A343F` | **`#3A3A3A`** | neutro, misma luminosidad |
| `dimGray` | `#5C565C` | **`#5A5A5A`** | neutro, misma luminosidad |
| `selectedBg` | `#2A2135` | **`#1F1A0F`** | yellow α 0.08 |
| `export.infoBg` | `#2E2618` | **`#2D2612`** | yellow α 0.14 |
| `toolSuccessBg` | `#14201A` | **`#1A1C15`** | green α 0.10 |
| `toolErrorBg` | `#241014` | **`#201513`** | red α 0.10 |

**Sin cambio**, porque no derivan del carbon: `concrete`, `structure`, `yellow`,
`yellowDim`, `green`, `red` y todos los `syntax*`.

Nota sobre `selectedBg`: la banda de foco pasa de morada a **cálida**, derivada
del amarillo. No es un capricho — es la regla 3 de la gramática (el foco es una
banda de fondo) atada a la regla 9 (un solo acento). La referencia hace lo mismo:
su fila resaltada lleva el tinte de su color de marca.

Los `syntax*` tienen carga cálida leve (`syntaxComment #6E6860`,
`syntaxPunctuation #8E8788`), no morada. Se quedan.

### Qué cambia

**La gramática de marco de `STYLE.md // 002`.** Fuera el marco doble, fuera las
pestañas invertidas, fuera las líneas de puntos. La jerarquía pasa a expresarse
con **espacio, sangría e intensidad** (`bold`/`dim`), no con bordes.

### La gramática, leída de las capturas

Diez reglas concretas, cada una con lo que sustituye en Ein:

1. **Cero recuadros, con una excepción.** En toda la app de referencia el único
   elemento con borde es el campo de entrada de texto, y con un trazo finísimo y
   de bajo contraste. Todo lo demás es sin borde. → Sustituye a `frame.ts`
   entero y a las pestañas de sección.
2. **La regla vertical izquierda sustituye a la caja.** Cada bloque de la lista
   lleva una barra de un carácter (`▏`) en el margen izquierdo, con color. Es el
   único elemento estructural del cuerpo, y agrupa sin encerrar. → Sustituye a
   `■ NNN. SECCIÓN` como marcador de bloque.
3. **El foco es una banda de fondo, no un borde ni un cursor.** La fila activa
   se tiñe con un fondo sutil a todo el ancho. → Sustituye o acompaña al `▸`.
4. **La etiqueta de sección pierde peso, no identidad.** En la referencia es
   mayúscula apagada, sin regla debajo y sin marco. **Adaptación:** se conserva
   `// 002. SECCIÓN`, se retira todo lo que lo rodeaba — el `■`, la pestaña
   invertida, la regla separadora. El `//` va en amarillo, el número y el
   título en gris apagado. Es el gesto de marca a la intensidad de la
   referencia.
5. **El punto medio `·` es el separador universal**, tanto para metadatos en
   línea (`▲ 1 · 56s ago`) como para listas de atajos
   (`enter select · ctrl+x clear · ctrl+c quit`). → Sustituye a las líneas de
   puntos que llevan la etiqueta hasta su valor.
6. **Minúsculas en el texto corrido, no en los títulos.** En la referencia el
   estado es `loading r/soccer…`, en minúscula y sin ceremonia. **Adaptación:**
   los mensajes de estado, ayudas y atajos bajan a minúscula; los títulos de
   sección `// 00N` mantienen su forma. Lo que se retira es el grito
   permanente, no la numeración.
7. **Dos barras de chrome y nada más.** Una superior fina con identidad y
   contexto (izquierda: wordmark; centro: dónde estás; derecha: sesión y estado
   vivo), y una inferior con estado y atajos. Ambas con un tinte de fondo
   apenas perceptible. El contenido flota entre las dos sin marco.
8. **Espacio negativo masivo.** La pantalla de conexión usa alrededor del 15%
   del alto. La de carga, **una sola línea** centrada. El vacío es la decisión
   de diseño, no lo que queda cuando no hay nada que poner.
9. **La jerarquía la hace el apagado, no el color.** Casi toda la pantalla es
   gris atenuado; el acento aparece en tres o cuatro glifos. Encaja sin
   fricción con la regla de cuatro colores que ya tenemos.
10. **El estado vivo es diminuto y permanente.** `⏺ LIVE`, un sparkline de
    catorce barras, `20 queued`, `updated just now` — todo en la barra inferior,
    siempre visible, nunca volcado al cuerpo.

### Cómo se ve aplicado a Ein

Una salida de comando. Hoy abre con `/// 000. SDD STATUS` sobre marco; en la
gramática nueva el título se queda y el marco se va:

```
  // 000. sdd status

    cambio       update-astro-documentation
    carril       standard
    siguiente    apply

  // 001. fases

    scope ✓   map ✓   design ✓   tasks ✓   apply ▸   verify ·   close ·
```

El overlay del cambio activo:

```
  update-astro-documentation                       standard · apply · 3/7

    scope ✓   map ✓   design ✓   tasks ✓   apply ▸   verify ·   close ·

  ▏ T3  normalizar frontmatter de runtimes                            ▸
  ▏ T4  reescribir la matriz de paridad
```

Y el recibo de una tool, en lugar de las veinte líneas de hoy (`// 002 / B1`):

```
  ein · status      apply · 3/7 · verify pendiente
```

Nótese qué sobrevive: la numeración, el amarillo en el `//` y en el foco, el
blanco en los valores, el gris en las etiquetas. Y qué desaparece: el marco, la
pestaña, los puntos suspensivos hasta el valor, y el volumen.

La regla 10 resuelve `B1` sin inventar nada: el estado del cambio deja de
volcarse al cuerpo del chat y pasa a vivir permanentemente en el chrome. Y la
regla 2 resuelve el raíl de fases de `B2`. Las tandas 2 y 4 comparten
vocabulario, lo que tiene una consecuencia de orden que está en `// 004`.

### La numeración: dónde vive y qué le pasa

Hoy hay **tres formas** de lo mismo conviviendo:

| Forma | Dónde | Qué le pasa |
|---|---|---|
| `// 000.` | Respuestas en markdown (`orchestrator.md:199-213`), `MANIFIESTO.md` | **Intacta.** Es el contrato de voz, y `A4` existe para restituirlo en Claude. |
| `/// NNN.` | Títulos de panel y salidas de comando (`STYLE.md // 002`) | Pierde el marco. Candidato a unificar en `//`. |
| `■ NNN.` | Secciones dentro de un panel | El `■` se retira; la numeración se queda. |

**Decidido el 2026-08-19: se unifica en `//`.** Es la forma que el manifiesto ya
usa, la que estructura las respuestas y la que gusta. Que la misma idea tenga dos
y tres barras según la superficie es ruido heredado, no una distinción que aporte
algo. Un solo prefijo en todas partes: `// 000.`

La comprobación de portabilidad de `// 003 / prosa portante` cubre este cambio:
nada parsea el prefijo, así que unificar es seguro.

**Lo que ninguna pasada de diseño puede tocar:** el formato de respuesta. Es
prosa portante, `A4` depende de él, y comparte numeración con lo que sí cambia —
que es justo lo que lo pone en riesgo de caer como daño colateral.

### Reglas que sobreviven intactas

- **El estado desconocido se dibuja desconocido** (`MANIFIESTO // 006`), por
  encima de cualquier consideración estética.
- **Un solo acento por pantalla.** El amarillo marca una cosa: el foco actual.
  La referencia lo cumple de forma más estricta de lo que lo cumplimos hoy.
- **Plano siempre**, `NO_COLOR` y fallback monocromo.

### Consecuencia que encarece el trabajo

En el análisis previo estimé que D1 se arreglaba en gran medida sustituyendo la
superficie de `@clack` por el `frame.ts` que ya existe y está probado. **Con
esta decisión, esa ruta queda descartada:** `frame.ts` es precisamente el
recuadro que sobra.

El orden correcto pasa a ser: escribir la gramática nueva primero, y luego
aplicarla a las superficies. D1 es más caro de lo estimado.

Esa inversión de orden es lo que crea la **tanda 1.5** de `// 004`. Y tiene un
efecto compensatorio que conviene no perder de vista: como el recibo de una
línea y el raíl de fases de la tanda 2 ya son la gramática nueva, esa tanda deja
de ser trabajo que habrá que rehacer y pasa a ser la primera aplicación real.
Lo que D1 encarece, la tanda 2 lo amortiza.

### Prosa portante que se toca

`MANIFIESTO // 004` avisa de que parte de la prosa es portante y de que hay
código que depende de frases literales, así que se comprobó antes de decidir.

**Resultado de la comprobación: el prefijo es presentación pura.** 49 sitios
imprimen `///`; **cero lo parsean**. No hay `startsWith`, ni regex, ni
`includes` sobre él en `ein-pi/`, `installer/`, `cc-ein/` ni `tests/`. Ningún
consumidor mecánico depende del prefijo, así que retirarlo no rompe ningún
mecanismo — solo cambia lo que se ve.

Dependencias reales identificadas, todas de presentación:

- `STYLE.md // 002` define los prefijos `/// NNN.` y `■ NNN.`, que aparecen
  como cadenas literales en `formatSddStatus`, `formatChangeLint`,
  `formatSddNext` y el resto de salidas de `ein-ai.ts`.
- Seis ficheros de test afirman sobre esos prefijos:
  `sdd-check-ux`, `sdd-status-output`, `sdd-next-dispatcher`, `sdd-remedies`,
  `ein-banner-updates` y `banner-git-semantics`. Son tests de presentación, que
  es exactamente para lo que existen: se actualizan con el cambio, no lo
  bloquean.
- `tests/terminal-chrome.test.ts` fija el marco: el bloque `describe("marco de
  la app")` comprueba que todas las líneas midan lo mismo, que el borde caiga en
  columna y que cada sección abra su pestaña una sola vez. **Cambiar la gramática
  invalida la premisa de ese fichero entero**, no unas cuantas aserciones.
- `installer/src/tui/frame.ts` duplica la gramática a propósito, y un test
  compara las dos copias.

Ninguna de estas dependencias es motivo para no hacer el cambio. Son el
inventario de lo que hay que reescribir a la vez para que el cambio sea
coherente en lugar de dejar dos gramáticas conviviendo — que es el problema que
D1 describe.

### La placa amarilla: se retira

**Decidido el 2026-08-19.** `STYLE.md // 001` la reservaba para versiones y tags
(texto carbon sobre fondo amarillo). Era lo único con peso que quedaría en
pantalla y choca con la regla 1. La versión pasa a gris apagado en la barra
inferior, como el resto del estado.

Dónde vive, para retirarla entera y no a medias:

| Sitio | Qué es |
|---|---|
| `ein-pi/agent/lib/banner-panel.ts:16,32,117-120,151` | el tono `"plate"` del panel |
| `ein-pi/agent/extensions/ein-banner.ts:661-666` | placa ` EIN <versión> ` |
| `ein-pi/agent/extensions/ein-banner.ts:681` | placa ` ESTADO ` |
| `ein-pi/agent/extensions/ein-banner.ts:715,721` | mapa de tonos con `plate` |
| `ein-pi/agent/surfaces/terminal-theme.ts:39-40` | `plateBg` / `plateFg` |
| `installer/src/tui/theme.ts` | función `plate()`, consumida por `frame.ts` |
| `ein-pi/core/docs/STYLE.md // 001` | la regla que la establece |

Retirar el tono `"plate"` de `banner-panel.ts` deja el `PanelTone` sin uno de sus
seis valores: es un cambio de tipo, no solo de color, y el compilador señala los
puntos de consumo.

### El logo: rehacerlo

**Decidido el 2026-08-19.** La geometría actual son letras de bloque en `██`
(`ein-pi/agent/lib/ein-logo.ts`, 54×10 el corte grande y 38×7 el estrecho). Salió
del estilo brutalista que se está retirando, así que se rehace para acompañar la
gramática nueva, no se conserva por inercia.

Lo que **no** cambia: seguir teniendo **una sola geometría canónica**. Hoy
`ein-logo.ts` es fuente única del árbol `ein-pi/` —el installer conserva copia
aparte a propósito, porque corre antes de que exista el template— y
`tests/terminal-brand.test.ts` lo fija. Esa disciplina se mantiene; lo que se
sustituye es el dibujo.

Consumidores a actualizar: `extensions/ein-banner.ts`, `lib/banner.ts` (que
re-exporta), `surfaces/terminal-splash.ts`, `surfaces/terminal-theme.ts` e
`installer/src/tui/banner.ts`.

La **forma** concreta queda abierta: es trabajo de diseño, no una decisión que se
tome sobre el papel. Dirección de partida, de la regla 6 y de la referencia: un
wordmark pequeño en minúsculas para el chrome permanente, y —si sobrevive— una
marca de arranque que aparezca una sola vez, no en cada superficie.

### Qué queda por decidir

Una sola cosa, y se resuelve mejor con algo en pantalla que sobre el papel:

**El revelado gradual.** En la referencia los comentarios entran de uno en uno
con un fundido en lugar de volcarse de golpe. Roza el "sin animaciones en loop"
de `STYLE.md`, aunque no es lo mismo: un reveal único está explícitamente
permitido.

---

## // 004. PLAN DE EJECUCIÓN

### Tanda 0 — Despejar la mesa

`openspec/changes/update-astro-documentation` está **a medio apply**: tiene
`apply-progress.md`, no tiene `verify-report.md`, y hay seis ficheros de
`docs-site/` modificados sin commitear.

Cerrarlo o aparcarlo antes de abrir nada. Empezar trabajo nuevo encima es cómo
se pierde el rastro de qué edición pertenece a qué cambio.

### Tanda 1 — Que no mienta (A1–A5)

**A1 y A2 son una línea cada uno. No abren ciclo SDD.** El manifiesto es
explícito (`// 004`): *"Un defecto de forma se arregla, no se procesa."*
Edición directa, un test de regresión que fije la cadena, y a correr.

**A3, A4 y A5 entran como un cambio SDD.** A4 es el de mejor retorno por línea
tocada de toda la lista: restituye la voz del producto en un runtime entero.

A5 pide su reproducción en navegador antes de tocar nada.

### Tanda 1.5 — La gramática, antes de pintar nada nuevo

**Movida aquí desde la tanda 4 el 2026-08-19.** Motivo: las capturas dejaron
claro que las piezas de la tanda 2 —el recibo de una línea y el raíl de
fases— **son** ejemplos de la gramática nueva (reglas 10 y 2 de `// 003`).
Construirlas con la gramática vieja (`///`, `■`, marco) obliga a reescribir
exactamente los mismos ficheros dos tandas después.

Alcance deliberadamente pequeño, porque no es una pasada de rediseño:

1. **El negro neutro y sus tintes.** `brand.json` a `#0B0B0B`, las cinco copias
   detrás (los tests dicen cuáles), y las once vars de `themes/ein.json` con los
   valores ya derivados en `// 003`. Va primero y solo: es un cambio de valores
   con un guardarraíl que ya existe, y así se ve en pantalla antes de tocar
   ninguna forma.
2. **Retirar la placa amarilla.** Siete sitios inventariados en `// 003`.
   Incluye quitar `"plate"` del tipo `PanelTone`, que es lo que hace que el
   compilador señale los consumidores.
3. **Enmendar `STYLE.md`**: la paleta en `// 001` (sin placa), las diez reglas
   en `// 002`, y la unificación del prefijo en `//`.
4. **Un módulo de primitivas** con lo mínimo: regla vertical, banda de foco,
   fila etiqueta/valor, separador `·`, barra de chrome, título `// 00N`.

El logo va **fuera** de esta tanda: su forma está abierta y es trabajo de
diseño, no de fontanería. Entra en la 4, con la gramática ya asentada.

Nada de aplicarlo todavía a las superficies grandes. Eso es la tanda 4.

### Tanda 2 — Que se lea (B1–B4)

Un cambio SDD, tres piezas que se refuerzan, ya en la gramática nueva:

1. `renderResult` en las dos tools ruidosas: una línea en pantalla, contenido
   íntegro al modelo.
2. El overlay pinta el raíl de fases completo, con `LANE_PHASES` + `present`,
   que ya están calculados.
3. El estado del gatekeeper por fase sobre ese mismo raíl (B4).

Más el ancho real del terminal en el overlay y el título corto en el contrato
de `tasks.md`.

### Tanda 3 — Que se llame bien (C1)

Rename mecánico con la frontera de `// 002 / C1`: nada de `archive/`, nada de
`CHANGELOG.md`.

Va después de la tanda 2 y no antes porque un rename ancho encima de trabajo en
vuelo convierte cada conflicto en arqueología.

### Tanda 4 — Diseño (D1–D3)

Con la gramática ya escrita en la tanda 1.5 y ya probada contra contenido real
en la tanda 2 (el overlay hace de banco de pruebas: es pequeño y está fijado
por `tests/sdd-overlay.test.ts`). Aquí se propaga:

1. **El instalador.** Retirar `frame.ts` y unificar la superficie de `@clack`
   bajo la gramática nueva, que es lo que cierra `D1`. Incluye podar el
   contenido, no solo el estilo: la ruta absoluta del `.fish` no responde a
   ninguna pregunta que el usuario tenga en ese momento.
2. **La app de terminal y el panel de modelos.** Aquí cae
   `tests/terminal-chrome.test.ts`, cuya premisa entera —el borde cae en
   columna, cada sección abre su pestaña— desaparece con el marco.
3. **Las salidas de comando restantes** de `ein-ai.ts`: los 49 sitios que
   imprimen `///`.
4. **`docs-site/`** al final: es la superficie con menos coste de espera.

Las tres decisiones abiertas de `// 003` se resuelven aquí, con el paso 1
delante.

---

## // 005. RIESGOS Y FRONTERAS

- **A3 retira una libertad.** Cambiar de tema pasará por la plantilla. Asumido
  a conciencia en `// 002 / A3`.
- **A5 no está reproducido.** Descartados índice, hidratación y `showModal`, el
  sospechoso es el envoltorio propio. No es una certeza y no se va a tratar
  como tal hasta verlo en un navegador.
- **La tanda 3 es ancha y aburrida**, que es donde un error se cuela sin ruido.
  Merece verify de verdad, no una lectura por encima.
- **B3 no se arregla del todo en el renderizado.** Si `sdd-tasks` sigue
  escribiendo frases largas, el overlay solo recortará más elegantemente.
- **La tanda 4 tiene la trampa de las dos gramáticas conviviendo.** Si se
  aplica a medias, el resultado es peor que el estado actual: hoy al menos cada
  superficie es internamente coherente.
- **El formato de respuesta `// 00N` puede caer como daño colateral** al
  reescribir los prefijos de terminal. Comparten numeración y origen estético, y
  solo uno de los dos cambia. Ver `// 003`.
- **La tanda 1.5 puede crecer sola.** Es un doc y un módulo de primitivas; en
  cuanto empiece a aplicarse a superficies deja de ser la tanda 1.5 y se come la
  4. El límite es que nada fuera del overlay cambia de aspecto hasta la tanda 4.
- **Ninguna tanda justifica que el arnés se reescriba a sí mismo.** Si al
  ejecutar esto aparece la tentación de generar tareas para arreglar la forma de
  un artefacto, es señal 2 y se corrige con una edición.

---

## // 006. ESTADO

Plan aprobado, ejecución no iniciada.

**2026-08-18** — Trece hallazgos ordenados y localizados en código. Decisión de
diseño tomada en dirección, pendiente de concretar.

**2026-08-19** — Gramática concretada desde capturas de la referencia
(`// 003`): diez reglas, con lo que sustituye cada una. Comprobado que el
prefijo `///` no tiene consumidor mecánico (49 impresiones, 0 parseos). Añadida
la tanda 1.5 y reordenada la 4 en consecuencia.

**2026-08-19, corrección** — La primera lectura de las capturas se pasó de
frenada: proponía retirar la numeración de sección y pasar todo a minúsculas.
Anulado. El principio es **adaptar, no arrasar**: se conserva la paleta y el
`// 00N`, se retira el peso (cajas, placas, líneas de puntos).

**2026-08-19, cierre de diseño** — Decidido y anotado:

- Carbon `#0C0011` → **`#0B0B0B`**, y las once vars derivadas de
  `themes/ein.json` re-derivadas sobre el negro neutro, con la regla de mezcla
  que las produce. Amarillo, blanco y grises sin tocar.
- **Prefijo unificado en `//`**. Se acabaron las tres formas.
- **La placa amarilla se retira.** Siete sitios inventariados; la versión pasa a
  gris apagado en la barra inferior.
- **El logo se rehace**: salió del estilo brutalista que se retira. Se mantiene
  la disciplina de geometría única; se sustituye el dibujo. Su forma es trabajo
  de la tanda 4.

Queda abierta **una sola** decisión: el revelado gradual.

Siguiente paso: tanda 0.
