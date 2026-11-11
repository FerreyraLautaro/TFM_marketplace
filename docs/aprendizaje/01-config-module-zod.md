# ConfigModule + validación de variables de entorno con zod

> Semana 1 · Ítem "Nest + PostgreSQL en Docker + TypeORM + ConfigModule"
> Docs de Nest: Configuration, Dynamic modules, Providers, Modules.

## 1. El problema

Hoy `app.module.ts` tiene host, puerto y contraseña escritos en el código. Eso trae dos problemas:

1. **Cambiar de entorno obliga a tocar código.** En Railway la base no va a estar en `localhost` y la contraseña va a ser otra.
2. **Los errores aparecen tarde.** Si falta una variable o tiene un valor inválido, te enterás cuando TypeORM intenta conectarse o en medio de un request.

Objetivo: que la configuración venga de afuera (variables de entorno) y que **la app no arranque si la configuración es inválida**. Eso es *fail fast*: mejor fallar al levantar con un mensaje claro que en producción a las 3 a. m.

## 2. Los conceptos de Nest detrás de `ConfigModule`

`ConfigModule` es un ejemplo de manual de tres conceptos que se usan en todo el proyecto.

### a) Módulos dinámicos: `forRoot()`

`TypeOrmModule.forRoot({...})` ya es uno. Un módulo **estático** siempre hace lo mismo. Un módulo **dinámico** es una fábrica: recibe opciones y devuelve un módulo configurado a medida.

Analogía: el módulo estático es un mueble ya armado. `forRoot(opciones)` es el mismo mueble hecho a medida: Nest lo arma con las medidas que le diste.

`ConfigModule.forRoot()` lee el `.env`, lo combina con `process.env`, lo valida y registra el resultado.

📖 Doc: *Fundamentals → Dynamic modules*

### b) Providers e inyección de dependencias: `ConfigService`

Lo que registra `ConfigModule` es un **provider**: `ConfigService`. No se instancia con `new`: se pide en el constructor de una clase y Nest lo inyecta. Es **el** concepto central de Nest; todo el framework gira alrededor del contenedor de inyección de dependencias (DI).

¿Por qué no leer `process.env.DB_HOST` directo? Porque `process.env` es estado global: no se mockea limpio en tests, no tiene tipos y no está validado. `ConfigService` es una dependencia explícita y reemplazable.

📖 Doc: *Overview → Providers*

### c) Alcance de los módulos: `isGlobal`

En Nest, un provider solo es visible dentro del módulo que lo registra o en los módulos que **importan** ese módulo. Es encapsulamiento deliberado.

`isGlobal: true` rompe esa regla a propósito para la configuración, porque casi todos los módulos la necesitan y sería ruido importarla en cada uno. **Usarlo solo para cosas realmente transversales.** Si aparece `isGlobal` en todos lados, es señal de mal diseño.

📖 Doc: *Overview → Modules → Global modules*

## 3. Dónde entra zod

`ConfigModule.forRoot()` acepta dos formas de validar:

| Opción | Qué recibe | Comentario |
|---|---|---|
| `validationSchema` | un schema de **Joi** | Es lo que muestra la doc, pero queda atado a Joi |
| `validate` | **una función** `(config) => configValidada` | Agnóstica: adentro se puede usar zod, class-validator, etc. |

Con zod se usa **`validate`**. El contrato: la función recibe un objeto con todas las variables. Si son válidas, devuelve el objeto validado. Si no, **lanza un error** y la app no arranca.

### ⚠️ La trampa principal

**Todas las variables de entorno son strings.** `DB_PORT=5432` llega como `"5432"`. Si el schema dice `z.number()`, falla. Hay que **convertir** el valor; zod tiene una herramienta pensada para este caso (buscarla en la doc de zod).

## 4. Pasos de implementación

