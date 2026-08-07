# Roadmap canónico de features de EIN

> **Este documento es la hoja de ruta canónica de priorización y ejecución de EIN.**
> `docs/ein_futuras_features.md` sigue siendo el catálogo detallado de ideas; no se
> sustituye ni se reescribe aquí. `docs/borrador_nuevas_feats_EIN.md` también se
> conserva como material de propuesta. Este documento ordena el trabajo aceptado
> y lo divide en cambios SDD independientes.

## 1. Decisión de beta

La promesa de beta incluye un **launcher mínimo**. Será una CLI/workbench separada,
no una ampliación de la TUI del instalador.

Antes de beta, el trabajo debe recorrer este camino:

1. reconciliar la verdad actual de beta con la evidencia obsoleta del roadmap;
2. definir el contrato compartido de estado de proyecto;
3. añadir adaptadores de sesión para Pi y Claude;
4. construir el launcher mínimo;
5. endurecer el flujo con E2E.

El primer SDD recomendado es **A — `beta-truth-and-exit-criteria`**. Va antes de
implementar el launcher porque fija qué significa estar en beta, qué evidencia es
válida y qué queda explícitamente fuera. Sin esa reconciliación, el launcher podría
presentar estados o criterios de salida basados en documentación antigua.

## 2. Alcance del launcher mínimo

El launcher debe permitir, para el proyecto y runtime seleccionados:

- seleccionar un proyecto;
- seleccionar Pi o Claude;
- mostrar la fase activa de OpenSpec y el siguiente paso;
- listar, crear y reanudar sesiones del runtime seleccionado;
- lanzar el runtime;
- ofrecer acceso compacto a doctor.

El launcher **orquesta** estas operaciones, pero no es dueño de la lógica de
instalación ni de actualización. Esa responsabilidad sigue en las superficies
correspondientes del instalador.

### Fuera de beta

No forman parte de la promesa de beta:

- updater universal o avanzado;
- dashboard completo o TUI de navegación general;
- escritores paralelos;
- mutaciones del cleaner;
- mutaciones del architect.

## 3. Arquitectura interna y continuidad

Las fuentes tienen responsabilidades distintas:

- **OpenSpec** es la autoridad del trabajo activo: cambio, fase y siguiente paso.
- **EIN.md** es el contexto estable del proyecto.
- **Git** representa el estado exacto del código.
- **Las sesiones de runtime** permanecen privadas dentro de Pi o Claude.

Un **proyector determinista de estado de proyecto** normaliza estas fuentes en una
representación compartida. Los adaptadores de Pi y Claude exponen una superficie
común para **listar, crear, reanudar y lanzar** sesiones, sin convertir el launcher
en propietario de los datos internos de cada runtime.

La continuidad entre runtimes transfiere el **estado de proyecto** normalizado
(proyecto, fase, siguiente paso, estado Git y señales de frescura), no el historial
privado de conversación. Cambiar de runtime no debe fingir que una conversación
privada fue migrada.

La verificación está ligada al estado exacto que se verificó. Si una sesión cambia
el estado relevante del código, la evidencia previa debe marcarse como inválida o
obsoleta hasta volver a verificar; no se hereda automáticamente por reanudar o
cambiar de runtime. El proyector debe hacer visible esa frescura para que el
launcher no presente evidencia antigua como actual.

