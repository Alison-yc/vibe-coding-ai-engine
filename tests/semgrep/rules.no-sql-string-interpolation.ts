export function badQuery(db: { query: (sql: string) => Promise<unknown> }, id: string) {
  // ruleid: no-sql-string-interpolation
  return db.query(`SELECT * FROM docs WHERE id = ${id}`);
}

export function okParameterized(
  db: { execute: (sql: string, params: string[]) => Promise<unknown> },
  id: string,
) {
  // ok: no-sql-string-interpolation
  return db.execute('SELECT * FROM docs WHERE id = $1', [id]);
}
