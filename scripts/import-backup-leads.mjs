import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';

// Reads COPY data as data. Never executes SQL supplied by a backup.
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const backup = args.includes('--backup') ? option('--backup') : undefined;
if (!backup) throw new Error('Use --backup /path/file.backup.gz [--env /path/file] [--apply]');
const sql = gunzipSync(fs.readFileSync(backup)).toString('utf8');
const match = sql.match(/^COPY public\.leads \(([^\n]+)\) FROM stdin;\n([\s\S]*?)^\\\.$/m);
if (!match) throw new Error('Expected public.leads COPY section missing');
const columns = match[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
if (columns.some((s) => !/^[a-z_]+$/.test(s))) throw new Error('Invalid column name');
const decode = (value) => value === '\\N' ? null : value.replace(/\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|.)/g, (_, c) => {
  if (/^[0-7]/.test(c)) return String.fromCharCode(parseInt(c, 8));
  if (/^x/.test(c)) return String.fromCharCode(parseInt(c.slice(1), 16));
  return ({ b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' })[c] ?? c;
});
const rows = match[2].trimEnd().split('\n').map((line) => line.split('\t').map(decode));
if (rows.some((r) => r.length !== columns.length)) throw new Error('Invalid COPY row width');
const idIndex = columns.indexOf('id');
const emailIndex = columns.indexOf('email');
if (idIndex < 0 || emailIndex < 0 || new Set(rows.map((r) => r[idIndex])).size !== rows.length ||
    new Set(rows.map((r) => r[emailIndex]?.toLowerCase())).size !== rows.length) throw new Error('Missing or duplicate identities');
console.log(JSON.stringify({ sourceRows: rows.length, backupSha256: createHash('sha256').update(fs.readFileSync(backup)).digest('hex') }));
if (args.includes('--inspect-only')) process.exit(0);
const env = dotenv.parse(fs.readFileSync(args.includes('--env') ? option('--env') : '.env.migration.local'));
const connection = env.DIRECT_URL || env.DATABASE_URL;
const url = new URL(connection);
const target = 'uhavtfhfebwwamltlmmq';
if (!(url.hostname === `db.${target}.supabase.co` ||
      (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${target}`))) {
  throw new Error('Refusing an unrecognized destination project');
}
const client = new pg.Client({ connectionString: connection, connectionTimeoutMillis: 15000 });
const quoted = columns.map((c) => `"${c}"`).join(',');
try {
  await client.connect();
  await client.query(args.includes('--apply') ? 'BEGIN' : 'BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '30s'");
  if (args.includes('--apply')) await client.query('LOCK TABLE public.leads IN SHARE ROW EXCLUSIVE MODE');
  const expected = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c,
    r[i] === null ? null : ['extra', 'attribution'].includes(c) ? JSON.parse(r[i]) :
      c === 'consent' ? r[i] === 't' : r[i],
  ])));
  // PostgreSQL casts JSON strings using actual destination types, preserving dates,
  // booleans, JSONB and bigint values without JS precision loss.
  const source = 'jsonb_populate_recordset(NULL::public.leads, $1::jsonb)';
  const payload = JSON.stringify(expected);
  const conflicts = await client.query(`SELECT count(*)::int AS count FROM ${source} s JOIN public.leads d
    ON d.id=s.id OR lower(d.email)=lower(s.email)
    WHERE ${columns.map((c) => `d."${c}" IS DISTINCT FROM s."${c}"`).join(' OR ')}`, [payload]);
  if (conflicts.rows[0].count) throw new Error(`Import stopped: ${conflicts.rows[0].count} conflicting records require review`);
  const missing = await client.query(`SELECT count(*)::int AS count FROM ${source} s
    WHERE NOT EXISTS (SELECT 1 FROM public.leads d WHERE d.id=s.id)`, [payload]);
  let inserted = 0;
  if (args.includes('--apply')) {
    const result = await client.query(`INSERT INTO public.leads (${quoted})
      SELECT ${columns.map((c) => `s."${c}"`).join(',')} FROM ${source} s
      WHERE NOT EXISTS (SELECT 1 FROM public.leads d WHERE d.id=s.id)`, [payload]);
    inserted = result.rowCount;
    const verified = await client.query(`SELECT count(*)::int AS count FROM ${source} s JOIN public.leads d ON d.id=s.id
      WHERE ${columns.map((c) => `d."${c}" IS NOT DISTINCT FROM s."${c}"`).join(' AND ')}`, [payload]);
    if (verified.rows[0].count !== rows.length) throw new Error('Restored records failed exact comparison');
    // Advance only; never rewind an existing sequence.
    await client.query(`SELECT setval(pg_get_serial_sequence('public.leads','id'),
      GREATEST((SELECT max(id) FROM public.leads), nextval(pg_get_serial_sequence('public.leads','id'))), true)`);
    await client.query('COMMIT');
  } else await client.query('ROLLBACK');
  console.log(JSON.stringify({ target, mode: args.includes('--apply') ? 'applied' : 'dry-run', sourceRows: rows.length, missing: missing.rows[0].count, inserted }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  // Database errors can contain personal data; print only the error code.
  console.error(error.code ? `Database operation failed (${error.code}); transaction rolled back.` : error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
