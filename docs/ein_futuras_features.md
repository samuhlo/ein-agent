# EIN — Propuesta de futuras funcionalidades

> **Historical ideation document.** This file preserves early product exploration and does not define current priority, status, or execution order. Detailed planning lives in the [canonical EIN product roadmap](roadmap-features-ein.md).
>
> **Status snapshot:** EIN-Pi is the flagship. Cleaner and Architect are internal Pi subagents with independent, disabled-by-default activation. Cleaner is partial, Architect is not implemented, Claude parity follows proven Pi behavior, the installer remains third priority, and the launcher remains fourth.
>
> Documento de trabajo para planificación y análisis.
>
> Este archivo no define una implementación cerrada. Organiza las ideas actuales, identifica el valor esperado de cada funcionalidad y conserva como decisiones abiertas todos los puntos que todavía necesitan investigación.

## 1. Principios generales

Las siguientes reglas deben orientar cualquier evolución de EIN descrita en este documento.

### 1.1. Eficiencia en el uso de tokens

EIN debe intentar consumir la menor cantidad posible de tokens y priorizar, siempre que sea viable, los modelos más económicos.

La estrategia general será:

1. Resolver primero todo lo posible mediante herramientas deterministas, scripts y análisis automatizados.
2. Entregar al agente únicamente los resultados relevantes de esos análisis.
3. Reservar los modelos más capaces y costosos para dirigir, decidir o resolver los casos que realmente necesiten razonamiento.
4. Utilizar modelos más baratos para ejecutar tareas bien delimitadas cuando sea suficiente.

Cuando una comprobación pueda convertirse en una herramienta determinista, debe valorarse su creación antes de delegarla de forma repetida a un agente.

### 1.2. Herramienta personal antes que producto público

EIN sigue siendo, ante todo, una herramienta personal. Las decisiones deben priorizar su utilidad real en el flujo de trabajo propio antes que las necesidades hipotéticas de un producto público.

### 1.3. Prioridad tecnológica

El soporte principal debe centrarse en TypeScript y, después, en sus frameworks.

---

## 2. `feat/launcher-tui`

## 2.1. Objetivo

Crear un launcher de terminal para EIN que permita abrir y gestionar los distintos agentes disponibles en un proyecto.

El launcher debería iniciarse mediante un comando como `/ein` y permitir arrancar Claude Code, Pi y cualquier otro agente que se incorpore en el futuro.

No debe limitarse a ser un selector de agentes. Su principal valor es actuar como una capa común entre ellos para que el usuario pueda cambiar de agente sin perder el contexto operativo del proyecto.

## 2.2. Alcance por proyecto

El launcher debe abrirse dentro del proyecto actual, igual que se ejecutaría directamente uno de los agentes.

Desde esa ubicación debe poder leer y gestionar la configuración común recogida en `EIN.md`, incluyendo las opciones compartidas entre agentes que ya formen parte del sistema, como:

- modo individual o modo equipo;
- idioma del agente;
- idioma de comentarios, pull requests y commits;
- Hypa;
- CodeGraph;
- Engram;
- futuras opciones comunes que se incorporen a EIN.

El launcher debe incluir una sección de configuración del proyecto desde la que puedan consultarse y modificarse estas opciones.

## 2.3. Continuidad entre agentes

La funcionalidad principal del launcher debe permitir:

- iniciar Pi o Claude Code dentro del mismo proyecto;
- continuar con un agente el trabajo que dejó otro;
- alternar entre agentes por límites de uso o para obtener enfoques diferentes;
- ejecutar agentes en paralelo cuando trabajen en tareas totalmente independientes y no modifiquen el mismo código.

Para que esta continuidad sea fiable, el seguimiento de tareas mediante OpenSpec y la lectura del estado del proyecto deben estar bien resueltos.

El launcher no debería depender únicamente del historial interno de cada agente. Necesita una fuente de estado compartida, comprensible por todos los agentes compatibles.

## 2.4. Resumen de sesiones

Al estar situado por encima de cada agente concreto, el launcher puede ofrecer acceso a las sesiones anteriores realizadas con los distintos agentes.

