// The only door a cloud agent can use.
//
// The platform itself sits behind Cloudflare Access, which a scheduled Claude
// routine cannot pass. These two routes live on the public Worker instead and
// are deliberately tiny: read the lead requests that are waiting, and file
// pending leads against one. Nothing here can read a client, publish a page,
// send anything, or delete a row. A leaked key buys someone the ability to put
// junk in the leads pile, which a human then rejects.

const LEAD_COLS = ['name','category','city','address','phone','website','facebook','instagram','maps_url',
  'rating','review_count','business_status','alive_at','website_score','fit','source','place_id'];

const CAP = { name: 160, category: 80, city: 80, address: 200, phone: 40, fit: 2000, url: 400 };
const clip = (v, n) => (v === null || v === undefined || v === '') ? null : String(v).trim().slice(0, n) || null;
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : null; };

export async function handleIntake(request, env, url) {
  if (!env.INTAKE_KEY) return json({ error: 'Intake is not configured' }, 503);
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!timingSafe(given, env.INTAKE_KEY)) return json({ error: 'Not authorised' }, 401);

  // What is waiting to be researched.
  if (url.pathname === '/intake/jobs' && request.method === 'GET') {
    const rows = (await env.DB.prepare(
      "SELECT id, type, brief, queued_by, queued_at FROM jobs WHERE type = 'find_leads' AND status = 'queued' ORDER BY id LIMIT 5"
    ).all()).results;
    return json({ requests: rows });
  }

  // File what was found, and close the request.
  if (url.pathname === '/intake/leads' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Send JSON' }, 400); }
    const jobId = Number(body.job_id) || null;
    const items = Array.isArray(body.leads) ? body.leads.slice(0, 40) : [];
    if (!items.length && !body.note) return json({ error: 'Send leads, or a note saying why there were none' }, 400);

    const job = jobId ? await env.DB.prepare("SELECT id, status FROM jobs WHERE id = ?1 AND type = 'find_leads'").bind(jobId).first() : null;
    if (jobId && !job) return json({ error: 'No such lead request' }, 404);

    const added = [], skipped = [];
    for (const l of items) {
      const name = clip(l && l.name, CAP.name);
      if (!name) { skipped.push({ name: null, why: 'no name' }); continue; }
      const dupe = await env.DB.prepare('SELECT id FROM leads WHERE lower(name) = lower(?1)').bind(name).first()
        || await env.DB.prepare('SELECT id FROM businesses WHERE lower(name) = lower(?1)').bind(name).first();
      if (dupe) { skipped.push({ name, why: 'already known' }); continue; }
      const row = {
        name,
        category: clip(l.category, CAP.category), city: clip(l.city, CAP.city), address: clip(l.address, CAP.address),
        phone: clip(l.phone, CAP.phone), website: clip(l.website, CAP.url), facebook: clip(l.facebook, CAP.url),
        instagram: clip(l.instagram, CAP.url), maps_url: clip(l.maps_url, CAP.url),
        rating: num(l.rating, 0, 5), review_count: num(l.review_count, 0, 1e6),
        business_status: clip(l.business_status, 40), alive_at: clip(l.alive_at, 20),
        website_score: num(l.website_score, 0, 100), fit: clip(l.fit, CAP.fit),
        source: clip(l.source, 40) || 'claude', place_id: clip(l.place_id, 120)
      };
      const r = await env.DB.prepare(
        `INSERT INTO leads (${LEAD_COLS.join(',')}, created_by) VALUES (${LEAD_COLS.map((_, i) => '?' + (i + 1)).join(',')}, 'Claude')`
      ).bind(...LEAD_COLS.map(k => row[k])).run();
      added.push({ id: r.meta.last_row_id, name });
    }

    const note = clip(body.note, 600);
    const summary = added.length
      ? `Researched a lead request and filed ${added.length} new ${added.length === 1 ? 'lead' : 'leads'}${skipped.length ? `, skipping ${skipped.length} already known` : ''}`
      : `Researched a lead request and found nothing new${note ? `: ${note}` : ''}`;
    const stmts = [env.DB.prepare("INSERT INTO activities (business_id, type, summary, actor) VALUES (NULL, 'lead', ?1, 'Claude')").bind(summary)];
    if (job && job.status === 'queued') {
      stmts.push(env.DB.prepare("UPDATE jobs SET status = 'done', output = ?1, finished_at = datetime('now') WHERE id = ?2")
        .bind(`${added.length} filed, ${skipped.length} skipped${note ? '. ' + note : ''}`, job.id));
    }
    await env.DB.batch(stmts);
    return json({ added, skipped, note: note || null }, 201);
  }

  return json({ error: 'No such endpoint' }, 404);
}

function timingSafe(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
