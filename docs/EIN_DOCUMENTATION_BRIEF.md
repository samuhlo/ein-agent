# EIN Documentation — Product & Design Brief

## Objetivo

Crear la documentación pública de **EIN** para acompañar el lanzamiento de la beta.

La documentación debe servir como la principal fuente de referencia para una persona que descubre EIN, quiere entender qué es, instalarlo, empezar a utilizarlo y profundizar progresivamente en su funcionamiento.

No debe sentirse como una documentación genérica ni como una plantilla ligeramente personalizada. Tiene que formar parte de la identidad de EIN.

La intención es separar claramente tres superficies:

- **README:** entrada rápida al proyecto.
- **Documentación:** fuente de verdad sobre uso, conceptos, funcionamiento, runtimes, referencia y resolución de problemas.
- **Artículo de lanzamiento:** historia personal, decisiones, errores y aprendizajes detrás de EIN.

La documentación no debe intentar sustituir al artículo ni convertir cada página en una explicación narrativa.

---

# Principios generales

## 1. Primero utilidad, después estética

La identidad visual es importante, pero nunca debe perjudicar:

- La lectura.
- La navegación.
- La búsqueda de información.
- El uso desde móvil.
- La accesibilidad.
- La comprensión de ejemplos y comandos.
- La velocidad con la que alguien puede encontrar una respuesta.

La interfaz puede inspirarse en una terminal o en `tmux`, pero **no debe comportarse como una terminal falsa**.

No se debe obligar al usuario a memorizar comandos, atajos o interacciones especiales para navegar.

La navegación web convencional debe seguir funcionando siempre.

---

## 2. EIN debe tener una identidad propia

La documentación debe sentirse vinculada visualmente al proyecto EIN.

Referencias de dirección visual:

- Herramientas de terminal.
- `tmux`.
- Interfaces de desarrollo.
- Documentación técnica editorial.
- Brutalismo digital.
- Interfaces densas pero ordenadas.
- `stripe.dev/blog` como referencia de jerarquía, navegación, metadatos y personalidad visual.

No se busca copiar Stripe.

La referencia sirve principalmente por:

- Su forma de tratar el contenido técnico.
- El uso de índices y etiquetas.
- La navegación compacta.
- La sensación de sistema.
- La ausencia de estética SaaS genérica.
- La capacidad de tener personalidad sin dificultar la lectura.

La documentación de EIN debe ser bastante más sencilla.

---

## 3. Evitar la estética típica de documentación

Evitar que el resultado parezca:

- Una plantilla de documentación casi sin modificar.
- Una landing SaaS.
- Un dashboard lleno de cards.
- Una terminal decorativa sin utilidad.
- Una web cyberpunk.
- Una interfaz hacker cliché.
- Una copia de Stripe.
- Una imitación literal de `tmux`.

Evitar especialmente:

- Exceso de tarjetas redondeadas.
- Sombras innecesarias.
- Gradientes decorativos.
- Glassmorphism.
- Neones.
- Animaciones constantes.
- Iconos decorativos sin función.
- Grandes hero sections de marketing.
- Frases comerciales genéricas.

La personalidad debe salir de la estructura, tipografía, ritmo, nomenclatura y tratamiento del contenido.

---

# Dirección visual

## Sensación general

La web debe sentirse como una herramienta.

Palabras clave:

- Técnica.
- Directa.
- Precisa.
- Industrial.
- Brutalista.
- Terminal.
- Ordenada.
- Sobria.
- Con personalidad.
- Sin postureo.

Debe poder tener pequeños guiños gamberros o propios de EIN, pero sin convertir la documentación en una broma.

---

## Lenguaje inspirado en tmux

Se puede utilizar el lenguaje visual de `tmux` para construir jerarquía.

Ejemplos de conceptos que pueden inspirar la interfaz:

- Sesiones.
- Ventanas numeradas.
- Buffers.
- Rutas.
- Estado.
- Modos.
- Paneles.
- Status bar.
- Prefijos.
- Shortcuts visuales.

Estos elementos deben ser metáforas de navegación y jerarquía, no una simulación literal.

Ejemplo conceptual:

```text
[0] START
[1] CONCEPTS
[2] WORKFLOW
[3] RUNTIMES
[4] REFERENCE
[5] DEBUG
```

También pueden existir referencias compactas como:

```text
[D] Docs
[G] GitHub
[R] Releases
```

Siempre deben coexistir con navegación normal.

---

