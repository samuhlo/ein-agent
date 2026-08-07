# Fricciones encontradas usando EIN sobre EIN

Material en crudo para el artículo de lanzamiento. No es documentación pública:
es el registro de lo que se rompió, se quedó corto o mintió mientras EIN
construía su propia documentación.

El brief de documentación pide explícitamente no ocultar los problemas que
aparezcan durante el proceso. Este fichero existe para que no se pierdan entre
conversaciones.

**Origen:** cambio SDD `docs-content-inventory`, primera mitad de la
documentación pública. Rama `feat/docs-site`, base `0ae709d`. Fecha: 2026-08-07.

---

## F1 — Un salto de línea bloqueó una fase entera

**Qué pasó.** `sdd-scope` terminó su fase correctamente y declaró que el cambio
no altera comportamiento observable, con una razón honesta. El guardrail
determinista lo rechazó y bloqueó la fase `map`.

**Evidencia.** El parser en `ein-pi/agent/lib/sdd-guardrails.ts:447` exige las
tres líneas contiguas:

```
/^## Spec delta declaration\nspec_delta: none\nspec_delta_reason: ([^\n]*)$/gm
```

Lo que escribió el agente:

```markdown
## Spec delta declaration

spec_delta: none
spec_delta_reason: El cambio produce contenido de documentación estática...
```

Una línea en blanco entre el encabezado y la primera clave. Cualquier
formateador de markdown la habría puesto igual.

**Qué devolvió el sistema.**

```
ERROR [spec-delta-unresolved]: El cambio OpenSpec requiere exactamente un
delta válido o una declaración spec_delta: none válida.
```

**Por qué importa.** El mensaje dice que falta una declaración válida. La
declaración estaba, era correcta y era honesta: lo que fallaba era el
espaciado. Un desarrollador leyendo ese error busca el contenido que falta, no
el salto de línea que sobra.

Hay dos lecturas y las dos son interesantes para el artículo. La primera es que
un contrato determinista que depende de que un modelo no inserte un salto de
línea natural está mal diseñado: o el parser tolera espacios en blanco, o el
mensaje nombra la causa real. La segunda es más incómoda — el contrato del
agente **sí decía** "three consecutive lines", literalmente. El modelo lo leyó
y aun así escribió markdown con el espaciado que le salía natural. Poner la
regla en el prompt no basta cuando choca con un hábito de formato más fuerte.

**Coste real.** Una fase bloqueada, una inspección del parser y una edición de
un carácter.

### Reincidencia, y la parte incómoda

Al arrancar el segundo cambio (`docs-content-reference`) se avisó explícitamente
en la delegación, en mayúsculas y con la causa nombrada:

> El parser exige las tres líneas EXACTAMENTE consecutivas, sin línea en blanco
> entre `## Spec delta declaration` y `spec_delta: none`: en SLICE 1 eso bloqueó
> una fase entera.

El agente **volvió a fallar el mismo check**, pero de otra forma: en lugar de
escribir el bloque con un salto de línea de más, no escribió el bloque en
absoluto. Lo parafraseó en prosa dentro de otra sección:

```markdown
## Canonical spec context

`spec_delta: none` — ningún cambio de comportamiento. Las páginas son
esqueletos declarativos sin prosa.
```

Semánticamente correcto. Sintácticamente invisible para el parser.

Esto es lo que hace la fricción interesante para el artículo: el aviso no
eliminó el fallo, **cambió su forma**. Advertir sobre el espaciado hizo que el
agente evitara el espaciado evitando el bloque. Cuando un contrato depende de
una forma literal exacta y el modelo entiende la intención pero no la trata
como literal, más instrucciones producen más variantes del mismo error, no
menos errores.

La conclusión práctica es que este check no se arregla con prompt. Se arregla
en el parser: tolerar espacios en blanco, o aceptar la declaración en cualquier
sección y no solo bajo un encabezado exacto.

---

## F2 — `strict_tdd: true` sobre un cambio que no tiene nada que testear

