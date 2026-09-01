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

El tema de Pi (`themes/ein.json`) deriva sus fondos de la base con dos reglas, no con valores elegidos a ojo:

- **Superficie neutra** = gris puro escalonado sobre `#0B0B0B`.
- **Superficie semántica** = su color mezclado a alfa baja: `mix(c, α) = 11 + α · (c − 11)` por canal.

| Var | Hex | Derivación |
|---|---|---|
| `customMsgBg`, `toolPendingBg` | `#121212` | neutro +1 |
| `userMsgBg`, `export.cardBg` | `#161616` | neutro +2 |
| `darkGray` | `#3A3A3A` | neutro |
| `dimGray` | `#5A5A5A` | neutro |
| `selectedBg` | `#1F1A0F` | yellow α 0.08 |
| `export.infoBg` | `#2D2612` | yellow α 0.14 |
| `toolSuccessBg` | `#1A1C15` | green α 0.10 |
| `toolErrorBg` | `#201513` | red α 0.10 |

La banda de foco es **cálida**, no neutra: ata la regla del foco (`// 002`) al acento único de esta sección.

## // 002. GRAMÁTICA DE TERMINAL

Diez reglas, y una que las gobierna: **el aire sustituye al borde**.

1. **Cero recuadros.** Sin marcos, sin cajas, sin pestañas de sección. Un bloque se separa del siguiente con una línea en blanco.
2. **La regla vertical agrupa sin encerrar.** Una barra de un carácter en el margen izquierdo (`▏`) marca un bloque. Es el único elemento estructural del cuerpo.
3. **El foco es una banda de fondo**, no un borde ni un cursor: `selectedBg` a todo el ancho, con la regla vertical en amarillo.
4. **La etiqueta de sección conserva su número y pierde su peso**: `// NNN. sección`, con `//` en yellow y el resto en structure. Sin regla debajo, sin marcador `■`.
5. **El punto medio `·` es el separador universal**, en metadatos (`apply · 3/7`) y en listas de atajos (`tab plegar · ctrl+c salir`).
6. **Minúsculas en el texto corrido.** Mensajes de estado, ayudas y atajos van en minúscula; los títulos `// NNN` mantienen su forma.
7. **Dos barras de chrome y nada más.** Una superior con identidad y contexto, una inferior con estado y atajos, ambas sobre `#121212`. El cuerpo flota entre ellas sin marco.
8. **Espacio negativo generoso.** El vacío es la decisión de diseño, no lo que queda cuando no hay nada que poner.
9. **La jerarquía la hace el apagado, no el color.**
10. **El estado vivo es diminuto y permanente**: vive en la barra inferior, nunca volcado al cuerpo.

| Elemento | Qué es | Ejemplo |
|---|---|---|
| `// NNN. título` | Título de panel, sección o salida de comando | `// 000. sdd status` |
| `▏` | Regla vertical: agrupa un bloque | — |
| `▸` | Fila con foco, sobre banda `selectedBg` | `▸ apply` |
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
