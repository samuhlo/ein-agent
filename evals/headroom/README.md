# Headroom en Ein-Pi

Headroom sustituye el wrapper de Hypa en esta versión del runtime. Es un motor
local opcional: Ein funciona sin él. La compresión solo se entrega después de
comprobar que conserva los datos. [Resultados actuales](integration-results.md).

## Uso

Con **esta versión completa de Ein-Pi** instalada:

```text
/ein:headroom update 0.37.0
/ein:headroom on
/ein:headroom status
```

`update` necesita `uv`. Prepara un entorno aislado con el paquete oficial,
lo arranca en un puerto temporal y ejecuta las pruebas de compatibilidad.
Solo selecciona el candidato si pasan. La versión probada es 0.37.0; no se
presume compatibilidad con cualquier versión futura.

| Comando | Efecto |
| --- | --- |
| `on` | Entrega las compresiones verificadas; persiste por proyecto. |
| `observe` | Mide sin modificar lo que recibe el modelo. |
| `off` | Conserva la salida normal de Pi. |
| `status` | Comprueba conexión y versión; muestra mediciones de la sesión. |
| `start` | Arranca un binario instalado o reutiliza un servicio existente. |
| `stop` | Detiene exclusivamente el servicio que arrancó esta sesión. |
| `retry` | Reabre el circuito tras fallos; no reejecuta comandos. |
| `update VERSION` | Comprueba un candidato sin cambiar el proceso en uso. |
| `rollback` | Selecciona la versión gestionada anterior para el próximo arranque. |

Ein interactivo arranca en segundo plano un servicio ya instalado cuando el
modo lo permite. No descarga dependencias al abrir una sesión. Los workers lo
reutilizan. Tras actualizar, usa `stop` y `start` para cambiar un proceso propio
en un momento conveniente. Nunca se termina un servicio externo al cerrar Ein.

La preferencia vive en `.pi/ein/headroom.json`, con `{ "version": 1, "mode": "on" }`.
Ajustes, onboarding, banner y doctor comparten esa preferencia. El valor inicial
es `on`: requiere un servicio disponible y un resultado verificable. Un antiguo
`hypa=off` permanece apagado; auto/on válidos pasan a Headroom sin reescribir el
archivo antiguo. Un ajuste antiguo inválido se trata como apagado. `/ein:hypa`
es solo un aviso de compatibilidad y no ejecuta el wrapper.

## Límites y garantías

La extensión actúa en `tool_result`, sin cambiar comandos, permisos o streaming.
Comprueba todas las columnas, tipos, filas, valores, orden y duplicados de tablas
JSON. Admite strings con comillas, comas y saltos, booleanos y números cuya
representación puede verificar. Rechaza claves duplicadas, esquemas desconocidos,
números que perderían precisión y la ambigüedad null/string vacío en columnas
nullable. Conserva íntegro un pie de hasta 2.048 caracteres tras un array JSON.

Para logs con prefijo temporal común reconstruye cada línea y compara toda la
secuencia. Los diagnósticos muestran su fecha completa, en su posición original.
Si Pi truncó una salida, puede leer su spool completo, acotado y sin seguir
symlinks. No abre rutas extraídas del texto ni rutas arbitrarias.

Código, diffs, resultados delegados, contratos SDD, comandos fallidos, contenido
binario y formatos no admitidos pasan intactos. `details`, `isError` y `usage`
siguen siendo los de Pi. Las mediciones no sustituyen la evidencia SDD.

Se consideran salidas de 8 KiB a 512 KiB. La vista final debe ahorrar al menos
10 % de bytes frente al original y caber en 48.000 bytes, con el aviso incluido.
El formato compacto tiene un límite de 1.800 líneas. Si no cabe o no puede
verificarse, se conserva la vista normal de Pi, incluido su aviso de truncado.

El timeout local es 1,5 s, sin reintentos. Tres fallos consecutivos pausan las
consultas hasta `retry` o un nuevo arranque. Cancelar no cuenta como fallo del
servicio. Antes del primer envío y cada 30 segundos se comprueba la respuesta
de salud del endpoint. Si no se identifica como Headroom, se conserva la salida
de Pi sin enviarle el contenido.

## Originales y observación

