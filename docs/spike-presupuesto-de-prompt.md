# Spike: cuánto prompt se puede retirar, y con qué palanca

Medición del **2026-08-17** sobre `ein-pi/agent/assets/orchestrator.md`. Existe
para una sola decisión: si la apuesta (1) de
[`comparativa-openspec-upstream.md`](comparativa-openspec-upstream.md) —que una
herramienta ensamble el paquete de instrucción por fase— resuelve el problema
del prompt o solo una parte, y qué hace falta además.

Autoridad: subordinado a `MANIFIESTO.md` § 004 (arneses sí, burocracia no) y
§ 001 (el caro decide, el barato ejecuta). No ordena trabajo.

**Condición de retirada:** se borra cuando las tres palancas estén ejecutadas o
descartadas por escrito en `docs/roadmap-features-ein.md`. Es una foto con
fecha, no un observatorio.

---

## // 000. RESULTADO

**Se puede retirar en torno a un tercio del prompt. No dos tercios.**

| Palanca | Bytes | % del prompt |
|---|---:|---:|
| (1) Paquete de instrucción por fase | ~11.066 | 24 % |
| (4) Prosa que debería decir la herramienta | ~2.282 | 5 % |
| Retirada de anécdota medida | ~1.410 | 3 % |
| **Total direccionable** | **~14.758** | **33 %** |
| Coordinación que se queda | ~30.563 | 67 % |

Línea base: **45.321 bytes**. Objetivo realista tras las tres palancas: **~30 KB**.

Esto **corrige dos estimaciones previas** hechas sin medir:

- «20 KB es agresivo y alcanzable» — no lo es. 20 KB exigiría reescribir la
  coordinación, que es otra clase de trabajo y otro riesgo.
- «el prompt es tejido cicatricial» — solo en un 3 %. El prompt es grande porque
  tiene **muchas reglas**, no porque acumule anécdotas. La poda fácil no existe.

---

## // 001. REPARTO POR SECCIÓN

```
45.321  total
14.190  31,3%  SDD Flow             ← el grueso de lo direccionable
10.295  22,7%  Work Routing Ladder  ← coordinación pura, no se mueve
 4.822  10,6%  Subagent Inventory   ← datos tabulares, se generan
 3.675   8,1%  plantilla // PLAN    ← plantilla, se mueve
 2.293   5,1%  Deterministic guards
 2.082   4,6%  Delivery & board
 8.-64  17,6%  resto (identidad, voz, gates, idioma, skills…)
```

El segundo bloque más pesado —la escalera de enrutado, casi un cuarto del
prompt— es donde el padre decide **a quién delegar y con qué límites**. No cabe
en ningún paquete por artefacto: es la única cosa que el coordinador tiene que
saber siempre. La apuesta (1) no lo toca, y por eso no basta por sí sola.

---

## // 002. CLASIFICACIÓN DE `SDD Flow` (17.865 bytes)

El detalle que sostiene la tabla de arriba. Cada párrafo, clasificado por a
dónde puede irse.

### Se mueve al paquete de fase — 6.244 bytes (35 % de la sección)

Reglas que solo importan mientras corre **una** fase, y que hoy se pagan en cada
turno de cada sesión aunque esa fase no llegue a ejecutarse:

| Párrafo | Bytes | Destino |
|---|---:|---|
| `sdd-apply` runtime y tamaño de grupo | 1.442 | apply |
| `sdd-apply` ejecuta el plan masticado | 885 | apply |
| Scope Gate y SCOPE PACKET | 796 | scope |
| Reenvío de TDD estricto | 711 | apply |
| Contrato del envelope de fase | 724 | todas (hoy duplicado en los agentes) |
| Apply por grupos, resumible | 515 | apply |
| Plantilla `// PLAN` | 397 | plantilla de artefacto |
| `sdd-verify` — cobertura honesta | 394 | verify |
| Runtime de fases de planificación | 380 | map, tasks |

Sumado al **Subagent Inventory** (4.822 bytes, que es una tabla de datos y no
prosa: nombre, herramientas, cuándo), la apuesta (1) alcanza **11.066 bytes**.