```text
                    ┌──────────────────────┐
                    │ OpenSpec: trabajo    │
                    │ activo y siguiente   │
                    │ paso                 │
                    └──────────┬───────────┘
                               │
┌──────────────────┐           │           ┌──────────────────────┐
│ EIN.md: contexto │───────────┼──────────▶│ Proyector determinista│
│ estable          │           │           │ de estado de proyecto │
└──────────────────┘           │           └──────────┬───────────┘
                               │                      │
                    ┌──────────▼───────────┐         │ estado común
                    │ Git: estado exacto    │         │
                    │ del código           │         ▼
                    └──────────────────────┘  ┌──────────────────────┐
                                               │ Launcher: orquesta  │
                    ┌──────────────────────┐   │ sin instalar/actual.│
                    │ Sesiones privadas   │   └──────────┬───────────┘
                    │ Pi / Claude         │              │
                    └──────────┬───────────┘              ▼
                               │              ┌──────────────────────┐
                    ┌──────────▼───────────┐  │ Adaptadores Pi/Claude│
                    │ list / create /      │  │ list / create /      │
                    │ resume / launch      │  │ resume / launch      │
                    └──────────────────────┘  └──────────────────────┘
```

## 4. Horizontes

### Horizonte beta: A–E

Establece la verdad de beta, el contrato común, la integración con Pi y Claude, el
launcher mínimo y la evidencia E2E necesaria para confiar en el flujo.

### Inmediato post-beta: F–I

Comparte configuración y asesoría de actualización, registra las áreas revisadas,
audita el cleaner en modo lectura y, solo después, habilita mutaciones acotadas del
cleaner mediante slices SDD.

### Madurez: J–L

Audita el architect en modo lectura, habilita mutaciones estructurales únicamente
con análisis determinista de dependencias y property tests, y finalmente permite
paralelismo seguro con worktrees aislados y reglas explícitas de ownership y
conflicto.

## 5. Secuencia de cambios SDD

Cada bloque A–L es un cambio SDD futuro independiente, con su propio diseño,
tareas, aplicación y verificación. La secuencia es recomendada y sus dependencias
son parte del contrato de planificación; no se deben fusionar varios bloques en un
mega-cambio.

### A — `beta-truth-and-exit-criteria`

- **Objetivo:** establecer la verdad vigente de beta y criterios de salida revisables.
- **Alcance:** reconciliar la promesa de beta, las capacidades existentes y la
  evidencia obsoleta del roadmap; clasificar cada punto como requisito, posterior o
  descartado; fijar los criterios de salida de A–E.
- **No incluye:** implementar el launcher, cambiar el instalador o resolver features
  posteriores.
- **Dependencias:** ninguna de esta hoja de ruta.
- **Aceptación / salida:** existe una matriz revisada de verdad de beta; los
  criterios de salida y exclusiones de beta están explícitos; ninguna evidencia
  antigua se usa como criterio sin reconciliación.
- **Riesgo:** confundir una propuesta histórica con una capacidad o requisito
  vigente.

### B — `shared-project-state-contract`

- **Objetivo:** definir la representación compartida y determinista del estado de
  proyecto.
- **Alcance:** contrato y semántica para identidad del proyecto, fase activa y
  siguiente paso de OpenSpec, contexto de EIN.md, estado exacto de Git, frescura de
  verificación y referencias/capacidades de runtime; límites del proyector.
- **No incluye:** UI del launcher, implementación de sesiones, exportación de
  conversaciones ni lógica de instalación/actualización.
- **Dependencias:** A.
- **Aceptación / salida:** el contrato distingue autoridad, contexto, código y
  sesiones privadas; define cuándo una verificación queda obsoleta; sus casos de
  estado ambiguo o incompleto tienen una representación explícita.
- **Riesgo:** crear un contrato demasiado amplio que mezcle estado público con
  detalles privados de un runtime.

### C — `runtime-session-adapters`

- **Objetivo:** ofrecer una interfaz común de sesiones para Pi y Claude.
- **Alcance:** adaptadores para listar, crear, reanudar y lanzar sesiones; traducción
  de capacidades, errores y estado de cada runtime al contrato compartido.
- **No incluye:** UI, continuidad de historiales privados, escritor paralelo ni
  cambios en la lógica del instalador.
- **Dependencias:** B; debe respetar la verdad de beta de A.
- **Aceptación / salida:** Pi y Claude exponen la superficie común sin ocultar sus
  diferencias relevantes; una reanudación identifica el estado de proyecto usado;
  el traspaso entre runtimes comunica estado normalizado, nunca historial privado.
