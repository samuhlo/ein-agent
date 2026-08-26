## // 000. RESUMEN
El instalador enseña su plan antes de ejecutarlo y lo va tachando. Los pasos
pendientes se ven desde el primer fotograma, con contador y barra, en vez de un
log lineal que solo enseña la línea que corre.

## // 001. QUÉ CAMBIÓ
- `install-executor.ts`: oyente opcional que emite `start`, `done` y `abandoned`.
- `install-journal.ts`: lo deja pasar sin enterarse.
- `installer/src/tui/progress.ts`: el modelo puro del avance.
- `installer/src/tui/progress-view.ts`: la pantalla, con su salida inyectada.
- `install.ts`: cablea la pantalla y manda los spinners de los handlers por el
  efecto que ya existía.
- `spec_delta: none`.

## // 002. CÓMO FUNCIONA POR DENTRO
- El dato ya existía: `createInstallPlan` calcula el inventario completo antes de
  tocar la máquina, con el estado de cada entrada, porque es lo que alimenta el
  journal de recuperación. Lo que faltaba era enseñarlo.
- El ejecutor ya era un bucle único sobre ese inventario en orden inmutable, así
  que contar lo que hace fue una costura, no fontanería repartida.
- El contador cuenta solo los pasos ejecutables, sube al CERRAR y no rebasa el
  total. `abandoned` declara que un paso no se hará y por eso no suma: contarlo
  como progreso sería la clase de mentira que este cambio viene a cerrar.
- Los spinners de los handlers alimentan la fila que corre en vez de pintar por
  su cuenta. Su etiqueta ya decía lo correcto; lo que sobraba era que compitiera
  con la lista.
- Sin TTY no se repinta: `curl | bash` recibe un fichero, no una pantalla, y los
  escapes de cursor dejarían basura en el log.

## // 003. DECISIONES
- Oyente opcional, no puerto obligatorio: obligar a pasarlo rompería a todos los
  llamadores del ejecutor por una pantalla.
- Modelo y pantalla en módulos separados: un fallo silencioso solo se caza en la
  mitad que se puede medir.
- El spinner de la pantalla cumple el contrato de `p.spinner`, así que los puntos
  de llamada no cambian de forma.

## // 004. VERIFICACIÓN
- `bun test` — 2517 pass, conjunto de fallos idéntico al de `origin/main`.
- Los dos typechecks — PASS.
- Ciclo estricto en tres contratos; el fixture con `bun: true` destapó que dos de
  ellos apuntaban a un paso que el plan descartaba.

## // 005. PENDIENTE / RIESGOS
- No se ha visto en un terminal real: los contratos fijan qué se escribe, no cómo
  se lee en movimiento.
- Si algo escribe entre repintados, el siguiente sube mal el cursor.
- Un plan más largo que la pantalla no se recorta por alto.