Cada sesión debería mostrar, como mínimo, una frase breve que resuma lo último que se hizo. Esta descripción debe facilitar la identificación de una sesión antes de reanudarla.

Esta capacidad debe servir como primer paso hacia una continuidad más completa entre agentes.

## 2.5. Estado compartido y estandarización de documentos

Actualmente, los roadmaps, conjuntos de funcionalidades y próximos pasos pueden acabar guardados en archivos como `docs/nombre-lista-random.md`, sin una convención estable.

Esto provoca varios problemas:

- el agente puede no saber cuál es el documento vigente;
- puede recuperar un documento anterior por error;
- otro agente puede no localizar correctamente el punto en el que quedó el proyecto;
- el launcher no dispone de una fuente fiable para mostrar el estado actual.

Debe investigarse y definir un estándar para almacenar:

- roadmap vigente;
- funcionalidades planificadas;
- trabajo en curso;
- próximos pasos;
- estado necesario para continuar una tarea.

Este estándar sería la evolución natural del resumen de sesión y permitiría que el launcher leyese el estado del proyecto y ofreciese continuar con cualquiera de los agentes compatibles.

## 2.6. Update advisor y updater

El launcher debe incluir un sistema que compruebe si existen actualizaciones para:

- EIN;
- Pi;
- extensiones de Pi;
- Claude Code;
- otros agentes o componentes compatibles que se añadan en el futuro.

Cuando haya una actualización disponible, debe mostrar un aviso y ofrecer una forma de ejecutarla desde el propio entorno.

## 2.7. Instalación, diagnóstico y opciones del sistema

Debe decidirse cómo se relacionará el launcher con el instalador actual.

Opciones todavía abiertas:

1. Mantener dentro del launcher las opciones del instalador.
2. Separar por completo el instalador y conservar en el launcher únicamente el doctor o diagnóstico.
3. Mantener el instalador separado, pero permitir acceder a él desde una sección de sistema del launcher.

Siguiendo un criterio de simplicidad, debe evitarse que el launcher acumule responsabilidades sin una separación clara. Una posible organización sería reunir estas funciones bajo un apartado de opciones del sistema, pero esta decisión todavía requiere investigación.

## 2.8. Formato de la aplicación

Debe investigarse si el alcance previsto sigue encajando en un launcher sencillo o si EIN necesita convertirse en una aplicación de terminal más completa.

La dirección planteada es construir un programa de terminal cuidado, ejecutable desde cualquier terminal y con una experiencia cercana a herramientas como LazyVim, sin dejar de ser una TUI.

## 2.9. Interfaz y navegación

La estética debe estar cuidada e incluir un banner reconocible.

La navegación debe combinar:

- atajos de teclado inspirados en herramientas como LazyVim;
- teclas directas para acciones habituales, por ejemplo `f` para buscar o `q` para salir;
- navegación mediante flechas para no depender exclusivamente de los atajos.

## 2.10. MVP

El MVP del launcher debe incluir:

1. Lanzamiento de Pi y Claude Code.
2. Resumen de sesiones anteriores.
3. Configuración global del proyecto.
4. Comprobación y ejecución de actualizaciones.

## 2.11. Decisiones abiertas

- Definir si será un launcher sencillo o una aplicación TUI más completa.
- Definir la relación exacta entre launcher, installer y doctor.
- Diseñar el estándar compartido para roadmaps, funcionalidades y próximos pasos.
- Determinar cómo se representa y actualiza el estado compartido entre agentes.
- Definir los límites seguros para ejecutar varios agentes en paralelo.

---

## 3. `feat/agente-limpiador`

## 3.1. Objetivo

Crear un agente especializado en mejorar la calidad del código después de la implementación, sin introducir funcionalidad nueva y con el menor gasto posible de tokens.

Su función será realizar una limpieza que preserve el comportamiento existente y mejore aspectos como la claridad, la duplicación, la complejidad, la estructura local y la capacidad de prueba.

En el flujo actual, este proceso se ejecutaría después de `sdd-apply`.

## 3.2. Principio de funcionamiento

El agente debe seguir un proceso de dos capas:

