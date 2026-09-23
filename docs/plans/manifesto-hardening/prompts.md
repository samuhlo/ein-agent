# Prompts de ejecución: una PR por punto

Actualizados el 17 de septiembre de 2026 por autorización expresa de Samu para commit, push y apertura de PR por cambio. Sustituyen los prompts anteriores que prohibían la entrega Git. Son 13 encargos; los paquetes internos no generan PRs individuales.

Usa uno cada vez. Los puntos dependientes necesitan su dependencia verificada, aunque su PR siga abierta. Una PR en borrador con fallos pendientes no cuenta como dependencia terminada. No se autoriza merge ni release. Los workspaces originales con cambios ajenos se preservan.

Entrega inicial (17 de septiembre):

- 01: [PR #453](https://github.com/samuhlo/ein-agent/pull/453), rama `fix/manifesto-01-verification-outcome`, base `main`; checkout `/private/tmp/ein-manifesto-pr01`. CI Linux/macOS/docs pasa.
- 02: [PR #454](https://github.com/samuhlo/ein-agent/pull/454), rama `fix/manifesto-02-verification-freshness`, base la rama del 01; checkout `/private/tmp/ein-manifesto-pr02`. Borrador: compila, pero 4 pruebas focalizadas fallan; ver pendientes en la PR antes de continuar. No ejecutar de nuevo desde el workspace original ni darlo por completado.

Las rutas anteriores son ubicaciones locales de conveniencia, no requisitos: si ya no existen, recuperar las ramas remotas y preparar nuevos checkouts. Las fichas del plan permanecen en el workspace original y deben acompañar al encargo.

## 1. Un único resultado de verificación — 01

```text
Trabaja en ein-agent. Implementa completo el punto 01 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/01-verify-outcome.md.

Ejecuta 01A → 01B, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: Ninguna funcional.

Objetivo específico: Un ejemplo pass no debe dominar un fail global; parser, lint, router, resumen y cierre deben coincidir.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 2. Verificación ligada al contenido — 02

```text
Trabaja en ein-agent. Implementa completo el punto 02 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/02-verification-freshness.md.

Ejecuta 02A → 02B → 02C → 02D → 02E → 02F → 02G, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: 01 completo y verificado. 02E–02G son una transición conjunta: ejecutar sus comprobaciones de integración después de adaptar los tres.

Objetivo específico: Ediciones, altas y borrados deben invalidar el recibo; evita la autorreferencia y conserva una política común en Pi/Claude y cierre.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 3. Rollback completo — 04

```text
Trabaja en ein-agent. Implementa completo el punto 04 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/04-template-rollback.md.

Ejecuta 04.1 → 04.2 → 04.4 → 04.3, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: Ninguna funcional.

Objetivo específico: Snapshot, despliegue y restauración deben compartir inventario. Prueba fallos en instalaciones temporales; no uses el home real.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 4. Dry-run sin mutaciones — 13

```text
Trabaja en ein-agent. Implementa completo el punto 13 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/13-update-dry-run.md.

Ejecuta 13.1 → 13.2 → 13.3, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: Conserva 04 si su código forma parte de la base elegida; ambos tocan la transacción.

Objetivo específico: La simulación no limpia ni finaliza recuperación. Comprueba el disco antes/después y conserva la recuperación de ejecución real.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 5. Delegación que respeta políticas — 05

```text
Trabaja en ein-agent. Implementa completo el punto 05 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/05-delegation-contract.md.

Ejecuta 05.1 → 05.2 → 05.3, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: Comprueba la integración de #451/#452 o usa su rama como base dependiente; no las fusiones. Si tienen fallos pendientes que impiden este trabajo, informa del bloqueo.

Objetivo específico: Rechaza delegaciones dinámicas, ambiguas o legacy no admitidas antes de lanzar hijos; conserva autorizaciones al reemitir el transporte.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 6. Recuperación vinculada a la fase — 03

```text
Trabaja en ein-agent. Implementa completo el punto 03 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/03-phase-reconciliation.md.

Ejecuta 03A → 03B → 03C → 03D → 03E, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: 01, 02 y 05 completos y verificados; trabajo de #452 presente.

Objetivo específico: La reconciliación solo acepta la ejecución, cambio, fase y recibo esperados; un archivo ajeno o incompleto no demuestra finalización.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 7. Coherencia de tareas terminadas — 09

```text
Trabaja en ein-agent. Implementa completo el punto 09 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/09-tasks-readiness.md.

Ejecuta 09A → 09B, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: Comprueba los cambios de routing de 01/02 si están presentes y evita sobrescribirlos.

Objetivo específico: Lint y router deben decidir igual sobre tareas completadas, pendientes y bloqueadas; mantén el criterio único de la ficha.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 8. TDD y presupuesto coherentes — 11

```text
Trabaja en ein-agent. Implementa completo el punto 11 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/11-apply-tdd-budget.md.

Ejecuta 11.1 → 11.2 → 11.3, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: 05 completo y verificado.

Objetivo específico: Padre e hijo consumen la misma postura resuelta; aplica la precedencia de auto y strict_tdd y verifica capacidades reales de turnBudget.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 9. Presupuesto efectivo de investigación — 10

```text
Trabaja en ein-agent. Implementa completo el punto 10 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/10-phase-budget.md.

Ejecuta 10.1 → 10.2 → 10.3, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: 05 completo; conserva la integración de 11 si está presente en el gateway.

Objetivo específico: Distingue límites reales de llamadas y orientación de tokens. Comprueba el runner temporal y que sigue permitiendo entregar el resultado.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 10. Conservar el objetivo — 07

```text
Trabaja en ein-agent. Implementa completo el punto 07 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/07-continuity-objective.md.

Ejecuta 07.1 → 07.2 → 07.3 → 07.4 → 07.5, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: Ninguna funcional.

Objetivo específico: Una respuesta como «sí, continúa» no sustituye el objetivo; prueba setter explícito, refresh, checkpoints anteriores y Pi/Claude.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 11. Operaciones inciertas persistentes — 08

```text
Trabaja en ein-agent. Implementa completo el punto 08 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/08-mutation-uncertainty.md.

Ejecuta 08.1 → 08.2 → 08.3 → 08.3b → 08.4 → 08.5, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: 05 y 07 completos y verificados según el orden recomendado.

Objetivo específico: Reiniciar o refrescar no borra incertidumbre. Distingue denegaciones antes de ejecutar de operaciones iniciadas sin resultado demostrado.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 12. Intent entre sesiones — 06

```text
Trabaja en ein-agent. Implementa completo el punto 06 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/06-pending-intent.md.

Ejecuta 06.1 → 06.1b → 06.2 → 06.3 → 06.3b → 06.3c → 06.4 → 06.5 → 06.6 → 06.7, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: 05 y 07 completos; conserva la integración de 08.

Objetivo específico: Persiste borrador y respuestas, usa admisión única en status/cierre y prueba Pi→Claude→Pi, conflictos y fallos de publicación.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```

## 13. Medir la entrega real — 12

```text
Trabaja en ein-agent. Implementa completo el punto 12 del endurecimiento del MANIFIESTO y entrega UNA PR propia de este punto.

Lee completos MANIFIESTO.md, docs/plans/manifesto-hardening/README.md y docs/plans/manifesto-hardening/12-review-forecast.md.

Ejecuta 12.1 → 12.2 → 12.3 → 12.4 → 12.5 → 12.5b → 12.6, continuando automáticamente entre paquetes cuando cumplan sus comprobaciones. Dependencias: Comprueba los hooks/puertos/CLI actuales y conserva los puntos previos presentes.

Objetivo específico: Incluye untracked, distingue working-tree/committed y unknown, y verifica el commit medido antes de publicar. Prueba publicaciones con dobles, sin efectos remotos de test.

Antes de editar, inspecciona Git, remotos y PRs existentes. Si el punto ya tiene PR, continúa en su rama; no dupliques PRs ni implementación. Si no la tiene, crea rama y checkout aislados desde la base vigente acordada por el índice. Comprueba APIs actuales: no uses el workspace original antiguo como base ni copies archivos completos que reviertan cambios posteriores. Conserva cambios ajenos. Lleva las fichas necesarias al checkout sin incluir documentación ajena en el diff de código.

Si dependes de una PR abierta y verificada, basa tu rama y tu PR en esa rama y declara la dependencia. El diff contra la base debe contener solo este punto. Si las dependencias ya están fusionadas, usa la rama de integración acordada. No fusiones PRs para desbloquearte ni metas varios puntos en la misma PR. Si hacen falta varias ramas aún no integradas que no forman una cadena compatible, explica la incompatibilidad antes de publicar un diff mezclado.

Sigue las decisiones y límites de escritura de cada paquete. Resuelve errores normales dentro del alcance sin pedir permiso entre pasos. No rediseñes, debilites pruebas, modifiques modelos/configuración personal ni reformatees archivos ajenos. Detente ante una incompatibilidad material que exija cambiar el diseño y aporta evidencia concreta.

Ejecuta los tests prescritos, controles negativos y positivos, tipos y comprobaciones de integración del índice. Para cambios en payload ejecuta su empaquetado/smoke; para installer, también sus tipos. No repitas checks verdes sin cambios o lagunas que lo justifiquen. Distingue lo probado de lo pendiente.

Tienes autorización expresa para crear la rama, hacer commits de este punto, push y abrir o actualizar su PR: hazlo sin volver a preguntar. Revisa el diff preparado antes del commit y usa rutas concretas, sin arrastrar cambios ajenos. Abre la PR en español con problema, solución, pruebas reales, límites y dependencias. Si quedan bloqueos, conserva el trabajo útil en una PR en borrador y detállalos; no lo presentes como terminado. No hagas merge, force-push ni release.

Comprueba la PR creada: URL, título, rama, base, diff y estado de checks. Corrige fallos atribuibles a este punto dentro del alcance y actualiza la misma PR; si no puedes, déjala en borrador con el motivo. No declares CI verde si sigue pendiente.

Termina con URL de la PR, rama/base, resumen, pruebas y estado real de CI, y pendientes. No avances a otro punto.
```
