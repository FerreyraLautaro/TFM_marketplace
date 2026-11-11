# Health check con Terminus

> Semana 1 · Ítem "Esqueleto desplegado en Railway con `/health`" (parte del endpoint)
> Docs de Nest: Reliability → Health checks (Terminus). En el repo de la doc el archivo es `content/reliability/terminus.md`.

## 1. El problema

Una app puede estar "arriba" (el proceso corre) y aun así no servir: por ejemplo, con la base de datos caída. Railway, Docker u otro orquestador necesitan una forma de preguntarlo, y esa pregunta es un endpoint de salud.

Si responde `200` con la base caída, la plataforma cree que todo está bien cuando no lo está.

## 2. Qué debe chequear un health check

Mi respuesta inicial fue "variables de entorno, módulos y base". Corrección:

- **Variables de entorno y módulos: ya están cubiertos al arrancar.** Con `validateEnv` y el `.catch` de `main.ts`, si algo de eso falla la app no levanta. Si `/health` responde, ya pasó. Chequearlo de nuevo es redundante: las variables no cambian mientras el proceso vive.
- **Lo que sí chequea es lo que puede romperse después del arranque:** la base de datos hoy; servicios externos (Gemini, Mercado Pago) más adelante.
- **Un health check solo debe depender de lo que tu app necesita.** Mi primer intento copió el ejemplo de la doc que hace ping a `docs.nestjs.com`. Si ese sitio se cae o Railway no tiene salida a internet, tu app reportaría `503` y podría reiniciarse sin que haya nada roto.

### Liveness vs readiness

| Tipo | Pregunta | Si falla |
|---|---|---|
| Liveness | ¿El proceso está vivo? | Reiniciarlo |
| Readiness | ¿Puede atender tráfico ahora (base incluida)? | No mandarle requests |

Un `/health` que solo devuelve `200` es liveness; uno que además consulta la base es readiness. Para el TFM alcanza con un solo endpoint que haga ambas cosas.

## 3. Código final

`src/health/health.module.ts`:

```ts
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

`src/health/health.controller.ts`:

```ts
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database').withTimeout(1000),
    ]);
  }
}
```

`AppModule` suma `HealthModule` en `imports`. Dependencia: `@nestjs/terminus`.

### Paso a paso

- **`TerminusModule`** provee `HealthCheckService` y los indicadores.
- **`@HealthCheck()`** marca el endpoint para que Terminus arme la respuesta y el código HTTP.
- **`health.check([...])`** recibe una lista de funciones; cada una es un indicador.
- **`pingCheck('database')`** ejecuta un `SELECT 1` sobre la conexión de TypeORM. `'database'` es solo la **etiqueta** que aparece en el JSON, no elige ninguna base.
- **`.withTimeout(1000)`**: si la base no responde en 1 s, el indicador se marca `down`. Sin esto una base colgada deja el health check colgado.

## 4. ¿Cómo sabe qué base controlar?

`TypeOrmHealthIndicator` no recibe configuración tuya. Pide por **inyección de dependencias** la conexión de TypeORM ya registrada (el `DataSource` por defecto) y ejecuta el `SELECT 1` sobre ella.

Esa conexión existe porque `DatabaseModule` hizo `TypeOrmModule.forRootAsync(...)`, y TypeORM la registra como provider global. Por eso `HealthModule` la encuentra sin importar `DatabaseModule`. Con dos conexiones habría que indicar cuál.

## 5. Códigos de respuesta (verificado)

- Todo bien: `200`, `"status": "ok"`.
- Algún indicador `down`: `503`, `"status": "error"`, y el detalle va en `error`.
- Probado en local: base arriba → `200`; `docker compose stop` → `503`.

Estados nuevos de la doc actual:
- `degraded`: dependencia que hace lenta la app pero no la rompe (un caché). Responde `200`. Podría servir más adelante para un servicio externo como Gemini.
- `shutting_down`: la app se está apagando pero todavía acepta requests.

Advertencia de la doc: si un indicador **custom** lanza un error en vez de reportar `down`, el resultado es `500` y no `503`. Para eso existe `attempt()`.

## 6. Errores y correcciones del camino

1. **Copiar el ejemplo de la doc sin leerlo**: incluía un ping HTTP externo a `docs.nestjs.com`. Se eliminó junto con `HttpHealthIndicator`, `HttpModule` y `@nestjs/axios`.
2. **Dos endpoints (`/health` y `/health/db`)**: sobraba uno. Railway chequea un solo path; ese tiene que ser el que mira la base.
3. **Spec autogenerado roto**: `npm test -- health` fallaba por dos causas encadenadas. Jest no puede leer `@nestjs/terminus` (error de parseo de módulos en `node_modules`) y, aunque pudiera, el spec crea el controller sin sus dependencias. Se borró; se retoma cuando toque el primer test unitario, con mocks y la configuración de Jest necesaria.

## 7. Índice para releer

Base: https://docs.nestjs.com

| Tema | Dónde | Para qué |
|---|---|---|
| Health checks | Reliability → Health checks (Terminus) | `TerminusModule`, indicadores, estados |
| TypeORM health indicator | Misma página, sección "TypeOrm health indicator" | `pingCheck`, `SELECT 1` |
| Custom health indicator | Misma página | `attempt()`, `degraded()` |
| Timeouts y caché | Misma página, "Timeouts and caching" | `withTimeout` |

## 8. Pendiente

- **Deploy en Railway** (siguiente del plan): Postgres de Railway, variables de entorno, y configurar el health check path en `/health`. Es la prueba de que `validateEnv` funciona fuera de tu máquina.
- **`synchronize: true`**: decidir antes de producción si se condiciona por entorno o se pasa a migraciones. En Railway puede alterar o borrar columnas sin avisar.
- **Saltos de línea (LF/CRLF)** (resuelto): con `core.autocrlf=true` en Windows y sin `.gitattributes` ni `endOfLine` en `.prettierrc`, Git marcaba archivos como modificados sin diferencias reales (caché del índice). Se agregó `.gitattributes` con `* text=auto eol=lf` y `"endOfLine": "lf"` en `.prettierrc`, en un commit aparte. Si el editor sigue mostrando marcas, recargar la ventana.
- **Primer test unitario escrito a mano** (ítem del plan) y configuración de Jest para módulos ESM de `node_modules`.