### Lo dice la herramienta, no el prompt — 2.282 bytes

Prosa que **explica lo que un módulo determinista ya calcula**. Es la apuesta
(4) del documento comparativo: el campo `fix` del envelope de diagnóstico.

| Párrafo | Bytes | Quién debería decirlo |
|---|---:|---|
| Qué bloquea y qué solo avisa el gatekeeper | 933 | `ein_sdd_check` en su salida |
| Cómo desbloquear un cierre según `specState` | 694 | `ein_sdd_status`, campo `fix` |
| Una edición post-verify invalida verify | 655 | el router, que ya calcula `verifyStale` |

Es la conversión más limpia de las tres: la regla no desaparece, cambia de sitio
a donde ya vive el cálculo. Y sirve directamente a `// 001`, porque un ejecutor
barato resuelve un bloqueo con una frase accionable sin interpretar prosa.

### Anécdota retirable — ~1.410 bytes en todo el prompt

Siete frases que citan una medición de un incidente pasado: «measured over 230
runs», «once measured 382k tokens», «7-turn apply to delete a blank line», «135
turnos». Justifican reglas que **hoy ya están implementadas de forma
determinista** (el hook que inyecta `acceptance: none`, el enrutado de thinking
por fase). La regla se queda; la justificación histórica pertenece al commit que
la introdujo, no al prompt que se paga cada turno.

Es la palanca más pequeña y la más fácil de sobrestimar. Se documenta el número
para no volver a prometer que aquí hay una poda grande.

### Se queda — 6.022 bytes de la sección

El bucle de enrutado (`status` → delegar una fase → `check`), la corrección de
artefactos como edición del padre, el orden de participantes, la cadena de
respaldo, el preflight perezoso, el gate humano antes de apply y la
clasificación de TDD. Todo esto es **lo que el coordinador hace**, no lo que una
fase debe saber. Mover cualquiera de ellos a un paquete de fase sería esconder
la coordinación dentro del ejecutor: exactamente lo que `// 001` prohíbe.

---

## // 003. CONSECUENCIAS PARA EL PLAN

1. **La apuesta (1) es la palanca mayor, pero no es F3 entera.** Cubre 24 %.
   Prometer que resuelve el prompt sería repetir el error que este spike
   corrige.
2. **La apuesta (4) sube de prioridad.** Con 5 % del prompt y coste bajo, su
   relación valor/esfuerzo es la mejor de las tres, y además es requisito para
   que un ejecutor barato resuelva bloqueos solo.
3. **La retirada de anécdota deja de ser una palanca y pasa a ser higiene.**
   3 % no justifica un trabajo propio; se hace de paso al tocar cada sección.
4. **El techo va primero y ya está puesto** (`tests/prompt-budget.test.ts`,
   45.321 bytes). Sin línea base congelada, «líneas netas retiradas» —la métrica
   de aceptación que pide el documento comparativo— no significa nada.

**Criterio de éxito de la apuesta (1):** el presupuesto del orquestador baja de
45.321 a **≤ 34.500 bytes** sin que el de agentes suba. Si el paquete se
implementa y el prompt no baja, la regla se ha duplicado en vez de moverse, y la
adopción no cuenta como hecha.

---

## // 004. CORRECCIÓN TRAS INTENTAR EJECUTARLO (2026-08-17)

La clasificación de `// 002` daba 6.244 bytes «movibles al paquete de fase». Al
ir a moverlos, la premisa se cayó: **casi todos esos párrafos están dirigidos al
PADRE, no al ejecutor.** «Pasa `maxRuntimeMs: 1800000`», «construye un SCOPE
PACKET», «delega un GRUPO cada vez» son instrucciones de *cómo delegar una
fase*, no de *cómo ejecutarla*. Un ejecutor no puede actuar sobre ellas.

Meterlas en un paquete de fase habría sido esconder la coordinación dentro del
ejecutor — justo lo que `// 001` prohíbe. El paquete de instrucción por fase, en
la forma que describía este spike, **no aplica a este prompt**: lo que un
ejecutor necesita saber ya vive en su `.md` de agente, que se paga por
delegación y no por turno. Ya estaba bien puesto.

