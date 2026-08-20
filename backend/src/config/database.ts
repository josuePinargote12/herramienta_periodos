// Configura el pool de conexiones reutilizables hacia MySQL/MariaDB.
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'contamatic',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export async function testDatabaseConnection() {
  const connection = await pool.getConnection();
  connection.release();
  return true;
}
