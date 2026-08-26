# Design: redesign-banner-placa-rejilla

## A. Proposal

### Intent

El arranque de Pi ocupa 44 filas: trece de televisor apiladas sobre veinticuatro
de panel. El modo completo solo exige 30 filas de terminal, así que el banner se
sale por arriba en cualquier ventana normal. El rediseño lo baja a 30 filas sin
pedir una sola columna más, por dos movimientos independientes:

1. **La placa.** El mueble y los datos de marca (subtítulo y versiones) dejan de
   apilarse: la marca se pone a la derecha del aparato, dentro de su misma
   banda. Y el aparato pierde la antena y las patas — pasa a ser el corte
   `cabinet`, que ya existía.
2. **La rejilla.** `SISTEMA` y `SESION` no pasan de 31 columnas cada una, así que
   apiladas desperdiciaban media fila por línea. En paralelo el panel baja de 24
   filas a 19.

### Scope

**In:** la geometría del banner (`ein-banner.ts`), una sección `grid` en el
módulo puro del panel (`banner-panel.ts`), el corte `compact` sin patas
(`ein-tv.ts`), y la elección de corte en las otras dos superficies que dibujan
el mismo aparato (`terminal-splash.ts`, `installer/src/tui/banner.ts`).

**Out:** contenido del panel, tiempos de la cascada, `composeColumns`, el corte
`full` (se conserva, deja de elegirse). El carril micro no lleva `map.md` ni
`tasks.md`.

### Affected areas

- `banner-panel.ts` — nueva `PanelSection` de clase `grid` con exactamente dos
  columnas de `PANEL_W / 2`. La invariante del módulo (toda línea mide
  `PANEL_W`) se mantiene rellenando cada celda a su ancho antes de unirlas.
- `ein-tv.ts` — `compact` deja de emitir su fila de patas.
- `ein-banner.ts` — banda de placa, corte `cabinet`, `SISTEMA`/`SESION` en
  `grid`.
- `terminal-splash.ts`, `installer/src/tui/banner.ts` — el corte más grande pasa
  de `full` a `cabinet`, para que el aparato sea el mismo en las tres
  superficies.

### Risks

- **Desalineación por columnas.** Es el modo de fallo de todo dibujo de
  caracteres: una celda que no mide lo que debe abre el panel por la derecha. Se
  contiene rellenando y recortando cada celda a su ancho declarado, y se fija con
  el test de ancho que ya existía.
- **Valores más cortos.** Un campo de la rejilla tiene 18 columnas de valor en
  vez de 49. Hoy caben todos (`preguntar` es el más largo); un modo o una persona
  con nombre largo se recortaría antes que ahora.
- **La placa no cabe en terminales estrechos.** El mueble más el aire más las
  versiones piden 59 columnas con el corte `cabinet`. Por debajo de eso el
  banner vuelve a la forma apilada.
- **Cambio visible fuera del banner.** El splash de Pi y el instalador también
  pierden antena y patas. Es deliberado: el aparato es una sola marca.

### Rollback

Revertir los cinco ficheros de producción y los dos de test juntos. No hay
migración, ni estado persistido, ni contrato de release implicado.

## B. Spec

### Requirement 1 — La rejilla no rompe el ancho del panel

El panel **MUST** seguir emitiendo lineas de exactamente `PANEL_W` caracteres,
tambien en las filas de una seccion `grid`. Cada mitad **MUST** rellenarse o
recortarse a `PANEL_W / 2` antes de unirse a la otra, con independencia de lo que
midan la etiqueta y el valor.

**Given** una seccion `grid` con un valor de 400 caracteres en cada columna,
**When** se renderiza el panel abierto del todo, **Then** toda linea mide
`PANEL_W` y ninguna mitad contiene texto de la vecina.

### Requirement 2 — Numeracion y sangria de la rejilla

Las dos columnas **MUST** numerarse `// NNN.` de izquierda a derecha en el orden
en que se leen. Cada mitad **MUST** llevar su propia sangria de etiqueta: la
izquierda arranca en la columna 0 y la derecha en `PANEL_W / 2`. La columna con
menos campos **MUST** quedarse en blanco por abajo sin descuadrar la fila.

**Given** `SISTEMA` con cinco campos y `SESION` con cuatro, **When** se renderiza
el panel, **Then** la fila de titulos lleva `// 000. sistema` en la columna 0 y
`// 001. sesion` en la columna 31, y la quinta fila existe con la mitad derecha
vacia.

### Requirement 3 — El aparato es un rectangulo

Ningun corte salvo `full` **MUST** emitir antena (`╲`) ni patas (`▀`). `full`
**MUST** conservarse con su geometria y su suite, aunque ninguna superficie lo
elija.

**Given** los cortes `cabinet`, `compact` y `minimal`, **When** se renderiza cada
uno con cualquier senal, **Then** ninguno contiene esos glifos y todas las filas
del mueble miden `TV_WIDTH[cut]`.

### Requirement 4 — La placa cede antes que recortar

El banner **MUST** poner el subtitulo y las versiones al costado del mueble
cuando el mueble, el aire y el texto mas ancho caben en el terminal. Si no caben,
**MUST** volver a la forma apilada en vez de recortar la marca.

**Given** un terminal de 59 columnas y uno de 58, **When** se dibuja el banner,
**Then** el primero sale en placa y el segundo apilado, y ninguno de los dos
desborda su ancho.

## C. Decisions

- **Una seccion `grid` nueva, no un flag en `fields`.** La animacion escalona por
  indice de fila y no conoce la estructura de las secciones: emitir la rejilla
  como filas normales la deja funcionar sin tocarla.
- **Rellenar y recortar cada mitad al final, no confiar en la aritmetica.** La
  invariante del panel es que toda linea mide `PANEL_W`; un ajuste final por
  celda la sostiene aunque llegue una etiqueta larga.
- **`full` se conserva.** Retirarlo obligaria a tocar tipo, tabla de anchos y
  suite para no ganar nada; dejar de elegirlo basta.
- **El mismo aparato en las tres superficies.** El televisor es una sola marca:
  el splash y el instalador pierden antena y patas con el banner.

## D. Success Criteria


- El banner completo mide 30 filas y no pasa de `PANEL_W + 4` columnas.
- Toda línea del panel sigue midiendo exactamente `PANEL_W`, también las de la
  rejilla y con valores desbordados.
- `SISTEMA` y `SESION` conservan su numeración `// 000.` y `// 001.`, y sus
  valores arrancan en la misma columna dentro de cada mitad.
- Ningún corte de la TV emite patas salvo `full`, que se conserva sin usarse.
- En un terminal demasiado estrecho para la placa, el banner sigue dibujándose
  apilado y sin recortes.
