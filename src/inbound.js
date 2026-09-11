// Mail coming back the other way.
//
// The platform sits behind Cloudflare Access, which a webhook cannot pass, so
// Resend posts here instead, to the public Worker, and this file writes into
// the same database. Every request is checked against the signing secret
// before a single byte of it is believed.
//
// What arrives is a reply from a business owner. It gets filed against the
// right client, raised as a task, and the pipeline moves to "replied". A copy
// is forwarded to the studio mailbox so nothing depends on anyone opening the
// platform that day.
//
// Nothing in here sends a message to a prospect. The only mail it can send is
// the forwarded copy, to one address we set ourselves.

const CAP = { subject: 300, body: 60000, addr: 200, name: 120 };
const clip = (v, n) => (v === null || v === undefined || v === '') ? null : String(v).trim().slice(0, n) || null;

export async function handleInbound(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.RESEND_WEBHOOK_SECRET) return json({ error: 'Inbound is not configured' }, 503);

  const raw = await request.text();
  if (!(await verifySvix(request, raw, env.RESEND_WEBHOOK_SECRET))) {
    return json({ error: 'Bad signature' }, 401);
  }

  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: 'Send JSON' }, 400); }
  const type = event.type || '';
  const data = event.data || {};

  if (type === 'email.received') return received(env, data);
  if (type === 'email.opened' || type === 'email.clicked') return providerEngagement(env, type, data);
  if (type === 'email.bounced' || type === 'email.complained' || type === 'email.delivery_delayed') {
    return trouble(env, type, data);
  }
  return json({ ok: true, ignored: type });
}

/* ------------------------------------------------------- a reply lands */

