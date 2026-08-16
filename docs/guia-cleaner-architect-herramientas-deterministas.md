# EIN Cleaner, Architect y herramientas deterministas

EIN separa dos tipos de trabajo que suelen mezclarse: calcular hechos verificables e interpretar qué significan. Cleaner y Architect reciben primero evidencia calculada por herramientas deterministas; después usan razonamiento semántico para evaluar mantenibilidad, intención y arquitectura.

Esta guía empieza con un mapa mental suficiente para usar el sistema. Las secciones posteriores explican los contratos, límites y herramientas con profundidad progresiva.

## Mapa mental de una página

### La idea en una frase

**El ordenador calcula los hechos; el modelo interpreta su significado.**

Los tokens de un modelo de lenguaje son costosos y pueden llenarse de ruido. No tiene sentido pedir al modelo que cuente ramas, calcule cobertura, compare hashes o encuentre secuencias exactas si un programa puede hacerlo de forma más barata, repetible y auditable.

```text
petición del usuario
        |
        v
alcance exacto + estado actual del repositorio
        |
        v
herramientas deterministas calculan hechos
        |
        v
modelo inspecciona intención, significado y riesgos
        |
        v
resultado limitado, trazable y honesto
```

### Hecho determinista frente a juicio semántico

Un **hecho determinista** produce el mismo resultado para la misma entrada y una definición fija. Un **juicio semántico** exige comprender intención, contexto o una compensación entre alternativas.

| Pregunta | Tipo | Quién debe resolverla |
|---|---|---|
| ¿Cuántas decisiones tiene esta función según la definición acordada? | Hecho determinista | Colector de complejidad |
| ¿Esta función tiene demasiadas responsabilidades? | Juicio semántico | Cleaner |
| ¿Dos bloques contienen la misma secuencia exacta de tokens? | Hecho determinista | Detector de duplicación estructural |
| ¿Dos implementaciones distintas representan la misma regla de negocio? | Juicio semántico | Cleaner |
| ¿Cambió el archivo desde la auditoría? | Hecho determinista | Identidad Git y digest del archivo |
| ¿La frontera propuesta protege bien la política del dominio? | Juicio semántico | Architect |

El principio **deterministic-first** significa “hechos primero”, no “solo hechos”. El sistema ahorra tokens sin sacrificar calidad semántica: una métrica nunca sustituye la comprensión de nombres, responsabilidades, invariantes o decisiones arquitectónicas.

### Cleaner y Architect

| Aspecto | Cleaner | Architect |
|---|---|---|
| Pregunta principal | “¿Cómo mantenemos mejor este código sin cambiar su comportamiento?” | “¿Cómo están organizadas las responsabilidades y cómo debería evolucionar su estructura?” |
| Modos | Audit e Improve | Audit, Plan y Validate |
| Escritura | Solo una sustitución exacta, acotada y verificada | Nunca escribe en v1 |
| Unidad de atención | Código y mantenibilidad dentro de un alcance | Límites, módulos, dependencias, invariantes y migración |
| Resultado típico | Hallazgos priorizados o una mejora pequeña | Hallazgos, plan vinculado o validación de plan |

**Analogía memorable:** Cleaner es quien revisa y ajusta una habitación sin cambiar el uso del edificio. Architect estudia el plano, las cargas y la relación entre espacios, pero no mueve paredes.

### Activación rápida

Los perfiles controlan la **participación automática en SDD**, no la disponibilidad de los agentes.

| Perfil | Cleaner | Architect | Uso esperado |
|---|---:|---:|---|
| Balanced | on | off | Recomendado: mantenimiento automático con menor coste |
| Thorough | on | on | Revisión de mantenibilidad y arquitectura |
| Manual | off | off | Solo invocaciones explícitas |

El banner muestra `CLEANER auto:on/off` y `ARCH auto:on/off`. `auto:off` no significa “agente inutilizable”: una petición directa sigue funcionando.

```text
/ein:cleaner status
/ein:architect status
/ein:cleaner on
/ein:architect off
/ein:cleaner Audita los archivos cambiados
/ein:architect Valida el plan de separación de src/core
```

La selección del perfil se guarda por proyecto. Los comandos `on` y `off` crean una anulación para la sesión actual y no reescriben el perfil persistido.

### Secuencia SDD

Cuando hay participación automática, los agentes entran después de `sdd-apply` y antes de `sdd-verify`.

| Cleaner | Architect | Secuencia |
|---|---|---|
| off | off | `sdd-apply -> sdd-verify` |
| on | off | `sdd-apply -> ein-cleaner -> sdd-verify` |
| off | on | `sdd-apply -> ein-architect -> sdd-verify` |
| on | on | `sdd-apply -> ein-cleaner -> ein-architect -> sdd-verify` |

## Cómo pedir trabajo

El lenguaje natural es la vía principal. Los controles directos sirven cuando quieres un enrutamiento o estado inequívocos.

### Ejemplos en lenguaje natural

