# Diseño — arquitectura de información del README y release

## A. Proposal

### Problema

El README presenta los conceptos de Ein antes de ofrecer una ruta de instalación y mezcla recomendaciones volátiles, afirmaciones de distinta madurez y un ejemplo de publicación obsoleto. Tampoco existe un control determinista que mantenga alineados el resumen visible de la última release, `CHANGELOG.md` y las versiones locales del instalador.

### Intent

Reordenar la entrada del README para que una persona nueva entienda qué es Ein, copie de inmediato la instalación soportada y vea la última release registrada antes de entrar en conceptos. Mantener el estilo Swiss Grid Brutalism y convertir la información de release, modelos y canales de instalación en contratos verificables y duraderos.

### Scope

**Incluye**

- Un bloque inicial conciso de instalación y un enlace descriptivo a la instalación detallada.
- Un resumen de la última release registrada localmente: `0.18.0`, publicada el `2026-07-13`, enlazada a `CHANGELOG.md#0180---2026-07-13` y con tres puntos derivados de esa entrada.
- Orientación de modelos basada en capacidad, riesgo y coste, conservando `/ein:models`, `/ein:models:full`, `/ein:models:lite` y la ausencia de fallback automático.
- Corrección o eliminación de afirmaciones del README que confundan comportamiento publicado con comportamiento verificado sólo en fuente/desarrollo.
- Un control Bun offline para metadatos de release, orden, comando de instalación, anchors, recomendaciones volátiles y canales no soportados.
- El contrato downstream que mantiene bloqueado `homebrew-install-channel`.

**No incluye / non-goals**

- Publicar una release, crear o subir tags, cambiar versiones ni reescribir el historial de `CHANGELOG.md`.
- Implementar Homebrew, instalación manual no verificada, nuevos canales, generación automática del README o automatización de release.
- Cambiar updater, Engram, banner, instalador, checksums, presets, proveedores, routing, fallback, dependencias o comportamiento público.
- Rediseñar documentación adyacente, sitio web, arquitectura o contenido bilingüe fuera de contradicciones directas.
- Investigar por red ni demostrar que GitHub sirve hoy una release o sus assets.

### Affected areas

| Área | Responsabilidad |
|---|---|
| `README.md` | Nuevo orden inicial, resumen de release, guía de modelos estable, claims cualificados y ejemplo de tag no volátil. |
| `tests/readme-release-ia.test.ts` | Contrato offline de información, metadatos, anchors y claims permitidos/prohibidos. |
| `CHANGELOG.md` | Fuente canónica de versión, fecha, anchor y bullets; sólo lectura. |
| `installer/package.json` | Contraste local de versión; sólo lectura. |
| `installer/src/core/version.ts` | Contraste de `INSTALLER_VERSION`; sólo lectura. |
| `.github/workflows/installer-release.yml` | Convención `installer-v*`; sólo lectura. |
| `tests/release-asset-contract.test.ts` | Regresión existente del contrato de assets/checksums; sin ampliación salvo necesidad demostrada. |

`installer/README.md` y `ein-pi/core/docs/EIN_OPERATING_SYSTEM.md` quedan fuera: el mapa no demostró que la propuesta mínima necesite modificarlos para evitar una contradicción nueva.

### Risks

- La evidencia local es coherente, pero una comprobación offline no demuestra el estado vivo de GitHub; el copy no debe convertir esa limitación en una afirmación remota.
- El anchor de GitHub derivado de la cabecera del changelog puede romperse si el algoritmo del test no reproduce la convención acordada.
- Un test de cadenas demasiado amplio puede marcar prosa histórica o nombres legítimos fuera de la guía afectada.
- Duplicar el comando entre la ruta rápida y la instalación detallada recrearía deriva.
- Renumerar secciones rompería anchors entrantes y aumentaría innecesariamente la carga de revisión.
- Resumir los handoffs puede borrar límites esenciales y presentar fuente/desarrollo como release publicada.

### Rollback

Revertir juntos el cambio de `README.md` y el control `tests/readme-release-ia.test.ts`. No hay migración, estado persistente, dependencia ni comportamiento de runtime que restaurar; `CHANGELOG.md`, versiones, workflow y archivos archivados permanecen intactos.

### Success criteria

Una persona puede identificar el propósito, instalar Ein y consultar la release registrada antes de `// 000. MODOS DE TRABAJO`. Un control offline falla ante deriva de versión, fecha, anchor, comando, orden, nombres volátiles o Homebrew, sin acceder a red ni mutar el repositorio.

## B. Spec

### R1 — Orden de lectura

