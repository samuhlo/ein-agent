---
title: "Instalar Ein"
description: "Instalación estable o alpha, requisitos y primera comprobación."
sources: ["installer/install.sh", "installer/src/core/deps.ts", "installer/README.md"]
verified_rev: "7c3dd072fdc872b46f680e09325c722ce59efa1b"
---

Ein soporta macOS y Linux, en ARM64 y x64. Windows no está soportado. Pi es el núcleo y requiere Node **22.19.0 o posterior**; si no cumple el requisito, el instalador se detiene con instrucciones. Los binarios del instalador son standalone; el runtime tiene sus propias dependencias y autenticación.

## Canal estable

```bash
curl -fsSL https://raw.githubusercontent.com/samuhlo/ein-agent/main/installer/install.sh | bash
ein
```

El bootstrap descarga el instalador, comprueba el asset y lo ejecuta. Conserva `ein-install` como herramienta de ciclo de vida e instala `ein` como aplicación de terminal. Puede ser necesario abrir una terminal nueva para recoger el PATH.

## Probar una alpha

El comando anterior selecciona **estable**. Para una alpha, copia el comando exacto de sus [notas de release](https://github.com/samuhlo/ein-agent/releases): el bootstrap exige juntos `--release-channel` y `--release-tag`. El enlace de GitHub `releases/latest` no selecciona prereleases.

Si ya tienes Ein:

```bash
ein-install update --channel alpha
```

Guarda alpha como preferencia tras una actualización correcta. Para volver al canal estable usa `ein-install update --channel stable`. Para fijar una versión, pasa a `update` el tag exacto de sus notas. Abre una sesión nueva de Ein después de actualizar.

## Pi y Claude

Pi se instala siempre. Puedes añadir Claude Code como relevo opcional:

```bash
ein-install install --runtime pi
# Alternativa, con Claude:
ein-install install --runtime both
```

No ejecutes ambos para una instalación normal: elige uno. Los hogares de Ein son `~/.pi-ein/agent` y `~/.claude-ein`. `pi` y `claude` conservan sus entradas vanilla. Consulta la [matriz](/ein-agent/03-runtimes/runtime-matrix/) antes de elegir Claude para un cambio.

`--yes` evita las preguntas del instalador; no autoriza por adelantado cualquier acción futura sobre tus proyectos. Las [integraciones opcionales](/ein-agent/04-reference/optional-tooling/) no son requisitos para empezar.

## Comprobar y trabajar

```bash
ein-install doctor
cd /ruta/a/tu/proyecto
ein
```

Doctor diagnostica el despliegue, no la calidad de tu proyecto. Configura la autenticación y los modelos que vayas a usar en el runtime. Puedes empezar con servicios alojados; el modelo local es un objetivo futuro y opcional.

Para probar código del repositorio sin publicar, sigue [desarrollo local](https://github.com/samuhlo/ein-agent/blob/main/installer/README.md#desarrollo). Ese despliegue modifica tu instalación activa: no crea un perfil desechable.

Sigue con [tu primer cambio](/ein-agent/00-start/first-run/).