- “Pide a Cleaner que audite los archivos cambiados en esta tarea.”
- “Pide a Cleaner que mejore este módulo sin cambiar su comportamiento.”
- “Pide a Architect que inspeccione los límites bajo `src/core`.”
- “Pide a Architect que prepare un plan de separación para estos módulos.”
- “Pide a Architect que valide este plan contra el código actual.”

### Controles directos

```text
/ein:cleaner <petición>|on|off|status
/ein:architect <petición>|on|off|status
```

Estos controles viven dentro de una sesión Pi; no son comandos de shell. Una petición incluida después del nombre invoca al agente aunque su participación automática esté desactivada.

## Cleaner de principio a fin

Cleaner busca oportunidades de mantenibilidad sin añadir funciones de producto ni rediseñar la arquitectura. Sus dos modos forman un embudo: Audit puede estudiar varios archivos dentro de límites estrictos; Improve solo puede aplicar una sustitución exacta en un archivo auditado.

### Audit: observar antes de opinar

Audit sigue este recorrido:

1. Valida que exista un repositorio Git y un estado completo y actual.
2. Convierte archivos, árboles o archivos cambiados en un alcance canónico.
3. Rechaza rutas restringidas, enlaces simbólicos, ámbitos vacíos o presupuestos excedidos.
4. Captura fuente, tamaño, líneas y SHA-256 por archivo.
5. Ejecuta colectores pasivos de entorno, complejidad y duplicación cuando el lenguaje es compatible.
6. Puede planificar pruebas y cobertura; no ejecuta scripts por sí mismo.
7. Inspecciona semánticamente nombres, responsabilidad, acoplamiento, código muerto, legibilidad y duplicación semántica.
8. Separa hechos medidos, oportunidades inferidas y preguntas sin resolver.
9. Prioriza hallazgos por evidencia, riesgo y valor probable.

El alcance de fuente admite como máximo 32 archivos y 128 KiB en el paquete base de auditoría. Directorios como dependencias, salidas de compilación, cobertura y código generado quedan excluidos. Audit no escribe fuente.

### Improve: una modificación con condiciones estrictas

Improve exige un hallazgo vigente de Audit y una declaración de cambio vinculada a ese hallazgo. La operación admitida es una **sustitución textual exacta**: el fragmento anterior debe aparecer una sola vez y el resultado debe coincidir con el digest esperado.

El flujo tiene tres pasos:

```text
admitir sin escribir
    -> aplicar una sustitución exacta
    -> exigir verificación para completar
```

La admisión comprueba el `stateRef`, el área, los selectores, la evidencia, el archivo objetivo, los digests anterior y posterior y la unicidad del texto a reemplazar. La intención declarada debe ser preservar el comportamiento; el contrato reduce el riesgo, pero la verificación es la que aporta evidencia posterior.

La escritura usa una autoridad única y abre el descriptor sin seguir enlaces simbólicos. Justo antes de truncar y escribir, vuelve a comprobar tipo, tamaño, bytes y digest mediante ese descriptor. Esta protección cierra la carrera en la que una ruta válida pudiera cambiar entre la lectura y la escritura.

Después de escribir, Cleaner registra la transición desde el estado observado al resultante, invalida la auditoría anterior y conserva fuente y digest previos para una recuperación acotada. Un resultado de escritura puede quedar como `mutation-uncertain`; nunca se transforma por optimismo en éxito.

La operación termina en `verification-required`. Solo pasa a `complete` cuando la verificación está presente, aprobada, vigente y vinculada exactamente al estado resultante. Una verificación ausente, fallida, obsoleta o asociada a otro estado impide declarar la mejora completa.

### Qué puede y qué no puede hacer Cleaner

**Puede:**

- auditar archivos o árboles explícitos y el conjunto actual de archivos cambiados;
- medir hechos compatibles y señalar evidencia ausente;
- interpretar mantenibilidad y duplicación semántica;
- priorizar hallazgos;
- proponer una mejora pequeña;
- aplicar una sustitución exacta en un archivo auditado mediante el contrato de escritura;
- conservar evidencia de transición, recuperación y verificación.

**No puede:**

- ampliar el alcance en silencio;
- tratar una métrica como sentencia de calidad;
- ejecutar comandos arbitrarios o scripts de proyecto automáticamente;
- aplicar varias ediciones libres o una refactorización abierta en un solo Improve;
- modificar un archivo no auditado, obsoleto, ambiguo, restringido o enlazado simbólicamente;
- añadir funcionalidad de producto o apropiarse de decisiones arquitectónicas;
- afirmar éxito sin verificación vigente.

## Architect de principio a fin

Architect v1 es estrictamente de solo lectura. Sus modos Audit, Plan y Validate comparten una misma base de evidencia acotada.

### Audit

Architect rechaza un alcance ausente, mal formado, ilimitado o igual a la raíz completa. Después recoge archivos, digests, estado Git, módulos derivados de las rutas y una identidad inmutable de evidencia.

El modelo puede inspeccionar límites de módulo o paquete, dirección de dependencias cuando haya evidencia, acoplamiento entre política y detalles, encapsulación, superficies públicas accidentales, propiedad de responsabilidades e invariantes. Debe separar medición, interpretación, inferencia e incertidumbre.