**Qué pasó.** `openspec/config.yaml` declara `strict_tdd: true` para todo el
proyecto. Este cambio produce markdown: diez páginas en estado esqueleto. No
hay unidad ejecutable que pueda fallar primero, así que no hay ciclo RED/GREEN
posible.

**Evidencia.** El mismo fichero que exige TDD estricto registra que no hay con
qué hacerlo:

```yaml
strict_tdd: true
rules:
  apply:
    test_command: ""
  verify:
    test_command: ""
context: |
  No reliable test runner was detected; verify testing manually before
  enabling strict TDD.
```

**Cómo se resolvió.** La fase de diseño lo declaró explícitamente no
satisfacible en vez de fingir ciclos, y definió un sustituto: 19 criterios
comprobables por `find`, `grep` y `test`, ejecutados sobre el árbol vacío antes
de escribir (fallan) y de nuevo tras cada lote (pasan). La fase de aplicación
registró `tdd: not-applicable` con la causa concreta.

Y una regla que resultó ser la parte importante: ni diseño, ni aplicación, ni
verificación pueden tocar `openspec/config.yaml`. Si el gate rechaza la
declaración, se devuelve `blocked` y decide una persona.

**Por qué importa.** Es el caso donde un harness disciplinado se vuelve contra
sí mismo. La salida honesta para un agente que no puede satisfacer una regla es
decirlo; la salida cómoda es fabricar evidencia que la cumpla de forma
aparente. La segunda es indistinguible de la primera en un informe, y es la que
un sistema mal diseñado incentiva.

La pregunta abierta para el artículo: `strict_tdd` es global, pero la
testabilidad es una propiedad del cambio, no del proyecto. Un cambio de
documentación, uno de configuración y uno de lógica de negocio no admiten la
misma evidencia.

---

## F3 — Un guard que cuenta lo que se menciona, no lo que se escribe

**Qué pasó.** La fase de tareas produjo seis lotes. El guard emitió siete
avisos de `oversized-group` diciendo que cada grupo toca entre 6 y 11 ficheros
de producción, sobre un umbral de 4.

**Evidencia.** Lo que los grupos declaran escribir:

```
Lote 1 → 3 ficheros    Lote 4 → 2 ficheros
Lote 2 → 2 ficheros    Lote 5 → 2 ficheros
Lote 3 → 1 fichero     Lote 6 → 1 fichero
```

Ninguno supera el umbral. El guard no cuenta ficheros escritos: cuenta rutas
mencionadas. Cada tarea nombra su fichero dos veces —en la cabecera y en el
comando de verificación— y además cita las fuentes de las que extrae contenido.

**Por qué importa.** En un cambio de documentación, citar fuentes **es el
contrato**: cada página declara de dónde sale lo que dice. El guard lee esa
trazabilidad como superficie de escritura y penaliza justo la práctica que el
cambio existe para imponer.

El propio mensaje delata la causa:

> bajo TDD estricto cada fichero son muchos ciclos RED/GREEN → el apply se va
> de turnos

La heurística asume TDD. Este cambio ya había declarado que TDD no aplica. El
guard no tiene forma de saberlo: razona sobre un modelo de trabajo que este
cambio no sigue.

**Nota de honestidad.** No se comprobó si el guard cuenta rutas únicas o
apariciones, ni se leyó su implementación. La conclusión de que cuenta
menciones y no escrituras es una inferencia sólida a partir de la diferencia
entre lo declarado y lo reportado, no una lectura del código.

### Confirmación en el segundo cambio

En SLICE 2 se instruyó explícitamente al ejecutor de tareas para que usara **una
sola forma canónica de ruta por fichero**, precisamente para no duplicar el
conteo. Los avisos bajaron de siete a cinco, pero no desaparecieron. Y uno de
ellos cierra el diagnóstico:

```
WARNING [oversized-group]: Grupo "Notas de arquitectura" toca 11 ficheros de
producción (> 4)
```

«Notas de arquitectura» **no es un grupo de tareas**: es una sección de prosa al
final del fichero que menciona las once páginas para explicar cómo encajan.