- **Riesgo:** que una diferencia de ciclo de vida entre runtimes se convierta en
  una falsa equivalencia o en una sesión reanudada con estado incorrecto.

### D — `minimal-workbench-launcher`

- **Objetivo:** entregar el launcher mínimo prometido para beta.
- **Alcance:** selección de proyecto y runtime; fase activa y siguiente paso;
  listar, crear, reanudar y lanzar sesiones; acceso compacto a doctor; presentación
  de estado incompleto o verificación obsoleta.
- **No incluye:** expansión de la TUI del instalador, dashboard completo,
  navegación general, updater universal/avanzado, escritores paralelos ni
  mutaciones de cleaner o architect.
- **Dependencias:** A, B y C.
- **Aceptación / salida:** un usuario puede recorrer el flujo mínimo desde el
  proyecto seleccionado hasta el runtime seleccionado; el launcher usa el contrato
  común y los adaptadores; no duplica ni absorbe la lógica de instalación o
  actualización.
- **Riesgo:** que el launcher crezca hasta ser otra TUI general o replique lógica del
  instalador.

### E — `beta-launcher-e2e-hardening`

- **Objetivo:** demostrar y endurecer los caminos críticos del launcher antes de
  beta.
- **Alcance:** E2E del ciclo de selección de proyecto/runtime, lectura de OpenSpec,
  listado/creación/reanudación/lanzamiento y doctor; escenarios de fallo y de
  invalidación de verificación después de cambiar el estado del código.
- **No incluye:** ampliar el alcance funcional del launcher ni validar features
  post-beta.
- **Dependencias:** D, con los criterios de salida de A como referencia.
- **Aceptación / salida:** los escenarios críticos cubren éxito, error y estado
  obsoleto de forma reproducible; los fallos dejan un diagnóstico accionable; la
  evidencia de E2E corresponde al estado exacto comprobado.
- **Riesgo:** cubrir solo el camino feliz y dejar silenciosas las transiciones de
  estado o los fallos de un runtime.

### F — `shared-config-update-advisor`

- **Objetivo:** centralizar la lectura de configuración y la asesoría sobre
  actualización después de beta.
- **Alcance:** estado y recomendaciones compartidas para configuración y
  actualización; explicación de qué acción corresponde al instalador; exposición
  coherente desde las superficies que la consuman.
- **No incluye:** updater universal o avanzado, ni trasladar la lógica de instalación
  y actualización al launcher.
- **Dependencias:** E; reutiliza B como contrato de estado.
- **Aceptación / salida:** la recomendación es consistente entre superficies,
  distingue información de acción y conserva la propiedad del instalador sobre
  instalar/actualizar.
- **Riesgo:** presentar una recomendación de configuración como si fuera una
  actualización automática o segura.

### G — `reviewed-area-ledger`

- **Objetivo:** registrar qué áreas fueron revisadas y con qué evidencia vigente.
- **Alcance:** límites de un área, estado de revisión, referencia a la evidencia y
  reglas de frescura ligadas al estado Git; consumo por futuras auditorías.
- **No incluye:** aprobar cambios automáticamente, permitir escritores paralelos o
  sustituir la revisión humana/SDD.
- **Dependencias:** F y B; debe conservar la evidencia obtenida en E.
- **Aceptación / salida:** el ledger permite distinguir revisado, no revisado y
  obsoleto; un cambio relevante de código invalida la entrada afectada; no declara
  revisada un área por el mero hecho de que exista una sesión.
- **Riesgo:** una granularidad incorrecta produzca confianza falsa o invalide más
  áreas de las necesarias.

### H — `cleaner-read-only-audit`

