# Origen e ideas de EIN

> **Material de origen, no un plan.** Este documento conserva la intención
> fundacional en las palabras originales de Samu, más las ideas que aún no han
> entrado en ninguna fase. No define prioridad, estado ni orden de ejecución.
>
> - Los **principios** viven ahora en [`MANIFIESTO.md`](../MANIFIESTO.md).
> - La **priorización y el estado** viven en [`roadmap-features-ein.md`](roadmap-features-ein.md).
>
> Sustituye a `borrador_nuevas_feats_EIN.md` y a `ein_futuras_features.md`,
> fusionados aquí en 2026-08-17.

---

## 01. La intención original (texto sin editar)

Se conserva literal, con su ortografía y su voz, porque es la semilla del
manifiesto y de casi todo lo que vino después.

### feat/launcher-tui

- un launcher que con lanzar /ein sirva para poder arrancar cualquiera de los agentes (claude, pi, y en el futuro mas si meto).
- se abre especifico por proyecto, como si ejecutaras un agente, y debe configurar el el EIN.md, con las opciones en comun entre agentes : el modo solo o team, idioma de commentarios prs commits + idioma propio del agente, hypa, codegraph, engram ...
- esto estaria bien que ya tuviera una parte de configuracion del proyecto donde cambiar estas cosas.
- como esta fuera del agente propio, puede tener una parte donde tenga la opcion de resume de las sesiones anteriores con los agentes. ( estaria genia que tuviera un resumen de lo ultimo que hizo con una frase, para poder identificarlos mejor )
- tener un update advisor, que mire si hay actualizaciones del propio EIN y luego de los agentes ( pi, pi extensions, claude code ... ), y muestre un warning para poder actualizar. que tenga un updater para poder actualizar.
- DUDA: Seguir metiendo las opciones del installer, o igual solo el doctor, y separar el installer de este launcher. Poder acceder desde el launcher al installer ??? Pensando en ockham lo suyo seria un apartado de opciones sistema o algo asi.
- IMPORTANTE : La idea principal es que se pueda lanzar pi o claude code en el proyecto y continuar por donde lo dejo el otro, o incluso en paralelo sin problemas si son tareas totalmente diferentes que no tocan el mismo codigo. Pudiendo alternar entre ellos para los limites de uso, o diferentes opiniones. Por lo que el seguimiento de las tareas con openspec y su lectura tiene que ser muy buena.
	- PLUS :  Estaria genial crear un estandar para los roadmaps, conjunto de feats, proximos pasos .... porque actualmente me doy cuenta que se guardan en docs/nombre-lista-random.md sin ningun tipo de estandar. De hecho si no le dices cual, puede el agente pillar otro anterior incluso. Esto permitiria leer al launcher por donde va y continuarlo con el agente que se quiera. Seria la evolucion del resumiur sesion.

	INVESTIGAR :
	 - compensa todos estos cambios con un lancher solo en la termianl ?? o ya deberia ser una app propia ya, que se ejecuta en cualquier terminal, como un agente / lazyvim ... Vamos hacer un programa de terminal, ya mas currado

- La estetica tiene que ser cuidada, con un buen banner y el lancher estilo lazyvim ( cuando entras, que para buscar archivo le das a la f, para salir a la q ... ) con sus atajos pero tambien el uso de flechas.

#### MVP

1. launcher de los dos agentes
2. resuemen de sesion
3. configuracion global del proyecto
4. updater.

### Dos nuevos agentes

Sacado de estos dos enlaces:

