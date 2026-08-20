# Guía del backend

## Flujo general

`Frontend → Routes → Controllers → Services → Models → Base de datos`

La respuesta regresa en sentido contrario. Routes define endpoints; controllers
reciben la petición; services aplican reglas; models ejecutan SQL.

## Config

`src/config/database.ts` crea el pool de conexiones a MySQL usando `.env`.
Los modelos importan ese pool para consultar o modificar la base de datos.

## Routes

Define las direcciones de la API y las conecta con controllers.

- `auth.routes.ts`: autenticación y sesiones.
- `client.routes.ts`: clientes y configuraciones.
- `period.routes.ts`: períodos fiscales y meses.
- `dashboard.routes.ts`: datos resumidos del dashboard.
- `sso.routes.ts`: autenticación externa.

Ejemplo: `GET /api/clients` llega a la ruta de clientes y ejecuta su controller.

## Controllers

Reciben la petición HTTP. Leen `req.params` (datos de la URL), `req.query`
(filtros) y `req.body` (datos enviados). Luego llaman al service o model y
devuelven `res.json(...)` o un código de error.

- `auth.controller.ts`: credenciales y sesiones.
- `client.controller.ts`: clientes.
- `dashboard.controller.ts`: resúmenes del dashboard.
- `declaration.controller.ts`: declaraciones mensuales.
- `document.controller.ts`: documentos y archivos.
- `incomeTax.controller.ts`: impuesto anual y creación de meses.
- `period.controller.ts`: períodos fiscales.
- `sso.controller.ts`: autenticación externa.

## Services

Contienen las reglas del negocio. `auth.service.ts` valida usuarios y sesiones.
`dashboard.service.ts` combina clientes, períodos, documentos y declaraciones
para calcular cumplimiento y pendientes. Reglas como “solo abrir el año
siguiente” deben vivir en esta capa o en el controller especializado.

## Models

Conocen las tablas y ejecutan `SELECT`, `INSERT`, `UPDATE` y `DELETE` mediante
el pool de base de datos.

- `client.model.ts`: clientes.
- `user.model.ts`: usuarios.
- `declaration.model.ts`: tabla `declaraciones_mensuales`.
- `incomeTax.model.ts`: tabla `configuraciones_impuesto_renta`.
- `period.model.ts`: tabla `accounting_periods` y estados mensuales.
- `document.model.ts`: documentos y versiones.
- `sso.model.ts`: autenticación externa.

Ejemplo: `declaration.model.ts` consulta `declaraciones_mensuales`; el
controller devuelve esas filas como JSON al frontend.

## Middleware

Se ejecuta antes del controller. `auth.middleware.ts` verifica sesión o token;
`csrf.middleware.ts` protege contra peticiones CSRF. Si todo es válido llaman
a `next()`; si no, detienen la petición con un error.

## Types

Define interfaces y tipos de TypeScript. Describe la forma de los datos, pero
no consulta la base ni ejecuta reglas.

## Archivos principales

- `server.ts`: configura Express, middleware, rutas y puerto.
- `server.js`: versión JavaScript antigua o de compatibilidad.
- `storage`: archivos subidos.
- `.env`: configuración privada.
- `.env.example`: plantilla de variables necesarias.

## Ejemplo: guardar impuesto a la renta

El frontend llama `PUT /api/clients/5/income-tax/2022`. La route encuentra el
endpoint y llama a `incomeTax.controller.ts`. El controller lee `clientId`,
`year` y `req.body`; se validan las reglas; `incomeTax.model.ts` guarda en
`configuraciones_impuesto_renta`; si corresponde se crean registros en
`accounting_periods`; finalmente el controller responde al frontend.

## Para agregar una funcionalidad

Identifica el endpoint, registra la route, modifica el controller, coloca las
reglas en el service, consulta la tabla desde el model y devuelve el formato
que espera el frontend.