El README **DEBE** conservar hero, badges y propuesta de valor al inicio; inmediatamente después **DEBE** presentar la ruta rápida y el resumen de release antes de la primera sección de conceptos o arquitectura. La explicación extensa **DEBE** permanecer detrás de esa entrada progresiva.

**Escenario:** Dado el README abierto desde el principio, cuando una persona lee hasta `// 000. MODOS DE TRABAJO`, entonces ya ha encontrado qué es Ein, cómo instalarlo, dónde ampliar la instalación y cuál es la última release registrada.

### R2 — Instalación rápida sin duplicación

El README **DEBE** mostrar exactamente una vez el comando soportado:

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
```

El bloque **DEBE** estar etiquetado como Bash y **DEBE** enlazar con texto descriptivo a un anchor explícito y estable de la instalación detallada. Esa sección detallada **NO DEBE** repetir el one-liner ni trasladar plataforma, dependencias, recuperación o troubleshooting al bloque inicial.

**Escenario:** Dado el bloque inicial, cuando una persona copia el único comando y sigue «Ver instalación detallada», entonces llega a la sección de plataforma y dependencias sin encontrar una segunda copia mantenida del comando.

### R3 — Resumen de la última release

El README **DEBE** mostrar `0.18.0` y `2026-07-13` bajo una etiqueta inequívoca de última release publicada según el registro canónico del repositorio. El enlace **DEBE** apuntar a `CHANGELOG.md#0180---2026-07-13`, y el resumen **DEBE** contener exactamente tres bullets factuales:

1. CodeGraph opt-in/conmutable y su uso de lectura acotada en SDD.
2. CodeGraph como dependencia opcional del instalador con telemetría desactivada tras instalarlo.
3. Bootstrap automático create-if-absent de `openspec/config.yaml` y eliminación del bloqueo prematuro por `tasks.md`.

El bloque **NO DEBE** afirmar disponibilidad remota comprobada ni incluir updater, Engram o semántica Git del banner.

**Escenario:** Dado que la primera entrada de `CHANGELOG.md` es `0.18.0` del `2026-07-13`, cuando se renderiza el resumen, entonces versión, fecha, anchor y tres bullets corresponden sólo a esa entrada y no a cambios archivados posteriores.

### R4 — Contrato determinista de mantenimiento

Un control offline **DEBE** comparar la versión visible del README con la primera cabecera de release de `CHANGELOG.md`, `installer/package.json.version` e `INSTALLER_VERSION`; la fecha visible **DEBE** concordar con esa cabecera del changelog. También **DEBE** comprobar el anchor calculado desde la cabecera y la convención `installer-v*` declarada por changelog y workflow. Cualquier discrepancia **DEBE** fallar. El sistema **NO DEBE** afirmar que el README se genera automáticamente.

**Escenario:** Dado que cualquiera de los cuatro valores de versión, la fecha del changelog/README o el enlace cambia de forma aislada, cuando corre el control enfocado, entonces falla indicando el origen que no concuerda; si todos concuerdan, no necesita red ni memoria del mantenedor.

### R5 — Guía de modelos estable

La guía **DEBE** recomendar razonamiento más fuerte para arquitectura, ambigüedad, revisión adversarial y decisiones de alto riesgo; **DEBE** recomendar ejecución de menor coste para trabajo acotado, bien especificado, repetitivo o mecánico. **DEBE** conservar `/ein:models`, `/ein:models:full` y `/ein:models:lite`, y **DEBE** explicar que cambiar de modelo es decisión del usuario y que Ein no hace fallback automático silencioso. La guía **NO DEBE** contener `gpt-5.5`, `MiniMax-M3`, `MiniMax-M2.7` ni nuevos nombres concretos de proveedor/modelo.

**Escenario:** Dado un lector que elige configuración, cuando consulta la sección de modelos, entonces puede decidir por capacidad, riesgo y coste y ejecutar los presets existentes sin depender de una recomendación nominal que envejezca.

### R6 — Canales de instalación verificados

El README **DEBE** documentar el bootstrap como único canal de instalación de Ein confirmado para este cambio. **PUEDE** conservar WSL como forma de ejecutar el camino Linux, pero **NO DEBE** presentarlo como un canal independiente. **NO DEBE** añadir instalación manual por assets, Homebrew, tap, fórmula, cask, badge de disponibilidad, comando de upgrade ni promesa de canal.

**Escenario:** Dado el inventario local y la ausencia de verificación remota, cuando una persona revisa toda instrucción de instalación de Ein, entonces sólo encuentra el bootstrap soportado y, para Windows, la preparación de WSL antes de usar ese mismo camino.