### Plan

Un plan válido contiene exactamente estos campos:

| Campo | Propósito |
|---|---|
| `proposedBoundaries` | Límites que se propone crear o reforzar |
| `affectedModules` | Módulos dentro del alcance que resultarían afectados |
| `migrationSteps` | Orden de transición |
| `risks` | Riesgos técnicos o de comportamiento |
| `invariants` | Propiedades que deben conservarse |
| `verification` | Comprobaciones previstas |
| `unresolvedDecisions` | Decisiones que aún requieren autoridad o evidencia |
| `propertyTests` | Ideas de pruebas de propiedades, si son útiles |

El enlace del plan incorpora `evidenceId`, `areaId`, `stateRef` y selectores. También rechaza módulos afectados fuera del alcance.

### Validate

Validate vuelve a recoger evidencia actual. Si cualquier identidad relevante cambió, devuelve un rechazo por plan obsoleto. Si sigue vigente, admite el plan para una evaluación semántica de coherencia, orden de migración, invariantes, riesgos, verificación y decisiones abiertas.

La validación no ejecuta la migración. Tampoco edita, reorganiza ni formatea archivos.

### Limitación actual del grafo

El runtime todavía no dispone de un adaptador programático seguro y autoritativo para CodeGraph. Architect marca el grafo como no disponible y entrega listas vacías de aristas y ciclos; no reconstruye ni inventa relaciones.

La presencia de una herramienta de grafo en el entorno general no equivale a tener un contrato programático inyectado en Architect. Hasta que exista ese contrato, una afirmación sobre dirección de dependencias o ciclos debe declararse sin evidencia suficiente.

### Qué puede y qué no puede hacer Architect

**Puede:**

- auditar una selección explícita de archivos o árboles;
- interpretar límites, responsabilidades, encapsulación e invariantes;
- producir un plan con forma estricta y módulos dentro del alcance;
- vincular el plan a evidencia y estado exactos;
- rechazar evidencia o planes obsoletos;
- validar semánticamente un plan vigente sin ejecutarlo.

**No puede:**

- auditar toda la raíz mediante un selector abierto;
- inventar aristas, direcciones o ciclos cuando el grafo no está disponible;
- incluir módulos fuera del alcance;
- validar un plan contra evidencia anterior después de un cambio de fuente;
- escribir código, mover módulos, ejecutar migraciones o modificar la arquitectura.

## Catálogo de herramientas deterministas

Las herramientas siguientes son internas. El lector no necesita invocarlas manualmente para usar Cleaner o Architect, pero entenderlas ayuda a interpretar sus resultados.

### 1. Evidencia acotada de fuente y auditoría

**Qué pregunta responde:** “¿Qué fuente exacta puedo estudiar ahora y a qué estado pertenece?”

**Qué recibe:** Un conjunto de archivos o árboles relativos, o la petición de usar los archivos cambiados.

**Qué calcula:** Alcance canónico, `areaId`, `stateRef`, rama, suciedad del repositorio, archivos, bytes, líneas, SHA-256, fuente y scripts relevantes detectados.

**Qué no hace:** No juzga calidad, no ejecuta pruebas y no escribe.

**Cuándo no está disponible:** Fuera de un repositorio, con estado Git incompleto, alcance vacío o superior a 32 archivos/128 KiB, ruta restringida, enlace simbólico, fuente no UTF-8 o extensión no admitida.

**Cómo ahorra tokens:** Entrega una selección exacta y hechos ya contados; evita que el modelo explore el repositorio completo y recalcule tamaños o identidades.

**Ejemplo:** `{kind: "selectors", selectors: [{kind: "tree", path: "src/core"}]}` produce una fotografía limitada de los archivos compatibles bajo `src/core`.

### 2. Detección de entorno y capacidades

**Qué pregunta responde:** “¿Qué lenguajes, frameworks, gestores y colectores parecen utilizables aquí?”

**Qué recibe:** La raíz del repositorio, presupuestos opcionales y, cuando hace falta, rutas exactas ya admitidas por Audit.

**Qué calcula:** Señales de JavaScript/TypeScript, Bun, Vitest, Vue y Astro; gestor de paquetes; scripts tokenizables; y estados de capacidades para pruebas, LCOV, complejidad y duplicación.

**Qué no hace:** No instala herramientas, no ejecuta scripts y no promete que una mera dependencia garantice una ejecución correcta.

**Cuándo no está disponible:** Cuando faltan señales, el escaneo se trunca, `package.json` es inválido o una orden no puede tokenizarse de forma segura. Los estados distinguen `unavailable`, `unsupported` e `invalid`.

**Cómo ahorra tokens:** Resume señales del proyecto sin pedir al modelo que lea configuraciones, bloqueos y extensiones uno por uno.

**Ejemplo:** Un bloqueo de Bun, archivos `.ts` y un script `bun test` permiten anunciar capacidades Bun y JS/TS, pero no ejecutan ese script.

### 3. Evidencia de pruebas Bun y Vitest