1. Instalar `@nestjs/config` y `zod`.
2. Crear `.env` con las variables de la base (host, puerto, usuario, contraseña, nombre de la base) y agregarlo a `.gitignore`. Crear también `.env.example` **sin secretos**, que sí se commitea, para que quien clone el repo sepa qué variables necesita.
3. Crear un archivo aparte con el schema de zod y la función `validate`. **No dentro de `app.module.ts`**: es otra responsabilidad.
4. En la función: usar `safeParse`. Si falla, lanzar un error con los problemas que reporta zod. Si pasa, devolver los datos.
5. Registrar `ConfigModule.forRoot({ isGlobal: true, validate })` en `AppModule`.
6. **Probar que valida:** borrar una variable del `.env` o poner `DB_PORT=abc` y levantar la app. Tiene que fallar con un mensaje claro. Si no falla, no está validando.

**Bonus:** zod puede **inferir el tipo** desde el schema (`z.infer`), y `ConfigService` acepta un genérico. Combinando las dos cosas, `configService.get('DB_PORT')` queda tipado.

## 5. Lo que queda abierto (puente al punto 2)

Al terminar, `TypeOrmModule.forRoot({...})` **sigue con valores fijos** y no puede leer de `ConfigService`. ¿Por qué? Pensar en el orden en que Nest construye las cosas.

La respuesta es `forRootAsync` + `inject` + `useFactory`, que es el siguiente paso: extraer la configuración de la base de datos a su propio módulo para desacoplarla de `AppModule`.

## Autoevaluación (responder antes de codear)

1. ¿Qué diferencia hay entre `ConfigModule` (el módulo) y `ConfigService` (el provider)? ¿Cuál se importa y cuál se inyecta?
2. ¿Por qué `validate` y no `validationSchema`?
3. Si pongo `DB_PORT=5432` en el `.env`, ¿qué tipo de dato le llega a la función `validate`?

### Respuestas (revisadas)

1. **`ConfigModule` se importa, `ConfigService` se inyecta.** El módulo lee, valida y registra la configuración, y exporta el service. El service (`get()`) es lo que se pide en el constructor. Con `isGlobal: true` los demás módulos no necesitan importar `ConfigModule`, solo inyectar el service.
2. **`validate` es una función agnóstica** (sirve zod, class-validator, etc.). `validationSchema` espera un schema de Joi y queda atado a esa librería. Lo que devuelve `validate` es lo que queda guardado como configuración.
3. **Siempre `string`.** Por eso el schema convierte con `z.coerce.number()`.

## 6. Lo que se resolvió

### Error 1: `{ validateEnv }` no funciona

`{ validateEnv }` es azúcar de `{ validateEnv: validateEnv }`: la **clave** es `validateEnv`. `ConfigModule` solo reconoce ciertas claves (`isGlobal`, `validate`, `envFilePath`...). Solución: `validate: validateEnv` (clave que Nest espera, valor = tu función).

### Error 2: leer la config desde `TypeOrmModule`

`forRoot({...})` evalúa su objeto al **cargar el archivo**, antes de que exista el contenedor de DI, así que no hay `ConfigService` disponible. Solución: `forRootAsync`, que entrega una receta a Nest para ejecutar cuando las dependencias ya están resueltas.

### Código final

Primera versión (todo junto, antes de separar en módulos):

```ts
ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => ({
    type: 'postgres',
    host: config.get('POSTGRES_HOST', { infer: true }),
    port: config.get('POSTGRES_PORT', { infer: true }),
    username: config.get('POSTGRES_USER', { infer: true }),
    password: config.get('POSTGRES_PASSWORD', { infer: true }),
    database: config.get('POSTGRES_DB', { infer: true }),
    entities: [],
    synchronize: true,
  }),
}),
```

### Paso a paso

- **`inject: [ConfigService]`**: dependencias que Nest resuelve antes de ejecutar la fábrica. No hace falta `imports: [ConfigModule]` porque es global.
- **`useFactory`**: Nest la ejecuta y le pasa las instancias **en el mismo orden que `inject`**. Devuelve el objeto de opciones que antes iba en `forRoot`.
- **`ConfigService<Env, true>`**: `Env` es el tipo inferido del schema (`z.infer`), así `get` solo acepta claves válidas. El `true` (`WasValidated`) hace que `get` devuelva `string` y no `string | undefined`.
- **`{ infer: true }`**: el tipo de retorno sale de `Env`. `POSTGRES_PORT` llega como `number`.

