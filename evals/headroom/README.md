# Headroom en Ein: piloto de extensión Pi

Estado: experimental, apagado por defecto. Headroom 0.37.0, Python 3.13.14,
Pi 0.84.4, Bun 1.3.14; probado en macOS arm64. Consulta `results.md` para los
resultados y las limitaciones; `metrics.json` contiene las mediciones.

## Qué se activa

La extensión recibe `tool_result` y envía **solo una salida nueva de bash** a
`POST /v1/compress` en loopback. Pi sigue llamando directamente a su proveedor.
Headroom no recibe el prompt, el historial, las credenciales ni el razonamiento.
No se añaden herramientas al modelo ni se cambia su esfuerzo.

El perfil final solo admite arrays JSON grandes de objetos planos. Antes de
entregar una tabla, Ein comprueba todas las filas, su orden, columnas, tipos,
valores y multiplicidades contra el JSON original. Se admite un subconjunto
estricto del formato `csv-schema`: strings simples no vacíos, enteros seguros
y booleanos. Comillas, comas o saltos en strings, estructuras anidadas, esquemas
mixtos, floats, campos ausentes o formatos desconocidos conservan el original.
No se afirma compatibilidad con todo JSON.

El original se guarda con permisos 0600 en `.pi/ein/headroom/<sesión>/<hash>.txt`.
El agente puede abrirlo con `read`, que nunca se comprime. No depende del TTL de
Headroom ni de que su servicio siga vivo. Las sesiones no comparten sus rutas.
El almacenamiento tiene un límite de 32 MiB por sesión, comprobado en disco.
Los originales persisten para reanudar y auditar; no hay limpieza automática.

Solo se consideran salidas entre 8 KiB y 200 KB, con margen para el aviso de
recuperación y al menos un 10 % de reducción conservadora en bytes. El límite
superior no evita el truncado previo de Pi: si Pi ya truncó, la extensión pasa
la salida sin modificarla. Errores de herramientas, evidencias SDD, resultados
delegados, código, logs, tests y comandos ya envueltos en Hypa quedan intactos.

El timeout es 1,5 s, sin reintentos. Tras tres fallos consecutivos se deja de
consultar al servicio durante esa sesión. Una respuesta inválida, cancelación,
falta de `read`, falta de espacio o error de archivo conserva el resultado de
Pi. `details`, `isError` y `usage` no se reemplazan. Los metadatos de observación
se escriben como entradas de sesión `ein-headroom`, nunca como hechos del test.

## Probarlo sin desplegar otra versión de Ein

Desde este worktree, prepara el servicio una vez:

```bash
bash tooling/headroom-service.sh setup
bash tooling/headroom-service.sh serve
```

En otra terminal, desde el proyecto donde quieres probarlo:

```bash
EIN_HEADROOM_MODE=observe ein-pi -e /private/tmp/ein-pi-headroom/ein-pi/agent/extensions/ein-headroom.ts
```

`observe` mide sin cambiar resultados; `on` entrega las tablas verificadas:

```bash
EIN_HEADROOM_MODE=on ein-pi -e /private/tmp/ein-pi-headroom/ein-pi/agent/extensions/ein-headroom.ts
```

`/ein:headroom` muestra las mediciones de esa sesión. `wouldSaveBytes` es una
estimación conservadora del modo observación, descontando 600 bytes de margen;
`savedBytes` es la reducción real del texto entregado. No equivalen a ahorro de
factura. Una configuración inválida se explica mediante ese comando.

Para salir de la prueba, termina el servicio y arranca Ein normalmente sin
`EIN_HEADROOM_MODE=on` ni `-e`. No se modifican settings de usuario ni URLs de
proveedores. El perfil desactiva beacon, memoria, ML, CCR del proxy y ajustes del
razonamiento; no utiliza `headroom wrap` ni registra Serena.

Variables opcionales: `EIN_HEADROOM_URL` (origen HTTP literal 127.0.0.1 o [::1]),
`EIN_HEADROOM_TIMEOUT_MS` (50–5000), `EIN_HEADROOM_SERVICE_DIR` y
`EIN_HEADROOM_PORT` (servicio). Si cambias el puerto, configura también la URL
de la extensión. El perfil no autentica el servicio local; solo escucha en
loopback. No es una configuración para un servicio compartido entre usuarios.

## Reproducir las mediciones

```bash
bun tooling/headroom-pilot.ts /tmp/ein-headroom-replay http://127.0.0.1:8787
```

El replay usa la herramienta bash real de Pi: conserva sus truncados y compara
salidas de Ein, el wrapper Hypa explícito y la combinación con Headroom. El brazo
`hypa-generic-experimental` prueba otra API de Hypa que Ein no usa actualmente.
Incluye datos del repositorio y dos casos sintéticos etiquetados. Nunca llama
a un modelo. `HYPA_BIN` selecciona el ejecutable para la comparación.

Para el piloto con modelo, prepara un hogar Pi separado con autenticación propia
y sin paquetes adicionales. El siguiente comando consume cuota del proveedor;
ejecuta 12 sesiones acotadas, en directorios nuevos:

```bash
EIN_HEADROOM_URL=http://127.0.0.1:8787 bun tooling/headroom-live-pilot.ts \
  /tmp/ein-headroom-live-new /tmp/ein-headroom-replay /ruta/al/hogar-pi-aislado
```

Usa gpt-5.6-luna/low mediante openai-codex por defecto; las variables
`EIN_HEADROOM_PILOT_MODEL` y `EIN_HEADROOM_PILOT_PROVIDER` seleccionan otra
configuración explícita. No hay fallback automático de modelo. Se alterna el
orden de los brazos y se verifica desde fuera del modelo, con pruebas reservadas
en la reparación y respuestas calculadas independientemente en los otros casos.
Es una prueba de la extensión con el contrato de apply, no del orquestador SDD
completo ni de su aislamiento de capacidades.

```bash
.pi/ein/headroom-service/venv/bin/python tooling/headroom-metrics.py \
  /tmp/ein-headroom-replay /tmp/ein-headroom-live-new /tmp/headroom-metrics.json
```

Usa directorios nuevos en cada ejecución para no mezclar sesiones o evidencias.
`requirements.lock` fija las 92 distribuciones Python del entorno ensayado;
no incluye un modelo ML. La instalación y el perfil no se añaden al instalador
normal de Ein.
