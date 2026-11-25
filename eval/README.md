# Evaluación del normalizador de catálogo

Mide qué tan bien normaliza el LLM los títulos de productos, comparando sus propuestas con un dataset etiquetado a mano.

- `golden-dataset.json`: 49 productos con la respuesta esperada y las reglas de etiquetado.
- `run-eval.ts`: corre el normalizador real (el mismo servicio que `POST /catalog/normalize`) sobre todo el dataset, con llamadas reales a Gemini. Cada llamada queda registrada en `normalization_run`.
- `compare.ts`: compara los resultados de dos versiones de prompt.
- `results/`: resultados en JSON (detalle por producto). `reports/`: reportes en Markdown.

## Requisitos

- Docker con Postgres arriba (`docker compose up -d`) y las migraciones aplicadas.
- `.env` con `GEMINI_API_KEY` y `GEMINI_MODEL`.

## Uso

```bash
# 2 corridas (por defecto): mide cuánto varía el modelo consigo mismo
npm run eval -- --prompt v1

# 1 sola corrida: usar si la cuota gratuita no alcanza
npm run eval -- --prompt v1 --runs 1

# Comparar dos evaluaciones
npm run eval:compare -- eval/results/<archivo-v1>.json eval/results/<archivo-v2>.json
```

## Cuota

Cada corrida hace una llamada por producto (49). Con el plan gratuito de `gemini-3.1-flash-lite` (15 por minuto, 500 por día):

| Corridas por versión | Llamadas por versión | v1 + v2 | Tiempo por versión |
| -------------------- | -------------------- | ------- | ------------------ |
| 2 (por defecto)      | 98                   | ~196    | ~7 min             |
| 1                    | 49                   | ~98     | ~3,5 min           |

Si el proveedor empieza a rechazar por cuota (3 errores seguidos, o una espera pedida mayor a 1 minuto), el script se detiene, guarda lo evaluado y marca el resultado como **parcial**, sin seguir gastando llamadas. En ese caso: esperar al día siguiente, o volver a correr con `--runs 1`.

## Cómo leer el resultado

- **Precisión por campo:** marca, estado de marca, cantidad, unidad y categoría tienen una sola respuesta correcta. `productName` se reporta aparte porque es subjetivo (se compara sin mayúsculas ni acentos).
- **Variación entre corridas:** aunque se usa `temperature: 0`, el modelo no es 100% determinístico. Una mejora entre versiones menor o igual a esa variación no es evidencia de mejora.
- **Una llamada fallida** (`INVALID_OUTPUT` o `ERROR`) cuenta como error en todos los campos: la confiabilidad es parte de la calidad.
