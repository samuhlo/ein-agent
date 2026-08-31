# Manifiesto Ein

Este documento existe para no perder el norte. No describe lo que Ein es hoy:
describe lo que Ein **tiene que ser**. Cuando una decisión de producto choque
con este documento, gana este documento. Cuando este documento choque con la
realidad medida, se corrige este documento — nunca se ignora.

Autoridad: por encima de `docs/roadmap.md` (que ordena el trabajo)
y de cualquier plan, spike o artefacto SDD (que registran evidencia).

---

## // 000. QUÉ ES EIN

Un arnés de agente de programación para **una persona**: Samu. Convierte trabajo
ambiguo en cambios pequeños, verificados y explicados, con el estado del cambio
en disco y no en la conversación.

No es un producto para todo el mundo. Es una herramienta propia que debe poder
enseñarse con orgullo. Cuando el uso propio y la ambición de producto chocan,
gana el uso propio.

---

## // 001. EL PRINCIPIO ECONÓMICO

**El modelo caro decide el mapa. Los modelos baratos recorren rutas cortas y
acotadas.**

Es el principio fundacional, no una optimización. De él se derivan casi todas
las demás reglas.

- **Acotar, pensar, diseñar y descomponer** — orquestador, `scope`, `sdd-design`,
  `tasks` — es trabajo de modelo capaz con razonamiento alto. Es donde se decide
  si el cambio es correcto y se deja la ruta suficientemente masticada.
- **Recorrer la ruta, ejecutar, verificar y entregar** — `map`, `apply`,
  `verify`, `close`, `git`, `linear`, `scout` — es trabajo mecánico. Va a modelos
  baratos, o a modelos capaces con razonamiento bajo cuando abaratar el modelo
  saldría más caro.
- **El coste se controla con el nivel de razonamiento antes que con el precio
  del modelo.** Un modelo barato que da 135 turnos de prueba y error no ahorra:
  arruina. La regla operativa es *thinking bajo sobre plan masticado*, no
  *modelo barato sobre plan vago*.
- **Si un ejecutor necesita pensar para hacer su trabajo, el fallo está en la
  fase anterior.** La corrección es afinar el plan, no subirle el razonamiento
  al ejecutor.
- **El contexto del padre es el recurso escaso.** Cada byte que imprime un
  comando se queda ahí para toda la sesión. Investigar es trabajo de `ein-scout`
  con contexto fresco, no del padre.

**Horizonte declarado:** las fases mecánicas deben poder ejecutarse en un modelo
local especializado. Eso solo es posible si los contratos de fase siguen siendo
pequeños, cerrados y verificables por herramienta. Ninguna fase mecánica puede
depender de conocimiento general del mundo.

---

## // 002. DETERMINISTA PRIMERO, AGENTE CUANDO HACE FALTA

**Todo hecho computable se calcula. Solo se gasta modelo en interpretarlo.**

El estado de fase, la validez de un artefacto, el tamaño de un PR, el impacto
de un cambio, la frescura de una evidencia, los permisos de una acción
destructiva: son cálculos, no opiniones. Una herramienta los produce y el
resultado es idéntico en Pi, en Claude y dentro de un año.

Reglas que se derivan:

- El enrutado del flujo lo decide una herramienta determinista, nunca el
  recuerdo del modelo de dónde estaba.
- Un guardarraíl que puede ser código no puede ser un párrafo de prompt. Un
  párrafo de prompt es una sugerencia; el código es una garantía.
- **Fail-closed:** la incertidumbre nunca se convierte en un estado bueno. Un
  probe que falla, expira o llega obsoleto se representa como desconocido,
  jamás como correcto.
- **La evidencia lleva procedencia.** Un dato sabe de dónde salió, para que el
  consumidor distinga un hecho de una suposición.
- Un determinismo débil se reporta como evidencia incompleta. Nunca se asciende
  una heurística floja a conclusión para ahorrar tokens.

El agente entra donde hay significado, intención o compromiso arquitectónico.
Ahí el determinismo no llega y fingir que llega es peor que no tenerlo.

---

## // 003. DOS RUNTIMES, UNA DISCIPLINA

**Pi es el producto principal.** Tiene todas las herramientas, define el
comportamiento primero y es la referencia de cualquier contrato.

**Claude es el relevo.** No es un clon ni un segundo producto. Existe por dos
razones, en este orden:

1. **Continuar trabajo de Pi** cuando Pi se agota — límites semanales, cuota,
   caída de proveedor.
2. Ahorrar tokens en trabajo que encaja mejor en su runtime.

Y la simetría es obligatoria: **Pi tiene que poder continuar trabajo de
Claude.** La continuidad es bidireccional o no es continuidad, es una salida de
emergencia de un solo sentido.

Consecuencias:

- **Un solo cerebro, muchos cuerpos.** La lógica vive una vez, en TypeScript
  puro compartido. Los adaptadores son superficie: traducen, no reimplementan.
- **La paridad es funcional, no textual.** Traducir el nombre de un fichero de
  Pi a un nombre de Claude sin que exista el fichero ni el código que lo lea no
  es paridad: es una mentira que pasa los tests. Todo lo que un adaptador
  promete tiene que existir y ejecutarse en ese runtime.
- **El puente es el disco, no la conversación.** No se copian transcripciones ni
  se finge razonamiento compartido. Se derivan hechos del proyecto, se guarda un
  checkpoint acotado y el destino relee el proyecto antes de actuar.
- **Aislamiento primero.** `pi` y `claude` vanilla no se tocan. Ein entra por
  superficies explícitas y hogares propios.
- Un tercer runtime no autoriza una capa de proveedores. La abstracción se
  extrae de duplicación demostrada, nunca antes.