### R7 — Niveles de verdad de updater, Engram y banner

El resumen de release **NO DEBE** incorporar comportamiento de updater, Engram o banner que no figure en la entrada canónica `0.18.0`. Si el README conserva Engram, **DEBE** etiquetarlo como integración opcional verificada en fuente/desarrollo mediante un adapter CLI acotado, con OpenSpec canónico y fallos no bloqueantes; **NO DEBE** afirmar persistencia real demostrada, MCP/DB directo ni almacenamiento completo de artefactos. El copy de `ein update` **NO DEBE** afirmar que la transacción actualiza Pi. No se **DEBE** añadir una promesa nueva del banner.

**Escenario:** Dado un handoff archivado verificado pero ausente de la release `0.18.0`, cuando se condensa su información, entonces queda fuera del resumen de release y cualquier mención restante conserva la etiqueta fuente/desarrollo y sus limitaciones materiales.

### R8 — Identidad visual, anchors y accesibilidad

El README **DEBE** mantener los badges, texto alternativo útil, convenciones bilingües y headings `// 00N` existentes. Las secciones numeradas **NO DEBEN** renumerarse para este cambio. La instalación detallada **DEBE** conservar su heading generado y recibir un anchor semántico explícito para el enlace rápido. Links y labels **DEBEN** ser descriptivos; las listas, tablas y bloques de comandos **DEBEN** poder entenderse sin interpretar símbolos decorativos.

**Escenario:** Dado un enlace previo a una sección numerada y navegación por headings o lector de pantalla, cuando el README cambia, entonces el heading previo sigue disponible, la ruta rápida anuncia un destino comprensible y ningún significado depende sólo de `//`, flechas o badges.

### R9 — Control enfocado, offline y acotado

El control **DEBE** validar: orden de bloques; único comando y destino; versión/fecha/anchor; tres bullets; comandos de presets; ausencia de los nombres inventariados; ausencia de claims Homebrew; ejemplo de tag genérico; y anchors requeridos. Las prohibiciones de nombres **DEBEN** limitarse a la guía afectada y al resumen, y las de instalación **DEBEN** distinguir Ein de una dependencia ajena. El control **NO DEBE** usar red, GitHub API, Engram, tags reales, publicación, instalación ni mutaciones.

**Escenario:** Dado un fixture textual con un nombre volátil o `brew install ein` dentro de la zona controlada, cuando se ejecuta el test, entonces falla; el mismo término en evidencia histórica fuera de la zona no provoca un falso positivo amplio.

### R10 — Handoff de Homebrew

El cambio **DEBE** registrar que `homebrew-install-channel` sigue bloqueado porque no existe tap/fórmula de Ein verificado. La documentación pública futura **SÓLO PUEDE** habilitarse después de publicar el canal real, verificar instalación limpia y upgrade contra una release publicada y definir explícitamente la propiedad del updater.

**Escenario:** Dado un trabajo posterior que propone documentar Homebrew, cuando todavía falta cualquiera de publicación, instalación/upgrade verificados o ownership del updater, entonces el handoff lo mantiene bloqueado y no autoriza copy público.

## C. Decisions

### Arquitectura de información mínima

Se conservará la numeración actual. Entre la propuesta de valor y `// 000. MODOS DE TRABAJO` se insertarán dos bloques breves y claramente rotulados: instalación rápida y última release publicada. No se renumerará todo el README ni se moverá la instalación detallada; se añadirá un anchor semántico estable junto a `// 010. INSTALACIÓN`. Esta variante satisface progressive disclosure con el menor riesgo de enlaces y menor carga de revisión.

### Fuente canónica y publicación

- La primera cabecera de release de `CHANGELOG.md` es la fuente primaria de versión, fecha, contenido y anchor.
- `installer/package.json.version` e `INSTALLER_VERSION` son fuentes de concordancia, no prueba independiente de publicación.
- `installer-v*` es la convención local, respaldada por el preámbulo del changelog y el trigger del workflow.
- El README usará copy manual protegido por test. El workflow actual sólo genera notas de GitHub y no demuestra generación del README.
- «Publicada» se limita al registro canónico local; no se afirmará que una consulta remota confirmó tag, fecha, assets o resolución de `releases/latest`.

### Canal documentado

Sólo se documentará el bootstrap. Aunque workflow y build prueban los cuatro nombres de assets y `checksums.txt`, no existe comprobación remota permitida que complete una ruta manual pública para una release concreta; por tanto, esa ruta se omite en vez de presentarla condicionalmente como disponible.

### Frontera de claims

