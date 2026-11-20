import { createRemoteJWKSet, jwtVerify } from 'jose';
import { initial, people } from '../src/model.js';
import { updateSchema } from './schema.js';
import { canUpdateCalendar } from './permissions.js';

const keys = new Map();
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => Response.json(body, { status, headers });

export async function identity(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  const issuer = env.ACCESS_ISSUER;
  if (!token || !issuer || !env.ACCESS_AUD || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) return null;
  if (!keys.has(issuer)) keys.set(issuer, createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer)));
  let email;
  try {
    const { payload } = await jwtVerify(token, keys.get(issuer), {
      issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub']
    });
    if (typeof payload.email !== 'string') return null;
    email = payload.email.toLowerCase();
  } catch {
    return null;
  }
  const members = JSON.parse(env.FAMILY_MEMBERS || '{}');
  const member = Object.hasOwn(members, email) ? members[email] : null;
  if (member?.readOnly === true && typeof member.name === 'string' && member.name.trim()) {
    return { name: member.name.trim(), editor: false, readOnly: true };
  }
  return people.includes(member?.name)
    ? { name: member.name, editor: member.editor === true }
    : null;
}

async function load(db) {
  const row = await db.prepare('SELECT revision, state FROM calendar WHERE id = 1').first();
  return row ? { revision: row.revision, state: JSON.parse(row.state) } : { revision: 0, state: initial('shared') };
}

export async function calendar(request, db, user, origin) {
  if (request.method === 'GET') {
    const data = await load(db);
    if (data.revision && new URL(request.url).searchParams.get('revision') === String(data.revision)) {
      return new Response(null, {status: 204, headers});
    }
    return json({ ...data, user });
  }
  if (request.method !== 'PUT') return json({ message: 'Metodo non supportato.' }, 405);
  if (user.readOnly || request.headers.get('Origin') !== origin) return json({ message: 'Modifica non autorizzata.' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ message: 'Formato non valido.' }, 415);
  let input;
  try { input = await request.json(); } catch { return json({ message: 'Dati non validi.' }, 400); }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return json({ message: 'Controlla dati, date e sovrapposizioni.' }, 400);
  const { revision, state, action, details } = parsed.data;
  const current = await load(db);
  const conflict = () => json({ message: 'Il calendario è appena cambiato. Riapri la modifica e riprova.' }, 409);
  if (revision !== current.revision) return conflict();
  if (!canUpdateCalendar(current.state, state, user)) return json({ message: 'Puoi inserire, modificare o rimuovere soltanto i tuoi extra.' }, 403);
  state.audit = [{ when: new Date().toISOString(), actor: user.name, action, details }, ...current.state.audit];
  const next = revision + 1;
  const stateJson = JSON.stringify(state);
  const result = revision === 0
    ? await db.prepare('INSERT INTO calendar (id, revision, state) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING').bind(next, stateJson).run()
    : await db.prepare('UPDATE calendar SET revision = ?, state = ? WHERE id = 1 AND revision = ?').bind(next, stateJson, revision).run();
  return result.meta.changes === 1 ? json({ revision: next, state, user }) : conflict();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/cloudflare-config.js') {
      return new Response('window.FAMILY_CLOUDFLARE = true;', {
        headers: { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' }
      });
    }
    if (url.pathname !== '/api/calendar') return json({ message: 'Pagina non trovata.' }, 404);
    try {
      const user = await identity(request, env);
      return user
        ? await calendar(request, env.CALENDAR_DB, user, url.origin)
        : json({ message: 'Accedi con un account familiare autorizzato.' }, 401);
    } catch {
      return json({ message: 'Calendario condiviso temporaneamente non disponibile.' }, 500);
    }
  }
};