1. **Análisis determinista:** ejecutar herramientas y scripts que puedan detectar problemas de forma automática.
2. **Revisión mediante agente:** entregar los informes obtenidos al agente para que interprete los resultados y realice las refactorizaciones necesarias.

El agente no debe gastar tokens en tareas que puedan resolverse previamente mediante herramientas deterministas.

## 3.3. Análisis inicial

La primera pasada debe incluir, como mínimo:

- análisis de cobertura cuando resulte necesario para interpretar o reducir la complejidad;
- cálculo de la métrica CRAP;
- detección de duplicación mediante herramientas DRY;
- generación de informes que puedan ser procesados posteriormente por el agente.

SwarmForge utiliza como referencia una secuencia en la que se revisa primero CRAP y después DRY, intentando mantener CRAP en `6` o menos. Este valor puede servir como referencia durante la investigación, pero todavía debe decidirse si encaja como regla de EIN.

## 3.4. Refactorización a partir de informes

Después de la pasada determinista, el agente debe leer los informes y aplicar refactorizaciones que preserven el comportamiento.

La revisión puede abarcar:

- nombres poco claros;
- funciones o archivos con responsabilidades locales mezcladas;
- duplicación de código;
- complejidad innecesaria;
- acoplamiento local;
- legibilidad de las pruebas;
- comentarios obsoletos;
- código muerto;
- problemas que dificulten probar el código.

No debe introducir comportamiento nuevo.

## 3.5. Revisión DRY semántica

Las herramientas deterministas pueden detectar duplicación textual o estructural, pero no siempre identifican lógica repetida expresada de formas diferentes.

Después del análisis automático, el agente debe realizar una segunda revisión centrada en DRY semántico para detectar duplicaciones de lógica que las herramientas no hayan reconocido.

## 3.6. Preservación del comportamiento

Toda modificación debe mantener la funcionalidad existente.

Las refactorizaciones deben ser suficientemente pequeñas como para poder verificarse de forma local mediante las pruebas y comprobaciones disponibles en el proyecto.

## 3.7. Seguimiento del código revisado

El agente debe evitar analizar repetidamente el mismo código sin necesidad.

Debe estudiarse un sistema que permita:

- registrar qué partes del proyecto ya fueron revisadas;
- saber cuándo se realizó la revisión;
- detectar si ese código cambió desde entonces;
- continuar una limpieza anterior sin empezar siempre desde cero.

Este registro también permitiría ejecutar procesos progresivos de limpieza sobre proyectos antiguos o ya iniciados.

## 3.8. Modo de limpieza para proyectos existentes

Además de ejecutarse después de `sdd-apply`, el agente podría ofrecer un proceso específico para revisar y limpiar proyectos antiguos o bases de código ya existentes.

Este modo debería utilizar el mismo enfoque progresivo y evitar repetir revisiones sobre zonas que no hayan cambiado.

## 3.9. Salida didáctica

El agente puede incluir una parte docente que explique:

- qué problema importante encontró;
- por qué era un problema;
- cómo lo mejoró;
- qué principio puede aprenderse de ese cambio.

Las explicaciones deben ser sencillas, comprensibles incluso para una persona con poca experiencia y, cuando sea útil, acompañarse de ejemplos de código.

Para no generar ruido ni consumir tokens innecesarios:

- solo debe explicar los cambios más importantes o menos habituales;
- debe evitar repetir lecciones ya explicadas en el mismo proyecto;
- puede mantener un registro de aprendizaje por proyecto;
- ese registro podría evolucionar hacia una pequeña guía específica del proyecto;
- toda la parte docente debe poder activarse o desactivarse.

## 3.10. Integración pendiente de decidir

Debe decidirse entre dos opciones:

1. Integrar el limpiador directamente dentro del flujo SDD después de `sdd-apply`.
2. Mantenerlo como un agente independiente, por ejemplo `ein_code_cleaner`, que pueda activarse o desactivarse.

Estas opciones no son necesariamente excluyentes, pero no debe asumirse una solución hasta estudiar el coste y la complejidad de ambas.

## 3.11. Compatibilidad entre agentes

