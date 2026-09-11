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

  // They asked us, so they are a client from the start, not a speculative lead.
  const existing = await env.DB.prepare('SELECT id, name FROM businesses WHERE lower(name) = lower(?1)').bind(name).first();

  const fit = [
    'They came to us. Asked for a free draft through the studio site' + (city ? ` from ${city}` : '') + '.',
    what ? `They describe themselves as: ${what}.` : '',
    site ? `Current site: ${site}.` : 'They gave no website, which is usually the whole reason they wrote.',
    notes ? `In their words: "${notes}"` : ''
  ].filter(Boolean).join(' ');

  let id = existing ? existing.id : null;
  if (!id) {
    const slug = await uniqueSlug(env, name);
    const r = await env.DB.prepare(
      `INSERT INTO businesses (slug, name, category, city, phone, website, source, stage, brief, alive_at, created_by)
       VALUES (?1,?2,?3,?4,?5,?6,'asked us','new',?7,date('now'),'Their enquiry')`
    ).bind(slug, name, what, city, phone, site, fit).run();
    id = r.meta.last_row_id;
  }

  const who = person ? `${person} at ${name}` : name;
  const stmts = [
    env.DB.prepare(`INSERT INTO contacts (business_id, name, role, email, phone, facebook, instagram, preferred_channel, casl_basis, created_by)
       VALUES (?1,?2,'got in touch',?3,?4,?5,?6,?7,'asked us to contact them','Their enquiry')`)
      .bind(id, person, email, phone, facebook, instagram, email ? 'email' : 'phone'),
    env.DB.prepare("INSERT INTO activities (business_id, type, summary, actor) VALUES (?1, 'enquiry', ?2, 'Their enquiry')")
      .bind(id, `${who} asked for a free draft through the website. ${[email, phone].filter(Boolean).join(' · ')}`.trim()),
    env.DB.prepare("INSERT INTO tasks (business_id, title, due, kind, created_by) VALUES (?1, ?2, date('now'), 'enquiry', 'Their enquiry')")
      .bind(id, `Reply to ${who} today, they asked us for a draft`)
  ];
  if (notes) stmts.push(env.DB.prepare("INSERT INTO notes (business_id, body, pinned, author) VALUES (?1, ?2, 1, 'Their enquiry')")
    .bind(id, `What they told us when they wrote in:\n\n${notes}`));
  for (const u of links) stmts.push(env.DB.prepare("INSERT INTO notes (business_id, body, pinned, author) VALUES (?1, ?2, 0, 'Their enquiry')").bind(id, `Link they gave us: ${u}`));

  // Put the research in front of Claude straight away.
  const brief = [
    `# Research request: ${name}`, '',
    'This business asked us for a free draft through the studio site, so they are',
    'expecting to hear back within one business day. Research them, then build the',
    'v0 package. Use the firstdraft-research and firstdraft-web-design skills.', '',
    '## What they told us',
    `- Business: ${name}`,
    person ? `- Person: ${person}` : '',
    city ? `- Where: ${city}` : '',
    what ? `- What they do: ${what}` : '',
    email ? `- Email: ${email}` : '',
    phone ? `- Phone: ${phone}` : '',
    links.length ? `- Links they gave: ${links.join(', ')}` : '- They gave no links',
    notes ? `- In their words: "${notes}"` : '', '',
    'Proof of life is already established: they wrote to us. Go straight to the',
    'menu or service list, prices, hours, reviews, their own words, and photos.'
  ].filter(Boolean).join('\n');
  stmts.push(env.DB.prepare("INSERT INTO jobs (business_id, type, brief, queued_by) VALUES (?1, 'research', ?2, 'Their enquiry')").bind(id, brief));

  await env.DB.batch(stmts);

  return json({ ok: true, message: (person ? `Thanks ${person}. ` : 'Thanks. ')
    + 'We have everything we need. You will get an email within one business day with a link to your first draft and three social posts made for you. No credit card, and we have not added you to anything.' });
}

async function uniqueSlug(env, name) {
  const base = name.toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'business';
  let slug = base, n = 2;
  while (await env.DB.prepare('SELECT 1 FROM businesses WHERE slug = ?1').bind(slug).first()) slug = `${base}-${n++}`;
  return slug;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
