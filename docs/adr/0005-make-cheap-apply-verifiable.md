# ADR 0005 — Convertir apply en trabajo barato verificable

status: accepted
date: 2026-09-03

## Contexto

El principio económico de Ein dice que el modelo caro decide el mapa y que los
modelos baratos recorren rutas cortas y acotadas. La arquitectura, el instalador
y la beta ya tienen fronteras suficientes para dejar de ser el trabajo
principal, pero la entrega entre `sdd-tasks` y `sdd-apply` todavía no cumple ese
principio.

El repositorio ya contiene piezas útiles:

- `sdd-design` y `sdd-tasks` separan la decisión de la ejecución;
- `apply-packet/v1` puede clasificar un encargo como ejecutable, incompleto o
  rechazado;
- `sdd-apply` trabaja por grupos en contexto fresco;
- `sdd-verify` vuelve a ejecutar comprobaciones;
- session accounting mide runs, coste, tokens y turnos con cobertura explícita.

Sin embargo, las piezas no forman una cadena obligatoria. La gramática de
`tasks.md` no exige la frontera ni las condiciones que espera el packet, ningún
módulo de runtime consume el packet, el ejecutor conserva herramientas amplias
y la contabilidad no puede unir el coste de un grupo con su resultado
verificado.

La medida histórica que motivó esta decisión sigue en cero: ningún packet del
corpus congelado es ejecutable. El recuento independiente más reciente sobre el
commit base encontró 652 tareas, 120 packets compilables y 0 ejecutables. Las
pruebas enfocadas del 2026-09-03 vuelven a confirmar que ningún packet del
corpus es ejecutable y que corpus y packet están aislados del runtime.

El defecto no se reduce a campos ausentes. `apply-packet/v1` permite
`edits: []`, mezcla el permiso de escritura con los ficheros nombrados por un
check y compila una tarea aunque el runtime delega un grupo. Añadir `stop:` y
`evidence:` sin resolver esas fronteras dejaría decisiones de implementación en
el ejecutor.

## Explicación humana

Ein debe funcionar como una fábrica:

1. El modelo caro escribe una orden de trabajo completa.
2. Una puerta comprueba que la orden no deja decisiones abiertas.
3. El operario barato solo recibe esa orden y las piezas necesarias.
4. Una valla real impide que toque fuera del encargo.
5. Un inspector independiente prueba el resultado.
6. El contador atribuye coste únicamente a trabajo que llegó a ese resultado.

Hoy existen la persona, el operario, un formulario, un inspector y un contador,
pero el formulario no llega al operario, la valla es prosa y el contador mide
actividad en vez de trabajo correcto.

## Decisión

El siguiente programa principal de Ein será cerrar el bucle de ejecución barata
en Pi. Claude permanece como complemento y no recibe trabajo de paridad hasta
que el recorrido de referencia esté demostrado.

La entrega se construye en este orden:

1. **Orden ejecutable por grupo.** `apply-packet/v2` representa el mismo grupo
   que delega el orquestador e incluye pasos ordenados no vacíos.
2. **Tres fronteras distintas.** El packet separa contexto de lectura, permiso
   de escritura y checks ejecutables. Nombrar un test en un comando no concede
   permiso para modificarlo.
3. **Observación antes de bloqueo.** El runtime compila y valida el packet en el
   punto real de delegación y muestra el resultado sin impedir todavía el
   apply existente.
4. **Confinamiento real.** Tras estabilizar la gramática, las herramientas
   impiden escrituras fuera de la lista y sustituyen el shell abierto por checks
   declarados. El runtime, no el worker, actualiza el control SDD.
5. **Receipt de resultado.** Los checks producen evidencia ligada al digest del
   packet y al estado resultante. Un cambio conductual con cobertura `none` o
   `partial` no se cierra como pass ordinario.
6. **Coste por éxito.** La contabilidad une cambio, grupo, packet, modelo,
   thinking, coste, turnos, receipt y reparaciones. La unidad económica es el
   coste total por grupo verificado, no el coste aislado de `apply`.
7. **Canary por clase de trabajo.** El mismo packet se ejecuta en árboles
   aislados con un modelo capaz y uno barato/local. Solo se promocionan clases
   con cero escapes, calidad equivalente y menor coste total.