## Paleta

La documentación debe utilizar la identidad visual existente de EIN.

Elementos importantes:

- Fondo muy oscuro.
- Contraste alto.
- Amarillo industrial de EIN como color de acento.
- Colores secundarios muy controlados.
- Bordes visibles.
- Jerarquía basada principalmente en estructura, espaciado, tipografía y líneas.

Evitar convertir cada tipo de contenido en un color distinto.

---

## Tipografía

La tipografía debe reforzar la sensación técnica y editorial.

Se puede combinar:

- Tipografía monoespaciada para elementos de sistema.
- Tipografía de lectura para contenido largo si mejora claramente la legibilidad.

No sacrificar lectura por estética terminal.

Los artículos y páginas conceptuales pueden tener párrafos largos; deben seguir siendo cómodos de leer.

---

# Navegación

## Navegación global

Debe permitir acceder fácilmente a:

- Overview.
- Getting Started.
- Concepts.
- Workflow.
- Runtimes.
- Reference.
- Debug / Troubleshooting.
- GitHub.
- Releases.

Debe existir siempre una forma evidente de volver al inicio.

---

## Navegación de documentación

Debe poder entenderse:

1. En qué sección estoy.
2. En qué página estoy.
3. Qué páginas relacionadas existen.
4. Qué viene antes.
5. Qué viene después.
6. Qué apartados contiene la página actual.

La navegación puede adoptar lenguaje visual de ventanas o sesiones, pero nunca debe ocultar esta información.

---

## Búsqueda

La documentación debe ofrecer una búsqueda rápida y evidente.

La búsqueda debe sentirse integrada en la interfaz de EIN.

Puede utilizar una estética cercana a:

- Command palette.
- Prompt.
- Search buffer.

Pero debe seguir siendo inmediatamente reconocible como buscador.

---

## Navegación móvil

La versión móvil no debe intentar reproducir todos los paneles de escritorio.

Debe simplificarse.

Prioridades en móvil:

1. Contenido.
2. Menú principal.
3. Navegación entre páginas.
4. Tabla de contenidos.
5. Búsqueda.

No mantener decoraciones si perjudican el espacio útil.

---

# Portada

La portada de la documentación debe ser más libre visualmente que las páginas interiores.

No debe parecer la página por defecto de una herramienta documental.

Debe comunicar rápidamente:

- Qué es EIN.
- Qué intenta resolver.
- Estado actual del proyecto.
- Runtimes disponibles.
- Cómo empezar.
- Dónde está GitHub.
- Dónde leer la documentación.

---

## Hero / entrada

Evitar un hero de marketing tradicional.

La entrada puede sentirse más parecida a una cabecera de herramienta o sistema.

Debe contener:

- EIN.
- Una definición muy breve.
- Estado `BETA`.
- Acceso a instalación.
- Acceso a documentación.
- Acceso a GitHub.

Ejemplo conceptual:

```text
EIN // MULTI-AGENT CODING HARNESS

Turn ambiguous work into small,
explained and verified changes.

[BETA]

[I] Install
[D] Documentation
[G] GitHub
```

El copy definitivo puede cambiar.

---

## Estado de runtimes

Mostrar de forma visible qué runtimes están soportados.

Como mínimo:

- Pi Coding Agent.
- Claude Code.

Debe poder apreciarse rápidamente que ambos existen pero **no asumir que ofrecen exactamente las mismas capacidades**.

La documentación debe explicar sus diferencias de forma honesta.

---

## Workflow

La portada puede mostrar una versión muy resumida del flujo:

```text
scope
→ map
→ design
→ tasks
→ apply
→ verify
→ close
```

No convertir la portada en documentación completa.

Debe servir para despertar curiosidad y ofrecer un modelo mental inicial.

---

# Arquitectura de contenidos

La documentación beta debe organizarse en seis grandes áreas:

```text
00 — START
01 — CONCEPTS
02 — WORKFLOW
03 — RUNTIMES
04 — REFERENCE
05 — DEBUG
```

La numeración puede formar parte de la identidad visual.

---

# 00 — START

## Overview

Debe responder:

- Qué es EIN.
- Qué problema intenta resolver.
- Qué significa que sea un coding-agent harness.
- Para quién está pensado.
- Qué runtimes soporta.
- En qué estado se encuentra.
- Qué no intenta resolver.

La explicación debe ser concisa.

---

## Getting Started

Debe permitir pasar de cero a EIN funcionando.

Debe cubrir:

- Requisitos.
- Instalación.
- Selección de runtime.
- Primer arranque.
- Comprobación básica de que todo está correctamente instalado.
- Siguiente paso recomendado.

No mezclar aquí conceptos avanzados.

---

## First Run

Debe existir un ejemplo pequeño y real.

Objetivo:

Que alguien pueda entender rápidamente cómo se siente utilizar EIN.

Mostrar:

- Petición.
- Qué hace EIN.
- Qué aparece durante el proceso.
- Qué resultado deja.
- Qué artefactos produce.
- Qué debe revisar el usuario.

No utilizar una demo artificialmente perfecta.

---

# 01 — CONCEPTS

Esta sección explica las ideas que una persona necesita para entender EIN.

No debe convertirse en teoría general sobre inteligencia artificial.

## Orchestrator

Explicar:

- Qué papel tiene.
- Qué responsabilidades conserva.
- Qué responsabilidades delega.
- Por qué no debe hacerlo todo.
- Qué significa delegar una tarea acotada.
- Qué relación tiene con el usuario.

## SDD + OpenSpec

Explicar:

- Por qué EIN trabaja por fases.
- Por qué el estado del cambio vive fuera de la conversación.
- Qué representa OpenSpec dentro del flujo.
- Por qué los artefactos importan.
- Cómo permiten retomar una tarea.
- Qué diferencia existe entre conversación y estado persistente.

## Context

Explicar:

- Por qué EIN trata el contexto como un recurso limitado.
- Por qué no todo debe vivir en el contexto del agente principal.
- Cuándo conviene utilizar contexto nuevo.
- Cuándo conviene heredar contexto.
- Por qué un agente más barato no implica necesariamente una ejecución más barata.

Evitar convertirlo en una explicación académica de ventanas de contexto.

## Deterministic Boundaries

Explicar la diferencia entre:

- Lo que decide un modelo.
- Lo que puede comprobar una herramienta.
- Lo que puede garantizar EIN.
- Lo que únicamente puede observar o pedir que se verifique.

Es importante evitar promesas falsas.

---

# 02 — WORKFLOW

## Workflow Overview

Explicar claramente:

```text
scope
→ map
→ design
→ tasks
→ apply
→ verify
→ close
```

Para cada fase describir:

- Objetivo.
- Qué recibe.
- Qué produce.
- Qué NO debe hacer.
- Qué permite decidir la siguiente fase.

No hace falta crear una página independiente para cada fase en la primera beta si no aporta suficiente valor.

## Artefactos

Explicar los principales artefactos generados durante un cambio.

Debe poder verse claramente la relación:

```text
scope.md
↓
map.md
↓
design.md
↓
tasks.md
↓
apply-progress.md
↓
verify-report.md
↓
summary.md
```

No limitarse a describir nombres de archivos.

Explicar qué problema resuelve cada uno.

## Real Workflow Example

Esta debe ser una de las páginas más importantes de toda la documentación.

Utilizar un cambio real.

Mostrar:

1. Petición inicial.
2. Scope.
3. Investigación.
4. Diseño.
5. Tareas.
6. Implementación.
7. Verificación.
8. Cierre.
9. Resultado final.

El objetivo es demostrar qué aporta EIN frente a una conversación normal con un coding agent.

---

# 03 — RUNTIMES

## Runtime Overview

Explicar que EIN tiene un núcleo conceptual compartido pero que cada runtime puede ofrecer capacidades distintas.

No presentar Pi y Claude Code como equivalentes si no lo son.

## Pi Coding Agent

Documentar:

- Cómo utilizar EIN con Pi.
- Qué capacidades están disponibles.
- Qué particularidades tiene.
- Qué limitaciones existen.

## Claude Code

Documentar:

- Cómo utilizar EIN con Claude Code.
- Qué capacidades están disponibles.
- Qué cambia respecto a Pi.
- Qué limitaciones existen.
- Qué garantías no pueden trasladarse exactamente.

## Runtime Matrix

Debe existir una comparación visual sencilla.

Objetivo:

Permitir que alguien comprenda las diferencias sin tener que leer varias páginas completas.

Evitar marketing.

Mostrar únicamente capacidades comprobables.

---

# 04 — REFERENCE

Esta sección debe ser eminentemente práctica.

## CLI

Documentar los comandos disponibles.

Para cada comando:

- Qué hace.
- Cuándo utilizarlo.
- Qué resultado esperar.
- Riesgos o efectos importantes.