### Trampa de `z.coerce.number()`

`"abc"` da `NaN` y falla bien, pero `""` (variable vacía) se convierte en `0` y pasa. Para puertos conviene sumar `.int().positive()`.

## 7. Índice de la doc de Nest para releer

Base: https://docs.nestjs.com

| Tema | Dónde | Para qué |
|---|---|---|
| Módulos y `isGlobal` | Overview → Modules → Global modules | Encapsulamiento y alcance de providers |
| Providers e inyección | Overview → Providers | Cómo funciona el contenedor de DI |
| Módulos dinámicos | Fundamentals → Dynamic modules | Por qué existen `forRoot` / `forRootAsync` |
| Configuración | Techniques → Configuration | `ConfigModule`, `validate`, `ConfigService` |
| `ConfigService` tipado | Techniques → Configuration → Custom getter / `infer` | `get` con tipos |
| TypeORM async | Techniques → Database → Async configuration | `forRootAsync`, `inject`, `useFactory` |
| Providers asíncronos | Fundamentals → Custom providers → Factory providers | Base conceptual de `useFactory` |

## 8. Separación en módulos (estructura final)

```
src/
├── app.module.ts                 # raíz de composición: solo lista módulos
├── config/
│   ├── configuration.module.ts   # ConfigurationModule: ConfigModule.forRoot(...)
│   └── env.schema.ts             # schema de zod + validateEnv + tipo Env
└── database/
    └── database.module.ts        # DatabaseModule: TypeOrmModule.forRootAsync(...)
```

`AppModule` queda con `imports: [ConfigurationModule, DatabaseModule]`.

**Por qué separar:**
- `AppModule` es la **raíz de composición**: su trabajo es decir qué módulos forman la app, no configurarlos. Si acumula detalles de cada módulo, se vuelve ilegible al sumar Auth, Products, Orders...
- Cada módulo tiene **una sola responsabilidad**: uno sabe de variables de entorno, el otro de la conexión a la base.
- El nombre de la clase coincide con el archivo (`ConfigurationModule` en `configuration.module.ts`) y no se confunde con el `ConfigModule` de Nest.
- `DatabaseModule` no importa `ConfigurationModule`, pero **depende de él de forma implícita** porque es `isGlobal`. Si algún día deja de ser global, hay que importarlo explícitamente.

## 9. `main.ts`: promesas flotantes

El lint avisó `no-floating-promises` en `bootstrap();`. `bootstrap` es `async`, así que devuelve una `Promise`; si falla (config inválida, base caída, puerto ocupado) y nadie captura el rechazo, queda como `unhandledRejection`.

Solución: capturar el error, loguearlo y **terminar con `process.exit(1)`**. El código de salida distinto de 0 le avisa a Docker o Railway que el arranque falló; sin él el proceso podría salir con código 0 ("todo bien") aunque haya fallado.

```ts
bootstrap().catch((error) => {
  console.error('Failed to start the application', error);
  process.exit(1);
});
```

`void bootstrap()` también silencia el warning, pero solo lo oculta: los errores siguen sin manejarse.

## 10. Verificado y deuda anotada

- ✅ Fail fast probado: sin `POSTGRES_DB` la app no arranca y muestra el mensaje de zod.
- ✅ `.env` está en `.gitignore` y existe `.env.example`.
- ⚠️ `synchronize: true`: TypeORM modifica el esquema solo al arrancar. Está bien en local, pero en Railway puede alterar o borrar columnas sin avisar. Decidir en el ítem de despliegue: condicionarlo por entorno o pasar a migraciones.
- ⚠️ `POSTGRES_PORT` usa `z.coerce.number().int()` sin `.positive()`: una variable vacía (`""`) se convierte en `0` y pasa la validación. Agregar `.positive()` en el schema.