**Qué pregunta responde:** “¿Qué pruebas se ejecutaron, con qué invocación exacta y cuál fue su resultado?”

**Qué recibe:** Entorno vigente, runner, formato, archivos y selectores limitados, ruta de salida aprobada y, al ingerir, artefacto más vínculo pre/post ejecución.

**Qué calcula:** Un `argv` exacto para Bun JUnit o Vitest JSON, identidad de invocación, totales, duración y fallos acotados. Luego valida el artefacto contra formato, ruta, tamaño y estado.

**Qué no hace:** No ejecuta el `argv`, no interpreta una cadena de shell y no acepta comandos arbitrarios. El plan requiere ejecución externa autorizada e ingestión posterior.

**Cuándo no está disponible:** Si falta capacidad demostrada, Vitest local no es verificable, el alcance excede 32 archivos, la salida no está fuera del repositorio o aprobada, falta el vínculo de ejecución, cambia la fuente o el artefacto es inválido.

**Cómo ahorra tokens:** Convierte XML/JSON en totales y fallos compactos, sin enviar informes completos al modelo.

**Ejemplo:** El plan puede producir `bun test src/math.test.ts --reporter=junit ...`; otro actor autorizado lo ejecuta y devuelve el JUnit para ingestión.

### 4. Normalización de cobertura LCOV

**Qué pregunta responde:** “¿Qué líneas, ramas y funciones cubre esta ejecución en la fuente exacta?”

**Qué recibe:** Entorno, plan de cobertura derivado del plan de pruebas, evidencia de pruebas, LCOV y vínculo de estado.

**Qué calcula:** Métricas normalizadas por archivo y totales, registros `DA` por línea, ramas, funciones, digests de fuente y artefacto e identidad de salida.

**Qué no hace:** No ejecuta pruebas, no acepta rutas LCOV inseguras y no presenta el nombre/línea LCOV como identidad AST exacta de función.

**Cuándo no está disponible:** Si las pruebas no están vinculadas, cambia el estado, el LCOV excede presupuestos, contiene registros ambiguos/no soportados o apunta a fuente ausente o con digest distinto.

**Cómo ahorra tokens:** Reduce un LCOV extenso a métricas y registros fiables que otros colectores pueden reutilizar.

**Ejemplo:** 8 líneas ejecutables y 6 alcanzadas se normalizan como `found: 8`, `hit: 6`, `percentage: 75`.

Si las pruebas fallan pero producen LCOV válido, la cobertura queda marcada como `tests-failed-coverage-only`. Es información de cobertura, no prueba de calidad superada.

### 5. Complejidad ciclomática por función

**Qué pregunta responde:** “¿Cuántos caminos de decisión tiene cada función según una definición explícita?”

**Qué recibe:** Evidencia de entorno vigente y archivos JS, TS, JSX, TSX, Vue o Astro admitidos.

**Qué calcula:** Base 1 más `if`, bucles, `case` no predeterminado, `catch`, condicional ternario, `&&`, `||` y `??`. Excluye funciones anidadas del total de su padre, cadenas opcionales y código de nivel superior.

**Qué no hace:** No decide si una complejidad es buena o mala y no aplica umbrales. No analiza expresiones de plantillas Vue/Astro.

**Cuándo no está disponible:** Con fuente mal formada, digest/estado obsoleto, ruta no regular, UTF-8 inválido o presupuesto de archivos, bytes, funciones, nodos AST o tiempo excedido.

**Cómo ahorra tokens:** El parser encuentra límites y cuenta decisiones con precisión; el modelo solo interpreta por qué una función concreta puede ser difícil de mantener.

**Ejemplo:** Una función con un `if`, un `for` y un `&&` tiene complejidad `1 + 3 = 4` según esta definición, sin etiqueta automática de calidad.

En Vue se analizan `script` y `script setup` con lenguajes JS/JSX/TS/TSX. En Astro se analizan el frontmatter inicial y scripts inline seguros; las plantillas quedan fuera.

### 6. CRAP vinculado a estado y tramo exactos

**Qué pregunta responde:** “¿Cómo se combinan la complejidad de una función y la cobertura ejecutable de su tramo exacto?”

**Qué recibe:** Paquetes vigentes e íntegros de complejidad y cobertura con el mismo `stateRef`, ruta y digest de fuente.

**Qué calcula:** `CRAP = complejidad² × (1 - cobertura)³ + complejidad`, usando la fracción de líneas ejecutables LCOV dentro del tramo AST de la función.

**Qué no hace:** No etiqueta resultados como buenos o malos, no fija límites y no fuerza un mapeo dudoso.

**Cuándo no está disponible:** Sin archivo de cobertura, sin líneas `DA`, con función anidada o ambigua, una sola línea de declaración ambigua, digests distintos o alineación de framework no demostrada.

**Cómo ahorra tokens:** Realiza la aritmética y el enlace preciso; el modelo decide después qué riesgo representa en contexto.

**Ejemplo:** Complejidad 4 y cobertura 100 %: `4² × 0³ + 4 = 4`. Con cobertura 50 %: `16 × 0,5³ + 4 = 6`. Con cobertura 0 %: `16 × 1 + 4 = 20`. Son números, no veredictos.