- [Uncle Bob dice que NO lee el código... ¿cómo lo hace? — YouTube](https://www.youtube.com/watch?v=pBANOHIhmFI)
- [unclebob/swarm-forge — GitHub](https://github.com/unclebob/swarm-forge)

#### feat/agente-limpiador

- tiene que gastar los menos tokens posibles. aumenta la calidad del codigo sin aumentar gasto
- usar herramientas deterministas, scripts ... antes de cualquier llamada a agente
- tiene revision DRY y metrica CRAP ( con simplificacion + mas cobertura )
- leer reportes y refactorizar una vez hecha la pasada determinista
- pasada de DRY semantico, por la duplicidad de logica que deterministica no pilla.
- DUDA : en pi, es facil de integrar las herramientas con scripts de typescrip, pero en claude code es tan facil ??
- Este agente ira despues del sdd-apply
- DUDA: Meterlo en el flujo SDD o meterlo como agente propio ein_code_cleaner pudiendo ser activable o desactibable tambien
- Se podria crear un proceso de limpieza de todo el codigo de proyectos antiguos y ya empezados
- Hacer que no revise el mismo codigo mil veces, marcar por donde paso y guardarlo
- Sacar la parte didactica de porque y como mejoro el codigo, de forma que como todo el restoo de explicaciones hasta un crio pudiera entenderlo, y copn ejemplos de codigo si fuera poosible.
	- Que solo lo haga de lo mas importante y raro
	- Registro de aprendizaje por proyecto para no repetirsse ( puede hasta crear una mini-guia )
	- Activable y descativable la parte docente.

#### feat/agente-arquitecto

- seguira el mismoo patron que el agente limpiador, es decir primero herramientas deterministicas y luego los resultados al agente, lo de aparte del sdd, agente propio ein-architect, parte didactica ...
- es importante que mantenga la funcionalidad y nunnca la cambie
- aplicar la logica del clean code : separaciones de logicas( negocio, ui ...)
- dependecy inversion + boundaries + encapsulacion + tesst de propiedades
- direccion(cortar) -> limites(separar) -> encapsulacion (ocultar) -> test(bombardear).

> **IMPORTANTE**
> EIN deberia consumir los menos tokens posibles, siempre tiene que apostar por el uso de menos tokens y sobre todo tokens baratos, que modelos caros manden, baratos hagan.
> Por eso : lo que pueda ser una herramienta determinista que lo sea, si hace falta se construye
> acordarse que es una herrmienta presonal, antes que un producto publico
> lo principal siempre va ser typescript, luego sus frameworks.

---

## 02. Ideas que siguen sin fase asignada

Rescatadas del catálogo formalizado antes de retirarlo. No están en el roadmap
canónico ni en ninguna spec.

### Interfaz y navegación del launcher

- Estética cuidada, con banner reconocible.
- Atajos de teclado inspirados en LazyVim: teclas directas para acciones
  habituales (`f` buscar, `q` salir).
- Navegación con flechas además de los atajos, para no depender solo de la
  memoria muscular.
- Sigue abierto si el alcance cabe en un launcher sencillo o pide una
  aplicación de terminal completa.

### Estándar de documentos de trabajo

La idea del `PLUS` de arriba nunca se implementó: no hay un formato común para
roadmaps, listas de features y próximos pasos, y por eso acaban en
`docs/nombre-aleatorio.md`. Un estándar permitiría al launcher leer por dónde va
el trabajo y continuarlo con el agente que se quiera — la evolución natural del
resumen de sesión.

*(Esta limpieza es precisamente el coste de no haberlo hecho.)*

### Decisiones que siguen abiertas

- Relación exacta entre launcher, instalador y doctor: ¿un solo programa con un
  apartado de sistema, o dos programas que se llaman?
- Cómo se representa y actualiza el estado compartido entre agentes más allá del
  checkpoint de continuidad.
- Límites seguros para ejecutar varios agentes **en paralelo** sobre el mismo
  repo — worktrees aislados, reglas de propiedad, detección de colisión. Hoy el
  sistema solo contempla alternar, no concurrir.
- Si Cleaner y Architect deberían ser obligatorios en algún perfil.
- Si EIN llegará a ser un producto público. Mientras no se decida, gana el uso
  propio.

### Fuentes de referencia

- Roles de SwarmForge, base conceptual de Cleaner y Architect:
  - [`six-pack/cleaner.prompt`](https://github.com/unclebob/swarm-forge/blob/six-pack/swarmforge/roles/cleaner.prompt)
  - [`six-pack/architect.prompt`](https://github.com/unclebob/swarm-forge/blob/six-pack/swarmforge/roles/architect.prompt)
  - [`four-pack/refactorer.prompt`](https://github.com/unclebob/swarm-forge/blob/four-pack/swarmforge/roles/refactorer.prompt)
