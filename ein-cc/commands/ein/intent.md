---
description: Interroga la petición en rondas y cierra a disco en intent.md, solo si el usuario confirma
---

Ejecuta el protocolo de la skill `intent-channel`, sección `## /ein:intent`. No
lo repitas aquí: lee ese fichero (desplegado en tu carpeta `skills/`) y síguelo
al pie de la letra — el orden de las rondas, la delegación de hechos a
`ein-scout`, cierre a `openspec/changes/<change>/intent.md` únicamente cuando el
usuario confirme.

Si el usuario pasó argumentos, entiéndelos como la petición inicial y modela
la primera ronda sobre ella. Si no pasó nada, arranca en frío tal como
describe la skill.
