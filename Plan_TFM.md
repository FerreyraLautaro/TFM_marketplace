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

- [x] Órdenes con división automática en suborders por seller (foto de nombre y precio en cada ítem)
- [x] Máquinas de estado de Order y SubOrder (transiciones atómicas; 409 si el estado cambió)
- [x] Comisión por suborder (porcentaje fijo por seller, 10% por defecto, copiado en la suborder)
- [x] `EventPublisher` en memoria + eventos por cambio de estado (publicados después del commit)
- [x] Autorización por recurso (seller solo ve y avanza sus suborders)
- [x] Transacción al crear la orden
- [x] Tests e2e del flujo principal con supertest (escritos por Claude): auth, productos y flujo completo de órdenes contra una base `marketplace_test` aislada

**Terminado cuando:** una orden con productos de 2 sellers se divide, cambia de
estado y emite eventos, con tests e2e del flujo principal.

Docs de Nest: Custom providers, Guards, Interceptors, Exception filters, Events,
TypeORM transactions, Testing (e2e).

## Semana 3 · IA (~12 h)

> **Modo de trabajo de esta semana:** más participación mía. Cada decisión de diseño (proveedor, prompt, esquema de salida, manejo de errores, costos y límites) se discute antes de implementar, y el código se revisa pensando en cómo funcionaría en un entorno real: reintentos, timeouts, cuotas de la API, costo por llamada, observabilidad y qué pasa cuando el LLM falla o devuelve algo inválido.

- [x] API key de Gemini y límites confirmados en la consola (se empezó con `gemini-3.1-flash-lite`; se migró a `gemini-3.5-flash-lite`)
- [x] `LlmProvider` + `GeminiLlmProvider` con salida estructurada (reintentos propios, timeout, limitador de ritmo)
- [x] Taxonomía de categorías (18, con `SIN_CATEGORIA`) y semilla de 35 marcas con alias (en la migración)
- [x] Normalizador con prompt v1 + registro en `NormalizationRun` (`POST /catalog/normalize`, solo SELLER)
- [x] Golden dataset de 49 productos (borrador de Claude revisado fila por fila; reglas de etiquetado en el archivo)
- [x] Script de evaluación (`npm run eval`, 2 corridas por defecto) + prompt v2 (reglas y ejemplos fuera del dataset)
- [x] Reporte comparativo v1 vs v2 con números (`eval/reports/comparacion-v1-vs-v2.md`): todos los campos objetivos 85,4% → 97,9% sobre llamadas respondidas, tokens de entrada 271 → 688 por llamada

**Terminado cuando:** existe un reporte que compara v1 y v2 por campo y el
endpoint de normalización funciona.

## Modo reducido · Ya en Cencosud (4–6 h/semana)

- [x] ~~Mercado Pago sandbox detrás de `PaymentProvider`~~ → descartado: se mantiene `FakePaymentProvider` (decisión 2026-11-20)
- [x] Webhook idempotente **simulado** que pasa la orden a PAID (`POST /payments/webhook` con firma HMAC; checkout simulado en `POST /payments/:reference/simulate`)
- [ ] Despliegue en Railway con variables de entorno y seeds (se va completando en cada PR; seeds con un BUYER, un SELLER y comisiones de 5/10/15%)
- [ ] README completo (ver checklist de entrega; se va completando)
- [ ] Slides de presentación (hechas con Claude)
- [ ] Demo interactiva: página HTML/SPA (artifact de Claude) que muestra los flujos principales y permite elegir qué respuesta llega en cada paso (éxito, 400, 403, 404, 409), como alternativa más clara que Swagger
- [ ] Video con captura de pantalla, filmado por mí usando los endpoints (guion preparado con Claude)
- [ ] Formulario de entrega enviado

**Terminado cuando:** el formulario de entrega está enviado.

> **Prioridad:** nunca se recorta el núcleo del marketplace ni la parte de IA. El onboarding tiene prioridad.

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