CRAP para Vue y Astro está actualmente no disponible porque la alineación entre offsets del framework, fuente transformada y LCOV no está demostrada mediante mapas de fuente fiables.

### 7. Duplicación estructural exacta por tokens

**Qué pregunta responde:** “¿Dónde se repite una secuencia contigua y exactamente igual de estructura léxica?”

**Qué recibe:** Los mismos archivos admitidos y vinculados al entorno vigente.

**Qué calcula:** Grupos, pares y ocurrencias de secuencias exactas. Conserva la escritura exacta de identificadores y literales, e ignora trivia como espacios o comentarios.

**Qué no hace:** No detecta duplicación semántica: dos algoritmos con nombres o sintaxis distintos pueden expresar la misma idea y no coincidir.

**Cuándo no está disponible:** Con fuente no analizable, estado o digest obsoleto, o presupuestos de archivos, bytes, tokens, ventanas, pares candidatos, grupos o tiempo excedidos.

**Cómo ahorra tokens:** Encuentra repeticiones exactas sin enviar todos los archivos al modelo para comparación cruzada.

**Ejemplo:** Dos bloques de 55 tokens idénticos forman un grupo; dos validaciones conceptualmente iguales con nombres y estructura diferentes requieren inspección semántica.

El mínimo predeterminado de 40 tokens es un límite de precisión y coste, no un umbral de calidad. Actualmente no se necesita una dependencia de `jscpd`; se reconsideraría solo si la aceptación demuestra pérdidas materiales o problemas de rendimiento.

### 8. Extracción compartida de regiones Vue y Astro

**Qué pregunta responde:** “¿Qué fragmentos de un archivo de framework son fuente de script segura para los analizadores JS/TS?”

**Qué recibe:** Ruta y contenido de un archivo plano, `.vue` o `.astro`.

**Qué calcula:** Regiones y offsets para scripts Vue, frontmatter inicial de Astro y scripts inline admitidos. Rellena el resto para conservar posiciones de línea y columna al analizar.

**Qué no hace:** No interpreta plantillas, HTML, estilos ni expresiones embebidas de plantilla.

**Cuándo no está disponible:** Cuando la región, lenguaje o tipo de script no pertenece al subconjunto admitido o no puede extraerse con límites fiables.

**Cómo ahorra tokens:** Complejidad y duplicación comparten una extracción única en lugar de volver a descubrir los bloques por separado.

**Ejemplo:** En un componente Vue, `<script setup lang="ts">` entra al parser TypeScript; el `<template>` no entra.

### 9. Coordinador compacto de evidencia operativa

**Qué pregunta responde:** “¿Cuál es el resumen mínimo que necesita el modelo para razonar sin perder la evidencia completa?”

**Qué recibe:** Evidencia pasiva y, opcionalmente, pruebas, cobertura y CRAP ingeridos.

**Qué calcula:** Un resumen de fuente, stack, capacidades, agregados y hasta 10 elementos principales de complejidad, clones, CRAP y fallos.

**Qué no hace:** No descarta el paquete detallado interno ni incluye fuente cruda en el resumen del modelo.

**Cuándo no está disponible:** Si las piezas no comparten estado o si ni siquiera recortando listas puede respetar el máximo de 16 KiB.

**Cómo ahorra tokens:** Mantiene detalles completos en el canal interno y limita el contexto del modelo a 16 KiB y top 10 por categoría.

**Ejemplo:** El modelo recibe los 10 puntos de complejidad más altos y agregados; la herramienta conserva todas las funciones para trazabilidad.

### 10. Frescura Git e identidades inmutables

**Qué pregunta responde:** “¿Sigue siendo esta evidencia sobre el mismo código?”

**Qué recibe:** HEAD, rama, cambios Git y contenido relevante del árbol de trabajo.

**Qué calcula:** Un `stateRef` SHA-256 del estado Git y digests SHA-256 de archivos, artefactos, invocaciones y paquetes derivados.

**Qué no hace:** No supone que “misma ruta” significa “mismo contenido” ni que una evidencia antigua sigue vigente.

**Cuándo no está disponible:** Cuando Git falla, el estado no puede analizarse por completo, faltan objetos o un archivo relevante no puede leerse.

**Cómo ahorra tokens:** Una identidad compacta permite comprobar igualdad sin volver a comparar todo el contenido dentro del contexto del modelo.

**Ejemplo:** Editar una línea cambia el digest del archivo y el `stateRef`; un plan ligado al valor anterior se rechaza como obsoleto.

### 11. Contratos de mutación y verificación de Cleaner

**Qué pregunta responde:** “¿Puede aplicarse esta sustitución exacta y puede declararse completa?”

**Qué recibe:** Auditoría, hallazgo, declaración de sustitución, estado/digests esperados y, después, evidencia de verificación.

**Qué calcula:** Admisión, bytes resultantes, transición de estado, invalidación de evidencia, recuperación y estado final de verificación.

**Qué no hace:** No acepta edición libre, reemplazo ambiguo, varios archivos, rutas arquitectónicas/restringidas ni éxito sin comprobación.

