# Design: fix-installer-progress-append-only

## A. Proposal

### Intent

La pantalla del avance repintaba la lista entera subiendo el cursor tantas filas
como había pintado. En la primera instalación real quedó a la vista lo que eso
produce: bloques de lista pegados unos encima de otros, el contador saltando de
`0/9` a `3/9` a `6/9` sin las filas de en medio, y trozos del informe del doctor
partidos.

La causa no es el cálculo del salto: es la premisa. **La pantalla no es suya.**
Trece puntos de `install.ts` escriben durante los handlers —el informe completo
del doctor entre ellos—, y cada uno de esos writes invalida la cuenta de filas
pintadas. El siguiente repintado sube a ciegas.

El riesgo estaba escrito en el `verify-report.md` del cambio anterior y aun así se
entregó: «si algo escribe entre repintados, el siguiente sube mal el cursor».

### Scope

**In:** la forma de pintar el avance.

**Out:** el modelo, el oyente del ejecutor, el journal, y los puntos de escritura
de `install.ts`. El carril micro no lleva `map.md` ni `tasks.md`.

### Affected areas

- `progress-view.ts` — append-only.
- `progress.ts` — se retira la composición de la lista repintada.

### Risks

- **Se pierde la lista de pendientes de arriba**, que era la ganancia visible del
  cambio anterior. Se compensa con el total en la cabecera y la posición en cada
  línea (`3/8`), sin listar nada dos veces.
- **Un indicador vivo mal contenido reintroduce el problema.** Un `\r` solo puede
  reescribir la línea actual; en cuanto se emite un salto, esa línea es de otro.
- **Sin TTY no puede haber ni `\r`**: `curl | bash` recibe un fichero.

### Rollback

Revertir los dos ficheros de producción y el de test juntos.

### Success criteria

- Ninguna salida contiene un movimiento de cursor a una fila anterior.
- Una línea por paso cerrado, en orden, con su posición en el plan.
- La cabecera con el total aparece una vez.
- Sin TTY, ni un escape.
- Un detalle larguísimo se recorta en vez de desbordar.

## B. Spec

### Requirement 1 — Nunca se sube el cursor

La vista **MUST NOT** emitir jamás una secuencia de movimiento de cursor a una
fila anterior, con terminal o sin él. Un paso en curso **MAY** reescribir SU
propia línea con retorno de carro, y esa línea **MUST** cerrarse con el resultado
antes de que se escriba nada debajo.

**Given** un plan entero ejecutado con indicadores vivos, **When** se inspecciona
todo lo escrito, **Then** no aparece ninguna secuencia de cursor arriba.

### Requirement 2 — Una línea por paso, con su posición

Cada paso cerrado **MUST** dejar exactamente una línea, en el orden en que se
cierra, con su posición en el plan. Un paso abandonado **MUST** dejar también la
suya. La cabecera con el total **MUST** aparecer una sola vez.

**Given** un plan cuyo primer paso falla y el siguiente se abandona, **When**
termina, **Then** hay una línea por cada uno y una sola cabecera.

### Requirement 3 — Sin terminal, ni un escape

Sin TTY la vista **MUST NOT** emitir ninguna secuencia de escape, ni siquiera el
retorno de carro del indicador vivo.

**Given** una salida sin TTY, **When** se ejecuta el plan, **Then** lo escrito no
contiene un solo escape.

### Requirement 4 — La línea no decide el ancho

Un detalle más largo que el terminal **MUST** recortarse.

**Given** un detalle de 400 caracteres y un terminal de 76 columnas, **When** el
paso se cierra, **Then** ninguna línea pasa de 76 columnas visibles.

## C. Decisions

- **Append-only en vez de arreglar el salto.** Llevar la cuenta de lo que
  escriben otros trece puntos es un contrato que se rompe con el siguiente
  `console.log` que alguien añada. Un terminal compartido se escribe hacia abajo.
- **El total en la cabecera y la posición en cada línea**, en vez de repetir la
  lista arriba: se conserva el «cuánto falta» sin gastar el doble de pantalla.
- **El indicador vivo se queda**, contenido en su propia línea: sin él, un paso
  lento no da señales.
- **`progressLines` se retira entera.** Era la composición de la lista repintada;
  mantenerla sin usar solo invita a volver a llamarla.

## D. Success Criteria

Los de la sección A, verificados por los contratos de la sección B.
