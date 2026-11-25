# Comparación v1 vs v2

- v1: 2 corrida(s), 2026-11-25T18:12:24.780Z
- v2: 2 corrida(s), 2026-11-25T18:27:46.277Z
- Modelo: `gemini-3.5-flash-lite`

## Calidad (solo llamadas que respondieron)

| Campo | v1 | v2 | Diferencia | Ruido (máx. variación entre corridas) |
|---|---|---|---|---|
| brand | 100.0% | 100.0% | 0.0 pp | 0.0% |
| brandStatus | 100.0% | 100.0% | 0.0 pp | 0.0% |
| quantity | 89.6% | 100.0% | +10.4 pp | 0.0% |
| unit | 100.0% | 100.0% | 0.0 pp | 0.0% |
| category | 93.8% | 97.9% | +4.1 pp | 0.1% |
| productName (subjetivo) | 89.6% | 96.8% | +7.2 pp | 2.0% |
| **Todos los campos objetivos** | 85.4% | 97.9% | +12.5 pp | 0.1% |

> Una diferencia menor o igual al ruido no es evidencia de mejora: puede ser variación propia del modelo.

## Disponibilidad y costo

| Métrica | v1 | v2 |
|---|---|---|
| Disponibilidad (llamadas que respondieron) | 98.0% | 95.9% |
| Tokens de entrada por llamada | 271 | 688 |

> La disponibilidad depende del proveedor en el momento de la corrida, no del prompt.

## Precisión sobre el total (las llamadas fallidas cuentan como error)

| Campo | v1 | v2 | Diferencia | Ruido (máx. variación entre corridas) |
|---|---|---|---|---|
| brand | 98.0% | 95.9% | -2.0 pp | 4.1% |
| brandStatus | 98.0% | 95.9% | -2.0 pp | 4.1% |
| quantity | 87.8% | 95.9% | +8.2 pp | 4.1% |
| unit | 98.0% | 95.9% | -2.0 pp | 4.1% |
| category | 91.8% | 93.9% | +2.0 pp | 4.1% |
| productName (subjetivo) | 87.8% | 92.9% | +5.1 pp | 2.0% |
| **Todos los campos objetivos** | 83.7% | 93.9% | +10.2 pp | 4.1% |