Mantenerlo directo.

## Filesystem

Explicar de forma visual:

- Dónde vive EIN.
- Qué directorios utiliza.
- Qué pertenece al runtime original.
- Qué pertenece a EIN.
- Dónde viven backups.
- Dónde viven los cambios OpenSpec.

Debe ser fácil entender qué toca EIN y qué no.

## Optional Tooling

Documentar brevemente integraciones opcionales como:

- Engram.
- Linear.
- Context7.
- Hypa.
- CodeGraph.

Para cada una responder:

- Qué aporta.
- Cuándo se utiliza.
- Si es obligatoria.
- Qué ocurre cuando no está disponible.

No dedicar documentación excesiva a herramientas secundarias durante la beta.

---

# 05 — DEBUG

## Troubleshooting

Debe cubrir los fallos más probables.

Ejemplos de categorías:

- Dependencias.
- Instalación.
- Launchers.
- Actualizaciones.
- Configuración heredada.
- Runtimes.
- Backups.
- Estado inconsistente.
- Integraciones opcionales.

Las soluciones deben ser directas y comprobables.

## Doctor

Explicar:

- Para qué sirve.
- Qué comprueba.
- Cómo interpretar el resultado.
- Qué hacer si falla una comprobación.

## Known Limitations

Página obligatoria para la beta.

Debe incluir de forma explícita:

- Estado beta.
- Plataformas realmente probadas.
- Runtimes probados.
- Diferencias entre runtimes.
- Flujos todavía no maduros.
- Casos no soportados.
- Riesgos conocidos.
- Áreas que pueden cambiar.

No suavizar las limitaciones con lenguaje comercial.

## Uninstall & Recovery

Debe ser fácil encontrar cómo:

- Desinstalar EIN.
- Restaurar configuraciones.
- Recuperarse de una actualización fallida.
- Encontrar backups.
- Volver al runtime vanilla.

La reversibilidad debe formar parte de la confianza del proyecto.

---

# Tratamiento del contenido

## Páginas

Cada página debe empezar dejando claro:

- Qué explica.
- Para quién es.
- Qué aprenderá el lector.

Evitar introducciones largas.

## Jerarquía

Favorecer:

- Títulos claros.
- Secciones relativamente cortas.
- Ejemplos.
- Diagramas.
- Tablas cuando comparan realmente algo.
- Código únicamente cuando sea necesario.
- Enlaces entre conceptos relacionados.

Evitar bloques enormes de texto técnico sin descanso visual.

---

# Callouts

Los callouts pueden utilizar lenguaje de sistema.

Ejemplos:

```text
[INFO]
[NOTE]
[WARN]
[REQUIRED]
[RUNTIME:PI]
[RUNTIME:CLAUDE]
[BETA]
```

No abusar.

El estado debe transmitir información, no decoración.

---

# Código y terminal

Los bloques de terminal son especialmente importantes.

Deben:

- Tener alto contraste.
- Poder copiarse fácilmente.
- Diferenciar comando y salida.
- Indicar runtime cuando sea relevante.
- Evitar decoraciones excesivas.

La documentación debe sentirse cómoda para alguien que está trabajando con una terminal al lado.

---

# Diagramas

Utilizar diagramas cuando simplifiquen una idea.

Especialmente:

- Flujo SDD.
- Relación entre usuario, orquestador y agentes.
- Artefactos.
- Runtimes.
- Aislamiento.
- Ciclo de actualización / recuperación si resulta útil.

Evitar diagramas simplemente decorativos.

Todos deben entenderse rápidamente.

---

# Copy y tono

La documentación no debe sonar corporativa.

Debe ser:

- Directa.
- Técnica.
- Natural.
- Segura cuando algo está comprobado.
- Honesta cuando algo es una limitación.
- Sin vender humo.
- Sin lenguaje de gurú de IA.

Evitar expresiones como:

- `Revolutionary`.
- `Next-generation`.
- `Game-changing`.
- `Seamless`.
- `Unlock the power of AI`.
- `Supercharge your workflow`.
- `Production-ready` si no puede demostrarse.
- `Enterprise-grade` sin evidencia.

EIN puede tener personalidad, pero la documentación debe priorizar precisión.

---

# README

La documentación debe permitir reducir significativamente el README principal.

El README debería quedar orientado a descubrimiento.

Contenido aproximado:

1. EIN.
2. Definición breve.
3. Estado beta.
4. Captura o demo.
5. Problema que intenta resolver.
6. Runtimes soportados.
7. Instalación rápida.
8. Workflow resumido.
9. Enlaces a documentación.
10. Enlace al artículo de lanzamiento.
11. Changelog.
12. Issues / feedback.
13. Licencia.

No duplicar en el README explicaciones extensas que ya estén correctamente documentadas.

---

# Relación con el artículo de lanzamiento

La documentación y el artículo tienen responsabilidades distintas.

## Documentación

Responde:

- Qué es.
- Cómo funciona.
- Cómo se instala.
- Cómo se utiliza.
- Qué significa cada concepto.
- Qué limitaciones tiene.
- Cómo resolver problemas.

## Artículo

Responde:

- Por qué nació.
- Qué problemas personales llevaron a construirlo.
- Qué decisiones cambiaron durante meses de trabajo.
- Qué salió mal.
- Qué partes se sobreingenierizaron.
- Qué se eliminó.
- Qué aprendí.
- Por qué decido publicarlo ahora.

No trasladar la historia personal completa a la documentación.

Se puede enlazar al artículo desde la portada mediante algo similar a:

> Why I built EIN

---

# Beta: alcance mínimo de publicación

La documentación puede considerarse lista para acompañar la beta cuando exista:

- Portada propia.
- Overview.
- Getting Started.
- Primera ejecución.
- Explicación de los conceptos principales.
- Workflow completo.
- Ejemplo real.
- Diferencias Pi / Claude.
- Referencia básica de CLI.
- Filesystem.
- Troubleshooting.
- Known Limitations.
- Uninstall / Recovery.
- Búsqueda.
- Navegación móvil funcional.
- Enlaces a GitHub y releases.

---

# Fuera de alcance para la primera beta

No dedicar tiempo ahora a:

- Documentación bilingüe.
- Playground interactivo.
- Terminal simulada.
- Sistema de cuentas.
- Personalización por usuario.
- Telemetría.
- Referencia automática de todo el código.
- Una página independiente para cada agente.
- Una página independiente para cada skill.
- Animaciones elaboradas.
- Easter eggs complejos.
- Sistema de plugins para la documentación.
- Rehacer el blog dentro de esta web.
- Crear un CMS.
- Construir un framework de documentación propio.

Estas ideas pueden reconsiderarse después del lanzamiento.

---

# Dogfooding

Esta documentación debe construirse utilizando el propio EIN siempre que resulte razonable.

Objetivos:

- Validar EIN en un cambio real.
- Detectar fricciones.
- Generar un ejemplo auténtico.
- Obtener capturas para la documentación.
- Obtener material para el artículo de lanzamiento.

No ocultar problemas encontrados durante el proceso.

Si construir la documentación revela fallos o limitaciones de EIN, registrarlos y tratarlos como información útil de la beta.

---

# Resultado esperado

La documentación final debe conseguir que una persona pueda:

1. Descubrir EIN.
2. Entender su propósito en pocos minutos.
3. Saber si le interesa.
4. Instalarlo.
5. Ejecutar su primera tarea.
6. Comprender el modelo mental básico.
7. Entender el workflow.
8. Saber qué diferencias existen entre Pi y Claude.
9. Encontrar referencia cuando la necesite.
10. Diagnosticar problemas.
11. Conocer las limitaciones actuales.
12. Volver fácilmente al runtime vanilla si lo desea.

Y debe conseguir todo esto sintiéndose como **EIN**, no como una plantilla documental con un logo diferente.

---

# Restricción importante para la implementación

Este documento define **intención de producto, contenido, experiencia y dirección visual**.

No prescribe:

- Arquitectura.
- Estructura interna del código.
- Framework exacto.
- Componentes concretos.
- Estrategia de estilos.
- Sistema de estado.
- Plugins.
- Dependencias.
- Organización técnica.
- Implementación de navegación.
- Implementación de búsqueda.
- Implementación responsive.

EIN debe investigar el proyecto, evaluar las herramientas disponibles y decidir la solución técnica que considere más adecuada respetando este brief.

La solución debe favorecer:

1. Simplicidad.
2. Mantenibilidad.
3. Buen contenido.
4. Buena experiencia de lectura.
5. Identidad propia.
6. Accesibilidad.
7. Rendimiento.
8. Capacidad de evolucionar después de la beta.

Evitar sobreingeniería.

La documentación es parte del lanzamiento de EIN, no un nuevo producto que deba retrasarlo.