**Cuándo no está disponible:** Si el hallazgo no está vinculado, cambia una precondición, difieren los digests, el texto aparece cero o varias veces, falla la autoridad de escritura o la verificación no es vigente.

**Cómo ahorra tokens:** Convierte numerosas comprobaciones de seguridad en un resultado estructurado; el modelo no debe reconstruirlas ni debatir si una escritura insegura “parece aceptable”.

**Ejemplo:** Sustituir una función exacta una sola vez puede admitirse; encontrar dos copias iguales devuelve `replacement-ambiguous` y no escribe.

### 12. Coordinador de participantes SDD

**Qué pregunta responde:** “¿Qué participante habilitado debe ejecutarse ahora, sobre qué archivos y antes de qué fase?”

**Qué recibe:** Cambio SDD, sesión, estado actual y sección acotada de archivos cambiados producida por apply.

**Qué calcula:** Identidad de pasaje, generación, orden habilitado, siguiente tarea exacta y estado `ready`, `complete` o `blocked`.

**Qué no hace:** No inventa un alcance, no ejecuta dos veces el mismo participante en curso y no deja pasar `sdd-verify` si falta un participante requerido.

**Cuándo no está disponible:** Antes de completar apply, sin lista válida de archivos, con rutas ausentes/restringidas/no regulares, con estado obsoleto o tras un resultado bloqueado.

**Cómo ahorra tokens:** Reutiliza el alcance de apply, entrega solo el siguiente trabajo y conserva idempotencia dentro del mismo pasaje.

**Ejemplo:** Con ambos agentes activos, devuelve primero Cleaner. Tras su finalización actualiza el estado y entrega a Architect el alcance exacto posterior a Cleaner.

## Seguridad y honestidad de la evidencia

### Estados que no deben confundirse

| Estado | Significado práctico |
|---|---|
| `unavailable` | La capacidad podría existir, pero ahora falta señal, artefacto, vínculo o acceso fiable |
| `stale` | La evidencia fue válida para un estado anterior que ya cambió |
| `unsupported` | El formato, lenguaje o caso queda fuera del contrato implementado |
| `invalid` | La entrada o configuración contradice la forma exigida o no puede confiarse en ella |

El sistema **falla de forma cerrada**: ante duda, no inventa un valor ni amplía permisos. Rechaza la operación o marca la evidencia como ausente.

### Presupuestos y exclusiones

Los colectores limitan archivos, bytes, directorios, scripts, nodos AST, funciones, tokens, candidatos, registros, artefactos y duración. Si alcanzan un límite que impediría un resultado íntegro, fallan o declaran truncamiento; no presentan una muestra como si fuera el universo completo.

Las rutas de dependencias, compilación, cobertura, código generado y otras áreas restringidas quedan fuera. Los enlaces simbólicos se rechazan en fronteras sensibles. Estas reglas reducen coste y evitan que una auditoría aparentemente pequeña atraviese grandes árboles o fuentes no autoritativas.

### Sin umbrales automáticos

Complejidad, CRAP, cobertura y tamaño de clones son medidas. EIN no las convierte por sí solo en “bueno”, “malo” o “debe refactorizarse”. El modelo debe interpretar contexto, riesgo e intención.

### Por qué no se ejecutan comandos arbitrarios

Un script de proyecto puede borrar datos, acceder a red, consumir recursos o encadenar shell. Por eso EIN solo construye un `argv` exacto para combinaciones aceptadas, exige ejecución externa autorizada y después ingiere artefactos vinculados.

Planificar no es ejecutar. Detectar un script tampoco lo autoriza.

### Fuente generada o transformada

Los análisis dependen de que la fuente observada sea la fuente autoritativa y de que posiciones y cobertura se alineen. Código generado, bundles o salida transpilada quedan excluidos por defecto porque pueden duplicar, desplazar o perder la relación con la intención original.

Vue y Astro tienen extracción limitada a regiones de script. Sus expresiones de plantilla no se analizan. CRAP permanece no disponible en estos frameworks mientras la alineación mediante mapas de fuente no esté probada.

## Ejemplos completos

### Ejemplo 1: perfil Balanced y cambio TypeScript mediante SDD

1. El proyecto tiene Balanced: el banner muestra `CLEANER auto:on` y `ARCH auto:off`.
2. `sdd-apply` cambia `src/pricing/calculate.ts` y su prueba.
3. El coordinador lee la lista exacta de archivos de apply y crea un pasaje ligado al `stateRef` actual.
4. Cleaner recoge fuente, entorno, complejidad y duplicación. Si se autoriza la ejecución externa, planifica pruebas Bun o Vitest e ingiere resultados y LCOV.
5. Cleaner realiza la inspección semántica. Puede cerrar con Audit o aplicar un único Improve elegible mediante admisión, escritura y verificación.
6. Si Improve cambia la fuente, el coordinador actualiza el estado del pasaje.
7. Architect se omite porque está en `auto:off`.
8. `sdd-verify` solo continúa cuando Cleaner termina correctamente.

