import { Pool, QueryResultRow } from "pg";
import { config } from "../config";
import { SQLStatement } from "sql-template-strings";

const pool = new Pool({
  user: config.database.user,
  host: config.database.host,
  database: config.database.name,
  password: config.database.password,
  port: config.database.port,
});

const CREATE_PROJECTS = `CREATE TABLE IF NOT EXISTS projects (
  id serial PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  created TIMESTAMP NOT NULL,
  last_updated TIMESTAMP
);`;

async function generateSchema() {
  await pool.query(CREATE_PROJECTS);
}

export async function initDb() {
  // Connect to postgres
  await pool.connect();
  await generateSchema();
}

export function query<R extends QueryResultRow = any, I extends any[] = any[]>(
  query: string | SQLStatement,
  values?: I
) {
  return pool.query<R>(query, values);
}
