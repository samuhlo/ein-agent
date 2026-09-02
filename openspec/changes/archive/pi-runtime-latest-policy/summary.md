# Summary — pi-runtime-latest-policy

status: complete
change: pi-runtime-latest-policy
work_groups: 4
verification_status: pass

## Resultado

Ein deja de fijar una combinación conocida de Pi y extensiones. El host, la TUI de desarrollo y las cinco extensiones administradas declaran el dist-tag npm `latest`; instalación, reparación, actualización, CI y publicación vuelven a resolverlo y fallan de forma visible si la combinación actual no funciona.

## Mecanismo

- `runtime-compat.ts` conserva identidades estables, pero genera todos los specs desde un único tag `latest`.
- El plan de instalación selecciona Pi aunque ya exista; `ein update` refresca host y extensiones tras cualquier transacción válida, incluso cuando Ein ya estaba al día.
- Los doctors offline verifican la declaración móvil y una versión SemVer instalada sin fingir que conocen la frescura del registro.
- CI instala el lockfile, actualiza host/TUI sin persistir el resultado y ejecuta un smoke vivo en un hogar aislado: instala las cinco extensiones y arranca el help de Pi para demostrar que se cargan con las APIs actuales.
- Una copia global de Pi creada por instaladores antiguos bajo una redirección Bun se actualiza también si se demuestra la presencia del paquete scoped; Ein no crea una segunda copia solo por encontrar variables de entorno.

## Decisiones

- La rotura de upstream es una señal de adaptación para Ein, no motivo para conservar indefinidamente una versión antigua.
- Los paquetes adicionales del usuario permanecen bajo su propia declaración; la política `latest` alcanza solo al runtime que Ein administra.
- Un fallo de actualización de Pi o de sus extensiones vuelve incompleta la actualización y produce salida distinta de cero, aunque la transacción del binario Ein ya haya terminado.
- El lockfile sigue dando un baseline local inspeccionable, pero `setup`, CI, E2E y release lo superponen con el `latest` real antes de compilar o verificar.

## Verificación

- `bun tooling/verify-latest-pi-runtime.ts`: Pi `0.84.4` y cinco extensiones `latest` instaladas y cargadas (`pi-subagents@0.64.0`, `pi-mcp-adapter@2.32.1`, `context-mode@1.0.169`, `@juicesharp/rpiv-ask-user-question@2.9.0`, `@juicesharp/rpiv-i18n@2.9.0`).
- `cd installer && bun run bundle-template:host`: payload Pi empaquetado correctamente.
- `bun test --timeout 15000`: 3.033 pruebas, 0 fallos, incluida la remediación E2E.
- `bun test tests/deps-pi.test.ts tests/install-plan.test.ts tests/release-asset-contract.test.ts --timeout 15000`: 50 pruebas, 0 fallos.
- `bun run typecheck` y `cd installer && bun run typecheck`: pass.
- `./e2e/docker-test.sh`: 48 pruebas de matriz y cinco hogares Ubuntu, incluido upgrade real del layout Omarchy; resultado final `/// e2e: OK`.

## Riesgos conocidos

- El resultado depende deliberadamente del estado actual del registro npm: una publicación incompatible rompe CI y exige adaptar Ein.
- Los doctors son offline y no afirman que una versión SemVer siga siendo la punta del registro; la frescura se obtiene al ejecutar instalación/actualización o la puerta viva de CI.
- Si npm publica entre dos reconciliaciones consecutivas, la protección contra runtimes bifurcados falla de forma explícita y la siguiente ejecución vuelve a resolver `latest`.
