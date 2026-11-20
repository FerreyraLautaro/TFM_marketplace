# Plan del TFM — Marketplace de supermercado

> Plan vivo. Marcar casillas a medida que se avanza y registrar cada cierre semanal en la Bitácora.
> Creado: 30/10/2026.

## Reglas

1. Un proyecto con cierre a la vez: este. Ideas nuevas → sección "Después del TFM".
2. El código lo implementa Claude (IA); yo defino el alcance, tomo las decisiones de diseño y reviso y mergeo cada PR.
3. No entra una decisión que no pueda fundamentar: cada elección queda registrada en "Decisiones".
4. Los tests (unitarios y e2e) los escribe Claude a partir de los casos del plan.
5. Cierre semanal: revisar contra el criterio de "terminado" y anotar en la Bitácora.

## Alcance

**Incluye:** auth con roles, productos por seller, órdenes divididas en suborders,
máquinas de estado, comisión, eventos en memoria, autorización por recurso,
pago con Mercado Pago sandbox + webhook idempotente, normalizador de catálogo con
LLM, versionado y evaluación de prompts, Swagger, despliegue en Railway.

**No incluye:** frontend, búsqueda, stock y reservas, envíos reales, split payment
real de Mercado Pago, refresh tokens, panel de administración.

### Normalizador de catálogo

Ejemplo: `"LECHE SERENISIMA ENTERA 1LT"` →

```json
{ "brand": "La Serenísima", "productName": "Leche entera", "quantity": 1000,
  "unit": "ml", "category": "LACTEOS", "confidence": "high" }
```

| Campo | Cómo se resuelve |
|---|---|
| Categoría | Lista cerrada de 15–20 en el prompt. Si duda → `SIN_CATEGORIA` |
| Contenido / unidad | El LLM extrae; el código convierte a `ml`, `g`, `unidad` |
| Marca | El LLM extrae; el código compara con `Brand`. Si no existe → `PENDIENTE_REVISION` |
| Formato | Salida estructurada (JSON schema) + validación con DTO; fallo = error registrado |

Evaluación: golden dataset de 30–50 productos etiquetado a mano; script que mide
precisión por campo y validez de esquema; reporte v1 vs v2.

---

## Semana 1 · Base (~12 h)

- [x] Repositorio público en GitHub
- [x] Nest + PostgreSQL en Docker + TypeORM + ConfigModule
- [x] Esqueleto desplegado en Railway con `/health`
  - [x] Endpoint `/health` con ping a la base (Terminus), probado 200/503
  - [x] Deploy en Railway (Postgres + variables de entorno + health check path), `/health` responde 200 en producción
  - [x] `NODE_ENV` validada con zod; `synchronize` pasó a `false` en todos los entornos (el esquema solo cambia por migraciones)
- [ ] Users + auth: JWT, Passport, guards de rol, decorador `@CurrentUser()`
  - [x] Entidad `User` mínima (`id` uuid, `email` único, `createdAt`) registrada en `entities`
  - [x] `buildDataSourceOptions(env)` compartida entre la app y el CLI (`src/database/data-source.options.ts`)
  - [x] **Migraciones (prerrequisito):** `data-source.ts` para el CLI (carga del `.env`), scripts `migration:generate/run/revert/show`, migración `CreateUser` probada con run/revert en local, y `migrationsRun` al arrancar (probado desde `dist`). Pendiente confirmar en Railway (extensión `uuid-ossp`)
  - [x] Ampliar `User` (contraseña y rol) con una segunda migración
  - [x] JWT, Passport, guards de rol y `@CurrentUser()` (`/auth/register`, `/auth/login`, `/auth/me`)
- [x] CRUD de productos por seller con DTOs y validación (lectura pública; alta, edición y baja solo por el seller dueño)
- [x] Swagger configurado (`/docs`, Bearer auth, DTOs documentados con el plugin del CLI)
- [x] Tests unitarios (escritos por Claude): auth, users, guard de roles y productos, 18 tests

**Terminado cuando:** se registran usuarios con rol, un seller crea y edita sus
productos con validación, hay tests unitarios y el esqueleto está desplegado.

Docs de Nest: Modules, Providers, Controllers, Pipes/Validation, Database (TypeORM),
Configuration, Authentication, Authorization, Custom decorators, Testing, OpenAPI.

## Semana 2 · Núcleo del marketplace (~12 h)

- [ ] Órdenes con división automática en suborders por seller
- [ ] Máquinas de estado de Order y SubOrder
- [ ] Comisión por suborder
- [ ] `EventPublisher` en memoria + eventos por cambio de estado
- [ ] Autorización por recurso (seller solo ve y avanza sus suborders)
- [ ] Transacción al crear la orden
- [ ] Tests e2e del flujo principal con supertest (escritos por Claude)

**Terminado cuando:** una orden con productos de 2 sellers se divide, cambia de
estado y emite eventos, con tests e2e del flujo principal.

