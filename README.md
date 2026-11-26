# Marketplace de supermercado · API

API REST de un marketplace multi-vendedor de supermercado, con un **normalizador de catálogo basado en IA**. Trabajo Final de Máster.

- **API en producción:** https://tfmmarketplace-production.up.railway.app
- **Documentación interactiva (Swagger):** https://tfmmarketplace-production.up.railway.app/docs
- **Demo interactiva:** https://tfmmarketplace-production.up.railway.app/demo
- **Slides:** https://claude.ai/artifact/5ZoPmBq49Whp8i631PjMZu
- **Video:** _pendiente_

## Descripción general

Varios vendedores (sellers) publican productos y los compradores (buyers) arman un carrito con productos de distintos vendedores. La API:

- **Divide cada orden en suborders por vendedor**, cada una con su propia máquina de estados y su comisión.
- **Guarda una foto de la compra:** nombre y precio de cada ítem quedan fijos aunque el producto cambie o se borre después.
- **Cobra de forma asíncrona:** el pago se confirma con un webhook firmado e idempotente, como en los proveedores reales (simulado; Mercado Pago quedó fuera de alcance).
- **Normaliza el catálogo con un LLM (Gemini):** convierte títulos "sucios" (`LECHE SERENISIMA ENTERA 1LT`) en datos estructurados (marca, producto, cantidad, unidad y categoría), con una evaluación medida contra un dataset etiquetado.

## Stack tecnológico

| Área | Tecnología |
|---|---|
| Lenguaje y framework | TypeScript, NestJS 11, Node.js 24 |
| Base de datos | PostgreSQL 16, TypeORM 1.1 con migraciones |
| Autenticación | JWT (Passport), bcrypt, roles `BUYER` / `SELLER` |
| Validación | zod (variables de entorno), class-validator (requests) |
| IA | Gemini API (`@google/genai`), modelo `gemini-3.5-flash-lite`, salida estructurada |
| Documentación | Swagger / OpenAPI (`@nestjs/swagger`) |
| Tests | Jest (unitarios), supertest (e2e contra una base aislada) |
| Infraestructura | Docker Compose (local), Railway (producción, con health check) |

## Funcionalidades principales

| Módulo | Endpoints | Qué hace |
|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Registro con rol, login con JWT. El mismo error para email inexistente y contraseña incorrecta. |
| Productos | `GET /products`, `GET /products/:id`, `POST`, `PATCH`, `DELETE /products/:id` | Lectura pública; alta, edición y baja solo por el seller dueño. |
| Órdenes | `POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/pay`, `POST /orders/:id/cancel` | El buyer compra; la orden se divide en suborders por seller en una sola transacción. |
| Suborders | `GET /sub-orders`, `GET /sub-orders/:id`, `PATCH /sub-orders/:id/status` | Cada seller ve y avanza solo las suyas: `PENDING → ACCEPTED → SHIPPED → DELIVERED` (o `CANCELLED`). |
| Pagos | `POST /payments/webhook`, `POST /payments/:reference/simulate` | Webhook con firma HMAC e idempotente por evento; `simulate` hace de checkout del proveedor. |
| Catálogo (IA) | `POST /catalog/normalize` | Solo sellers. Propone la normalización de un título; no modifica productos. |
| Salud | `GET /health` | Verifica la conexión a la base (lo usa Railway para validar cada deploy). |

Más detalles de diseño:

- **Transiciones atómicas:** cada cambio de estado actualiza solo si el estado sigue siendo el esperado; si otro request ganó, responde `409`.
- **Eventos en memoria** (`OrderCreated`, `OrderPaid`, `SubOrderStatusChanged`, `OrderCompleted`, `OrderCancelled`), publicados después del commit y visibles en los logs.
- **Autorización por recurso:** un recurso privado ajeno responde `404`, para no revelar que existe.
- **Comisión por seller** (por defecto 10%), copiada en cada suborder; los montos se calculan en centavos.
- **Normalizador:** el LLM interpreta el texto y el código decide lo determinístico (conversión de unidades, marcas contra un catálogo con alias). Incluye reintentos con backoff, timeout, límite de ritmo y registro de cada llamada en `normalization_run`.

### Evaluación del normalizador

49 productos etiquetados (`eval/golden-dataset.json`), 2 corridas por versión de prompt, con el mismo modelo:

| Llamadas que respondieron | Prompt v1 | Prompt v2 (activo) |
|---|---|---|
| Todos los campos objetivos correctos | 85,4% | **97,9%** |
| Cantidad | 89,6% | 100% |
| Categoría | 93,8% | 97,9% |
| Tokens de entrada por llamada | 271 | 688 |

Reporte completo: [`eval/reports/comparacion-v1-vs-v2.md`](eval/reports/comparacion-v1-vs-v2.md). Cómo correrla: [`eval/README.md`](eval/README.md).

## Usuarios de prueba

Están cargados en producción con el seed de demo (`SEED_DEMO_DATA=true`). En una instalación local, las contraseñas se definen con `SEED_BUYER_PASSWORD` y `SEED_SELLER_PASSWORD`.

