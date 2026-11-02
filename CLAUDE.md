# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cómo trabajamos en este repo

- **Idioma:** siempre en español.
- **El usuario escribe el código.** Claude actúa como mentor: responde preguntas, explica conceptos y revisa lo que el usuario implementa. No edita archivos de `src/` ni `test/` por iniciativa propia.
- **Concepto antes que código.** Ante una duda, primero explicar el problema y el concepto de Nest/TypeORM involucrado (con referencia a la doc oficial), luego opciones con tradeoffs. Dar código solo si el usuario lo pide explícitamente, y aun así explicarlo línea por línea: la regla 3 del plan es "no entra código que no pueda explicar".
- **Seguir [Plan_TFM.md](Plan_TFM.md) en orden.** Es la fuente de verdad del alcance y del paso a paso semanal. Si una pregunta se va fuera del alcance o adelanta semanas, señalarlo; las ideas nuevas van a la sección "Después del TFM".
- Los primeros tests (unitario y e2e) los escribe el usuario a mano; no generarlos.
- Las explicaciones de conceptos se guardan en `docs/aprendizaje/` (numeradas, una por tema) para retomarlas desde otra máquina. Revisarlas antes de explicar algo para no repetir ni contradecir.

## Comandos

```bash
docker compose up -d            # Postgres 16 (contenedor postgres-marketplace, puerto 5432)
docker compose down -v          # baja el contenedor y BORRA el volumen (necesario si cambian POSTGRES_* )
docker exec -it postgres-marketplace psql -U postgres -l   # listar bases existentes

npm run start:dev               # Nest en modo watch
npm run build
npm run lint                    # eslint con --fix
npm run format                  # prettier

npm test                        # unit (jest, rootDir=src, *.spec.ts)
npm test -- app.controller      # un solo archivo de test (filtra por path)
npm test -- -t "nombre del test" # un solo test por nombre
npm run test:e2e                # e2e (test/jest-e2e.json, *.e2e-spec.ts)
```

## Arquitectura y estado actual

- NestJS 11 + TypeORM + PostgreSQL. Proyecto recién generado con el CLI de Nest; aún en Semana 1 del plan.
- Nest corre en el host (Windows) y Postgres en Docker: por eso `host: 'localhost'`. El nombre del contenedor/servicio solo resuelve si Nest también corre dentro de la red del compose.
- La imagen `postgres:16` guarda los datos en `/var/lib/postgresql/data` (no en `/var/lib/postgresql`, que es la convención de Postgres 18+). `POSTGRES_DB` solo se aplica con el volumen vacío; sin él, la única base creada es `postgres`.
- La conexión a TypeORM está hardcodeada en `src/app.module.ts` con `synchronize: true`. Próximos pasos según el plan: `ConfigModule` con validación de variables de entorno usando zod al arrancar, y extraer la configuración de base de datos a su propio módulo para desacoplarla de `AppModule`.

### Arquitectura objetivo (de Plan_TFM.md)

Abstracciones detrás de interfaces, para poder intercambiar implementaciones: `EventPublisher` (en memoria), `LlmProvider` → `GeminiLlmProvider`, `PaymentProvider` → Mercado Pago sandbox o `FakePaymentProvider`. Las órdenes se dividen en suborders por seller, cada una con su máquina de estados y su comisión. Despliegue en Railway con `/health`.
