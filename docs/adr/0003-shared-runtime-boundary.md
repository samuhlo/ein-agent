# ADR 0003 — Frontera del núcleo compartido

status: accepted
date: 2026-09-02

## Contexto

Pi y Claude deben ejecutar un solo cerebro SDD. Las primeras extracciones
dejaron tres formas de dependencia dentro de `shared/sdd/`: decisiones puras,
coordinadores con dependencias inyectadas y lectura directa de artefactos del
proyecto. Exigir pureza absoluta añadiría adaptadores ceremoniales para el
filesystem que ambos runtimes comparten, mientras permitir cualquier efecto
convertiría `shared/sdd/` en un segundo `lib/` sin frontera real.

El template de Pi, además, enumeraba manualmente los módulos de
`shared/contracts/` y `shared/sdd/`. Una fuente nueva podía quedar fuera del
archive mientras el checkout y la suite seguían usando su entrypoint de
compatibilidad.

## Decisión

`shared/` contiene comportamiento independiente del runtime:

- puede leer y escribir los artefactos del proyecto que forman el protocolo
  SDD/OpenSpec compartido;
- puede usar utilidades deterministas de plataforma como filesystem, rutas y
  criptografía;
- no puede importar Pi, Claude o installer, lanzar procesos, conocer la
  interfaz ni leer configuración privada de un runtime;
- Git, reloj, ejecución de comandos y estado específico del runtime se reciben
  como datos o dependencias explícitas.

El template de Pi deriva todos los `.ts` regulares situados en la raíz de
`shared/contracts/` y `shared/sdd/`. Los despliega byte a byte en su `lib/`
plano y falla si una fuente no es regular, está anidada o si dos módulos
comparten nombre.

Cada módulo que participa en ese overlay tiene una fachada homónima en
`ein-pi/agent/lib/`. En el checkout la fachada es un único `export *` hacia
`shared/`; en el paquete la implementación compartida la sustituye. Las
composiciones específicas de Pi usan otro nombre, normalmente `-runtime`, y
todo consumidor Pi importa mediante la ruta local instalable.

Antes de producir el archive, el bundler exige esa correspondencia, resuelve
todos los imports relativos del TypeScript staged —incluidos los de tipo— y
compila los entrypoints que Pi carga o ejecuta. Ningún import puede escapar del
payload.

## Consecuencias

- Un módulo compartido nuevo no necesita una segunda edición en el bundler ni
  en su inventario, pero sí su fachada explícita de checkout.
- El filesystem común no genera una capa de puertos sin consumidor real.
- Ningún núcleo compartido puede ejecutar Git o procesos a escondidas.
- Los subdirectorios y los nombres duplicados no forman parte del contrato del
  overlay plano y hacen fallar el bundle de forma explícita.
- El archive no puede publicarse si sus rutas existen pero sus exports no
  enlazan desde los entrypoints reales de Pi.
- Cada puente SDD superviviente declara motivo, propietario y condición de
  retirada en `shared/README.md`; la suite exige que ese inventario y los
  imports autorizados sean exactamente el mismo conjunto.

## Condiciones de retirada

- Retirar las fachadas solo si el template de Pi deja de superponer módulos
  planos y el nuevo empaquetador demuestra el cierre desde sus entrypoints
  reales.
- Retirar la prohibición de procesos únicamente si `shared/` deja de ser el
  núcleo independiente del runtime mediante una decisión arquitectónica que la
  reemplace.