El original queda en `.pi/ein/headroom/<sesión>/<sha256>.txt`, con permisos 0600
y una regla de ignore propia para evitar incluirlo en un `git add` normal.
`read` puede recuperarlo después de detener Headroom; no depende del TTL de CCR.
No se borra al compactar ni al cerrar. Hay un presupuesto de 32 MiB por sesión;
no se limpian automáticamente sesiones antiguas. Si no puede guardarse, la
salida no se sustituye.

Los eventos `ein-headroom` distinguen compresión, observación, rechazo,
cancelación, servicio no disponible y fallo de archivo. Los contadores se
restauran al reanudar la rama de una sesión. `savedBytes` compara con el original;
`promptSavedBytes` compara con la vista de Pi, que puede estar truncada;
`fullRecovered` cuenta informes completos recuperados. `wouldSaveBytes` es una
estimación de observación con 600 bytes de margen. No equivalen al ahorro de
factura o al contexto acumulado de toda la tarea.

## Mantenimiento y configuración avanzada

Las versiones gestionadas viven bajo `~/.pi-ein/agent/headroom/versions`.
`active` selecciona la comprobada y `previous` permite volver atrás. La selección
es atómica; un candidato rechazado no reemplaza al activo y los procesos vivos
conservan su versión. Un bloqueo evita mantenimientos simultáneos y recupera un
dueño que haya muerto. No se eliminan bloqueos de procesos vivos o desconocidos.
Cancelar conserva la selección anterior. Las instalaciones anteriores se guardan;
`rollback` requiere una versión gestionada previa.

| Variable | Uso |
| --- | --- |
| `EIN_HEADROOM_MODE` | Override de sesión sobre el proyecto; `status` lo identifica. |
| `EIN_HEADROOM_URL` | HTTP literal en 127.0.0.1 o [::1]; defecto `http://127.0.0.1:8787`. |
| `EIN_HEADROOM_TIMEOUT_MS` | 50–5.000 ms. |
| `EIN_HEADROOM_BIN` | Binario prioritario sobre la instalación gestionada y PATH. |
| `EIN_HEADROOM_SERVICE_DIR` | Directorio absoluto alternativo del servicio y versiones. |

El perfil no usa ML, memoria, CCR, beacon, `headroom wrap` o Serena. No cambia
URLs de proveedores, esfuerzo ni herramientas del modelo. La extensión no envía
historial o credenciales del proveedor al compresor. El instalador conserva su
oferta histórica de Hypa para una decisión posterior; instalar Hypa no activa
Headroom.

## Desarrollo y reproducción

No superpongas solo esta extensión a un Ein antiguo: también cambió el propietario
de comandos y ajustes. Se puede construir el runtime completo con
`bun run dev:install --build-only`; el despliegue sigue el procedimiento habitual
del repositorio. Las pruebas utilizaron hogares Pi aislados.

El mismo mantenimiento está disponible desde el checkout:

```bash
bun tooling/headroom-maintain.ts update 0.37.0
bun tooling/verify-headroom-runtime.ts http://127.0.0.1:8787
bun tooling/headroom-maintain.ts rollback
```

Para repetir el estudio, prepara un hogar Pi aislado con autenticación y sin
paquetes adicionales. Usa un directorio nuevo. **Consume cuota: 40 sesiones.**

```bash
EIN_HEADROOM_URL=http://127.0.0.1:8787 bun tooling/headroom-acceptance-pilot.ts \
  /tmp/headroom-study /ruta/al/hogar-pi-aislado 5
```

Usa gpt-5.6-luna/low mediante openai-codex por defecto. Se puede elegir otro modelo
con `EIN_HEADROOM_PILOT_MODEL` y `EIN_HEADROOM_PILOT_PROVIDER`; no hay fallback
automático. El corpus se registra antes del primer request y conserva fallos.

```bash
/ruta/al/python-de-headroom tooling/headroom-acceptance-summary.py \
  /tmp/headroom-study /tmp/headroom-summary.json
```

Los scripts `headroom-pilot.ts`, `headroom-live-pilot.ts` y `requirements.lock`
conservan el primer experimento como referencia histórica. El informe vigente
es [integration-results.md](integration-results.md).
