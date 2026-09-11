# Vendor

Este árbol contiene fuentes externas que Ein distribuye, pero no posee.

`skills/` se construye a partir del catálogo de `runtime/skills/stack-profile.json`.
El empaquetado lo proyecta como `skills/downloaded/`; el código propio nunca debe
crecer dentro de este directorio.

Los README bajo `skills/react/` y `skills/tsdown/` pertenecen a sus fuentes externas. Sus instrucciones de instalación y generación describen esos proyectos originales: no son pasos para desarrollar o instalar Ein, y el snapshot distribuido puede omitir sus herramientas de autoría. Para cambiar el catálogo de Ein se revisa el perfil y se sincroniza el vendor; no se reescriben estos README como documentación propia.

Distribuir una skill no significa inyectarla entera al arrancar el orquestador. Pi selecciona las pertinentes para cada ejecutor y le entrega las rutas de sus instrucciones; Claude usa su adaptación y descubrimiento nativo.