---

## // 004. ARNESES SÍ, BUROCRACIA NO

Esta es la regla que más se ha incumplido y la que más caro sale.

**Un arnés existe para impedir que el trabajo salga mal. Si impide que el
trabajo salga, no es un arnés: es burocracia.**

Contrato de bloqueo:

- **Bloquea solo lo que tiene un consumidor mecánico aguas abajo.** Si algo
  rompe el enrutado, la ejecución o una garantía de seguridad, bloquea. Si solo
  ofende a un linter de prosa, es un aviso.
- **Un defecto de forma se arregla, no se procesa.** Una coma, una línea en
  blanco, un encabezado ausente en un documento del propio arnés se corrigen con
  una edición y se sigue. Nunca generan una tarea, una fase, ni una delegación.
- **El arnés no se audita a sí mismo.** Ningún ciclo puede consistir en que el
  sistema reescriba sus propios documentos para satisfacer sus propias reglas.
- **Un guardarraíl nace con su condición de retirada.** Se añade contra un fallo
  concreto y medido, y se documenta qué evidencia lo haría innecesario. Un
  guardarraíl sin fecha de caducidad es deuda permanente.
- **La cicatriz no es doctrina.** Cada incidente tienta con añadir un párrafo al
  prompt. El prompt es contexto pagado en cada turno de cada sesión. Antes de
  escribir el párrafo: ¿esto puede ser código? Si puede, es código. Si no puede,
  ¿sustituye a un párrafo existente en vez de acumularse?
- **Presupuesto de prompt.** El prompt del orquestador es la mayor factura fija
  del sistema. Crece solo si algo sale a cambio.
- **Parte de la prosa es portante.** Antes de retirar un párrafo, comprobar que
  ningún código depende de él. Hay reglas que el runtime detecta buscando una
  frase literal en el texto: borrarlas no quita una norma, rompe un mecanismo.
  Un presupuesto no se cumple borrando prosa cuya ausencia cambia el
  comportamiento.
- **Una reubicación se verifica intentándola.** Clasificar un párrafo por su
  tema («esto va de la fase X») en vez de por su destinatario («¿quién tiene que
  actuar con esto?») da siempre un número optimista. La estimación sobre el
  papel no cuenta como evidencia.

Señal de alarma: si el sistema pasa más tiempo resolviendo sus normas que
programando, el arnés está roto. Da igual lo bien argumentada que esté cada
norma por separado.

---

## // 005. TAMAÑO Y REVISIÓN

El trabajo se corta para que **una persona pueda revisarlo**.

- Un cambio = un comportamiento observable, con sus tests, su evidencia y su
  frontera de reversión.
- El límite de revisión gobierna la entrega. Cuando se supera, se decide
  partirlo — y esa decisión es del humano, no del agente.
- El menor cambio correcto gana. Comportamiento explícito sobre magia oculta.
  Tres líneas parecidas son mejores que una abstracción equivocada.
- El estado del cambio vive en disco. Reabrir una sesión no debe costar
  reconstruir nada.

---

## // 006. INTERFAZ

La interfaz importa. No como adorno: como parte del producto.

- **Útil antes que bonita, pero bonita.** Cada elemento en pantalla responde a
  una pregunta que el usuario tiene en ese momento.
- **Intuitiva sin manual.** El estado del proyecto, del cambio y del runtime se
  leen de un vistazo.
- **Honesta.** La interfaz nunca muestra como verdad lo que no ha comprobado.
  Un estado desconocido se dibuja como desconocido.
- **Presentable.** El listón es poder enseñarla sin pedir disculpas.
- Coherente entre superficies: launcher, instalador y sesión son el mismo
  producto.

---

## // 007. VOZ

- Español por defecto. Directo, sin relleno corporativo, sin emojis.
- **Se enseña en proporción al cambio.** Lo trivial se despacha. Lo importante
  se explica: qué hace, por qué, cómo funciona por dentro, qué se decidió y qué
  riesgo queda.
- **Se empieza en lenguaje humano.** El objetivo, el impacto y el motivo se
  entienden sin saber programar. El término técnico llega después de la idea
  llana y se define en una frase la primera vez.
- Nunca se infantiliza al lector ni se pierde corrección técnica.
- **Nunca se afirma lo que no se ha comprobado en esta sesión.** Un test que no
  se ha ejecutado no está verde. Una fase que no se ha corrido no está hecha.
- Sin atribución de IA en el historial del proyecto.

---

## // 008. NO OBJETIVOS

Ein **no** va a ser:

- Un producto genérico para cualquier equipo.
- Una plataforma de capacidades ni un registro de proveedores.
- Un segundo motor por runtime.
- Un sistema que exija seguir su ceremonia para hacer un cambio de una línea.
- Una capa que dependa de un agente para algo que una función puede calcular.
- Un catálogo de documentos que nadie mantiene ni lee.

---

## // 009. CÓMO SABER QUE NOS HEMOS DESVIADO

Señales concretas. Cualquiera de ellas abre una revisión de rumbo:

1. El modelo caro escribe código de aplicación.
2. Un ciclo de trabajo termina reescribiendo artefactos del propio arnés.
3. El prompt del orquestador crece sin que se retire nada equivalente.
4. Una regla nueva es prosa cuando podía ser una herramienta.
5. Un adaptador promete una ruta o un fichero que no existe en ese runtime.
6. Un trabajo empezado en Pi no puede continuarse en Claude, o al revés.
7. Un documento del repo contradice a otro y ninguno se retira.
8. Una fase mecánica necesita razonamiento alto para completarse.
9. Una pantalla muestra como verdad algo que no ha verificado.
10. La respuesta a un problema es una norma nueva antes que un experimento.
