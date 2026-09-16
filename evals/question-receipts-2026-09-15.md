# Respuestas de Ein en el terminal

El plugin `ask_user_question` devuelve texto para el modelo y `details` con
respuestas, notas y cancelación. El hook de intent añade un recibo a ese texto.
La vista anterior mostraba ambos bloques. La nueva tarjeta usa `details` y deja
intactos los datos del modelo y la persistencia.

Ejemplo de la vista normal:

```text
ein · Tu respuesta
Resumen por anexo
```

Las preguntas múltiples conservan una etiqueta por respuesta. Texto libre y
notas se muestran sin reescribirlos; solo se retira la marca de recomendación
de opciones seleccionadas. Una respuesta vacía aparece como «Sin respuesta».
La cancelación identifica los borradores como respuestas sin enviar. La vista
expandida añade preguntas y previews, sin volcar el protocolo interno.

## Comprobaciones

- Suite completa: 3.284 pruebas correctas, cero fallos. La primera ejecución
  dentro del sandbox falló en seis pruebas de sockets; fuera del sandbox pasan.
- Typecheck raíz e instalador y empaquetado host correctos.
- `bun tooling/verify-intent-questionnaire.ts`: plugin instalado real,
  respuestas RPC programadas y 18 renderizados con `ToolExecutionComponent`
  de Pi, tres anchuras, vistas normal y expandida. Verifica texto libre,
  cancelación, confirmación y recibo de intent sin modificación.
- `bun test tests/question-cards.test.ts tests/native-cards.test.ts tests/mcp-cards.test.ts`:
  restauración de historial, ciclo de vida, convivencia de tarjetas, respuestas
  múltiples, errores y ausencia de JSON visible.
- Revisión independiente detectó respuestas vacías omitidas; se corrigió y se
  añadió cobertura para texto vacío/nulo y selección múltiple vacía con notas.

Pi comprobado: 0.84.4. Son componentes reales de terminal con entrada controlada;
no es una prueba manual de navegación por teclado del selector. La instalación
personal no se ha modificado.
