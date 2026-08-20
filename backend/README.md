# ContaMatic Backend

Backend Node.js con arquitectura MVC.

```text
src/
├── controllers/   lógica HTTP
├── models/        acceso a datos (temporal en memoria)
├── routes/        endpoints
└── server.js      configuración y arranque
```

Instalación:

```bash
pnpm install
pnpm dev
```

Health check: `GET http://localhost:3000/api/health`

Database check: `GET http://localhost:3000/api/health/database`

## SSO

ContaMatic recibe el código del Sistema A y consulta la URL configurada en `SSO_VALIDATE_URL`.

```http
POST /api/sso/validate
Content-Type: application/json
```

```json
{ "code": "A83K9XLM12" }
```

También acepta `GET /api/sso/callback?code=A83K9XLM12`. La URL real del Sistema A debe colocarse en `.env`.

## Migración progresiva de contraseñas

`POST /api/auth/login` recibe `{ "username": "jpind", "password": "..." }`.

1. Si existe `password_hash_new`, valida únicamente ese hash.
2. Si no existe, valida `password_hash_legacy` (PHP bcrypt `$2y$`).
3. Si la contraseña antigua es correcta, genera `password_hash_new` con bcrypt y lo guarda.
4. Devuelve JWT access y refresh token.

Nunca se guarda la contraseña en texto plano.

Antes de iniciar, copia `.env.example` como `.env` y completa las credenciales de MySQL. La base `contamatic` debe existir previamente.

La persistencia actual es temporal en memoria. El siguiente paso es conectar PostgreSQL/Supabase y autenticación SSO.