- **Objetivo:** auditar el cleaner en modo lectura, sin mutar el proyecto.
- **Alcance:** inspección y reporte de oportunidades del cleaner, usando el estado
  proyectado y el ledger cuando corresponda; clasificación de hallazgos y límites
  de confianza.
- **No incluye:** aplicar cambios, limpiar automáticamente, escribir en paralelo ni
  mutar áreas sin una slice SDD posterior.
- **Dependencias:** G y B.
- **Aceptación / salida:** el audit es explícitamente read-only, sus hallazgos son
  trazables al estado revisado y no se presentan como cambios aplicados; los casos
  inciertos quedan visibles.
- **Riesgo:** convertir sugerencias de limpieza en mutaciones implícitas o analizar
  evidencia ya obsoleta.

### I — `cleaner-bounded-mutations`

- **Objetivo:** habilitar mutaciones del cleaner únicamente como slices SDD
  acotadas y revisables.
- **Alcance:** seleccionar un hallazgo de H, delimitar su cambio, aplicar la
  mutación con condiciones claras y actualizar/verificar su evidencia; detenerse
  ante ambigüedad o fuera de alcance.
- **No incluye:** cleaner autónomo sin límites, mutaciones del architect, escritores
  paralelos ni cambios masivos no descompuestos.
- **Dependencias:** H, G y B.
- **Aceptación / salida:** cada mutación tiene una slice SDD identificable, límites
  de ownership y verificación posterior; cualquier cambio del estado de código
  invalida la evidencia anterior hasta repetir la verificación; el resultado es
  atribuible y revisable.
- **Riesgo:** que una transformación aparentemente mecánica cruce límites de
  comportamiento o de ownership.

### J — `architect-read-only-audit`

- **Objetivo:** entender y auditar el architect sin permitirle mutaciones.
- **Alcance:** análisis estructural en modo lectura, mapa de dependencias y reporte
  de oportunidades, límites y precondiciones para cambios futuros.
- **No incluye:** aplicar refactors, mover archivos automáticamente, paralelismo ni
  mutaciones de architect.
- **Dependencias:** I y B; usa la disciplina de evidencia de G.
- **Aceptación / salida:** el audit produce hallazgos trazables y separa hechos de
  hipótesis; sus resultados dejan explícitas las dependencias que tendrían que
  demostrarse antes de mutar.
- **Riesgo:** tratar una inferencia arquitectónica como dependencia determinista o
  como permiso de escritura.

### K — `architect-structural-mutations`

- **Objetivo:** permitir mutaciones estructurales del architect solo bajo guardas
  deterministas.
- **Alcance:** aplicar cambios derivados de J mediante slices SDD; exigir análisis
  determinista de dependencias y property tests antes de mutar; invalidar y repetir
  la verificación tras modificar Git.
- **No incluye:** refactorización ilimitada, decisiones estructurales no demostradas,
  escritores paralelos ni mutaciones que omitan revisión.
- **Dependencias:** J, B y la disponibilidad de análisis determinista de
  dependencias y property tests.
- **Aceptación / salida:** ninguna mutación comienza sin pasar las precondiciones;
  el análisis y las propiedades cubren los invariantes declarados; cada cambio es
  acotado, revisable y deja evidencia fresca o explícitamente inválida.
- **Riesgo:** dependencias ocultas o propiedades insuficientes permitan una
  mutación estructural aparentemente segura pero dañina.

### L — `safe-agent-parallelism`

- **Objetivo:** introducir paralelismo seguro de agentes sin carreras ni ownership
  implícito.
- **Alcance:** aislamiento mediante worktrees, asignación explícita de áreas,
  reglas de ownership y conflicto, integración determinista y tratamiento de
  verificación después de integrar cambios.
- **No incluye:** escritores paralelos en beta, compartir un working tree sin
  aislamiento, resolver conflictos silenciosamente ni saltarse SDD/revisión.
