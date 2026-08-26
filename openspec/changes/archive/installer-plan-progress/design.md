# Design: installer-plan-progress

## A. Proposal

### Intent

El instalador es un log lineal con spinners: enseña la línea que está corriendo y
nada más. No sabes cuántos pasos quedan ni si vas por la mitad, y en una
instalación que baja binarios eso son minutos a ciegas.

El dato existía. `createInstallPlan` calcula el inventario completo ANTES de
tocar la máquina —es lo que alimenta el journal de recuperación— con el estado de
cada entrada. Lo que faltaba era enseñarlo.

### Scope

**In:** un oyente opcional en el ejecutor, el modelo puro que lo consume, la
pantalla que lo pinta, y el cableado.

**Out:** el plan, el journal, y qué hace cada paso. El carril micro no lleva
`map.md` ni `tasks.md`.

### Affected areas

- `install-executor.ts` — el bucle ya recorre el inventario en orden inmutable;
  solo cuenta lo que hace.
- `progress.ts` / `progress-view.ts` — modelo y pantalla, separados por la línea
  de la pureza.
- `install.ts` — construye la pantalla y le pasa el spinner a los handlers.

### Risks

- **Un indicador que miente.** Es el fallo típico y es SILENCIOSO: no rompe nada,
  solo engaña — un paso que se queda «corriendo» porque su cierre se perdió, o un
  contador que suma pasos que ni se van a ejecutar.
- **Dos cosas pintando a la vez.** Los spinners de los handlers escriben en su
  propia línea; con una lista que se repinta encima, la pantalla se pelea consigo
  misma.
- **Sin terminal no hay repintado.** `curl | bash` recibe un fichero: los escapes
  de cursor dejan basura en el log.
- **El oyente no puede cambiar nada.** Si altera una decisión del ejecutor, el
  journal y la recuperación dejan de corresponderse con lo ejecutado.

### Rollback

Revertir los cinco ficheros de producción y el de test juntos. El oyente es
opcional en todas las firmas, así que revertirlo no deja a nadie colgado.

### Success criteria

- Los pasos pendientes se ven desde el primer fotograma.
- El contador cuenta lo que se va a ejecutar, sube al cerrar y nunca pasa del
  total.
- Ningún paso se queda abierto, ni siquiera tras un fallo.
- Sin oyente, el ejecutor produce exactamente el mismo resultado.
- Sin terminal, ni un escape de cursor en la salida.

## B. Spec

### Requirement 1 — El ejecutor cuenta lo que hace, sin decidir nada

El ejecutor **MUST** abrir y cerrar cada paso que ejecuta, en el orden del plan.
Un paso que falla **MUST** cerrarse como fallo. Lo que ya no se vaya a ejecutar
porque su runtime cayó antes **MUST** declararse, no callarse. Con oyente y sin
él, el resultado **MUST** ser idéntico.

**Given** un plan cuyo primer paso falla, **When** se ejecuta con oyente,
**Then** ese paso se cierra como fallo, los siguientes de su runtime se declaran
abandonados, y el resultado es igual al de la misma ejecución sin oyente.

### Requirement 2 — El contador no miente

El total **MUST** contar solo los pasos que el ejecutor va a recorrer, no el
inventario entero. El contador **MUST** subir al CERRAR un paso, no al abrirlo, y
**MUST NOT** pasar del total pase lo que pase con los eventos. Solo un paso
**MUST** figurar como corriendo a la vez. Un evento de un paso que no está en el
plan **MUST** ignorarse entero.

**Given** un plan con entradas ya satisfechas, **When** llegan eventos repetidos,
desordenados o de pasos ajenos, **Then** el total sigue siendo el de los pasos
ejecutables y el contador nunca lo rebasa.

### Requirement 3 — Los pendientes se ven desde el principio

La pantalla **MUST** pintar una fila por paso ejecutable desde el primer
fotograma, con los pendientes marcados como tales. Ninguna línea **MUST**
desbordar el ancho del terminal.

**Given** el modelo recién arrancado, **When** se piden sus líneas, **Then** hay
una por paso ejecutable y todas dicen «pendiente».

### Requirement 4 — Sin terminal no se repinta

Con TTY la pantalla **MUST** repintar en sitio. Sin TTY **MUST** escribir una
línea por paso cerrado y **MUST NOT** emitir un solo escape de cursor.

**Given** una salida sin TTY, **When** se ejecuta el plan entero, **Then** hay
tantas líneas como pasos cerrados y ningún escape.

## C. Decisions

- **Un oyente opcional, no un puerto obligatorio.** El ejecutor es el sitio donde
  ya se sabe todo; obligar a pasarlo rompería a todos sus llamadores por una
  pantalla.
- **`abandoned` no suma al contador.** Declara que un paso NO se hará. Contarlo
  como progreso es justo la clase de mentira que este cambio viene a cerrar.
- **El spinner de los handlers alimenta la fila, no pinta.** Su etiqueta ya decía
  lo correcto; lo que sobraba era que compitiera con la lista. `effects.spinner`
  ya existía para inyectarlo.
- **La pureza se parte en dos módulos.** El modelo se mide; la pantalla se
  inyecta. Un fallo silencioso solo se caza en la mitad que se puede medir.

## D. Success Criteria

Los de la sección A, verificados por los contratos de la sección B.
