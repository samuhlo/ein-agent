# 04 · Restauración completa del template

Estado: diseño para implementar; no implementado ni verificado como producto.
Base inspeccionada: `origin/main`, `3b9fa42` (alpha.9). No aplicar sobre el árbol local sucio.
Principios: MANIFIESTO §§002 y 006; recuperar significa restaurar el estado comprobado.

## A. Proposal

Una actualización fallida debe dejar la instalación como estaba antes de empezarla.
Hoy `snapshotTemplate` y `restoreTemplate` conservan directorios y solo dos archivos raíz.
El paquete también sobrescribe `AGENTS.md`, `app.ts`, `settings.json`, `models.json`,
`brand.json` y `extensions-manifest.json`. El rollback puede devolver éxito con versiones mezcladas.
El probe `/private/tmp/ein-manifest-template-rollback-probe.ts` reproduce esa mezcla en memoria.

Crear un inventario versionado de los archivos y directorios que el despliegue puede modificar.
El empaquetador lo produce; el candidato verificado lo entrega antes de desplegar;
la transacción lo usa para guardar presencia, contenido y modo anteriores y verificarlos al restaurar.
No ampliar este trabajo a rollback de npm, binarios externos o sincronización de Claude.
La garantía comienza en transacciones COORDINADAS por el instalador corregido: el controlador
antiguo hace snapshot antes de arrancar el candidato y no conoce el nuevo protocolo.
Instalar por primera vez esta versión desde un updater antiguo no obtiene protección retroactiva.
Publicar esa limitación de bootstrap; no rediseñar aquí el protocolo de runtime-surfaces.

## B. Spec · Given / When / Then

- Dada una instalación anterior con `app.ts` y política antiguos, cuando falla el despliegue
  después de extraer el nuevo paquete, entonces ambos recuperan sus bytes y modos anteriores.
- Dado un archivo nuevo del candidato antes ausente, cuando se restaura, entonces desaparece;
  un archivo no perteneciente al inventario permanece intacto.
- Dadas preferencias personales en `settings.json`, cuando la actualización termina bien,
  entonces se conserva la mezcla actual de campos personales; cuando revierte, vuelve el archivo
  anterior completo, sin volver a mezclarlo con defaults de la versión nueva.
- Dados `skills/` o `themes/` con archivos personales, cuando se revierte, solo se restauran
  las hojas que el paquete modificó; nunca se borra su árbol completo.
- Dado un snapshot incompleto, corrupto o con enlaces fuera de la raíz, cuando se pide restore,
  entonces se rechaza antes de borrar archivos y se conserva la evidencia de recuperación.
- Dado un fallo de copia a mitad del restore, entonces no se registra `succeeded`, se conservan
  snapshot y journal y el siguiente intento puede repetir la restauración de forma idempotente.
- Dado un snapshot antiguo sin inventario, entonces se informa `recovery-required`;
  no se presenta una restauración parcial como recuperación probada.

## C. Decisions

### Inventario y propietarios

Crear `installer/src/core/template-inventory.ts`, sin imports de assets, con schema v1 y validadores.
Mover allí las listas de propiedad que consumen bundle y deploy; no mantener una tercera copia.
Separar `replaceTrees` de `overlayFiles`: los primeros son árboles enteros propios de Ein
(`MANAGED_DIRS` actuales); los segundos son archivos raíz y hojas empaquetadas en árboles mixtos
como `skills`, `themes` y `surfaces`. Un árbol no puede aparecer en ambas categorías.
El empaquetador enumera hojas del staging final, sin seguir symlinks, y registra rutas relativas
normalizadas. Incluir el propio `template-manifest.json` como archivo, sin hash autorreferencial.
El inventario no incluye `auth.json`, sesiones, backups, npm ni configuración no desplegada.
Añadir `.sdd` u otra ruta solo porque existe en destino está prohibido.

