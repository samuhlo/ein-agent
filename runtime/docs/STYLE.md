# STYLE — Contrato de marca y estilo de Ein

> Intención corta: que todo lo que Ein imprime, escribe o publica se reconozca como samuhlo de un vistazo. Plano, directo, sin adornos: la jerarquía la hacen el aire y el apagado, nunca un borde.

## // 001. PALETA

Fuente de verdad: `brand.json` → `colors`. El installer la duplica en `installer/src/tui/theme.ts` (corre antes de que exista el template desplegado); `tests/terminal-brand.test.ts` obliga a que las copias coincidan.

| Token | Hex | RGB | Uso |
|---|---|---|---|
| **Carbon** | `#0B0B0B` | 11, 11, 11 | Fondos |
| **Concrete** | `#FAF3F0` | 250, 243, 240 | Texto principal, valores |
| **Structure** | `#737373` | 115, 115, 115 | Etiquetas, texto secundario |
| **Yellow** | `#FFCA40` | 255, 202, 64 | Acento, foco `▸`, la `i` del wordmark |

Reglas duras:

- **Plano siempre.** Sin gradientes, sin shine, sin animaciones en loop. Un reveal único y a estático.
- **4 colores y ya.** La jerarquía se expresa con `bold`/`dim`, no añadiendo matices.
- **Un solo acento por pantalla.** El amarillo marca una cosa: el foco actual. Si marca cinco, no marca ninguna.
- **El gesto de marca**: un solo elemento amarillo sobre neutro — la `i` de `ein`.
- Honrar `NO_COLOR` y non-TTY con fallback monocromo.

### Tintes derivados

En la sesión Pi, mensajes de usuario, mensajes propios y herramientas heredan el fondo de la terminal (`""` en `themes/ein.json`). El TODO tampoco pinta un fondo: distingue la fila actual con texto, regla y `▸`. Así no aparecen placas negras ni franjas partidas en terminales con otro color de base.

Los menús nativos conservan `selectedBg` para identificar la opción seleccionada. La app de terminal independiente y la exportación HTML conservan superficies propias:

- **Superficie neutra** = gris puro escalonado sobre `#0B0B0B`.
- **Superficie semántica** = su color mezclado a alfa baja: `mix(c, α) = 11 + α · (c − 11)` por canal.

| Var | Hex | Derivación |
|---|---|---|
| `export.cardBg` | `#161616` | neutro +2 |
| `darkGray` | `#3A3A3A` | neutro |
| `dimGray` | `#5A5A5A` | neutro |
| `secondaryText` | `#9A9A9A` | texto secundario legible de la sesión Pi |
| `selectedBg` | `#1F1A0F` | yellow α 0.08 |
| `export.infoBg` | `#2D2612` | yellow α 0.14 |

### La escala de cuerpo

**Hay UN gris de cuerpo, no tres.** La misma pantalla llegó a pintar tres colores distintos para decir «esto es secundario»: el widget de subagentes a `#9A9A9A`, el banner a `#737373`, y el overlay SDD a `#737373` con el atributo ANSI `DIM` encima (≈`#4B4B4B`). El elemento más consultado era el menos legible.

| Nivel | Hex | Contraste sobre carbón | Qué pinta |
|---|---|---|---|
| **Acento** | `#FFCA40` | 12,9:1 | la `i`, el foco, la fase actual, lo que está vivo |
| **Primario** | `#FAF3F0` | 17,9:1 | título de tarea, valor de dato, título de sección |
| **Secundario** | `#9A9A9A` | 6,99:1 | claves, metadatos, fases hechas — el gris de cuerpo |
| **Apagado** | `#5A5A5A` | 2,85:1 | rutas, notas al pie, salvedades permanentes |
| **Estructura** | `#3A3A3A` | 1,43:1 | reglas, glifos de árbol, ids, fases pendientes |

Fuente: `lib/theme.ts` → `SCALE`, servido por `createPalette` como `muted` / `faint` / `structure`. Coincide con `secondaryText`, `dimGray` y `darkGray` de `themes/ein.json`, que es lo que permite que Pi y Ein pinten el mismo gris.

Regla dura: **el nivel se elige con el color, nunca rebajando el que ya se eligió.** No se apila `DIM` sobre un tono de la escala; para pesar menos existe el nivel siguiente.

La banda de foco es **cálida**, no neutra: ata la regla del foco (`// 002`) al acento único de esta sección.

## // 002. GRAMÁTICA DE TERMINAL

Diez reglas, y una que las gobierna: **el aire sustituye al borde**.

