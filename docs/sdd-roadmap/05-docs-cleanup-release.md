# // 000. Plan: Documentation Cleanup and Release

**Objetivo:** despues de implementar los planes 01-04, limpiar la documentacion del proyecto para que refleje el estado real.

---

## // 001. POR QUE

Despues de implementar cambios en el sistema SDD, la documentacion existente suele quedar desincronizada:

- Comandos que ya no existen siguen mencionados.
- Flujos que cambiaron siguen documentados con el viejo orden.
- Ejemplos que ya no aplican siguen en los READMEs.

Este plan identifica los puntos especificos de friccion y los limpia antes de un release o publicacion.

---

## // 002. DOCUMENTACION A REVISAR

### README raiz del proyecto

**Problema conocido:** la tabla o seccion que dice que el flujo SDD termina en `verify` mientras que otra seccion posterior menciona `archive`.

**Accion:** buscar en `README.md` y `ein-pi/agent/README.md` (si existe) cualquier referencia a:
- "flujo SDD" o "SDD flow"
- `init → explore → design → tasks → apply → verify` (sin `archive`)
- Cualquier comando que ya no exista (`/ein:sdd-check`, `/ein:sdd-archive` como comandos principales, no como alias)

### AGENTS.md

**Problema conocido:** la tabla de comandos publicos puede no reflejar los nuevos canonicos (`/ein:sdd-audit`, `/ein:sdd-close`, `/ein:sdd-next`).

**Accion:** verificar que la tabla de comandos incluye todos los comandos actuales con su descripcion correcta.

### Orchestrator.md

**Problema conocido:** la seccion de SDD Flow puede mencionar `archive` pero sin referencia a `/ein:sdd-close` como comando canonico.

**Accion:** actualizar la referencia del chain para incluir `sdd-tasks` si el plan 02 fue implementado.

### Documentacion de i18n / help

Si existe un comando `/ein:help` o documentacion de comandos, verificar que los nuevos comandos aparecen.

### CHANGELOG

**Problema conocido:** no existe CHANGELOG o no refleja los cambios de los planes 01-04.

**Accion:** si hay CHANGELOG, agregar entrada. Si no existe, crear con el formato conventional changelog.

### Installer version

Si el release incluye cambios en el installer (`installer/`), verificar que `package.json` tiene la version correcta y que el changelog del installer esta sincronizado.

---

## // 003. DOCUMENTACION STALE CONOCIDA HOY

| Archivo | Problema | Accion |
|---------|----------|--------|
| README.md (raiz) | Tabla dice flujo termina en verify, seccion posterior menciona archive | Unificar a `verify → close` con comando canonico `/ein:sdd-close` |
| `ein-pi/agent/README.md` (si existe) | Mismos problemas de desincronizacion | Misma accion |
| AGENTS.md | Tabla de comandos no incluye `/ein:sdd-audit`, `/ein:sdd-close`, `/ein:sdd-next` | Agregar entradas |
| `orchestrator.md` | Section SDD Flow no menciona `/ein:sdd-next` | Agregar referencia |

---

## // 004. TESTS / CHECKS

```
[ ] Buscar en README.md referencias a "verify" como fase final sin mention de archive/close
[ ] Buscar en AGENTS.md si todos los comandos canonicos estan documentados
[ ] Buscar en orchestrator.md si sdd-tasks aparece (si plan 02 se implemento)
[ ] Verificar que /ein:help muestra los comandos correctos (si aplica)
[ ] Si hay CHANGELOG, verificar que los cambios de planes 01-04 estan reflejados
[ ] Verificar que el numero de version en package.json aumento si corresponde
```

---

## // 005. RIESGOS

- **Riesgo bajo.** Solo documentacion.
- **Riesgo de遗漏:** puede haber archivos de documentacion que no se identificaron. La busqueda por grep mitiga esto.
- **Riesgo de inspección incompleta:** los problemas conocidos se documentan aqui, pero podria haber otros. Se recomienda una lectura rapida de los archivos relevantes antes de aplicar.

---

## // 006. NOMBRE DE COMMIT

```
docs: sync SDD command documentation and cleanup stale references
```

O, si incluye version bump:

```
release: bump version and sync documentation after SDD reorganization
```

---

## // 007. ORDEN DE APLICACION

Este plan se aplica al final, despues de que los planes 01-04 esten implementados y verificados. No tiene sentido limpiar documentacion antes de que los cambios esten hechos.

---

## // 008. NOTA

Si no hay release planned, este plan puede reducirse a solo la limpieza de la tabla README y la sincronizacion de AGENTS.md. El resto puede esperar al siguiente release natural.
