---
description: Dónde está el trabajo: cambio activo, fase, siguiente paso y ajustes del proyecto
allowed-tools: Bash(ein-cc-sdd status:*)
---

Estado determinista del proyecto, ya resuelto por `ein-cc-sdd` — cero adivinación:

!`ein-cc-sdd status`

Preséntaselo al usuario en su idioma, en una lectura corta y honesta:

- **Dónde está el trabajo**: el cambio activo y su fase; si no hay ninguno, dilo sin rodeos.
- **Cuál es el siguiente paso**: exactamente el que indica `next:`. No propongas otro.
- **Qué reglas rigen**: solo los ajustes que cambian lo que vas a hacer ahora — TDD estricto, modo de trabajo, idioma de los artefactos. Un ajuste marcado `no aplica aquí` se dice tal cual; no lo presentes como activo.
- **Qué hay sin confirmar**: el estado del árbol de trabajo, si lo hay.

No relances el comando ni investigues por tu cuenta para ampliar la respuesta: lo que no aparece arriba, no se afirma. Si el usuario pasó argumentos, entiéndelos como el cambio concreto sobre el que pregunta.
