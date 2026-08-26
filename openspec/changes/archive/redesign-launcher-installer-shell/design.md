# Design: redesign-launcher-installer-shell

## A. Proposal

### Intent

El aparato ya es la marca del banner de Pi. Llevarlo a las otras dos superficies
que el usuario ve —la portada de `ein` y el arranque del instalador— y aprovechar
el viaje para arreglar tres cosas que el código deja a la vista:

1. La portada de `ein` son nueve acciones en una sección sin nombre. Arrancar,
   continuar y administrar son tres decisiones distintas puestas en fila india.
2. Su cabecera pinta el wordmark y luego el título de la vista, que en la portada
   es `Ein`: en pantalla se lee `ein   ein`.
3. En el instalador las tres opciones de runtime se pintan en amarillo tengan el
   foco o no, porque llegan ya envueltas en `gold(...)` desde el punto de llamada
   y el `concrete(...)` del prompt no puede tapar un ANSI interior.

### Scope

**In:** presentación de la portada y del arranque del instalador, y las dos
primitivas puras que lo sostienen.

**Out:** el conjunto de filas, su orden y sus teclas; el avance guiado por plan
(entrega encadenada aparte); la geometría del aparato. El carril micro no lleva
`map.md` ni `tasks.md`.

### Affected areas

- `terminal-chrome.ts` — `brandLines` (la placa) y `contextLines` (proyecto, rama
  y el cambio SDD en curso). Puras: entra ancho y datos, salen `ChromeLine`.
- `terminal-app.ts` — `buildDashboard` nombra sus secciones.
- `terminal-dashboard-view.tsx` — monta placa y contexto solo en la portada.
- `installer/src/tui/banner.ts` — placa.
- `installer/src/cli/runtime-prompt.ts` — etiquetas sin pintar, pistas con
  consecuencia.

### Risks

- **El cambio en curso no siempre existe.** `summary.change` puede faltar, y una
  línea de contexto que se dibuja a medias descuadra la portada.
- **Terminal estrecho.** La placa pide el mueble más el aire más el texto; por
  debajo de eso hay que ceder a la forma apilada, como ya hace el banner de Pi.
- **Filas y teclas.** Nombrar secciones no puede mover la primera fila ni dejar
  ninguna sin atajo: hay tests que lo fijan, y son decisiones de producto.
- **Quitar el `gold(...)`** cambia quién manda sobre el color de una fila del
  prompt. Es una línea, pero es un traspaso de responsabilidad.

### Rollback

Revertir los cinco ficheros de producción y los tres de test juntos. Sin
migración, sin estado persistido, sin contrato de release implicado.

### Success criteria

- La portada abre con el aparato, y bajo él una barra de contexto que nombra el
  proyecto y —si lo hay— el cambio SDD con su fase y su siguiente paso.
- La cabecera de la portada no repite el wordmark; las demás vistas la conservan.
- Las nueve filas siguen ahí, en el mismo orden, con los mismos atajos, y la
  primera sigue siendo arrancar Pi bajo el cursor.
- Toda línea del chrome sigue midiendo el ancho declarado, también las nuevas.
- El instalador abre en placa, y la opción con el foco es la única en concreto.

## B. Spec

### Requirement 1 — La placa es una primitiva del chrome

`terminal-chrome.ts` **MUST** exponer la placa como líneas del chrome, no como
escritura directa a stdout, para que la portada la componga con el resto. Toda
línea que devuelva **MUST** medir el ancho pedido. Cuando el ancho no dé para el
mueble más su aire más el texto, **MUST** devolver la forma apilada en vez de
recortar la marca.

**Given** un ancho de 84 y otro de 40, **When** se piden las líneas de marca,
**Then** el primero las devuelve en placa y el segundo apiladas, y en ambos casos
toda línea mide el ancho pedido.

### Requirement 2 — El contexto nombra el trabajo, sin ocupar una fila

El bloque de contexto **MUST** llevar proyecto, rama y estado del árbol, y la
ruta pegada al margen derecho. Cuando hay un cambio SDD en curso **MUST** añadir
una línea con su nombre, su fase y su siguiente paso; cuando no lo hay **MUST**
omitir esa línea entera, no dibujarla vacía. No **MUST** ser una fila navegable:
es estado, y las filas del dashboard son acciones con atajo.

**Given** un resumen con cambio activo y otro sin él, **When** se piden las
líneas de contexto, **Then** el primero devuelve una línea más que el segundo y
ninguna de las dos versiones altera el número de filas del dashboard.

### Requirement 3 — Las secciones nombran el verbo, las filas no se mueven

`buildDashboard` **MUST** repartir sus filas en secciones nombradas por el verbo
que las agrupa. **MUST** conservar el conjunto de filas, su orden y sus atajos, y
la primera **MUST** seguir siendo arrancar Pi. Ninguna fila **MUST** quedarse sin
atajo.

**Given** el dashboard construido, **When** se listan sus filas visibles,
**Then** son las mismas nueve en el mismo orden, todas con atajo distinto, y la
primera resuelve a arrancar Pi.

### Requirement 4 — El foco manda sobre el color de la fila

Las opciones del prompt de runtime **MUST** entregar su etiqueta sin secuencias
ANSI, de modo que la fila con el foco se pinte en concreto y las demás en
estructura. Sus pistas **MUST** decir qué se instala y qué launcher deja puesto,
no repetir la etiqueta.

**Given** las opciones de runtime, **When** se inspeccionan sus etiquetas,
**Then** ninguna contiene un escape ANSI, y cada pista nombra al menos el
launcher que instala.

## C. Decisions

- **El cambio en curso va al chrome, no a una fila.** Ponerlo como fila lo
  metería bajo el cursor y desplazaría a arrancar Pi, que es la decisión de
  producto que el test «starting work is the first row» defiende desde antes.
- **La placa solo en la portada.** Las vistas de dentro necesitan decir dónde
  estás; repetir el aparato en cada una lo convierte en papel pintado.
- **Las primitivas viven en `terminal-chrome.ts`.** Es el módulo puro que ya
  produce líneas y el que la suite sabe medir; la vista `.tsx` solo pinta.
- **El instalador duplica la placa, no la importa.** Ya duplica paleta y
  gramática a propósito: corre antes de que exista el template desplegado. Lo que
  comparte es la geometría del aparato, que sí importa desde `ein-tv.ts`.

## D. Success Criteria

Los de la sección A, verificados por los contratos de la sección B.