`writeGlobalLinearIntegration` también escribe fuera del listado del tar: incorporar su ruta
relativa concreta, derivada por `globalLinearIntegrationConfigPath`, como efecto del despliegue.
El inventario de efectos es la unión del paquete y de esas escrituras declaradas por el deploy.
Los campos personales actuales de settings siguen siendo los de `settings.ts`; no redefinirlos.
Rollback restaura todo el archivo anterior: incluye sus campos personales y defaults antiguos.

### Obtención antes de escribir

El candidato añade `--ein-template-inventory`, una consulta sin despliegue que imprime JSON
con versión de binario, versión de template e inventario. Reutilizar `readBundledManifest`;
sus temporales internos se eliminan, y no puede tocar la instalación ni invocar npm.
El padre ejecuta exclusivamente el candidato ya adquirido y verificado; exige versión esperada,
schema válido, rutas cerradas y respuesta acotada a 1 MiB antes de crear el snapshot.
No confiar en el manifest instalado para describir los archivos nuevos.
Un candidato antiguo sin esta capacidad bloquea la actualización antes de sustituir el binario;
no inventar inventario a partir de nombres incompletos ni quitar el requisito para un downgrade.

### Snapshot, restore y prueba

Snapshot v1 guarda por ruta: tipo, presencia anterior, modo y hash; copia bytes anteriores.
Para `replaceTrees`, copia y registra recursivamente el árbol anterior completo.
Para overlays, registra también los padres antes ausentes; al restaurar solo elimina esos padres
si siguen vacíos. Una colisión archivo/directorio o symlink se rechaza antes de mutar.
La raíz y sus ancestros se comprueban con capacidades de filesystem; no seguir enlaces.
Usar `UpdateCaps.fs` también para limpiar: retirar la llamada directa a `cleanManagedDirs`
dentro de `restoreTemplate`, que hoy mezcla disco real con capacidades simuladas.
Añadir a las capacidades solo enumeración de directorio sin seguimiento de enlaces;
hash, inspect, copy, remove, chmod y rename ya existen.
Prevalidar todas las copias y el índice antes del primer borrado. Restore puede interrumpirse,
pero es repetible; verificar bytes, presencia y modos del destino antes de devolver `ok:true`.
`createTransaction` solo registra rollback satisfactorio después de esa verificación.
No eliminar snapshot/journal al fallar la verificación ni declarar atomicidad de todo el árbol.

## D. Acceptance

- Comparación anterior/post-rollback de todas las rutas propias, incluidos archivos ausentes.
- Preferencias personales, archivo de usuario en `skills/` y archivo ajeno a Ein intactos.
- Fallos inyectados en extracción, copia, chmod y read-back nunca producen éxito falso.
- Caso real con filesystem temporal y caso simulado recorren el mismo algoritmo de restore.
- El probe inicial pasa a esperar versiones antiguas de TODOS los archivos raíz.
- Validación de release: arrancar el coordinador corregido sobre una fixture de instalación antigua,
  preparar un candidato nuevo que falle tras desplegar y verificar restauración íntegra.
  Separar ese ensayo de antiguo-coordinador→nuevo, que conserva explícitamente la limitación anterior.
- Ningún test llama al instalador personal ni a red; candidatos de prueba son fixtures locales.

## E. Paquetes cerrados de ejecución

### 04.1 · Inventario emitido y consulta del candidato

Leer: `installer/scripts/bundle-template.ts`, `installer/src/core/deploy.ts`,
`installer/src/core/verify.ts`, `installer/src/main.ts` y `installer/src/core/settings.ts`.
Crear producción: `installer/src/core/template-inventory.ts`.
Editar producción: `installer/scripts/bundle-template.ts`, `installer/src/core/verify.ts`,
`installer/src/main.ts` (cuatro archivos contando el nuevo).
Pasos: definir schema y rutas; incorporar inventario al manifest después del staging;
añadir campo tipado opcional al lector legacy; publicar consulta privada sin despliegue.
Crear `tests/template-inventory.test.ts`; ampliar `tests/template-agent-inventory.test.ts`.
Comando: `bun test tests/template-inventory.test.ts tests/template-agent-inventory.test.ts`.
Parar si el inventario no representa una escritura real del deploy; cerrar esa lista antes de seguir.

