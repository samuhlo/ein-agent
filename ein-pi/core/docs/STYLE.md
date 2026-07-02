# STYLE — Contrato de marca y estilo de Ein

> Intención corta: que todo lo que Ein imprime, escribe o publica se reconozca como samuhlo de un vistazo. Brutalismo industrial: plano, directo, sin adornos.

## // 001. PALETA

Fuente de verdad: `brand.json` → `colors`. El installer la duplica en `installer/src/tui/theme.ts` (corre antes de que exista el template desplegado).

| Token | Hex | RGB | Uso |
|---|---|---|---|
| **Carbon** | `#0C0011` | 12, 0, 17 | Fondos, texto sobre placa amarilla |
| **Concrete** | `#FAF3F0` | 250, 243, 240 | Texto principal, valores, letras E/N del logo |
| **Structure** | `#737373` | 115, 115, 115 | Etiquetas, reglas `─`, texto secundario |
| **Yellow** | `#FFCA40` | 255, 202, 64 | Acentos, marcadores `■`, foco `▸`, letra I del logo |

Reglas duras:

- **Plano siempre.** Sin gradientes, sin shine, sin animaciones en loop. Un reveal único y a estático.
- **4 colores y ya.** La jerarquía se expresa con `bold`/`dim`, no añadiendo matices.
- **El gesto de marca**: un solo elemento amarillo sobre neutro (la I de EIN, el punto de `.SAMUHLO`, la h del wordmark).
- **Placa invertida** para versiones/tags: texto carbon en bold sobre fondo amarillo.
- Honrar `NO_COLOR` y non-TTY con fallback monocromo.

## // 002. PREFIJOS EN TERMINAL

| Prefijo | Qué es | Ejemplo |
|---|---|---|
| `/// NNN. TÍTULO` | Título de panel o salida de comando | `/// 000. EIN STATUS` |
| `■ NNN. SECCIÓN` | Sección dentro de un panel (marcador en yellow) | `■ 002. SKILLS` |
| `▸` | Fila con foco en un panel interactivo | `▸ sdd-design` |
| `─` | Regla / separador (en structure) | — |

Numeración de tres dígitos empezando en `000`. Español directo, sin relleno corporativo, sin emojis.

## // 003. MARKDOWN PUBLICADO (Linear, PRs, commits)

Donde Ein escribe de cara afuera, el esqueleto es siempre el mismo:

- **Título**: tags `[[TAG]]` + imperativo. Tags: `[[FRONT]]`, `[[BACK]]`, `[[FEAT]]`, `[[FIX]]`, `[[QA]]`, `[[AI]]`, `[[DOCS]]`.
- **Apertura**: `> Intención corta: ...` — una frase.
- **Secciones**: `## // NNN. TÍTULO` numeradas.

Formatos completos (issue, comentario de progreso, cierre didáctico, PR body): ver `agents/ein-linear.md` y `agents/ein-git.md`. Regla de oro del cierre de issue y del PR: la sección **CÓMO FUNCIONA** es el corazón — si no enseña el mecanismo, está incompleto.

Commits: Conventional Commits (`type(scope): descripción`), imperativo, sin atribución a IA.

El **idioma** de estos artefactos lo fija el eje «artefactos» de `/ein:lang` (`.pi/ein/lang.json`); el esqueleto `// NNN` y los `[[TAG]]` se mantienen, solo cambian las cabeceras y la prosa. Por defecto, español.

## // 004. CÓDIGO

- Todo `.ts` abre con su placa:

```ts
// =============================================================================
// TÍTULO
// Propósito en una o dos líneas: qué hace este fichero y por qué existe.
// =============================================================================
```

- Comentarios explican *por qué*, no *qué*. Español o inglés, pero consistente dentro del fichero.
- Colores en código: nunca hex/RGB hardcodeado fuera de `brand.json` y `theme.ts` — siempre via `loadPalette()` (extensiones) o los helpers de `theme.ts` (installer).

## // 005. VOZ

- Natural y directo. Técnico sin jerga vacía. El idioma (es/en) lo fija `/ein:lang`; la persona fija el tono, no la lengua.
- Enseñar antes que reportar: un cambio importante exige explicar el mecanismo (ver Samu Output Format en `assets/orchestrator.md`).
- Lo trivial se despacha en una línea. El peso de la respuesta acompaña al peso del cambio.
