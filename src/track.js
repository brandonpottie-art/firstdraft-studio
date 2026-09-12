// Did they actually look at it?
//
// Three things get recorded, all on our own domain, all first-party:
//
//   open   a 1x1 gif at /t/o/<token>.gif, put in every email we send
//   view   written when the Worker serves a demo or kit page, so it counts
//          even with JavaScript off
//   read   a beacon from the page itself carrying seconds on page and how
//          far down they scrolled, which is the signal that means something
//
// Two kinds of noise are separated rather than deleted. Our own visits are
// marked who='us' and left out of every count; a browser becomes ours by
// following a link with ?fd=us, which is how the platform links to a draft.
// Machines are marked bot=1: mail scanners fetch the pixel the instant a
// message lands, and Apple's Mail Privacy Protection fetches it for every
// user whether or not they looked.

const GIF = Uint8Array.from([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,0x00,0x00,0x00,
  0xff,0xff,0xff,0x21,0xf9,0x04,0x01,0x00,0x00,0x00,0x00,0x2c,0x00,0x00,0x00,0x00,
  0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,0x01,0x00,0x3b
]);

const BOT = /bot|crawl|spider|slurp|preview|fetch|monitor|scanner|proofpoint|barracuda|mimecast|symantec|forcepoint|headless|curl|wget|python-requests|go-http|okhttp|axios|facebookexternalhit|whatsapp|slackbot|discordbot|telegrambot|linkedinbot|twitterbot|bingpreview|yandex|ahrefs|semrush|petal|applebot/i;
// Gmail proxies every image through this, and Apple prefetches for everyone.
const MAIL_PROXY = /googleimageproxy|yahoomailproxy|microsoft office|outlook/i;

const YEAR = 60 * 60 * 24 * 365;

/* ----------------------------------------------------------- identity */

export function readCookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const cookie = (name, value, seconds) =>
  `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${seconds}; SameSite=Lax; Secure; HttpOnly`;

