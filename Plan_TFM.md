# Plan del TFM — Marketplace de supermercado

> Plan vivo. Marcar casillas a medida que se avanza y registrar cada cierre semanal en la Bitácora.
> Creado: 30/10/2026.

## Reglas

1. Un proyecto con cierre a la vez: este. Ideas nuevas → sección "Después del TFM".
2. El núcleo lo escribo yo: leo la documentación de Nest, implemento a mano, pido revisión.
3. No entra código que no pueda explicar línea por línea.
4. Primer test unitario y primer e2e a mano; el resto con IA a partir de mis casos.
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
- [ ] Esqueleto desplegado en Railway con `/health`
  - [x] Endpoint `/health` con ping a la base (Terminus), probado 200/503
  - [ ] Deploy en Railway (Postgres + variables de entorno + health check path)
  - [ ] Decidir `synchronize: true` en producción (condicionar por entorno o migraciones)
- [ ] Users + auth: JWT, Passport, guards de rol, decorador `@CurrentUser()`
- [ ] CRUD de productos por seller con DTOs y validación
- [ ] Swagger configurado
- [ ] **Primer test unitario escrito a mano**

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
- [ ] **Primer test e2e escrito a mano** (supertest); el resto con IA desde mis casos

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

## Decisiones

<!-- Decisiones de diseño tomadas en el camino y su motivo. Sirven para el video y las slides. -->

## Después del TFM

<!-- Ideas nuevas: se anotan acá y no se tocan hasta entregar. -->