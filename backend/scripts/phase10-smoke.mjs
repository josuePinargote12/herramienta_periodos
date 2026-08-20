// Pruebas de humo de la Fase 10.
// Ejecutar con: pnpm.cmd phase10:test
const baseUrl = process.env.API_URL || 'http://localhost:3000';
let failures = 0;

async function check(name, request, assertion) {
  try {
    const response = await request();
    const body = await response.text();
    const data = response.headers.get('content-type')?.includes('application/json') && body ? JSON.parse(body) : null;
    assertion(response, data);
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

await check('API activa', () => fetch(`${baseUrl}/api/health`), (res, data) => {
  if (res.status !== 200 || data?.ok !== true) throw new Error(`respuesta inesperada: ${res.status}`);
});

await check('Base de datos conectada', () => fetch(`${baseUrl}/api/health/database`), (res, data) => {
  if (res.status !== 200 || data?.database !== 'connected') throw new Error(`respuesta inesperada: ${res.status}`);
});

await check('Sin cookie muestra login completo', () => fetch(`${baseUrl}/api/auth/context`), (res, data) => {
  if (res.status !== 200 || data?.mode !== 'full') throw new Error(`modo inesperado: ${data?.mode}`);
});

await check('Ticket vacío es rechazado', () => fetch(`${baseUrl}/api/sso/consume`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 't='
}), (res) => {
  if (res.status !== 303) throw new Error(`esperaba 303 y recibí ${res.status}`);
});

await check('Login incompleto es rechazado', () => fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
}), (res, data) => {
  if (res.status !== 400 || data?.ok !== false) throw new Error(`respuesta inesperada: ${res.status}`);
});

if (failures) {
  console.error(`\n${failures} prueba(s) fallaron.`);
  process.exit(1);
}
console.log('\nTodas las pruebas de humo pasaron.');
