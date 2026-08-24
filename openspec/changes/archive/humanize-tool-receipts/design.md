status: ready
change: humanize-tool-receipts
phase: design
lane: micro
tdd: strict

# Design — humanize-tool-receipts

## A. Proposal

### Problema

De 18 herramientas registradas, 16 no tienen renderer. Ocho de ellas devuelven
`JSON.stringify(...)` como texto, así que lo que aparece en el chat es JSON.

Y el expandido tampoco ayuda: `receiptResult` (`ein-ai.ts:551-560`) devuelve
`full`, el volcado técnico. El humano elige hoy entre no ver nada o ver un
volcado. Ninguna de las dos opciones es "saber qué está pasando".

### Propuesta

Un recibo por herramienta, con **dos niveles y una sola voz**:

```
ein · Tamaño de la PR      312 líneas de producción, dentro del presupuesto
                           ↑ siempre visible

  Medí lo que va de main a HEAD.                    ↑ al expandir
  Producción: 312 líneas. Tests: 88, que no cuentan.
  El presupuesto es de 400, así que cabe en una PR.
```

Todo el texto se escribe en `tool-receipts.ts`, que es puro: entra el `details`
de la tool, sale texto. `ein-ai.ts` solo elige color y nivel.

### Alternativas descartadas

- **Solo el recibo seco de una línea**, que es lo que pedía el plan de
  dogfooding. Calla el ruido pero no mejora lo que entiendes al mirar.
- **Dos o tres líneas siempre visibles.** Se ve todo sin expandir y vuelve a
  llenar el chat, que era el problema original.
- **Escribir las frases en `ein-ai.ts`.** Ahí no se pueden probar sin arrancar
  Pi. La frontera actual (puro redacta, extensión pinta) ya existe y funciona.

## B. Spec

### R1 — El contrato del recibo

```ts
type ToolReceipt = Readonly<{
  line: string;              // siempre visible, ≤ 60 caracteres
  detail: readonly string[]; // bloque humano del expandido
  bad: boolean;              // pinta como problema, no como trámite
}>;
```

Una función pura por herramienta, `Xreceipt(details) → ToolReceipt`. Sin disco,
sin Pi, sin estado.

### R2 — La voz

Reglas que las pruebas fijan, no sugerencias:

1. **Castellano llano.** "3 hallazgos, 1 bloquea", nunca `findings=3`.
2. **Sin identificadores.** Ni `ein_cleaner_audit`, ni `stateRef`, ni
   `verification-passed`. La herramienta se nombra por lo que hace.
3. **Número con su unidad en palabras.** "312 líneas", no "312".
4. **La consecuencia antes que el dato**, cuando hay consecuencia: "dentro del
   presupuesto" pesa más que el número que lo demuestra.
5. **Si hay siguiente paso, se dice.** Un recibo que informa y no orienta deja
   el trabajo a medias.

### R3 — Fail-closed en la redacción

Un `details` ausente, de otra forma o ilegible produce un recibo que **lo dice**:
`no se pudo leer el resultado`, con `bad: true`. Nunca una frase inventada ni un
recibo optimista por defecto. Ningún receipt lanza.

### R4 — El expandido deja de ser un volcado

`receiptResult` pinta `detail` cuando `expanded`. El volcado crudo deja de
imponerse al humano; **sigue yendo íntegro al modelo** por `content`, que es
donde importa.

Coste aceptado: el texto técnico ya no se puede leer desde el expandido. Se
compensa con que el `detail` nombre los datos que de verdad se consultan, y con
que el `content` sigue en la sesión.

### R5 — El `content` es intocable

Ninguna de las 18 herramientas cambia lo que devuelve al modelo. Una prueba lo
demuestra sobre el árbol real: los renderers no aparecen dentro de ningún
`execute`, y ningún `content` se construye desde `tool-receipts.ts`.

### R6 — Las 18, y cómo se llaman en cristiano

| Herramienta | Nombre visible | Qué dice la línea |
|---|---|---|
| `ein_sdd_status` | Estado | fase siguiente, tareas hechas, bloqueos *(hecha)* |
| `ein_sdd_check` | Revisión del plan | errores y avisos, o fases limpias *(hecha)* |
| `ein_sdd_preflight` | Cómo se trabaja este cambio | con o sin pruebas primero, y cuántas fases |
| `ein_sdd_lane` | Carril | siete fases o versión corta |
| `ein_sdd_close` | Cierre | archivado, o qué lo impide |
| `ein_sdd_participants` | Participantes | quién revisa después de aplicar, o qué bloquea |
| `ein_openspec_sync` | Specs | cuántos dominios se actualizaron |
| `ein_openspec_delta_write` | Cambio de contrato | cuántos escenarios y en qué dominio |
| `ein_review_forecast` | Tamaño de la PR | líneas de producción y si cabe en el presupuesto |
| `ein_cleaner_audit` | Auditoría del código | hallazgos y cuántos bloquean |
| `ein_cleaner_evidence` | Evidencia del código | qué se pudo medir y qué no |
| `ein_cleaner_active_evidence` | Evidencia en caliente | qué área se miró y con qué frescura |
| `ein_cleaner_improve_admit` | Mejora propuesta | admitida, o el motivo del rechazo |
| `ein_cleaner_improve_apply` | Mejora aplicada | qué se tocó, o por qué no se tocó |
| `ein_cleaner_improve_complete` | Mejora verificada | verificada, o qué falta para darla por buena |
| `ein_architect_evidence` | Lectura de arquitectura | cuántos ficheros y módulos se leyeron |
| `ein_architect_plan_bind` | Plan de arquitectura | atado a su evidencia, o por qué no |
| `ein_architect_validate` | Validación de arquitectura | válido, o qué regla incumple |

### R7 — Encaje en 80 columnas

`line` no pasa de 60 caracteres visibles. Con el prefijo `ein · Nombre` cabe en
80 sin cortarse. Una prueba mide el ancho de cada línea generada.

## C. Riesgo aceptado

- **Diecisiete recibos son diecisiete oportunidades de escribir mal.** Por eso
  cada uno se fija con una prueba antes de existir, y por eso las reglas de voz
  de R2 son comprobables y no gusto personal.
- **Si una tool cambia su `details`, su recibo se queda obsoleto en silencio.**
  Mitigado por R3: una forma inesperada produce "no se pudo leer el resultado",
  no una frase falsa.
- **El volcado técnico deja de estar a un clic.** Aceptado en R4.

## D. Success criteria

1. Las 18 herramientas tienen `renderCall` y `renderResult`.
2. Cada recibo tiene su prueba, incluidas las dos que hoy no tienen ninguna.
3. Ninguna `line` pasa de 60 caracteres visibles.
4. Ningún recibo contiene un identificador de código.
5. Un `details` inesperado produce el recibo de fallo, y ningún receipt lanza.
6. El `content` de las 18 herramientas queda byte a byte idéntico.
