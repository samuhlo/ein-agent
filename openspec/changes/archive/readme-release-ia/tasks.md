# Tasks — readme-release-ia

status: ready
blocked_by: none

## // 001. Contrato offline de metadatos y claims del README

- [x] 1.1 Crear `tests/readme-release-ia.test.ts` como control Bun offline que extraiga la primera cabecera de release de `CHANGELOG.md` y contraste versión, fecha y anchor con `installer/package.json`, `installer/src/core/version.ts` y el bloque de release de `README.md`.
  - skills: `ein-discipline`, `release`
  - why: Evita que el resumen visible de la release derive de las fuentes canónicas locales.
  - learn: Una prueba textual acotada puede proteger documentación manual sin convertirla en contenido generado.
  - architecture: `CHANGELOG.md` es la fuente primaria; las dos versiones del instalador son contrastes de concordancia; `README.md` sólo presenta el resultado.
  - avoid: Inferir publicación remota, consultar GitHub o aceptar una versión local aislada como evidencia suficiente.
  - evidence: El test tiene aserciones separadas para versión, fecha y `CHANGELOG.md#0180---2026-07-13`; una discrepancia aislada identifica su origen.
  - verify: `bun test tests/readme-release-ia.test.ts`

- [x] 1.2 Completar el mismo control con límites de texto estables: orden de los bloques iniciales, único one-liner Bash y su anchor semántico, exactamente tres bullets de `0.18.0`, comandos de modelos, ausencia acotada de nombres volátiles y ausencia de claims de instalación Homebrew de Ein.
  - skills: `ein-discipline`, `cognitive-doc-design`, `readme-style`
  - why: Hace verificables los contratos de IA, instalación y niveles de verdad sin snapshots frágiles del README completo.
  - learn: Delimitar zonas por labels y headings reduce falsos positivos frente a prohibiciones globales de cadenas.
  - architecture: El test es propietario del enforcement offline; las prohibiciones de modelos se limitan a la guía afectada y al resumen, y las de instalación distinguen Ein de dependencias ajenas.
  - avoid: Escanear todo el repositorio, bloquear evidencia histórica legítima o permitir que el test haga red, mutaciones o instalación.
  - evidence: Los fixtures/aserciones fallan para un segundo comando, un anchor erróneo, un nombre inventariado en la zona controlada y `brew install ein`, sin prohibir la dependencia Engram ajena.
  - verify: `bun test tests/readme-release-ia.test.ts tests/release-asset-contract.test.ts`

## // 002. Entrada progresiva y claims duraderos del README

- [x] 2.1 Reordenar `README.md` sin renumerar `// 000` a `// 015`: conservar hero, badges, texto alternativo y propuesta de valor; insertar antes de `// 000. MODOS DE TRABAJO` una ruta rápida con el único comando soportado y un enlace descriptivo al anchor semántico explícito de `// 010. INSTALACIÓN`.
  - skills: `readme-style`, `cognitive-doc-design`
  - why: Permite entender, instalar y ampliar la instalación antes de entrar en conceptos.
  - learn: La divulgación progresiva ofrece primero la acción segura y deja plataforma, dependencias y recuperación en un único destino detallado.
  - architecture: `README.md` posee presentación y enlaces; `// 010. INSTALACIÓN` sigue siendo la única fuente detallada para WSL, dependencias y troubleshooting.
  - avoid: Duplicar el one-liner, mover detalle operativo al bloque inicial o renumerar headings con anchors entrantes.
  - evidence: Antes de `// 000` aparecen propósito, un único bloque Bash con `curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash` y un enlace descriptivo al destino estable.
  - verify: `bun test tests/readme-release-ia.test.ts && git diff --check`

- [x] 2.2 Añadir en `README.md` el bloque manual de última release registrada: `0.18.0`, `2026-07-13`, enlace relativo a `CHANGELOG.md#0180---2026-07-13` y exactamente los tres hechos de CodeGraph/OpenSpec definidos en el diseño.
  - skills: `cognitive-doc-design`, `release`, `readme-style`
  - why: Da contexto de mantenimiento verificable sin confundir el registro local con disponibilidad remota comprobada.
  - learn: Una fuente canónica local puede resumirse de forma útil si el copy declara su límite de evidencia.
  - architecture: La primera entrada de `CHANGELOG.md` decide contenido, fecha y anchor; el README mantiene copy manual protegido por el contrato de pruebas.
  - avoid: Introducir updater, Engram o banner como novedades de `0.18.0`, afirmar assets/tags remotos o reclamar generación automática del README.
  - evidence: El resumen queda antes de `// 000`, enlaza al anchor calculado y contiene sólo tres bullets trazables a la primera entrada del changelog.
  - verify: `bun test tests/readme-release-ia.test.ts tests/release-asset-contract.test.ts`

- [x] 2.3 Sustituir en `README.md` las recomendaciones nominales de proveedores/modelos por criterios de capacidad, riesgo y coste; conservar `/ein:models`, `/ein:models:full`, `/ein:models:lite` y el cambio dirigido por la persona usuaria sin fallback automático.
  - skills: `readme-style`, `cognitive-doc-design`
  - why: Mantiene una guía útil cuando los nombres concretos envejecen y sin alterar la configuración real.
  - learn: Describir el tipo de trabajo y su riesgo es más durable que prescribir un modelo concreto.
  - architecture: La documentación guía la elección; `ein-pi/agent/lib/model-config.ts` continúa siendo la implementación de presets y no cambia.
  - avoid: Añadir proveedores/modelos nuevos, modificar presets/routing/fallback o dejar `gpt-5.5`, `MiniMax-M3` o `MiniMax-M2.7` en la guía afectada.
  - evidence: La sección recomienda razonamiento fuerte para arquitectura, ambigüedad, revisión adversarial y alto riesgo; y ejecución económica para trabajo acotado, especificado, repetitivo o mecánico.
  - verify: `bun test tests/readme-release-ia.test.ts && git diff --check`

- [x] 2.4 Ajustar únicamente los claims directamente afectados de `README.md`: bootstrap como único canal confirmado, WSL como vía Linux, ejemplo de publicación genérico `installer-v<semver>`, Engram opcional y acotado a fuente/desarrollo, y eliminación de la promesa de que `ein update` actualiza Pi.
  - skills: `release`, `cognitive-doc-design`, `readme-style`
  - why: Evita convertir evidencia de fuente, desarrollo o workflow local en promesas públicas de una release o un canal inexistente.
  - learn: Separar «publicado según registro local» de «verificado en fuente» protege la precisión de la documentación.
  - architecture: Workflow, changelog, versiones e instalador son entradas de sólo lectura; el contrato downstream `homebrew-install-channel` permanece bloqueado hasta tap/fórmula publicada, instalación y upgrade limpios verificados, y ownership explícito del updater.
  - avoid: Documentar assets manuales, Homebrew, tap, fórmula, cask, upgrade, badge de disponibilidad o nuevas promesas de updater/banner fuera de la evidencia permitida.
  - evidence: No queda claim de Homebrew para Ein; WSL no aparece como canal independiente; Engram conserva adapter CLI opcional, OpenSpec canónico y fallos no bloqueantes; el tag de ejemplo no fija una versión obsoleta.
  - verify: `bun test tests/readme-release-ia.test.ts tests/release-asset-contract.test.ts && git diff --check`