La palanca real que quedó al descubierto es distinta y más pequeña:

| Retirado | Bytes | Por qué se pudo |
|---|---:|---|
| `maxRuntimeMs` en 5 sitios | ~1.400 | Un valor que depende del agente y de nada más es una **tabla**, no una decisión. Ahora lo fija `ensurePhaseRuntime`. |
| Esquema del envelope | ~575 | Los SIETE agentes ya lo llevan. Era duplicado. |

Total: **45.321 → 43.597 bytes (−1.724, −3,8 %)**, no los ~11.000 previstos.

Y una retirada que hubo que **deshacer**: el párrafo de reenvío de TDD parecía
redundante —el preflight ya inyecta la postura— pero `readDelegationTddHint`
detecta el modo estricto **buscando la frase `STRICT TDD MODE IS ACTIVE` en el
texto de la tarea**. Sin ella, un apply estricto recibe un cap de turnos que lo
aborta a mitad de ciclo RED/GREEN. Lo cazó la suite. **Parte de esa prosa es
portante a través de marcadores de texto**, y el presupuesto no se puede cumplir
borrando prosa cuya ausencia cambia el comportamiento.

### Segunda corrección: el inventario tampoco se recupera (2026-08-17)

El plan que quedaba apuntaba al **inventario de subagentes generado** (4.822
bytes) como la mayor palanca restante. No lo es, por dos razones que se ven al
intentarlo:

1. **Generarlo no ahorra bytes.** La tabla tiene que seguir en el prompt para
   que el padre pueda enrutar. Componerla desde el frontmatter elimina el
   mantenimiento a mano y la deriva —eso sí es valor— pero el coste por turno es
   idéntico. La alternativa, cargarla bajo demanda, ya está descartada por el
   propio prompt: listar agentes cuesta más que la tabla.
2. **La columna «When» no está en el frontmatter, y es portante.** Contiene
   prohibiciones —`NEVER curl the Linear API`, `NEVER run git/gh delivery
   directly`, `NEVER call subagent list`— que **no están aplicadas en ningún
   sitio del código**. El prompt es su única aplicación. Retirarlas sería el
   mismo fallo que la línea de TDD.

Queda en pie el envelope con `fix`, que sí se recuperó (~900 bytes reales, no
los ~2.282 estimados: la prosa de `Gatekeeper` describe una política de bloqueo
que el padre necesita para rutear, no un remedio).

### Qué significa para el objetivo

El criterio de ≤ 34.500 bytes **no es alcanzable por esta vía**. Lo que queda:

1. ~~Inventario generado~~ — descartado arriba: no ahorra bytes y su columna
   «When» es la única aplicación de tres prohibiciones.
2. **Envelope con `fix`** — hecho. Retiró ~900 bytes reales.
3. **Reescribir la escalera de enrutado** (10.295). No es mover, es redactar más
   corto. Otra clase de trabajo y otro riesgo.

El suelo alcanzable sin (3) es **42.693 bytes**, un 5,8 % por debajo de la línea
base. Bajar de ahí exige reescribir prosa de coordinación, con el riesgo de
tocar reglas portantes que solo se descubren rompiéndolas.

**Lección para las próximas apuestas:** clasificar un párrafo por su tema
(«esto va de apply») y no por su destinatario («¿quién tiene que actuar?») da un
número optimista. La verificación de una reubicación de prosa es intentarla.

---

## // 005. ALCANCE DE LA VERIFICACIÓN

- **Medido**: bytes por sección de `orchestrator.md` (partiendo por `## `);
  bytes por párrafo de `SDD Flow`; frases-anécdota por patrón de medición
  citada. Clasificación de cada párrafo hecha a mano leyendo su contenido.
- **No medido**: el coste real en tokens (los bytes son proxy; la ratio
  bytes/token varía con el contenido); si mover una regla a un paquete de fase
  preserva su efecto —eso solo lo demuestra la implementación—; el peso de los
  bloques equivalentes en `cc-ein/CLAUDE.md`, que es otro compilado.
- Ninguna afirmación se apoya en una ejecución del agente. Es medición estática
  sobre el fichero y lectura de su contenido.