// A visitor is their own cookie where we can set one, and a salted hash of
// address and browser where we cannot. Neither is reversible into a person.
// The cookie is minted before the page is counted, never after, or the first
// visit and every visit afterwards would look like two different people.
async function visitorId(request, cookies, env) {
  if (cookies.fd_v) return cookies.fd_v.slice(0, 32);
  const raw = [
    request.headers.get('cf-connecting-ip') || '',
    request.headers.get('user-agent') || '',
    env.TRACK_SALT || 'first-draft'
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

function newVisitor() {
  return [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------ writing */

async function write(env, row) {
  await env.DB.prepare(
    `INSERT INTO signals (business_id, email_id, kind, page, slug, visitor, seconds, depth, referrer, ua, country, who, bot, note)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`
  ).bind(
    row.business_id ?? null, row.email_id ?? null, row.kind, row.page ?? null, row.slug ?? null,
    row.visitor ?? null, row.seconds ?? null, row.depth ?? null,
    (row.referrer || '').slice(0, 300) || null, (row.ua || '').slice(0, 300) || null,
    row.country ?? null, row.who || 'them', row.bot ? 1 : 0, row.note ?? null
  ).run();
}

// The first time a prospect does anything, say so in the activity feed. After
// that the counts on the client page carry it, and the feed stays readable.
async function announceOnce(env, businessId, type, summary) {
  if (!businessId) return;
  const seen = await env.DB.prepare(
    "SELECT 1 FROM activities WHERE business_id = ?1 AND type = ?2 LIMIT 1"
  ).bind(businessId, type).first();
  if (seen) return;
  await env.DB.prepare("INSERT INTO activities (business_id, type, summary, actor) VALUES (?1, ?2, ?3, 'Them')")
    .bind(businessId, type, summary).run();
}


/* ------------------------------------------------- which email sent them */

// Visits used to be tied to a message by an ?e=<token> on the link. That was
// dropped on 2026-09-12 because a link whose destination did not match its
// visible text, ending in a random string, is the shape of a phishing link,
// and the careful owner who hovers first is the one worth reaching.
//
// So the match is made on timing instead. A visit can only have come from a
// message already sent, and the most recent one is the obvious candidate. No
// future email can explain a past visit, so deciding at write time is safe.
//
// Two honesty measures. Old links carrying a token still resolve exactly, and
// those keep winning, because an exact answer beats a good guess. And an
// inferred match is written into the note, so nobody reading the table later
// mistakes arithmetic for certainty.
const ATTRIBUTION_DAYS = 120;

async function emailForVisit(env, businessId, token) {
  if (token) {
    const exact = await env.DB.prepare('SELECT id FROM emails WHERE track_token = ?1').bind(token).first();
    if (exact) return { id: exact.id, inferred: false };
  }
  if (!businessId) return { id: null, inferred: false };
  const recent = await env.DB.prepare(
    `SELECT id FROM emails
      WHERE business_id = ?1 AND status = 'sent' AND sent_at IS NOT NULL
        AND sent_at <= datetime('now')
        AND sent_at >= datetime('now', ?2)
      ORDER BY sent_at DESC, id DESC LIMIT 1`
  ).bind(businessId, `-${ATTRIBUTION_DAYS} days`).first();
  return recent ? { id: recent.id, inferred: true } : { id: null, inferred: false };
}

// Keeps whatever the caller wanted to say and adds the caveat.
const withMatchNote = (note, inferred) =>
  inferred ? [note, 'email matched by send time'].filter(Boolean).join(' · ').slice(0, 120) : (note ?? null);

/* -------------------------------------------------------- page views */

// Called for every demo and kit page the Worker serves. Runs after the
// response goes out, so a slow database never slows their page down.
export function recordView(env, ctx, request, url, { slug, page }) {
  const cookies = readCookies(request);
  const ua = request.headers.get('user-agent') || '';
  const fromUs = cookies.fd_us === '1' || url.searchParams.get('fd') === 'us';
  const token = url.searchParams.get('e') || cookies.fd_e || null;
  // Decided here, used both for the row and for the cookie on the way out,
  // so a first visit and a second visit are the same person.
  const visitor = cookies.fd_v ? cookies.fd_v.slice(0, 32) : newVisitor();

  ctx.waitUntil((async () => {
    try {
      const biz = await env.DB.prepare('SELECT id, name FROM businesses WHERE slug = ?1').bind(slug).first();
      if (!biz) return;
      const email = await emailForVisit(env, biz.id, token);
      const bot = BOT.test(ua) || !ua;
      await write(env, {
        business_id: biz.id, email_id: email.id, kind: 'view', page, slug, visitor,
        referrer: request.headers.get('referer') || '', ua,
        country: request.cf && request.cf.country, who: fromUs ? 'us' : 'them', bot,
        note: withMatchNote(null, email.inferred)
      });
      if (!fromUs && !bot) {
        await announceOnce(env, biz.id, 'opened_page',
          page === 'kit' ? 'Opened the social posts we made for them' : 'Opened their draft site');
      }
    } catch { /* a missed count is never worth a broken page */ }
  })());

  // Cookies to set on the response: who they are, that they came from an
  // email, and whether this browser is one of ours.
  const set = [];
  if (!cookies.fd_v) set.push(cookie('fd_v', visitor, YEAR));
  if (url.searchParams.get('e')) set.push(cookie('fd_e', url.searchParams.get('e').slice(0, 40), 60 * 60 * 24 * 120));
  if (url.searchParams.get('fd') === 'us') set.push(cookie('fd_us', '1', YEAR * 2));
  return set;
}

/* ---------------------------------------------------------- the routes */

export async function handleTrack(request, env, ctx, url) {
  // The open pixel. Always answers with the gif, whatever else happens.
  const pixel = url.pathname.match(/^\/t\/o\/([A-Za-z0-9_-]{8,40})\.gif$/);
  if (pixel) {
    const ua = request.headers.get('user-agent') || '';
    ctx.waitUntil(recordOpen(env, pixel[1], ua, request).catch(() => {}));
    return new Response(GIF, {
      headers: {
        'content-type': 'image/gif',
        'cache-control': 'no-store, no-cache, must-revalidate, private',
        'x-robots-tag': 'noindex, nofollow'
      }
    });
  }

  // How long they stayed and how far they read. Sent by the band's script.
  // The body is read here and not in the background task: once the response
  // has gone, the request stream is no longer there to read.
  if (url.pathname === '/t/e' && request.method === 'POST') {
    let body = null;
    try { body = await request.json(); } catch { /* nothing usable */ }
    if (body) ctx.waitUntil(recordRead(body, request, env).catch(() => {}));
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  }

  return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
}

async function recordOpen(env, token, ua, request) {
  const e = await env.DB.prepare(
    'SELECT id, business_id, sent_at, opened_at FROM emails WHERE track_token = ?1'
  ).bind(token).first();
  if (!e) return;

  // An open inside the first few seconds is the receiving server checking the
  // message, not a person reading it. So is anything Apple or Google prefetch.
  const gap = e.sent_at ? (Date.now() - Date.parse(e.sent_at.replace(' ', 'T') + 'Z')) / 1000 : 1e9;
  const proxy = MAIL_PROXY.test(ua);
  const bot = BOT.test(ua) || !ua || gap < 10;

  await write(env, {
    business_id: e.business_id, email_id: e.id, kind: 'open', ua,
    country: request.cf && request.cf.country, bot,
    note: bot ? (gap < 10 ? 'opened within seconds of sending, almost certainly a mail scanner' : 'automated fetch')
      : proxy ? 'through their mail provider’s image proxy, so the time is right but the device is not' : null
  });
  if (bot) return;

  await env.DB.prepare(
    `UPDATE emails SET open_count = open_count + 1,
       opened_at = COALESCE(opened_at, datetime('now')), last_open_at = datetime('now') WHERE id = ?1`
  ).bind(e.id).run();
  if (!e.opened_at) await announceOnce(env, e.business_id, 'opened_email', 'Opened our email');
}

async function recordRead(b, request, env) {
  const slug = String(b.slug || '').slice(0, 64);
  if (!/^[a-z0-9-]+$/.test(slug)) return;

  const cookies = readCookies(request);
  const ua = request.headers.get('user-agent') || '';
  const biz = await env.DB.prepare('SELECT id FROM businesses WHERE slug = ?1').bind(slug).first();
  if (!biz) return;
  const email = await emailForVisit(env, biz.id, cookies.fd_e);

  const seconds = Math.max(0, Math.min(3600, Math.round(Number(b.seconds) || 0)));
  const depth = Math.max(0, Math.min(100, Math.round(Number(b.depth) || 0)));
  const who = cookies.fd_us === '1' ? 'us' : 'them';

  await write(env, {
    business_id: biz.id, email_id: email.id,
    kind: b.kind === 'click' ? 'click' : 'read',
    page: b.page === 'kit' ? 'kit' : 'demo', slug,
    visitor: await visitorId(request, cookies, env),
    seconds, depth, ua, country: request.cf && request.cf.country,
    who, bot: BOT.test(ua) || !ua,
    note: withMatchNote(b.what ? String(b.what).slice(0, 120) : null, email.inferred)
  });

  if (who === 'them' && !BOT.test(ua) && seconds >= 20) {
    await announceOnce(env, biz.id, 'read_page',
      `Spent real time on their draft: ${seconds >= 60 ? Math.round(seconds / 60) + ' minutes' : seconds + ' seconds'}, ${depth}% of the way down`);
  }
}