Así que el guard no solo confunde fuentes citadas con ficheros escritos: no
distingue entre una unidad ejecutable y un párrafo. Cuenta rutas en cualquier
sección del artefacto y las atribuye a un «grupo» que en algunos casos no
existe como tal.

Esto lo mueve de categoría. No es una heurística mal calibrada a la que le
sobra un umbral: es un contador que no entiende la estructura del documento
sobre el que opina.

---

## F4 — Un agente dedujo que fases ya ejecutadas no existían

**Qué pasó.** La fase de cierre buscó los artefactos del cambio en
`/home/samuhlo/Documentos/01_Code/ein-agent/`, el directorio principal del
repositorio. El trabajo vivía en un worktree aislado. Allí solo encontró un
`scope.md` obsoleto de una ejecución anterior, y concluyó que las fases de
diseño, aplicación y verificación **no se habían ejecutado**.

**Evidencia.** Devolvió `blocked_by: missing-phase-artifacts (design,
apply-progress, verify-report)` y una recomendación explícita:

> El coordinador padre debe completar las fases `sdd-design`, `sdd-apply` y
> `sdd-verify` antes de invocar `sdd-close`.

Las tres estaban completas y verificadas, con `status: pass` y 19/19 criterios,
en la ruta del worktree.

**Por qué importa, y por qué es la peor de las cinco.** Las otras cuatro son
contratos rígidos o heurísticas mal calibradas: molestas, pero visibles. Esta
produce un informe **coherente y falso**. El diagnóstico era plausible, la
causa nombrada era verosímil y la recomendación era accionable. Todo estaba
mal.

Aceptar ese informe habría significado relanzar tres fases sobre el directorio
equivocado, sobrescribiendo trabajo verificado. La única defensa fue un `ls` de
cinco segundos.

**Lo que no se determinó.** Las fases de mapeo, diseño, tareas, aplicación y
verificación escribieron en el worktree sin problema; solo esta resolvió contra
el directorio principal. No se investigó por qué difiere. El arreglo aplicado
fue pasar rutas absolutas explícitas en la delegación, que funcionó, pero es un
parche sobre el síntoma.

---

## F5 — Una restricción global que prohíbe justo el artefacto obligatorio

**Qué pasó.** Relanzada con rutas absolutas, la fase de cierre encontró todo
correctamente, leyó los artefactos, confirmó el resultado y entonces no pudo
escribir su salida.

**Evidencia.** El agente reportó el conflicto entre dos reglas:

1. Su contrato SDD: *"Your primary output: `summary.md` — Write
   `openspec/changes/{change}/summary.md`"*.
2. Una restricción global del harness: *"Do NOT Write report/summary/findings/
   analysis .md files. Return findings directly as your final assistant
   message."*

El `summary.md` de un cambio SDD es un artefacto de fase — entrada para la
orquestación y registro canónico del cambio — no un informe para el usuario.
La restricción global no distingue entre ambos: filtra por nombre.

**Cómo se resolvió.** El agente devolvió el contenido completo en su envelope y
el coordinador lo persistió. Funciona, pero invierte la propiedad del
artefacto: lo escribe quien no lo redactó.

**Por qué importa.** Es un choque entre dos capas de configuración que por
separado son razonables. La restricción global existe para evitar que los
agentes ensucien el repositorio con informes; el contrato SDD existe para que
el estado del cambio viva en disco y no en la conversación. Ninguna de las dos
sabe de la otra.

Para el artículo es el ejemplo más limpio de un problema que no es de modelos:
es de composición de reglas. Cuantas más capas de política tiene un harness,
más probable es que dos correctas produzcan una imposible.

---

## F6 — Un presupuesto ambiguo que habría estrangulado toda la cadena

**Qué pasó.** El paquete de scope del segundo cambio declaró el presupuesto de
**su propia fase** en lugar del presupuesto del cambio completo, y dejó el total
real en comentarios.

**Evidencia.** Lo que escribió:

```
budget_allocated:
  max_tokens: 12000       # esta fase (scope)
  max_reads: 20           # lectura de fuentes y specs
  max_runtime_ms: 300000  # 5 minutos

# Presupuesto total estimado para las 7 fases del cambio:
# ~95000 tokens distribuidos (scope 12k, map 15k, design 18k, tasks 10k, ...)
```

El paquete de scope es el presupuesto que **la cadena propaga entre fases**: el
contrato del ejecutor lo dice literalmente. Con 12000 ahí dentro, la fase de
mapeo habría arrancado con una octava parte de lo que necesitaba, y las
siguientes peor. El número correcto estaba escrito en el fichero, pero en un
comentario, donde nadie lo lee.

**El segundo defecto, más pequeño.** El router mostró el valor así:

```
budget: allocated=max_tokens: 12000       # esta fase (scope)
```

El comentario en línea viajó dentro del valor. El parser no los recorta, así
que un `12000 # esta fase` se propaga como si fuera el número.

**Por qué importa.** La ambigüedad es real y es de diseño: `budget_allocated`
no dice en su nombre si es de fase o de cambio, y las dos lecturas son
razonables para alguien que acaba de terminar una fase. En SLICE 1 el mismo
campo se rellenó con el presupuesto del cambio y la cadena funcionó; en SLICE 2
se rellenó con el de la fase. Mismo contrato, dos interpretaciones opuestas, y
ninguna validación que distinga cuál es.

Un campo que puede interpretarse de dos formas incompatibles, sin validación
que las separe, acaba interpretado de las dos formas. Es cuestión de tiempo.

---

## Material adyacente: informes de subagente que no cuadraban

No son fricciones del harness, pero pertenecen a la misma categoría de material
honesto y son útiles para el artículo. Los dos se detectaron verificando a mano
en lugar de aceptar el informe.

**El tamaño inventado.** La fase de mapeo informó de un artefacto de "5200+
líneas". El fichero tenía 513. El contenido era correcto; la cifra del informe,
inventada. Un dato así no cambia el resultado, pero cambia cuánto puedes fiarte
del resto del mismo informe — y por eso se verificaron sus tres hallazgos a
mano.

**El conflicto mal atribuido.** El mismo mapeo reportó un desacuerdo entre dos
ficheros sobre el número de fases del ciclo SDD. Al comprobarlo, el desacuerdo
no era entre ficheros: era `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md`
contradiciéndose consigo mismo en líneas contiguas.

```
72:  SDD es la forma seria de trabajar. Son 5 fases, cada una hecha por un
     ayudante distinto:
75:  scope → map → design → tasks → apply → verify → close
```

Cuenta cinco y enumera siete. El agente encontró el problema real y lo explicó
mal. Sin él nadie habría mirado ahí; con él, y sin verificar, la documentación
nueva habría heredado una atribución falsa.

La conclusión que sirve para el artículo: el valor del subagente estuvo en
dónde miró, no en lo que concluyó. Un orquestador que acepta conclusiones sin
verificar las que son baratas de comprobar convierte cada informe en deuda.

---

## Defectos de documentación encontrados de paso

Estos tres viven en `openspec/changes/docs-content-inventory/gap-inventory.md`
con su evidencia completa. Se listan aquí solo como referencia cruzada; no se
corrigieron en ese cambio por estar fuera de su alcance.

| id | dónde | qué |
|----|-------|-----|
| D1 | `README.md:121` | declara `EIN v0.40.0` como última release; `installer/package.json` dice `0.42.0` |
| D2 | `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md:9,11` | presenta Pi como único runtime, cuando Claude Code está soportado igual |
| D3 | `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md:72,75` | se contradice a sí mismo sobre el número de fases |

D1 tiene una respuesta estructural ya incorporada al contrato de la
documentación nueva: ninguna página puede fijar un literal de versión, y donde
haga falta referirse a la release vigente se enlaza a `releases/latest`. Si
ninguna página puede escribir un número, ninguna página puede quedarse
desfasada.
