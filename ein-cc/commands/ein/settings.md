---
description: Qué reglas del proyecto rigen esta sesión y cuáles no aplican en Claude
allowed-tools: Bash(ein-cc-sdd settings:*)
---

Ajustes del proyecto, resueltos desde su configuración:

!`ein-cc-sdd settings`

Resume al usuario en su idioma qué reglas está siguiendo la sesión ahora mismo. Dos cosas que no se pueden omitir:

- Lo que aparece bajo **Not applied** se dice explícitamente, con su motivo. Un ajuste que este runtime no puede honrar no es un ajuste activo, y callarlo es la forma de que el trabajo cambie de estándar sin que nadie se entere.
- Estas reglas ya están en tu contexto: se inyectaron al arrancar la sesión. Este comando las muestra, no las activa.

**Para cambiarlas**, el sitio es Pi o el launcher de Ein: la configuración vive en el proyecto (`.pi/ein/`) y la comparten los dos runtimes, así que un cambio hecho ahí vale para ambos. No edites esos ficheros a mano desde aquí a menos que el usuario lo pida.