Docs de Nest: Custom providers, Guards, Interceptors, Exception filters, Events,
TypeORM transactions, Testing (e2e).

## Semana 3 · IA (~12 h)

- [ ] API key de Gemini y límites confirmados en la consola
- [ ] `LlmProvider` + `GeminiLlmProvider` con salida estructurada
- [ ] Taxonomía de categorías y semilla de marcas
- [ ] Normalizador con prompt v1 + registro en `NormalizationRun`
- [ ] Golden dataset de 30–50 productos etiquetado a mano
- [ ] Script de evaluación + prompt v2
- [ ] Reporte comparativo v1 vs v2 con números

**Terminado cuando:** existe un reporte que compara v1 y v2 por campo y el
endpoint de normalización funciona.

## Modo reducido · Ya en Cencosud (4–6 h/semana)

- [ ] Mercado Pago sandbox detrás de `PaymentProvider`
- [ ] Webhook idempotente que pasa la orden a PAID
- [ ] Despliegue final en Railway con variables de entorno y seeds
- [ ] README completo (ver checklist de entrega)
- [ ] Slides
- [ ] Video con captura de pantalla
- [ ] Formulario de entrega enviado

**Terminado cuando:** el formulario de entrega está enviado.

> **Si falta tiempo:** `FakePaymentProvider` en lugar de Mercado Pago. Nunca se
> recorta el núcleo del marketplace ni la parte de IA. El onboarding tiene prioridad.

---

## Checklist de entrega (documentación del máster)

**README.md**
- [ ] Descripción general
- [ ] Stack tecnológico
- [ ] Instalación y ejecución
- [ ] Estructura del proyecto
- [ ] Funcionalidades principales
- [ ] Usuarios de prueba (un BUYER y un SELLER)
- [ ] URLs de despliegue, slides y video

**Otros**
- [ ] Repositorio público en GitHub
- [ ] Despliegue en Railway (recomendado)
- [ ] Slides con URL pública o en el repo
- [ ] Video con captura de pantalla (cámara opcional)
- [ ] Formulario: nombre, email, URLs (repo, despliegue, slides, video), usuario de prueba

---

## Bitácora

<!-- Una entrada por cierre semanal o hito. Formato:
### AAAA-MM-DD · Semana N
- Hecho:
- Aprendido (concepto de Nest):
- Bloqueos / dudas:
- Próximo paso:
-->

### 2026-11-20 · Semana 1
- Hecho: config validada con zod, `/health` con Terminus, deploy en Railway, migraciones de TypeORM, users + auth JWT con roles, CRUD de productos por seller, Swagger en `/docs`. 18 tests unitarios (auth, users, guard de roles, productos).
- Cambio de modo: por carga laboral, la implementación pasa a la IA y yo decido y reviso las PRs. Prioridad: entregar.
- Bloqueos / dudas: los paquetes `@nestjs/*` v12 son ESM y Jest no los cargaba (se resolvió con `@swc/jest`); `@nestjs/swagger` 12 exige Nest 12, se usa la línea 11.
- Próximo paso: Semana 2 (órdenes con suborders por seller).

## Decisiones

<!-- Decisiones de diseño tomadas en el camino y su motivo. Sirven para el video y las slides. -->

- **Validación de entorno con zod al arrancar (fail fast).** Una variable faltante o inválida frena el arranque con un mensaje claro, en vez de fallar en medio de un request.
- **Módulos separados (`ConfigurationModule`, `DatabaseModule`, `HealthModule`).** `AppModule` solo compone; cada módulo tiene una responsabilidad.
- **Migraciones en vez de `synchronize`, en todos los entornos.** El esquema cambia solo con archivos revisables y versionados; lo que se prueba en local es lo que corre en producción. Se aplican solas al arrancar (`migrationsRun`): si fallan, el health check de Railway mantiene el deploy anterior.
- **Opciones de conexión en una sola función (`buildDataSourceOptions`).** La comparten la app y el CLI de migraciones, para que la lista de entidades no se desincronice.
- **IDs UUID.** Un id incremental en la URL permite enumerar recursos y estimar cuántos hay.
- **Health check solo de dependencias propias (base de datos).** Un chequeo externo podría reiniciar la app sin que haya nada roto.
- **JWT solo access token (1 h), bcryptjs.** Refresh tokens fuera de alcance; bcryptjs evita compilar código nativo en Windows y Railway.
- **Login con el mismo error para email inexistente y contraseña incorrecta.** Evita revelar qué emails están registrados.
- **Regla de propiedad de productos en el servicio, no en el controller.** El seller solo modifica lo suyo (403); la regla queda en un lugar testeable sin HTTP.
- **Precio `numeric(12,2)` expuesto como número.** `numeric` evita errores de redondeo de `float`; un transformer lo convierte porque Postgres lo devuelve como string.

## Después del TFM

<!-- Ideas nuevas: se anotan acá y no se tocan hasta entregar. -->