### 2026-11-20 · Semana 2
- Hecho: órdenes divididas en suborders por seller con foto de precios, comisión por seller, máquinas de estado con transiciones atómicas, eventos en memoria, pago simulado (`FakePaymentProvider`), autorización por recurso. 115 tests unitarios y 16 e2e.
- Bloqueos / dudas: el glob de migraciones fallaba en Windows por la mayúscula de la unidad (`c:` vs `C:`); se reemplazó por una lista explícita.
- Próximo paso: Semana 3 (normalizador de catálogo con Gemini).

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
- **La orden es una foto.** Cada ítem copia nombre, precio unitario, cantidad y subtotal; el porcentaje y el monto de comisión se copian en la suborder. Cambios posteriores de precio o de comisión no alteran órdenes existentes; si se borra un producto, el ítem queda con `productId` en null y conserva sus datos.
- **Montos en centavos enteros.** Sumas y porcentajes se calculan en enteros para no acumular errores de punto flotante.
- **Comisión fija por seller (10% por defecto, otros valores por seeds).** No hay panel de administración y el seller no puede elegirla al registrarse.
- **Recursos privados ajenos devuelven 404, no 403.** En órdenes y suborders no se revela que el recurso existe; en productos (públicos) se usa 403.
- **Usuarios con órdenes no se pueden borrar.** La FK sin cascada preserva el historial de compras y ventas.
- **Transiciones de estado con compare-and-set.** El UPDATE solo aplica si el estado sigue siendo el validado (`WHERE id = ? AND status = ?`); si otro request ganó, 409. Las tablas de transiciones son funciones puras testeadas par por par.
- **La orden se bloquea al derivar su estado.** Con READ COMMITTED, dos sellers cerrando sus últimas suborders a la vez podían no verse entre sí y dejar la orden en PAID; el lock de la orden lo serializa.
- **Eventos publicados después del commit.** Ningún suscriptor ve un cambio que después se revierte. Un handler que falla se loguea y no rompe el request.
- **Pago detrás de `PaymentProvider` con `FakePaymentProvider`.** Mercado Pago será otra implementación del mismo token. El cobro va fuera de la transacción para no retener locks; si otro request cancela antes, un proveedor real necesitaría reembolsar (no implementado).
- **Solo se aceptan suborders de órdenes pagadas.**
- **Migraciones en lista explícita, como las entidades.** Un glob de archivos dependía de rutas (mayúsculas de unidad en Windows, `.d.ts` en `dist`); la lista funciona igual en local, tests y Railway.
- **Modelo Flash-Lite, configurable por variable (`GEMINI_MODEL`).** La tarea es extracción de texto corto: alcanza con el modelo más rápido, barato y con más cuota. Se empezó con `gemini-3.1-flash-lite` y se migró a `gemini-3.5-flash-lite`: el anterior tiene fecha de apagado (mayo 2027), su reemplazo oficial es el 3.5, y estaba saturado durante la evaluación. La migración fue solo de configuración (`GEMINI_MODEL` y `GEMINI_RPM`), y la evaluación se corre sobre el modelo de producción.
- **Normalización por endpoint explícito que solo propone (no modifica productos).** Crear productos no depende de la IA, reintentar es seguro y el endpoint sirve como tool para un agente (proponer y aplicar por separado: human-in-the-loop).
- **Reintentos en una sola capa (la nuestra); los del SDK apagados.** El SDK reintenta 5 veces por defecto: sumar los nuestros multiplicaría las llamadas (amplificación de reintentos). Los propios se registran, se cuentan por corrida y se testean sin red.
- **Política de fallas.** Transitorias (429, 5xx, timeout, red): hasta 3 intentos con backoff exponencial y jitter, respetando la espera que pide la API si es corta. Permanentes (400, 401, 403): sin reintento. Si se agotan: 503.
- **Limitador de ritmo por proceso con backpressure.** Respeta 15 RPM espaciando llamadas y rechaza en vez de encolar más de 10 s. Con varias instancias haría falta un contador compartido (Redis).
- **El LLM interpreta, el código decide lo determinístico.** El modelo extrae marca, nombre, cantidad, unidad cruda, categoría y confianza; el código convierte unidades (l→ml, kg→g) y compara marcas contra la tabla.
- **Marcas: coincidencia exacta sobre una clave normalizada + alias.** Sin mayúsculas, acentos, artículos ni puntuación. Sin similitud difusa: una marca desconocida va a `PENDIENTE_REVISION` en vez de adivinarse (un falso positivo es peor que un "no sé").
- **Marcas y categorías como datos de referencia en la migración.** Tienen que existir en todos los entornos; un seed aparte dejaría una base nueva sin marcas.
- **Un solo esquema (zod) para pedir y validar la salida del LLM.** Se convierte a JSON Schema para Gemini y valida lo que vuelve: la salida de un LLM se trata como dato no confiable.
- **Cada llamada queda en `NormalizationRun`** (texto, prompt, modelo, salida cruda, resultado, estado, intentos, latencia, tokens): observabilidad y materia prima de la evaluación.
- **Endpoint solo para SELLER.** Un endpoint público que llama a un LLM pago permite consumir la cuota o generar costos.
- **Errores del LLM según su naturaleza:** 503 + `Retry-After` si no está disponible, 502 si responde algo inválido (falla del servicio externo, no del usuario), siempre con la corrida registrada.
- **El texto del producto va delimitado y marcado como dato.** Mitiga inyección de prompt: un título como "ignorá las instrucciones…" no se interpreta como orden.
- **Evaluación con golden dataset y 2 corridas por versión.** Mide precisión por campo, variación del modelo consigo mismo (con `temperature: 0` fue ~0%), disponibilidad, tokens y latencia. Una mejora menor o igual a esa variación no cuenta.
- **Calidad separada de disponibilidad.** Las llamadas que fallan por el proveedor (503) se reportan como disponibilidad y no como error del prompt; si no, un mal momento de Google parece una regresión.
- **Prompt v2 dirigido por errores medidos.** Cada regla corrige una causa observada en la v1 ("X KG" como venta por peso, quesos, galletitas, estilo de nombre). Los ejemplos no pueden ser ítems del dataset (data leakage) y un test lo garantiza.
- **Limitación conocida:** la v2 se ajustó mirando el mismo dataset con el que se evalúa; para afirmar que generaliza haría falta un segundo dataset reservado.
- **Costo vs precisión:** la v2 usa 2,5× tokens de entrada por llamada (reglas y ejemplos) por +12,5 pp. Con Flash-Lite y este volumen es despreciable; a escala es una decisión de negocio.
- **Pago asíncrono confirmado por webhook.** `pay` solo crea un pago `PENDING`; la orden pasa a `PAID` cuando el proveedor confirma por webhook, como en Mercado Pago o Stripe. El checkout simulado usa exactamente el mismo camino firmado que un webhook real.
- **Webhook firmado con HMAC sobre los bytes crudos.** Comparación en tiempo constante; sin firma válida, 401 y nada registrado. Sin esto, cualquiera podría marcar órdenes como pagadas.
- **Idempotencia "reclamar primero".** El ID del evento se inserta con `ON CONFLICT DO NOTHING` en la misma transacción: si ya existía, es un reintento del proveedor y no cambia nada. `pay` también es idempotente (un índice único parcial impide dos pagos pendientes por orden).
- **El webhook responde 200 aunque ignore el evento.** Un error haría que el proveedor reintente indefinidamente; el caso queda registrado con su motivo.
- **Orden cancelada con pago aprobado → `REFUND_REQUIRED`.** Los reembolsos están fuera de alcance, pero el caso se detecta y se registra en lugar de perderse.
- **Tests e2e contra una base aislada (`marketplace_test`).** Se crea sola, recibe las migraciones al arrancar y se vacía entre suites; un guard aborta si la app no está conectada a esa base.

## Después del TFM

<!-- Ideas nuevas: se anotan acá y no se tocan hasta entregar. -->