El ahorro no consiste en “pensar menos”, sino en no pedir al modelo que cuente decisiones, normalice LCOV o compare digests.

### Ejemplo 2: Cleaner explícito mientras está desactivado

1. El perfil Manual muestra `CLEANER auto:off`.
2. El usuario escribe `/ein:cleaner Audita src/parser.ts y mejora un hallazgo elegible sin cambiar comportamiento`.
3. La ruta explícita ignora solo la desactivación automática; conserva todos los límites.
4. Audit captura el archivo y produce hallazgos vinculados.
5. Si hay un hallazgo elegible, Improve prepara una sustitución exacta y comprueba que aparece una sola vez.
6. Si otra edición cambia el archivo antes de aplicar, el digest o `stateRef` deja de coincidir y la operación se rechaza.
7. Si escribe, Cleaner conserva recuperación y exige verificación vigente antes de declarar `complete`.

`auto:off` nunca equivale a permiso para saltarse seguridad ni a prohibición de invocación directa.

### Ejemplo 3: plan de Architect que queda obsoleto

1. El usuario pide a Architect auditar `src/core` y preparar una separación de límites.
2. Architect recoge evidencia E1 con `evidenceId`, `areaId`, selectores, digests y `stateRef` S1.
3. El plan queda ligado a E1/S1 y enumera límites, módulos, pasos, riesgos, invariantes y verificación.
4. Antes de Validate, alguien modifica un archivo dentro del alcance.
5. Validate vuelve a recoger evidencia y obtiene E2/S2.
6. Como las identidades no coinciden, devuelve `stale-plan` y no evalúa el plan como vigente.
7. El usuario debe solicitar una auditoría o enlace nuevo contra el código actual.

Architect no “adapta mentalmente” el plan anterior: esa comodidad destruiría la trazabilidad.

### Ejemplo 4: evidencia Vue sin promesas excesivas

1. Cleaner recibe un componente `.vue` con `script setup lang="ts"`.
2. La extracción conserva las posiciones y entrega solo el script al parser.
3. Complejidad y duplicación estructural pueden calcularse para esa región.
4. El template no se analiza y CRAP se marca no disponible si no existe alineación de cobertura demostrada.
5. Cleaner todavía puede inspeccionar semánticamente el componente, pero debe distinguir esa interpretación de las métricas disponibles.

## Malentendidos comunes

### “Determinista” significa “correcto sobre cualquier significado”

No. Significa repetible bajo una definición y unas entradas. Contar `if` es determinista; decidir si el flujo expresa bien una regla de negocio sigue siendo semántico.

### `auto:off` deshabilita el agente por completo

No. Solo elimina su participación automática en SDD. Las peticiones directas continúan disponibles.

### Cleaner puede refactorizar libremente después de auditar

No. El contrato actual permite una sustitución exacta en un archivo auditado, con precondiciones y verificación. Una refactorización amplia necesita descomponerse y no cabe en un único Improve.

### Architect usa CodeGraph porque el repositorio está indexado

No necesariamente. Architect necesita un adaptador programático autoritativo dentro de su runtime, y ese adaptador aún no existe. No se aceptan aristas o ciclos inventados.

### El sistema ejecuta automáticamente el script `test` del proyecto

No. Detecta señales y planifica un `argv` aceptado. La ejecución requiere una autoridad externa y el resultado se ingiere después.

### Un CRAP alto o una complejidad alta obliga a cambiar el código

No. EIN no define etiquetas ni umbrales. La métrica orienta la atención; evidencia, intención y riesgo deciden la acción.

### Duplicación estructural y semántica son lo mismo

No. La estructural exige tokens exactos. La semántica puede existir entre implementaciones sintácticamente diferentes y requiere interpretación.

### Una cobertura producida por pruebas fallidas demuestra calidad

No. Puede aportar datos de líneas ejecutadas, pero queda marcada como cobertura solamente y conserva el resultado fallido de las pruebas.

## Matriz de soporte actual

| Área | Soporte actual | Límite importante |
|---|---|---|
| JS/TS | Admitido en `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx` | Solo fuente válida y acotada |
| Vue | Detección, complejidad y duplicación en `script`/`script setup` | Sin expresiones de template; CRAP no disponible |
| Astro | Detección, complejidad y duplicación en frontmatter inicial/scripts inline seguros | Sin expresiones de template; CRAP no disponible |
| Bun | Plan exacto e ingestión JUnit; cobertura LCOV | No hay ejecución arbitraria o automática |
| Vitest | Plan exacto e ingestión JSON; cobertura LCOV | Ejecutable local y señales deben demostrarse |
| React | Puede funcionar mediante el núcleo JSX/TSX | No tiene aceptación dedicada como framework |
| Node.js | Puede funcionar mediante el núcleo JS/TS | No tiene soporte dedicado aceptado |
| Complejidad | Por función, con definición versionada | Sin umbrales ni nivel superior |
| CRAP | JS/TS con enlace exacto de tramo AST y líneas LCOV | No Vue/Astro mientras el mapeo no sea fiable |
| Duplicación | Secuencias exactas desde 40 tokens | No detecta equivalencia semántica |
| Architect | Audit, enlace de Plan y Validate de solo lectura | Grafo programático no disponible |
| SDD | Orden, alcance, frescura, idempotencia y cuatro combinaciones | Requiere apply completo y lista válida de archivos |
| Aceptación Pi empaquetada | Pendiente | No debe afirmarse como aprobada |