- **Release `0.18.0`:** sólo los tres hechos seleccionados de su primera entrada de changelog.
- **Engram:** se conserva únicamente una nota breve, opcional y marcada como fuente/desarrollo, con adapter acotado, OpenSpec canónico y degradación no bloqueante.
- **Updater:** se elimina la afirmación de actualizar Pi y no se trasladan sus nuevas semánticas al bloque de release.
- **Banner:** no se añade copy nuevo; el handoff permanece evidencia de fuente con cobertura parcial.
- **Homebrew:** ausencia explícita en el contrato downstream, no roadmap disfrazado de disponibilidad.

### Límite del control

El nuevo test leerá archivos como texto siguiendo el patrón de `tests/release-asset-contract.test.ts`. Parseará zonas mediante labels/headings estables, no mediante snapshots del README completo. Calculará el slug esperado desde la cabecera soportada y emitirá aserciones separadas para versión, fecha y anchor. Las prohibiciones nominales se limitarán a la sección de modelos y al resumen; los patrones Homebrew se limitarán a claims/comandos de instalación de Ein.

### Responsabilidades por fase y archivo

- `design.md` fija orden, fuentes, niveles de verdad y criterios observables.
- `README.md` posee sólo presentación y enlaces; no decide qué release es canónica.
- `tests/readme-release-ia.test.ts` posee el enforcement offline contra deriva.
- `CHANGELOG.md`, versiones y workflow siguen siendo fuentes de sólo lectura para este cambio.
- La eventual división ejecutable pertenece a `sdd-tasks`; este diseño no crea checklist de implementación.

### Alternatives rejected

- **Renumerar todas las secciones:** rechazado por churn, rotura de anchors y riesgo de superar el presupuesto.
- **Duplicar el one-liner en quick path y detalle:** rechazado porque crea dos fuentes mantenidas.
- **Generar el README desde el workflow:** rechazado porque no existe esa mecánica y añadirla sería automatización especulativa.
- **Documentar assets manuales con una URL plantilla:** rechazado porque el contrato local no prueba que la ruta remota sea utilizable hoy.
- **Usar updater/Engram/banner como bullets de `0.18.0`:** rechazado porque verificación de fuente no demuestra inclusión en esa release.
- **Escanear todo el repositorio con bans genéricos:** rechazado por falsos positivos en historia, tests y la dependencia Engram.
- **Aprovechar para limpiar docs adyacentes:** rechazado por falta de contradicción nueva y por el límite de alcance.

### Contrato downstream: `homebrew-install-channel`

Estado: **bloqueado**. No existe canal Homebrew de Ein confirmado. El gate de apertura exige simultáneamente: tap/fórmula real publicada, instalación limpia y upgrade verificados contra una release publicada, y ownership explícito entre Homebrew y `ein update`. Hasta entonces no se permiten comando, badge, identificador de tap/fórmula, disponibilidad ni promesa operativa en documentación pública.

## D. Success Criteria

### Comprobaciones observables

- Antes de `// 000`, aparecen propósito, único one-liner, enlace descriptivo y release `0.18.0 — 2026-07-13`.
- El enlace de release resuelve al anchor calculado de la primera cabecera de `CHANGELOG.md` y hay exactamente tres bullets trazables a esa entrada.
- README, changelog, package y `INSTALLER_VERSION` concuerdan; una mutación aislada de versión, fecha o anchor hace fallar el control.
- La guía de modelos contiene los cuatro criterios de trabajo, los tres comandos y el contrato de no-fallback, sin los tres nombres inventariados.
- No aparece un segundo canal de instalación de Ein ni ninguna disponibilidad Homebrew.
- Engram queda opcional, acotado, no bloqueante y marcado como fuente/desarrollo; updater y banner no se presentan como novedades de `0.18.0`.
- Las secciones `// 000` a `// 015`, badges y anchors útiles permanecen; la instalación detallada tiene además un destino semántico estable.
- El ejemplo de publicación usa la convención genérica `installer-v<semver>` y no vuelve a fijar una versión que pueda quedar obsoleta.
- El diff esperado se mantiene en un único work unit de documentación + contrato, sin cambios de producción ni dependencias y bajo el techo de 400 líneas de documentación/producción previsto en scope.

### Verificación requerida en fases posteriores

```bash
bun test tests/readme-release-ia.test.ts tests/release-asset-contract.test.ts
git diff --check
```

Además, la revisión manual debe abrir los enlaces relativos del bloque inicial y confirmar el orden visual en Markdown renderizado. Estas comprobaciones no publican, no crean tags, no instalan, no consultan GitHub y no usan un Engram real.

No se ejecutaron tests ni builds durante DESIGN, conforme al límite de fase.
