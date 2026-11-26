# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cómo trabajamos en este repo

- **Idioma:** siempre en español.
- **Desde 2026-11-20 Claude implementa** (código y tests unitarios) para entregar el TFM; el usuario decide, revisa y mergea las PRs. Explicaciones breves y centradas en decisiones y tradeoffs (sirven para el video y las slides), no tutoriales. Las decisiones de producto reales se consultan antes de implementar.
- **Excepción en la Semana 3 (normalizador con IA):** el usuario quiere participar más. Plantear cada decisión de diseño con opciones y tradeoffs antes de implementar, y al revisar el código explicar cómo se comportaría en un entorno real (reintentos, timeouts, cuotas, costo, observabilidad, salidas inválidas del LLM).
- **Entregables con Claude:** slides, guion del video (lo filma el usuario) y una demo interactiva como artifact HTML/SPA con los flujos principales y respuestas seleccionables. Mercado Pago queda descartado: el webhook idempotente se simula.
- **Una PR por unidad de trabajo**, con tests, migración (si aplica) y Plan actualizado; push y merge los decide el usuario. Registrar decisiones de diseño en la sección "Decisiones" de [Plan_TFM.md](Plan_TFM.md).
- **Seguir [Plan_TFM.md](Plan_TFM.md) en orden.** Es la fuente de verdad del alcance. Lo que se va del alcance va a "Después del TFM".
- `docs/aprendizaje/` guarda las explicaciones de las primeras semanas; ya no es obligatorio agregar una por tema.

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
npm run test:e2e                # e2e (test/jest-e2e.json, *.e2e-spec.ts) contra la base marketplace_test; requiere Docker arriba
```

## Arquitectura y estado actual

- NestJS 11 + TypeORM + PostgreSQL. **Semanas 1, 2 y 3 cerradas, webhook, seeds y README listos.** Quedan los entregables con Claude (demo interactiva, slides, guion del video) y el formulario: ver "Etapa 4" en Plan_TFM.md. Normalizador con Gemini (`src/llm/`, `src/catalog/`) con prompt v2 activo y evaluación en `eval/`.
- Nest corre en el host (Windows) y Postgres en Docker: por eso `host: 'localhost'`. El nombre del contenedor/servicio solo resuelve si Nest también corre dentro de la red del compose.
- La imagen `postgres:16` guarda los datos en `/var/lib/postgresql/data` (no en `/var/lib/postgresql`, que es la convención de Postgres 18+). `POSTGRES_DB` solo se aplica con el volumen vacío; sin él, la única base creada es `postgres`.
- Módulos: `ConfigurationModule` (`src/config/`, zod en `env.schema.ts`, incluye `JWT_SECRET` y `JWT_EXPIRES_IN`), `DatabaseModule` (`src/database/`), `HealthModule` (`GET /health`, Terminus), `UsersModule` (`src/users/`, roles `BUYER`/`SELLER`), `AuthModule` (`src/auth/`: register/login/me, `JwtAuthGuard`, `@Roles()` + `RolesGuard` que va después de `JwtAuthGuard`, `@CurrentUser()`), `ProductsModule` (`src/products/`, lectura pública, escritura solo del seller dueño; la regla de propiedad vive en el servicio).
- Capas por módulo de negocio (auth, users, products, orders, payments, catalog, llm, events): `domain/` (entidades, enums, reglas puras), `application/` (servicios; `application/ports/` con interfaces + tokens DI de dependencias externas), `infrastructure/` (adaptadores), `http/` (controllers, `dto/`, guards, decoradores, filtros); `*.module.ts` en la raíz del módulo. Los specs van junto al archivo que prueban. `config`, `database`, `health`, `seed` y `demo` quedan planos.
- Base de datos: `synchronize: false` siempre. Opciones en `buildDataSourceOptions(env)` (`src/database/data-source.options.ts`), compartidas por la app y el CLI (`src/database/data-source.ts`). Entidades en lista explícita: **toda entidad nueva se agrega ahí**. Migraciones en `src/database/migrations/` y **listadas en `src/database/migrations/index.ts` (agregar cada migración nueva ahí)**; se generan con `npm run migration:generate -- src/database/migrations/<Nombre>` y la app las aplica al arrancar (`migrationsRun`). `migration:generate` agrega un drop/recreate espurio de `user_role_enum`: revisar y borrarlo de cada migración generada (pasa con todos los enums: `user_role_enum`, `order_status_enum`, `sub_order_status_enum`, `normalization_run_status_enum`, `payment_status_enum`).
- Imports relativos sin extensión `.js` (el proyecto compila a CommonJS; ts-node y Jest no los resuelven).
- Tests: los paquetes `@nestjs/*` v12 son ESM; Jest los transforma con `@swc/jest` (ver `transformIgnorePatterns` en `package.json`). `@nestjs/swagger` está en la línea 11 porque la 12 exige Nest 12.
- Órdenes (`src/orders/`): Order → SubOrder por seller → OrderItem con foto de precio; comisión copiada en la suborder; montos en centavos (`domain/money.ts`). Transiciones con compare-and-set (`application/status-transition.ts`) y tablas puras (`domain/*-status.machine.ts`); la orden se bloquea al derivar su estado. Eventos vía `EVENT_PUBLISHER` (`src/events/`), publicados después del commit. Pago asíncrono (`src/payments/`): `POST /orders/:id/pay` crea un pago `PENDING` vía `PAYMENT_PROVIDER` (`FakePaymentProvider`); `POST /payments/webhook` (firma HMAC en `x-signature` sobre `req.rawBody`, idempotente por `eventId`) pasa la orden a `PAID`; `POST /payments/:reference/simulate` hace de checkout del proveedor por el mismo camino firmado.
- Seed de demo (`src/seed/`): con `SEED_DEMO_DATA=true` la app carga al arrancar `comprador@example.com` (BUYER), `vendedor@example.com` (SELLER 10%), `vendedor.mayorista@example.com` (5%), `vendedor.bebidas@example.com` (15%) y 10 productos. Idempotente; los datos están en `demo-data.ts`.
- Railway: `railway.json` fija build, start (`npm run start:prod`) y health check (`/health`). Variables: `NODE_ENV`, `POSTGRES_*` (referencias al servicio Postgres), `JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL` (`gemini-3.5-flash-lite`), `PAYMENT_WEBHOOK_SECRET` y, para la demo, `SEED_DEMO_DATA` + `SEED_BUYER_PASSWORD` + `SEED_SELLER_PASSWORD`.
- Deuda anotada: registro concurrente con el mismo email da 500 en vez de 409; el spec de `HealthController` se borró (probablemente ya se puede recuperar con `@swc/jest`). Saltos de línea normalizados a LF.

### Arquitectura objetivo (de Plan_TFM.md)

Abstracciones detrás de interfaces, para poder intercambiar implementaciones: `EventPublisher` (en memoria), `LlmProvider` → `GeminiLlmProvider`, `PaymentProvider` → Mercado Pago sandbox o `FakePaymentProvider`. Las órdenes se dividen en suborders por seller, cada una con su máquina de estados y su comisión. Despliegue en Railway con `/health`.