Los pendientes más importantes son el adaptador seguro de CodeGraph para Architect, la aceptación Pi empaquetada y la ampliación de evidencia solo cuando existan escenarios que demuestren necesidad. React y Node.js pueden entrar por sintaxis JS/TS, pero no deben presentarse todavía como integraciones dedicadas.

## Glosario

**AST:** árbol sintáctico abstracto. Representa la estructura del código como nodos, por ejemplo una función, un `if` o un bucle.

**LCOV:** formato textual de cobertura que registra líneas, ramas y funciones alcanzadas.

**CRAP:** métrica que combina complejidad ciclomática y cobertura. EIN la calcula sin convertirla en juicio automático.

**Complejidad ciclomática:** número derivado de caminos de decisión según una definición concreta. En EIN parte de 1 y suma decisiones admitidas.

**Digest o hash:** resumen criptográfico del contenido. Un cambio en los bytes produce, con probabilidad práctica extremadamente alta, una identidad diferente.

**`stateRef`:** identidad inmutable del estado Git relevante, incluyendo HEAD, rama y cambios observados.

**Alcance (`scope`):** conjunto explícito y limitado de archivos o árboles sobre los que una operación tiene autoridad.

**Vinculación de evidencia (`evidence binding`):** relación comprobable entre un resultado, su alcance, sus archivos y el estado exacto del que procede.

**Inmutable:** que no se modifica después de crearse. Si cambia la fuente, se crea evidencia nueva en vez de reescribir la identidad anterior.

**Fallar de forma cerrada (`fail closed`):** rechazar o marcar como no disponible cuando falta certeza, en vez de asumir permiso o validez.

**Duplicación semántica:** repetición de la misma idea o regla aunque el texto y la estructura del código sean distintos.

## Comprobación de aprendizaje

Marca cada afirmación cuando puedas explicarla con tus propias palabras:

- [ ] Puedo distinguir un hecho determinista de un juicio semántico.
- [ ] Entiendo por qué deterministic-first ahorra tokens sin eliminar razonamiento.
- [ ] Sé cuándo usar Cleaner y cuándo usar Architect.
- [ ] Sé que `auto:off` solo afecta a la participación automática SDD.
- [ ] Puedo recitar el orden `apply -> Cleaner -> Architect -> verify` y sus omisiones.
- [ ] Entiendo por qué Audit puede abarcar más que Improve.
- [ ] Sé que Improve solo admite una sustitución exacta vinculada y verificada.
- [ ] Sé por qué un digest o `stateRef` distinto vuelve obsoleta la evidencia.
- [ ] Entiendo que Architect no escribe ni dispone hoy de grafo programático fiable.
- [ ] Sé que los planes de pruebas contienen `argv`, pero no ejecutan scripts.
- [ ] Puedo explicar por qué cobertura con pruebas fallidas es “coverage-only”.
- [ ] Puedo explicar la fórmula CRAP sin llamarla buena o mala.
- [ ] Distingo duplicación estructural exacta de duplicación semántica.
- [ ] Conozco los límites actuales de Vue, Astro, React y Node.js.
- [ ] Sé que la aceptación Pi empaquetada sigue pendiente.

## Resumen final

1. Acota primero el alcance y captura el estado actual.
2. Deja que las herramientas calculen hechos repetibles.
3. Reserva el modelo para significado, intención, prioridad y compensaciones.
4. Rechaza evidencia obsoleta, ambigua o fuera de presupuesto.
5. Usa Cleaner para mantenibilidad y una mejora estrictamente acotada.
6. Usa Architect para límites, planes e invariantes de solo lectura.
7. No confundas planificación de pruebas con ejecución autorizada.
8. No conviertas métricas en umbrales de calidad no acordados.
9. Exige verificación vigente después de cualquier escritura.
10. Declara con honestidad lo que falta: especialmente grafo programático y aceptación empaquetada.

## Cómo convertir esta guía en un artículo

Un artículo puede reducir esta referencia a cinco bloques:

1. Abrir con el coste de pedir a un LLM que calcule hechos que un programa resuelve mejor.
2. Presentar la separación “ordenador calcula, modelo interpreta” con dos ejemplos cotidianos.
3. Introducir Cleaner y Architect mediante la analogía de habitación y plano.
4. Narrar un caso completo de TypeScript y mostrar dónde se ahorran tokens y dónde sigue siendo imprescindible el juicio humano.
5. Cerrar con las limitaciones honestas: sin comandos arbitrarios, sin umbrales automáticos, sin grafo inventado y sin éxito sin verificación.

La pieza debería enlazar después a esta guía para las fórmulas, estados, matriz de soporte y contratos detallados, en lugar de repetirlos íntegramente.