| Rol | Email | Contraseña |
|---|---|---|
| BUYER | `comprador@example.com` | `buyer1234` |
| SELLER (comisión 10%) | `vendedor@example.com` | `seller1234` |
| SELLER (comisión 5%) | `vendedor.mayorista@example.com` | `seller1234` |
| SELLER (comisión 15%) | `vendedor.bebidas@example.com` | `seller1234` |

Los tres sellers suman 10 productos, para mostrar la división de órdenes con comisiones distintas.

### Demo interactiva

`/demo` es una página que ejecuta el flujo principal contra la API real, paso a paso: registro, login, catálogo, compra multi-seller, pago con webhook (y su reintento idempotente), avance de suborders como seller y normalización de un título con IA. Muestra cada request y su respuesta, sin tener que copiar tokens ni IDs a mano.

### Recorrido sugerido en Swagger

1. `POST /auth/login` como buyer y **Authorize** con el `accessToken`.
2. `GET /products` y `POST /orders` con productos de 2 o 3 sellers: la orden vuelve dividida en suborders, con la comisión de cada seller.
3. `POST /orders/:id/pay` devuelve una referencia de pago `PENDING`.
4. `POST /payments/:reference/simulate` con `{ "status": "APPROVED" }`: la orden pasa a `PAID`. Repetir con el mismo `eventId` responde `duplicate` (idempotencia).
5. Login como seller y `PATCH /sub-orders/:id/status` con `ACCEPTED`, `SHIPPED` y `DELIVERED`.
6. Como seller, `POST /catalog/normalize` con `{ "rawText": "QUESO CREMOSO LA SERENISIMA X KG" }`.

## Instalación y ejecución

Requisitos: Node.js 22+, Docker y una API key de Gemini (Google AI Studio).

```bash
git clone https://github.com/FerreyraLautaro/TFM_marketplace.git
cd TFM_marketplace
npm install
cp .env.example .env          # completar los valores (ver tabla)
docker compose up -d          # PostgreSQL 16 en el puerto 5432
npm run start:dev             # aplica las migraciones al arrancar
```

La API queda en http://localhost:3000 y Swagger en http://localhost:3000/docs.

| Variable | Obligatoria | Descripción |
|---|---|---|
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Sí | Conexión a PostgreSQL |
| `JWT_SECRET` | Sí | Firma de tokens (mínimo 32 caracteres) |
| `PAYMENT_WEBHOOK_SECRET` | Sí | Firma HMAC del webhook de pagos (mínimo 32 caracteres) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Sí | Acceso a Gemini (por ejemplo `gemini-3.5-flash-lite`) |
| `NODE_ENV` | No | `development` (por defecto), `production` o `test` |
| `GEMINI_RPM`, `GEMINI_TIMEOUT_MS`, `GEMINI_MAX_QUEUE_WAIT_MS` | No | Límite de ritmo, timeout y espera máxima (15 / 15000 / 10000) |
| `SEED_DEMO_DATA`, `SEED_BUYER_PASSWORD`, `SEED_SELLER_PASSWORD` | No | Datos de demo al arrancar (idempotente) |

Los secretos se generan con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. La app valida todas las variables al iniciar y no arranca si falta alguna.

### Comandos

```bash
npm run build                 # compilar
npm run start:prod            # ejecutar lo compilado (producción)
npm run lint && npm run format

npm test                      # tests unitarios
npm run test:e2e              # tests e2e (requiere Docker; usa la base marketplace_test)

npm run migration:generate -- src/database/migrations/<Nombre>
npm run migration:run | migration:revert | migration:show

npm run eval -- --prompt v2   # evaluación del normalizador (llamadas reales a Gemini)
```

## Estructura del proyecto

```
src/
├── config/      Variables de entorno validadas con zod
├── database/    Conexión TypeORM, data source del CLI y migraciones
├── health/      GET /health (Terminus)
├── users/       Entidad User, roles y comisión
├── auth/        JWT, guards, @Roles, @CurrentUser
├── products/    CRUD de productos por seller
├── orders/      Órdenes, suborders, máquinas de estado y montos
├── payments/    Pagos asíncronos, webhook firmado y checkout simulado
├── events/      EventPublisher en memoria
├── llm/         LlmProvider + Gemini (reintentos, timeout, límite de ritmo)
├── catalog/     Normalizador, marcas, prompts versionados y evaluación
└── seed/        Datos de demo
eval/            Golden dataset, scripts y reportes de evaluación
test/            Tests e2e
```

Las abstracciones detrás de interfaces (`LlmProvider`, `PaymentProvider`, `EventPublisher`) permiten cambiar Gemini, el proveedor de pagos o el bus de eventos sin tocar la lógica de negocio. Las decisiones de diseño y su justificación están en la sección "Decisiones" de [`Plan_TFM.md`](Plan_TFM.md).

## Uso de IA en el desarrollo

El código y los tests se implementaron con Claude (Anthropic) como asistente de programación. El alcance, las decisiones de diseño y la revisión de cada pull request fueron propios; el registro de decisiones y las etapas del desarrollo están en [`Plan_TFM.md`](Plan_TFM.md).