En Pi resulta sencillo integrar herramientas mediante scripts de TypeScript. Debe investigarse si Claude Code permite una integración equivalente con la misma facilidad y qué diferencias habría que abstraer desde EIN.

## 3.12. Decisiones abiertas

- Integración dentro del flujo SDD o agente independiente.
- Sistema para registrar el código ya revisado.
- Herramientas concretas para CRAP, DRY y cobertura en TypeScript.
- Uso o no del valor `CRAP <= 6` como regla de EIN.
- Integración equivalente de scripts deterministas en Pi y Claude Code.
- Formato y ubicación del registro de aprendizaje del proyecto.

---

## 4. `feat/agente-arquitecto`

## 4.1. Objetivo

Crear un agente especializado en revisar y mejorar la arquitectura del proyecto sin modificar su funcionalidad.

Debe seguir el mismo principio operativo que el agente limpiador:

1. ejecutar primero herramientas y comprobaciones deterministas;
2. entregar sus resultados al agente;
3. aplicar cambios arquitectónicos preservando el comportamiento;
4. verificar que el proyecto continúa funcionando.

## 4.2. Responsabilidad principal

El agente debe centrarse en la estructura de alto nivel y en la separación correcta de responsabilidades.

Su revisión debe prestar especial atención a:

- separación entre lógica de negocio, interfaz de usuario y detalles técnicos;
- límites claros entre módulos;
- dirección correcta de las dependencias;
- encapsulación;
- ocultación de información;
- capacidad de probar la lógica principal sin depender de UI, red, base de datos, sistema de archivos o framework;
- cobertura mediante pruebas de propiedades cuando resulte apropiado.

## 4.3. Preservación de la funcionalidad

El agente arquitecto nunca debe cambiar el comportamiento del sistema de forma intencionada.

Las mejoras arquitectónicas deben realizarse manteniendo las pruebas existentes y verificando que el proyecto continúa funcionando durante todo el proceso.

No debe introducir nuevas funcionalidades.

## 4.4. Dirección de dependencias

La lógica de alto nivel debe mantenerse independiente de los detalles de bajo nivel.

Esto implica evitar que las reglas principales del sistema dependan directamente de:

- interfaz de usuario;
- framework;
- sistema de archivos;
- base de datos;
- red;
- dispositivos;
- formatos o estructuras propios de esos detalles técnicos.

Los adaptadores y detalles de bajo nivel deben depender hacia dentro de conceptos estables definidos por los módulos de alto nivel.

## 4.5. Límites y separación

El agente debe revisar si existen módulos que:

- mezclan responsabilidades no relacionadas;
- difuminan límites técnicos importantes;
- obligan a la lógica principal a conocer detalles de infraestructura;
- filtran estructuras internas entre capas;
- exponen APIs públicas de forma accidental;
- presentan ciclos o direcciones incorrectas de dependencia.

Cuando sea necesario, debe separar estos módulos manteniendo interfaces estrechas y una representación interna encapsulada.

## 4.6. Encapsulación y ocultación de información

Cada módulo debe exponer únicamente los conceptos necesarios para colaborar con el resto del sistema.

El agente debe revisar que:

- los detalles internos permanezcan ocultos;
- las invariantes estén protegidas;
- los tipos del framework o de persistencia no atraviesen límites innecesariamente;
- los módulos de alto nivel no dependan de formas de datos propias de capas de bajo nivel.

## 4.7. Pruebas de propiedades

Después de las mejoras arquitectónicas, el agente debe valorar si existen propiedades relevantes que puedan comprobarse automáticamente.

Las pruebas de propiedades pueden centrarse, cuando tenga sentido, en:

- invariantes;
- rangos amplios de entrada;
- operaciones de ida y vuelta;
- conservación de valores;
- idempotencia;
- ordenación;
- estabilidad entre parseo y formateo.

La herramienta o framework concreto debe investigarse según el proyecto. Si no existe una opción adecuada, SwarmForge plantea como referencia la posibilidad de construir una solución pequeña y específica.

## 4.8. Secuencia conceptual de revisión

La revisión arquitectónica puede expresarse mediante la siguiente secuencia:

1. **Dirección — cortar:** corregir la dirección de las dependencias.
2. **Límites — separar:** establecer fronteras claras entre responsabilidades y detalles técnicos.
3. **Encapsulación — ocultar:** proteger la representación y los detalles internos.
4. **Pruebas — bombardear:** comprobar las propiedades y el comportamiento desde múltiples entradas y escenarios.

Esta secuencia resume la lógica que debe guiar al agente; no define todavía una implementación técnica cerrada.

## 4.9. Integración y salida didáctica

Debe investigarse si el agente arquitecto formará parte del flujo SDD o si se mantendrá como un agente independiente, por ejemplo `ein-architect`.

Al igual que el limpiador, puede incluir una salida didáctica opcional que explique únicamente las decisiones arquitectónicas más importantes o menos evidentes, evitando repetir aprendizajes ya registrados en el proyecto.

## 4.10. Relación con el agente limpiador

La separación de responsabilidades debe ser clara:

- el limpiador se ocupa principalmente de la calidad y estructura local del código;
- el arquitecto se ocupa de la estructura global, los límites entre módulos y la dirección de las dependencias.

Tomando como referencia el flujo de SwarmForge, una posible secuencia sería:

```text
sdd-apply -> agente limpiador -> agente arquitecto
```

Esta secuencia es coherente con las responsabilidades descritas, pero su integración definitiva en EIN sigue siendo una decisión abierta.

## 4.11. Decisiones abiertas

- Integración dentro del flujo SDD o agente independiente.
- Herramientas deterministas para analizar límites y dependencias en proyectos TypeScript.
- Forma de coordinar el trabajo con el agente limpiador.
- Framework o estrategia para pruebas de propiedades.
- Formato del registro didáctico y de decisiones arquitectónicas.

---

## 5. Relación entre las tres funcionalidades

Las tres propuestas resuelven problemas diferentes, pero relacionados:

- **Launcher TUI:** ofrece una entrada común, configuración compartida y continuidad entre agentes.
- **Agente limpiador:** mejora la calidad local del código después de la implementación.
- **Agente arquitecto:** mejora la estructura global, los límites y la dirección de dependencias.

El launcher puede convertirse en el punto desde el que se activen y supervisen estos procesos, pero no debe asumirse todavía que toda su lógica tenga que residir dentro de la TUI.

La prioridad común es que el estado importante del proyecto quede fuera de la memoria privada de un agente concreto y pueda ser leído por cualquiera de los agentes compatibles con EIN.

---

## 6. Elementos que este documento no decide

Este documento no define:

- la arquitectura interna del launcher;
- las librerías concretas para construir la TUI;
- las herramientas definitivas de análisis para TypeScript;
- el formato final del estado compartido del proyecto;
- la implementación de la comunicación entre agentes;
- la forma exacta de ejecutar agentes en paralelo;
- si los agentes de limpieza y arquitectura serán obligatorios;
- si EIN evolucionará hacia un producto público;
- ningún cambio de código.

Todos estos puntos requieren una fase posterior de investigación y diseño.

---

## 7. Fuentes de referencia

- Borrador original de funcionalidades para EIN.
- [Uncle Bob dice que NO lee el código... ¿cómo lo hace? — YouTube](https://www.youtube.com/watch?v=pBANOHIhmFI)
- [unclebob/swarm-forge — GitHub](https://github.com/unclebob/swarm-forge)
- Roles de referencia de SwarmForge:
  - [`six-pack/cleaner.prompt`](https://github.com/unclebob/swarm-forge/blob/six-pack/swarmforge/roles/cleaner.prompt)
  - [`six-pack/architect.prompt`](https://github.com/unclebob/swarm-forge/blob/six-pack/swarmforge/roles/architect.prompt)
  - [`four-pack/refactorer.prompt`](https://github.com/unclebob/swarm-forge/blob/four-pack/swarmforge/roles/refactorer.prompt)

> Nota de trazabilidad: las ideas atribuidas al vídeo se han limitado a lo ya recogido en el borrador original. Los detalles adicionales sobre responsabilidades, métricas, límites, dependencias y pruebas proceden de la documentación pública de SwarmForge enlazada arriba.
