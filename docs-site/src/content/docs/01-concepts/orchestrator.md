---
title: "Orquestador"
description: "Quién decide qué en EIN, y por qué el coordinador no escribe el código."
sources: ["ein-pi/agent/assets/orchestrator.md", "runtime/docs/PI_AGENTS_ARQUITECTURA.md"]
verified_rev: "29861f5"
---

Cuando hablas con EIN, hablas con el **orquestador**. Es el que lee tu petición,
decide qué hacer y te lo explica. Lo que no hace es escribir el código.

Eso lo delega en subagentes con una responsabilidad cada uno.

## Por qué no lo hace todo él

Podría. Y sería peor, por dos motivos.

**El contexto se llena.** Un agente que lee el repositorio entero, razona, edita
ficheros y además recuerda la conversación acaba arrastrando cientos de miles de
tokens. Cuanto más lleno está el contexto, peor razona: la señal se diluye entre
ruido que ya no importa.

**Nadie se revisa bien a sí mismo.** Si el mismo agente diseña, implementa y
verifica, la verificación tiende a confirmar lo que acaba de hacer. Separar las
fases hace que la de verificación llegue con el contrato delante y sin haber
escrito el código que juzga.

## Qué conserva y qué delega

| Conserva | Delega |
| :--- | :--- |
| Decidir qué fase toca | Ejecutar esa fase |
| Elegir a quién delegar y con qué contexto | Explorar el repositorio |
| Verificar lo que le devuelven | Escribir código y tests |
| Explicarte lo que ha pasado | La entrega a git |

La regla que más importa: **el orquestador no edita el código fuente**. Si
tuviera que hacerlo, tendría que cargarse el contexto que necesita para
coordinar.

## Delegar bien es acotar

Una delegación útil no es "arregla esto". Es un encargo cerrado: qué hay que
hacer, con qué presupuesto, qué está fuera de alcance y qué devolver.

Cada subagente vuelve con un sobre compacto —qué hizo, dónde lo dejó, qué
riesgos ve— y no con el detalle completo. El detalle vive en su artefacto en
disco; el orquestador lo lee de ahí cuando lo necesita.

Suena burocrático y tiene una razón práctica: si cada fase volcara todo su
trabajo en la conversación del coordinador, la conversación se llenaría sola en
tres fases.

## Y no se fía de lo que le devuelven

Esta es la parte que se nota usándolo. Un subagente puede volver diciendo que
todo pasó, y estar equivocado: un dato inventado, una cita mal atribuida, un
recuento que no cuadra.

El orquestador comprueba lo que es barato de comprobar. Si un informe dice que
un fichero tiene 5000 líneas, `wc -l` lo resuelve en un segundo. Si dice que un
documento afirma algo, `grep` lo confirma o lo desmiente.

:::tip[REGLA PRÁCTICA]
El valor de un subagente está en **dónde mira**, no en lo que concluye. Un
coordinador que acepta conclusiones sin verificar las baratas convierte cada
informe en deuda.
:::

## Tu papel

El orquestador decide el camino técnico, pero hay cosas que no son suyas:

- **Cambiar el alcance.** Si el trabajo resulta ser el doble de grande, te lo
  dice y decides tú.
- **Las acciones irreversibles.** Push, PR, merge, borrar. Se piden.
- **Relajar una regla.** Si un check falla y la salida cómoda es aflojar el
  check, eso se consulta.

## Siguiente

[SDD y OpenSpec](/ein-agent/01-concepts/sdd-openspec/) — las fases y dónde vive
el estado.
