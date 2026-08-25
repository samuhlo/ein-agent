# Investigación del freeze de repintado — agosto 2026

> Intención corta: clasificar de quién es el fallo antes de tocar una línea, que
> es lo que pide la unidad 4A del roadmap.

**Estado: una causa encontrada y corregida en Ein; el resto del síntoma sigue
siendo de Pi, pendiente de una prueba de dos minutos.**

---

## // 000. EL SÍNTOMA, EN PALABRAS DE QUIEN LO SUFRE

Al **cerrar Pi y volver a abrirlo** sobre una sesión anterior:

- El widget del TODO no se actualiza solo.
- El indicador del subagente aparece **abajo** en vez de en su sitio normal.
- **No hay animación**: el spinner no gira.
- Se refresca **cada cierto tiempo**, y también **en cuanto se pulsa una tecla o
  se escribe algo**.

No ocurre con `/resume` dentro de la misma ejecución, sino al arrancar de nuevo.

## // 001. LO QUE EL SÍNTOMA DESCARTA DE ENTRADA

**El estado no está congelado; el dibujo sí.** Que se actualice al pulsar una
tecla significa que los datos llegan bien y lo que falla es el repintado
autónomo. Eso descarta la primera hipótesis que se manejó —una caché del overlay
que no se invalidaba— y descarta también cualquier problema de lectura de
`tasks.md`.

## // 002. QUÉ PINTA EIN, MEDIDO SOBRE EL ÁRBOL

| Superficie | Dueño | Evidencia |
|---|---|---|
| Widget del TODO | **Ein** | `ein-sdd-overlay.ts:50`, único `setWidget` de todo el repositorio |
| Indicador de subagente | Pi | Ein no lo registra en ninguna parte |
| Spinner / animación de trabajo | Pi | Cero llamadas a `setWorkingIndicator` o `setWorkingVisible` en Ein |
| Footer | Pi | Cero llamadas a `setFooter` en Ein |
| Bucle de repintado del TUI | Pi | No hay API de repintado en la superficie de extensiones |

Ein registra **un solo widget**, con `placement: "aboveEditor"`. Las tres partes
del síntoma que no son el TODO —la posición del indicador, la falta de animación
y el repintado perezoso— caen fuera del código de Ein.

## // 003. LO ÚNICO QUE PODRÍA SER NUESTRO

Cuatro extensiones se enganchan a `session_start`: banner, overlay, `ein-ai` y
continuity. La de `ein-ai` (`ein-ai.ts:709`) es `async` y hace trabajo real:
escribe el bloque de `.gitignore`, puede abrir un **diálogo interactivo** de
codegraph, instala assets SDD y aplica la configuración de modelos.

Que un arranque haga trabajo síncrono y abra diálogos mientras la TUI se está
montando es la única vía plausible por la que Ein podría degradar el arranque.
Hay un precedente escrito en el propio repositorio: `ein-update-notice.ts:269`
existe precisamente *"para arrancar el aviso sin que `session_start` espere a las
comprobaciones de actualización"*. Alguien ya se encontró con un bloqueo ahí.

Es una hipótesis, no un hallazgo: **no está reproducida**.

## // 003 bis. UNA CAUSA ENCONTRADA, Y ES NUESTRA

Buscando por la zona que apuntaba la intuición del usuario —el orden de pintado—
aparece otra cosa, en `ein-sdd-overlay.ts:47-50`:

```ts
const next = lines.join("\n");
if (next === painted) return;   // sale sin pintar
painted = next;                 // se marca como pintado...
ctx.ui.setWidget(OVERLAY_KEY, ...);  // ...antes de saber si llego a la pantalla
```

`painted` registra lo **enviado**, no lo que llegó a la pantalla, y la API no
ofrece forma de saber lo segundo. Si un envío se pierde —la TUI montándose
todavía al abrir sobre una sesión con historial—, la caché queda marcada y
cualquier refresco posterior con el mismo contenido sale por la puerta de
arriba. **El widget se queda mudo hasta que el contenido cambie por su cuenta.**

Eso encaja con dos de las observaciones: que se actualice "cada cierto tiempo"
(cuando el contenido cambia de verdad y la caché deja de coincidir) y que se
actualice al pulsar una tecla (Pi fuerza el render por otro camino).

**Corregido:** la caché se invalida en `session_start`, porque al arrancar la UI
es nueva aunque el contenido sea el mismo. El atajo de plegar ya hacía
exactamente eso. Cubierto por `tests/sdd-overlay-repaint.test.ts`, que también
fija que la caché siga evitando repintados redundantes dentro de una sesión.

**Lo que esto no arregla:** la posición del indicador de subagente y la falta de
animación. Siguen siendo de Pi, y la prueba de abajo sigue en pie.

## // 004. LA PRUEBA QUE CIERRA LA CLASIFICACIÓN

Dos minutos, y la puede hacer cualquiera con el runtime delante:

1. Abrir una sesión con `pi` **vanilla** —sin Ein, que para eso el runtime está
   aislado— y dejarla con algo de historial.
2. Cerrar y volver a abrir sobre esa sesión.
3. Lanzar cualquier cosa que muestre el indicador de subagente y observar si
   anima, dónde aparece y si repinta sin tocar el teclado.

- **Si pasa igual en vanilla** → es de Pi. Se cierra con este informe, se reporta
  aguas arriba y Ein no parchea nada. Es el desenlace que el roadmap autoriza.
- **Si en vanilla va bien** → es de Ein o de la integración, y entonces la
  hipótesis de `session_start` pasa a ser la primera candidata y merece cavar.

## // 005. POR QUÉ NO SE PARCHEA MÁS QUE ESO

Lo corregido es lo que la evidencia de código sostiene: una caché que se marca
antes de tiempo. No se toca el arranque ni el layout, porque las otras dos
partes del síntoma pertenecen a superficies que Ein no dibuja, y ahí un parche
por conjetura tiene el coste habitual —romper el arranque para todos— sin saber
si arregla algo.

**El arreglo es una hipótesis con evidencia, no una causa demostrada.** Nadie ha
reproducido el fallo con un depurador. Lo que sí garantiza es que, si el widget
se pierde una vez, deja de quedarse perdido para siempre.

## // 006. SI RESULTA SER DE PI

Queda este informe como material del reporte aguas arriba, con lo que hace falta
para que sea accionable: la versión (`@earendil-works/pi-coding-agent` 0.84.1),
el disparador (arrancar sobre sesión existente, no `/resume`), las tres partes
del síntoma, y el dato que más acota — **repinta al recibir entrada de teclado**,
que apunta al bucle de render y no a los datos.
