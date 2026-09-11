// Someone on the studio site asking for a free draft.
//
// Public and unauthenticated by necessity, so it is capped, honeypotted, and
// can only ever create one pending lead plus a task. It cannot read anything.

const CAP = { name: 160, person: 120, email: 160, phone: 40, city: 80, what: 120, url: 400, notes: 2000 };
const clip = (v, n) => { const s = (v === null || v === undefined) ? '' : String(v).trim(); return s ? s.slice(0, n) : null; };
const tidy = u => { const s = clip(u, CAP.url); return s ? (/^https?:\/\//i.test(s) ? s : 'https://' + s.replace(/^\/+/, '')) : null; };

export async function handleEnquiry(request, env) {
  if (request.method !== 'POST') return json({ error: 'Post the form' }, 405);
  let form;
  try { form = await request.formData(); } catch { return json({ ok: false, message: 'We could not read that. Please try again.' }, 400); }

  // Quietly accept the bots so they stop trying.
  if (clip(form.get('company'), 40)) return json({ ok: true, message: 'Thanks. We will be in touch.' });
  const started = Number(form.get('t') || 0);
  if (started && Date.now() - started < 1500) return json({ ok: true, message: 'Thanks. We will be in touch.' });

  const name = clip(form.get('name'), CAP.name);
  if (!name) return json({ ok: false, message: 'We need the business name to get started.' }, 400);
  const email = clip(form.get('email'), CAP.email);
  const phone = clip(form.get('phone'), CAP.phone);
  if (!email && !phone) return json({ ok: false, message: 'Leave us an email or a phone number so we can send the draft.' }, 400);
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return json({ ok: false, message: 'That email address looks wrong. Mind checking it?' }, 400);

  const person = clip(form.get('person'), CAP.person);
  const city = clip(form.get('city'), CAP.city);
  const what = clip(form.get('what'), CAP.what);
  const notes = clip(form.get('notes'), CAP.notes);
  const links = form.getAll('links').map(tidy).filter(Boolean).slice(0, 6);
  const pick = re => links.find(u => re.test(u)) || null;
  const facebook = pick(/facebook\.com/i);
  const instagram = pick(/instagram\.com/i);
  const site = links.find(u => !/facebook|instagram|tiktok|linkedin|x\.com|twitter|youtube/i.test(u)) || null;

  const already = await env.DB.prepare('SELECT id FROM leads WHERE lower(name) = lower(?1)').bind(name).first()
    || await env.DB.prepare('SELECT id FROM businesses WHERE lower(name) = lower(?1)').bind(name).first();

  const fit = [
    'They came to us. Asked for a free draft through the studio site' + (city ? ` from ${city}` : '') + '.',
    what ? `They describe themselves as: ${what}.` : '',
    site ? `Current site: ${site}.` : 'They gave no website, which is usually the whole reason they wrote.',
    notes ? `In their words: "${notes}"` : ''
  ].filter(Boolean).join(' ');

  const stmts = [];
  let leadId = null;
  if (!already) {
    const r = await env.DB.prepare(
      `INSERT INTO leads (name, category, city, phone, website, facebook, instagram, fit, source, created_by)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'asked us','Their enquiry')`
    ).bind(name, what, city, phone, site, facebook, instagram, fit).run();
    leadId = r.meta.last_row_id;
  }

  const who = person ? `${person} at ${name}` : name;
  stmts.push(env.DB.prepare("INSERT INTO activities (business_id, type, summary, actor) VALUES (NULL, 'lead', ?1, 'Their enquiry')")
    .bind(`${who} asked for a free draft through the website. ${email ? email : ''}${email && phone ? ' · ' : ''}${phone || ''}`.trim()));
  stmts.push(env.DB.prepare("INSERT INTO tasks (business_id, title, due, kind, created_by) VALUES (NULL, ?1, date('now'), 'enquiry', 'Their enquiry')")
    .bind(`Reply to ${who}, they asked for a draft${email ? ' (' + email + ')' : phone ? ' (' + phone + ')' : ''}`));
  await env.DB.batch(stmts);

  return json({ ok: true, message: person ? `Thanks ${person}. We will write back within one business day.` : 'Thanks. We will write back within one business day.' });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