- **Dependencias:** K, B y las capacidades de sesión de C.
- **Aceptación / salida:** cada agente trabaja en un aislamiento conocido; no se
  asignan áreas incompatibles sin una regla explícita; los conflictos se detectan y
  se detienen para resolución; la integración deja un estado Git verificable y
  vuelve obsoleta cualquier evidencia que ya no corresponda.
- **Riesgo:** conflictos semánticos no detectados por el aislamiento de archivos o
  ownership incompleto.

## 6. Diagrama de dependencias

La secuencia principal recomendada es:

```text
A ──▶ B ──▶ C ──▶ D ──▶ E
                         │
                         ▼
F ──▶ G ──▶ H ──▶ I ──▶ J ──▶ K ──▶ L
```

Lectura del diagrama:

- A fija la verdad y las salidas de beta antes de diseñar el contrato.
- B es la base común de adaptadores, launcher, ledger y auditorías.
- C y D construyen el camino de runtime; E lo endurece con E2E antes de abrir el
  trabajo post-beta.
- F–I introducen asesoría, evidencia y mutaciones acotadas del cleaner.
- J–K separan la comprensión arquitectónica de la mutación protegida.
- L espera a que existan límites de estado, análisis, verificación y aislamiento
  suficientes para paralelizar sin convertir el repositorio en una carrera.

## 7. Decisiones bloqueadas

Estas decisiones se consideran cerradas para este roadmap:

- La beta incluye un launcher mínimo.
- El launcher es una CLI/workbench separada, no una expansión de la TUI del
  instalador.
- OpenSpec es la autoridad del trabajo activo; EIN.md aporta contexto estable; Git
  fija el estado exacto del código.
- Las sesiones de Pi y Claude son privadas; la continuidad entre runtimes transfiere
  estado de proyecto, no historial privado de conversación.
- El proyector determinista normaliza las fuentes y los adaptadores exponen
  list/create/resume/launch.
- El launcher orquesta, pero no posee la lógica de instalación o actualización.
- Quedan fuera de beta el updater universal/avanzado, el dashboard completo, los
  escritores paralelos y las mutaciones de cleaner y architect.
- Las mutaciones posteriores deben ser slices SDD acotadas y toda evidencia de
  verificación se invalida cuando deja de corresponder al estado de código
  verificado.

Cambiar una decisión bloqueada requiere una nueva decisión explícita y una revisión
 de esta secuencia; no debe introducirse como detalle incidental de una slice.

## 8. Preguntas abiertas

Estas preguntas deben resolverse en el SDD que las necesite, sin reabrir las
decisiones bloqueadas:

- ¿Cuál es la forma exacta del contrato de estado y qué campos son obligatorios,
  desconocidos u obsoletos?
- ¿Qué cambios concretos del estado Git invalidan cada tipo de verificación y cada
  entrada del ledger?
- ¿Qué capacidades y errores específicos de Pi y Claude deben normalizar los
  adaptadores?
- ¿Qué diagnósticos incluye el acceso compacto a doctor y cuáles son estrictamente
  read-only?
- ¿Qué granularidad debe tener un área revisada y cómo se referencia su evidencia?
- ¿Qué invariantes y property tests son necesarios antes de las mutaciones
  estructurales del architect?
- ¿Cómo se declaran ownership, conflictos e integración cuando llegue el
  paralelismo seguro?
- ¿Qué evidencia mínima y revisada habilita cada transición de horizonte sin
  convertirla en una promesa de funcionalidad no aceptada?

## 9. Regla de ejecución

El catálogo de ideas puede seguir creciendo en `docs/ein_futuras_features.md`, pero
solo los cambios priorizados aquí deben tratarse como la secuencia de ejecución
actual. Cada nueva capacidad aceptada debe entrar mediante un cambio SDD con
alcance, no-alcance, dependencias y criterios de salida explícitos.

No se asignan estimaciones en este documento. La planificación posterior debe
aportar evidencia de verificación sin convertir una intención del roadmap en una
afirmación de implementación.
