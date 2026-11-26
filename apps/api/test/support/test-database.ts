// Base de pruebas de integración. Nunca se usa la base de desarrollo
// (airspace): la URL sale de DATABASE_URL_TEST o de la base local de pruebas,
// y se rechaza cualquier URL cuyo nombre de base no sea airspace_test.

export const TEST_DATABASE_NAME = 'airspace_test';
export const LOCAL_TEST_DATABASE_URL = `postgresql://airspace:airspace@127.0.0.1:5434/${TEST_DATABASE_NAME}`;

// Valida la URL sin imprimirla: el error solo dice qué base se esperaba.
export function assertTestDatabaseUrl(url: string | undefined): string {
  let databaseName = '';
  try {
    databaseName = url
      ? decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
      : '';
  } catch {
    databaseName = '';
  }
  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(
      `Las pruebas de integración solo corren contra la base "${TEST_DATABASE_NAME}". Revisa DATABASE_URL_TEST.`,
    );
  }
  return url as string;
}

// No lee ningún .env: solo el entorno del proceso. DATABASE_URL se ignora a
// propósito, porque en desarrollo apunta a la base airspace.
export function resolveTestDatabaseUrl(
  source: NodeJS.ProcessEnv = process.env,
): string {
  return assertTestDatabaseUrl(
    source.DATABASE_URL_TEST || LOCAL_TEST_DATABASE_URL,
  );
}