Las condiciones comunes de parada —fuente obsoleta, dependencia nueva,
decisión pendiente o escritura fuera de frontera— pertenecen al runtime. El
planificador solo declara las condiciones específicas del encargo.

La intención humana también tiene un único dueño: el proceso padre. Un hijo
que `pi-subagents` ya ligó a tarea, herramientas e identidad de run no vuelve a
abrir el diálogo interactivo. Saltar esa segunda pregunta no amplía permisos;
la frontera de capacidades del runner sigue siendo autoritativa. Esta regla se
incorporó tras observar dos verificadores reales que salían con 0 turnos porque
la puerta consumía su única entrada no interactiva.

La evidencia tampoco será prosa autoafirmada por el worker. El plan declara un
comportamiento y un check; el runtime ejecuta el check y conserva el resultado.

## Métricas y promoción

La comparación se hace por clase de trabajo y cuenta cualquier rescate con un
modelo caro como fallo del recorrido barato. Las puertas iniciales son:

- cero escrituras fuera de frontera;
- cero packets obsoletos ejecutados;
- al menos 20 grupos por clase antes de declararla estable;
- objetivo inicial de 90 % de grupos verificados al primer intento;
- ninguna pérdida de cobertura conductual respecto al baseline capaz;
- coste total por grupo correcto inferior al baseline equivalente.

El corpus histórico permanece congelado para conservar comparabilidad. Los
runs vivos se capturan en la delegación antes de que el cierre compacte los
artefactos. Se conserva una foto de accounting como referencia histórica, pero
la línea base válida será una ejecución controlada del mismo packet v2 con los
dos modelos.

## Política de modelos

- `orchestrator`, `sdd-scope`, `sdd-design` y `sdd-tasks`: modelo capaz, thinking
  alto; concentran intención, frontera y decisiones.
- `sdd-map`: modelo barato con thinking medio cuando el mapa sea estructural.
- `sdd-apply`: conserva temporalmente el modelo capaz durante observación; pasa
  a barato/local con thinking bajo solo para clases promocionadas.
- `sdd-verify`: runner determinista para hechos y modelo barato para interpretar
  huecos; una ambigüedad vuelve aguas arriba.
- `sdd-close`, Git y Linear: modelo barato con thinking bajo.

Las recomendaciones instaladas deben coincidir con esta política. Recomendar
`low` para `sdd-scope` o `sdd-tasks` contradice el manifiesto y traslada
decisiones al lugar equivocado.

## Presupuesto de prompt

Al aceptar esta decisión quedan 281 bytes de margen en el orquestador y 420 en
el conjunto de agentes. El presupuesto se atiende dentro de cada cambio que lo
consuma: mover garantías a código, sustituir prosa duplicada por el packet
compacto o elevar el techo con una compra explícita. No se abre una campaña de
compresión ni una limpieza sin consumidor.

## Trabajo aplazado

Hasta cerrar el bucle quedan fuera de prioridad:

- más refactor del instalador sin un fallo concreto;
- paridad adicional de Claude;
- integraciones, packs y perfiles para terceros;
- nuevos cleaners o división de ficheros por tamaño;
- selección prematura de un modelo local concreto.

La política de seguir las últimas versiones de Pi y extensiones permanece: una
rotura upstream es trabajo de adaptación, no motivo para congelar el runtime.

## Consecuencias

- Ein no afirmará que el ejecutor barato funciona porque una delegación termine
  con código cero; exigirá resultado verificable.
- `tasks.md` pasa de checklist docente a fuente de una orden consumida por
  máquina sin perder su explicación humana.
- El worker deja de poseer progresivamente el plano de control y la
  autoevaluación.
- El primer rollout informa sin bloquear; endurecer la puerta exige evidencia
  de runs reales.
- La primera superficie es Pi. Claude adopta el contrato después, mediante su
  papel de complemento, cuando exista un resultado estable que portar.

## Condiciones de revisión

- Revisar el schema si una clase promocionada necesita decisiones repetidas que
  el packet no puede expresar.
- Retirar un campo que no tenga consumidor mecánico o no cambie una decisión.
- Pausar la promoción si el coste total, los turnos p95 o las reparaciones
  empeoran aunque el precio nominal del modelo sea menor.
- Reabrir la estrategia si un executor local no puede operar con contexto
  cerrado sin copiar al packet una implementación completa.
