// Setup mínimo para testes unitários que importam módulos que dependem de env.
// O Vitest carrega este arquivo via vitest.config (setupFiles) — mas como mantemos
// os testes simples e auto-suficientes, definimos as variáveis aqui também.
process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-secret-with-at-least-sixteen-chars';
process.env.DB_USER ??= 'postgres';
process.env.DB_PASS ??= 'postgres';
process.env.DB_NAME ??= 'sic_2026_test';