### 04.2 · Snapshot y restauración por capacidades

Leer: inventario nuevo, `installer/src/core/template-transaction.ts`,
`installer/src/core/update-caps.ts`, `tests/helpers/fake-update-caps.ts`.
Editar producción: `installer/src/core/template-transaction.ts`, `installer/src/core/update-caps.ts`.
Pasos: añadir enumeración segura; snapshot v1 con ausencias; prevalidar; restaurar y comprobar;
rechazar snapshots legacy sin prueba suficiente, manteniendo sus archivos.
Editar helper de pruebas y crear `tests/template-rollback-inventory.test.ts` con filesystem real
temporal además de fake caps; no llamar `cleanManagedDirs` fuera de las capacidades.
Comando: `bun test tests/template-rollback-inventory.test.ts tests/deploy-settings.test.ts`.
Parar si un test necesita borrar una raíz externa a su `mkdtemp`.

### 04.3 · Cableado de transacción y fallos reales

Leer: salida de 04.1/04.2, `installer/src/core/transaction.ts`,
`installer/src/core/binary-probe.ts`, `installer/src/core/child-continuation.ts`.
Editar producción: `installer/src/core/transaction.ts`, `installer/src/core/template-transaction.ts`.
Pasos: obtener inventario del candidato antes de snapshot/reemplazo; pasar inventario validado;
propagar restore inválido; conservar evidencia en fallos; no convertir legacy en éxito.
Ampliar `tests/release-update-integration.test.ts` y `tests/release-update-transaction.test.ts`.
Comando: `bun test tests/release-update-integration.test.ts tests/release-update-transaction.test.ts tests/template-rollback-inventory.test.ts`.
Cerrar solo después de un fallo tras extracción que restituya bytes y ausencias.

### 04.4 · Mismo inventario en el despliegue

Leer: inventario de 04.1 y `installer/src/core/deploy.ts`.
Editar producción: `installer/src/core/deploy.ts`, `installer/src/core/template-inventory.ts`.
Pasos: importar listas compartidas; validar el inventario del bundle ANTES de clean/extract;
limpiar exclusivamente `replaceTrees`; asegurar que las escrituras adicionales declaradas
coinciden con las ejecutadas. Conservar el export `MANAGED_DIRS` como alias compatible.
No limpiar overlays completos ni eliminar archivos personales al retirar una hoja del paquete.
Ampliar `tests/template-agent-inventory.test.ts`, `tests/template-rollback-inventory.test.ts`
y `tests/deploy-settings.test.ts` con bundle real en raíz temporal.
Comando: `bun test tests/template-agent-inventory.test.ts tests/template-rollback-inventory.test.ts tests/deploy-settings.test.ts`.
Este paquete precede a la validación final de 04.3; no publicar una transacción cuyos dos extremos
usen inventarios distintos. Si mergeUserSettings falla, desplegar no puede continuar como éxito:
debe propagar el fallo y dejar rollback restaurar el preimage; acotar ese cambio a
`installer/src/core/settings.ts` como tercer archivo de producción de este paquete.

### Compatibilidad y reversión de la entrega

Los manifests instalados antiguos siguen siendo legibles para doctor; no acreditan rollback v1.
Un coordinador corregido puede actualizar una instalación antigua porque guarda su estado observado;
no necesita inventario antiguo para copiar árboles propios y preimages de overlays del candidato.
No migrar snapshots antiguos de forma destructiva. El cambio de formato requiere fixtures explícitas.
Revertir los commits de código no autoriza borrar snapshots v1 existentes: conservarlos para recuperación.
Orden de ejecución: 04.1 → 04.2 → 04.4 → 04.3; entregar sin activar 04.3 antes de sus dependencias.