async function received(env, data) {
  const providerId = clip(data.email_id || data.id, 120);
  if (providerId) {
    const seen = await env.DB.prepare('SELECT id FROM inbound_emails WHERE provider_id = ?1').bind(providerId).first();
    if (seen) return json({ ok: true, duplicate: true });
  }

  const from = address(data.from);
  const to = address(firstOf(data.to));
  const subject = clip(data.subject, CAP.subject);
  const body = clip(await bodyOf(env, data), CAP.body) || '(no text in the message)';

  const match = await matchBusiness(env, { to: to.addr, from: from.addr, subject });

  await env.DB.prepare(
    `INSERT INTO inbound_emails (business_id, email_id, provider_id, from_addr, from_name, to_addr, subject, body, matched_by)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
  ).bind(match.businessId, match.emailId, providerId, from.addr, from.name, to.addr, subject, body, match.how).run();

  if (match.businessId) {
    const biz = await env.DB.prepare('SELECT id, name, stage FROM businesses WHERE id = ?1').bind(match.businessId).first();
    const who = from.name || from.addr || 'They';
    const stmts = [
      env.DB.prepare("INSERT INTO activities (business_id, type, summary, actor) VALUES (?1, 'inbound', ?2, ?3)")
        .bind(biz.id, `Wrote back. ${subject || '(no subject)'}: ${body.replace(/\s+/g, ' ').slice(0, 200)}`, who),
      env.DB.prepare("INSERT INTO tasks (business_id, title, due, kind, created_by) VALUES (?1, ?2, date('now'), 'inbound', 'Their reply')")
        .bind(biz.id, `Answer ${who}`)
    ];
    // A reply is a reply whatever the pipeline thought. Stopped clients stay
    // stopped only until a person looks; everyone else moves to talking.
    if (!['replied', 'meeting', 'quoted', 'won', 'building', 'live', 'care_plan'].includes(biz.stage)) {
      stmts.push(
        env.DB.prepare("UPDATE businesses SET stage = 'replied', updated_at = datetime('now') WHERE id = ?1").bind(biz.id),
        env.DB.prepare("INSERT INTO activities (business_id, type, summary, actor) VALUES (?1, 'stage', ?2, 'Their reply')")
          .bind(biz.id, `Moved from ${biz.stage.replace(/_/g, ' ')} to replied`)
      );
    }
    await env.DB.batch(stmts);
  } else {
    await env.DB.prepare("INSERT INTO activities (business_id, type, summary, actor) VALUES (NULL, 'inbound', ?1, ?2)")
      .bind(`Mail arrived that matches no client: ${subject || '(no subject)'}`, from.addr || 'Unknown').run();
  }

  await forward(env, { from, to: to.addr, subject, body, matched: match.how });
  return json({ ok: true, business_id: match.businessId, matched_by: match.how });
}

// Four ways to know who wrote, best first.
async function matchBusiness(env, { to, from, subject }) {
  // 1. The reply address we put on the outgoing message carries its id.
  const tag = (to || '').match(/\+(\d+)@/);
  if (tag) {
    const e = await env.DB.prepare('SELECT id, business_id FROM emails WHERE id = ?1').bind(+tag[1]).first();
    if (e) return { businessId: e.business_id, emailId: e.id, how: 'reply address' };
  }
  if (from) {
    // 2. The address we wrote to.
    const e = await env.DB.prepare(
      "SELECT id, business_id FROM emails WHERE lower(to_addr) = lower(?1) AND status = 'sent' ORDER BY id DESC LIMIT 1"
    ).bind(from).first();
    if (e) return { businessId: e.business_id, emailId: e.id, how: 'the address we wrote to' };
    // 3. Anyone on file at the business.
    const c = await env.DB.prepare('SELECT business_id FROM contacts WHERE lower(email) = lower(?1) ORDER BY id LIMIT 1').bind(from).first();
    if (c) return { businessId: c.business_id, emailId: null, how: 'a contact on file' };
    // 4. Somebody else at the same company.
    const domain = from.split('@')[1];
    if (domain && !isFreeMail(domain)) {
      const b = await env.DB.prepare("SELECT id FROM businesses WHERE website LIKE ?1 ORDER BY id LIMIT 1").bind(`%${domain}%`).first();
      if (b) return { businessId: b.id, emailId: null, how: 'their company domain' };
    }
  }
  return { businessId: null, emailId: null, how: 'nothing matched' };
}

const FREE = new Set(['gmail.com','googlemail.com','yahoo.com','yahoo.ca','hotmail.com','hotmail.ca','outlook.com','live.com','live.ca','icloud.com','me.com','aol.com','proton.me','protonmail.com','sympatico.ca','rogers.com','bell.net','cogeco.ca','msn.com']);
const isFreeMail = d => FREE.has(d.toLowerCase());

/* --------------------------------------------------- what Resend sends */

// The webhook carries metadata; depending on the account the text may be in
// the payload or may need fetching. Try the payload first, then the API, and
// never fail the webhook over it.
async function bodyOf(env, data) {
  const inline = data.text || data.plain || stripHtml(data.html);
  if (inline) return inline;
  const id = data.email_id || data.id;
  if (!id || !env.RESEND_API_KEY) return null;
  for (const path of [`emails/received/${id}`, `emails/${id}`]) {
    try {
      const res = await fetch(`https://api.resend.com/${path}`, {
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}` }
      });
      if (!res.ok) continue;
      const full = await res.json();
      const text = full.text || full.plain || stripHtml(full.html);
      if (text) return text;
    } catch { /* try the next one */ }
  }
  return null;
}

function stripHtml(html) {
  if (!html) return null;
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;
}

const firstOf = v => Array.isArray(v) ? v[0] : v;

function address(v) {
  const s = String(firstOf(v) || '');
  const angled = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (angled) return { name: clip(angled[1].replace(/^"|"$/g, ''), CAP.name), addr: clip(angled[2].toLowerCase(), CAP.addr) };
  return { name: null, addr: clip(s.toLowerCase(), CAP.addr) };
}

/* ------------------------- what the sending side tells us, if enabled */

// Resend's own open and click tracking, when it is switched on for the domain.
// Our pixel records the same thing; both land in signals and the platform
// counts a person once per email, so a duplicate costs nothing.
async function providerEngagement(env, type, data) {
  const id = clip(data.email_id || data.id, 120);
  if (!id) return json({ ok: true });
  const e = await env.DB.prepare('SELECT id, business_id FROM emails WHERE provider_id = ?1').bind(id).first();
  if (!e) return json({ ok: true, unknown: true });
  await env.DB.prepare(
    "INSERT INTO signals (business_id, email_id, kind, who, bot, note) VALUES (?1, ?2, ?3, 'them', 0, ?4)"
  ).bind(e.business_id, e.id, type === 'email.clicked' ? 'click' : 'open',
         type === 'email.clicked' ? clip(data.click && data.click.link, 300) : 'reported by Resend').run();
  if (type === 'email.opened') {
    await env.DB.prepare(
      `UPDATE emails SET open_count = open_count + 1, opened_at = COALESCE(opened_at, datetime('now')),
         last_open_at = datetime('now') WHERE id = ?1`
    ).bind(e.id).run();
  }
  return json({ ok: true });
}

async function trouble(env, type, data) {
  const id = clip(data.email_id || data.id, 120);
  const e = id ? await env.DB.prepare('SELECT id, business_id, to_addr FROM emails WHERE provider_id = ?1').bind(id).first() : null;
  if (!e) return json({ ok: true, unknown: true });
  const what = type === 'email.bounced' ? `The email to ${e.to_addr} bounced. That address is no good.`
    : type === 'email.complained' ? `${e.to_addr} marked our email as spam. Do not write to them again.`
    : `Delivery to ${e.to_addr} is running late.`;
  await env.DB.prepare("INSERT INTO activities (business_id, type, summary, actor) VALUES (?1, 'email', ?2, 'Resend')")
    .bind(e.business_id, what).run();
  if (type === 'email.complained') {
    await env.DB.prepare("UPDATE contacts SET unsubscribed_at = datetime('now') WHERE business_id = ?1 AND lower(email) = lower(?2)")
      .bind(e.business_id, e.to_addr || '').run();
  }
  return json({ ok: true });
}

/* ------------------------------------------------------- the copy out */

async function forward(env, { from, to, subject, body, matched }) {
  if (!env.RESEND_API_KEY || !env.FORWARD_TO) return;
  const head = `From: ${from.name ? from.name + ' ' : ''}<${from.addr}>\nTo: ${to}\nFiled against: ${matched}\n`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `First Draft Studios <${env.STUDIO_EMAIL || 'hello@firstdraftstudios.ca'}>`,
        reply_to: from.addr ? [from.addr] : undefined,
        to: [env.FORWARD_TO],
        subject: `[reply] ${subject || '(no subject)'}`,
        text: `${head}\n${'-'.repeat(48)}\n\n${body}`
      })
    });
  } catch { /* the platform already has it; the copy is a convenience */ }
}

/* --------------------------------------------------------- signatures */

// Svix format, which is what Resend uses: the signed string is id.timestamp.body,
// HMAC-SHA256 with the decoded secret, base64. The header may carry several.
async function verifySvix(request, raw, secret) {
  const id = request.headers.get('svix-id');
  const ts = request.headers.get('svix-timestamp');
  const sig = request.headers.get('svix-signature');
  if (!id || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const keyBytes = b64decode(secret.replace(/^whsec_/, ''));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${raw}`));
  const mine = b64encode(new Uint8Array(mac));

  for (const part of sig.split(' ')) {
    const theirs = part.includes(',') ? part.slice(part.indexOf(',') + 1) : part;
    if (timingSafe(mine, theirs)) return true;
  }
  return false;
}

function b64decode(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encode(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
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
