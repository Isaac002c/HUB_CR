const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida nas variáveis de ambiente');
}

// SSL automático: Neon exige SSL (sslmode=require). O Postgres interno na VPS (rede
// Docker) não usa SSL — basta usar sslmode=disable na DATABASE_URL (ou DB_SSL=false).
// Mantém compatibilidade total com a connection string atual do Neon.
const connectionString = process.env.DATABASE_URL;
const sslDisabled = /sslmode=disable/i.test(connectionString) || process.env.DB_SSL === 'false';

const pool = new Pool({
  connectionString,
  ssl: sslDisabled ? false : { rejectUnauthorized: false },
  max: parseInt(process.env.PGPOOL_MAX, 10) || 10, // configurável (testes usam 1)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do banco:', err.message);
});

module.exports = pool;