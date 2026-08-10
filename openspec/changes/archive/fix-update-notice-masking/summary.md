## // 000. RESUMEN

El aviso de actualización del arranque de Pi se quedaba en silencio total cuando una sola de sus fuentes no podía comprobarse, aunque otra tuviera una actualización fresca y accionable. El corte de `renderPiEinAdvisorNotice()` rechazaba toda faceta `unavailable` usando el veredicto colapsado del advisor, dejando inalcanzable el filtro por componente que ya existía debajo y que era correcto. Se sustituyó la negación acumulada por una lista positiva de estados admitidos.

## // 001. QUÉ CAMBIÓ

- `ein-pi/agent/lib/ein-update-notice.ts`: constante `RENDERABLE_UPDATE_STATUSES: ReadonlySet<AdvisorUpdateStatus>` con el conjunto admitido (`update-available`, `unavailable`), consultada con `.has()` en lugar de `status !== "update-available"`. Import añadido del tipo `AdvisorUpdateStatus`.
- `tests/ein-banner-updates.test.ts`: cinco tests nuevos — el caso del defecto, tres guardias fail-closed (`ambiguous`, `error`, `unsupported`) y el límite superior (`current`). Los dos tests preexistentes no se modificaron.

## // 002. CÓMO FUNCIONA POR DENTRO

La función encadena dos filtros. El primero corta por el estado agregado de la faceta; el segundo recorre `provenance` y retiene solo los items con `quality === "update-available"` y `freshness === "current"`, que son los que dan nombre a componente y comando.

El defecto estaba en el primero: `unavailable` significa "la evidencia está incompleta", no "no hay noticias". Cortar ahí descartaba componentes que el segundo filtro habría extraído correctamente. Ahora `unavailable` atraviesa el primer corte y es el segundo, que mira la evidencia real de cada componente, quien decide.

La seguridad del cambio no depende del criterio de nadie: el objeto `handoff` solo se construye en el camino de comparación de versiones, y ese camino fija siempre `status: "update-available"`. Ningún resultado con faceta `unavailable` puede llevar handoff, así que admitirlo nunca alcanza la rama de escape que imprime la acción del installer — siempre pasa por el filtro por componente.

`shared-config-update-advisor.ts` no se tocó. Su fail-closed agregado es correcto: responde a "¿puedo dar un veredicto global limpio?" y la respuesta honesta con evidencia incompleta es no. El defecto era de interpretación en el consumidor.

## // 003. DECISIONES

- **D1 — Lista positiva, no negación acumulada.** Una cadena de `!==` no deja ver si un estado falta por decisión o por olvido, que es exactamente cómo nació este defecto. La constante con nombre obliga a que ampliar el conjunto sea un acto consciente.
- **D2 — `current` excluido por intención, no por inocuidad.** Medido: cuando la faceta vale `current`, ningún item de `provenance` puede tener `quality === "update-available"`, así que dejarlo pasar sería inocuo pero inútil. Se excluye igualmente porque el corte declara qué estados *pueden* traer noticia.
- **D3 — La rama de handoff no se ve afectada.** Ver §002.
- **D4 — Los guardias fail-closed entran en cobertura.** `map.md` los dejó como riesgo residual fuera de alcance; el diseño lo revirtió. El cambio *es* la decisión de qué estados pasan el corte, y cubrir solo el lado positivo dejaría media contrato sin test: una regresión futura que ampliase la lista a `error` no rompería nada.
- **D5 — Alternativas rechazadas.** Eliminar el corte entero (rompe fail-closed ante evidencia contradictoria); cambiar el advisor para que no devuelva `unavailable` con items accionables (degrada su honestidad, y la evidencia *está* incompleta); añadir un aviso de "evidencia incompleta" (fuera de alcance; el arranque solo observa probes y no debe afirmar más de lo que leyó).
- **Rollback:** revertir la constante y restaurar la condición original. Sin migración, estado persistido ni limpieza.

## // 004. VERIFICACIÓN

- Suite completa `bun test` desde la raíz: **1476 pass, 0 fail, 109 ficheros**. Línea base antes del cambio: 1471 pass, 0 fail. La diferencia son exactamente los cinco tests nuevos.
- Suite focalizada `bun test tests/ein-banner-updates.test.ts`: 24 pass, 0 fail (19 preexistentes intactos + 5 nuevos).
- Ciclo TDD: el test del caso del defecto falla en RED devolviendo `null` por el corte original, y pasa tras introducir la constante. Los tres guardias fail-closed y el límite `current` ya pasaban en RED por diseño (D4); su valor es fallar si alguien amplía el conjunto admitido, no motorizar el cambio.
- Tipado: `ReadonlySet<AdvisorUpdateStatus>` con `.has()` compila con `tsc --strict` sin errores ni casts. La forma inicial del apply (`as const` + `.includes()`) daba `TS2345` y fue corregida antes de verify. **Esta comprobación fue manual y externa a las puertas del repo**: `bun test` ejecuta TypeScript sin comprobar tipos, y no existe puerta de tipos para `ein-pi/`.
- Diff aislado a `ein-pi/agent/lib/ein-update-notice.ts` y `tests/ein-banner-updates.test.ts`. `shared-config-update-advisor.ts` no aparece en el diff.

## // 005. PENDIENTE / RIESGOS

- **El aviso hablará más a menudo.** `unavailable` es un estado frecuente en instalaciones reales — `PI_SKIP_VERSION_CHECK` apaga `binary`, y toda instalación de Ein en desarrollo devuelve `skipped/development-install`. Es el objetivo del cambio, no un efecto colateral: solo se renderiza un componente si su propia evidencia es fresca y accionable.
- **`ein-pi/` no tiene puerta de tipos.** No hay `tsconfig.json` en la raíz y `bun run typecheck` solo cubre `installer/`. `EIN.md` declara TypeScript estricto como convención que hoy nada hace cumplir en la carpeta donde vive la lógica del proyecto; este mismo cambio entró con un error de tipos que ninguna prueba automática detectó. Merece un cambio propio: añadir la puerta destapará errores acumulados.
- **Prerequisito de `launcher-update-surface` (bloque N), slice N.2.** Añadir Claude Code como cuarta fuente antes de este fix habría agravado el enmascaramiento: en toda máquina sin Claude instalado esa fuente queda `skipped` de forma permanente y habría silenciado las otras tres.