1. **Cero recuadros.** Sin marcos, sin cajas, sin pestañas de sección. Un bloque se separa del siguiente con una línea en blanco.
2. **La regla vertical agrupa sin encerrar.** Una barra de un carácter en el margen izquierdo (`▏`) marca un bloque. Es el único elemento estructural del cuerpo.
3. **El foco debe sobrevivir sin fondo propio.** En la sesión Pi lo marcan `▸`, la regla en amarillo y el texto. Los menús y la app independiente pueden añadir la banda `selectedBg`.
4. **La etiqueta de sección conserva su número y su peso lo lleva el título**: `// NNN  TÍTULO`, con `//` en yellow, el número en estructura y el TÍTULO en primario y mayúsculas. Sin regla debajo, sin marcador `■`. Era el elemento con menos peso de la pantalla siendo la única señal de estructura que hay: lo que se apaga es el número, no el título.
5. **El punto medio `·` es el separador universal**, en metadatos (`apply · 3/7`) y en listas de atajos (`tab plegar · ctrl+c salir`).
6. **Minúsculas en el texto corrido.** Mensajes de estado, ayudas y atajos van en minúscula; los títulos `// NNN` mantienen su forma.
7. **Cada superficie tiene una posición estable.** En Pi, la actividad nativa de subagentes va sobre el editor y el TODO debajo. El resumen persistente FleetView se oculta; el inspector sigue disponible en `/subagents-fleet`. La app independiente conserva sus barras de identidad y estado.
8. **Espacio negativo generoso.** El vacío es la decisión de diseño, no lo que queda cuando no hay nada que poner.
9. **La jerarquía la hace el apagado, no el color** — pero se apaga lo ACCESORIO, no todo. Una pantalla en la que cada nivel está apagado no tiene jerarquía: tiene un solo nivel, y encima ilegible.
10. **El estado vivo es diminuto y permanente**: vive en la barra inferior, nunca volcado al cuerpo.

| Elemento | Qué es | Ejemplo |
|---|---|---|
| `// NNN. título` | Título de panel, sección o salida de comando | `// 000. sdd status` |
| `▏` | Regla vertical: agrupa un bloque | — |
| `▸` | Fila con foco; abre la fila por la IZQUIERDA, no la cierra | `▸ apply` |
| `✓` | Hecho; en estructura, porque lo hecho ya no informa | `✓ scope` |
| `├─ └─ ⎿` | Jerarquía real: el árbol de actividad de Pi, adoptado tal cual | `⎿ read src/x.ts` |
| `·` | Separador de metadatos y atajos | `standard · apply · 3/7` |

Numeración de tres dígitos empezando en `000`. **Un solo prefijo, `//`**, en terminal y en markdown: las formas `///` y `■ NNN.` quedan retiradas. Español directo, sin relleno corporativo, sin emojis.

## // 003. MARKDOWN PUBLICADO (Linear, PRs, commits)

Donde Ein escribe de cara afuera, el esqueleto es siempre el mismo:

- **Título**: tags `[[TAG]]` + imperativo. Tags: `[[FRONT]]`, `[[BACK]]`, `[[FEAT]]`, `[[FIX]]`, `[[QA]]`, `[[AI]]`, `[[DOCS]]`.
- **Apertura**: `> Intención corta: ...` — una frase.
- **Secciones**: `## // NNN. TÍTULO` numeradas.

Formatos completos (issue, comentario de progreso, cierre didáctico, PR body): ver `agents/ein-linear.md` y `agents/ein-git.md`. Regla de oro del cierre de issue y del PR: la sección **CÓMO FUNCIONA** es el corazón — si no enseña el mecanismo, está incompleto.

Commits: Conventional Commits (`type(scope): descripción`), imperativo, sin atribución a IA.

El **idioma** de estos artefactos lo fija el eje «artefactos» de `/ein:lang` (`.pi/ein/lang.json`); el esqueleto `// NNN` y los `[[TAG]]` se mantienen, solo cambian las cabeceras y la prosa. Por defecto, español.

## // 004. CÓDIGO

- Todo módulo `.ts` nuevo debería abrir con su placa:

```ts
// =============================================================================
// TÍTULO
// Propósito en una o dos líneas: qué hace este fichero y por qué existe.
// =============================================================================
```

Es una recomendación de autoría, no una puerta global sobre el árbol existente. Al trabajar de forma sustancial en un módulo antiguo se puede añadir la placa dentro del mismo cambio; su ausencia aislada no crea una tarea ni bloquea una entrega.

- Comentarios explican *por qué*, no *qué*. Español o inglés, pero consistente dentro del fichero.
- Colores en código: nunca hex/RGB hardcodeado fuera de `brand.json` y `theme.ts` — siempre via `loadPalette()` (extensiones) o los helpers de `theme.ts` (installer).

## // 005. VOZ

- Natural y directo. Técnico sin jerga vacía. El idioma (es/en) lo fija `/ein:lang`; la persona fija el tono, no la lengua.
- Enseñar antes que reportar: un cambio importante exige explicar el mecanismo (ver Samu Output Format en `assets/orchestrator.md`).
- Lo trivial se despacha en una línea. El peso de la respuesta acompaña al peso del cambio.
