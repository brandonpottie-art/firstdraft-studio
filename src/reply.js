// Handles what the business owner submits from their own draft page.
// Writes a reply row, moves the pipeline, logs it, and raises a task.
// Public endpoint, so it stays small, capped, and forgiving.

const CAP = { name: 120, email: 160, phone: 40, message: 4000, reason: 120, timing: 40, want: 60 };
const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);

// intent -> where the pipeline goes and what we owe them
const ROUTE = {
  interested: { stage: 'replied', task: 'Get back to %s, they want to go ahead', due: 0 },
  later:      { stage: 'not_now', task: 'Check back with %s, interested later', due: 60 },
  no:         { stage: 'lost',    task: null }
};

export async function handleReply(request, env, slug) {
  let form;
  try { form = await request.formData(); } catch { return done(request, 'We could not read that. Please try again.', false); }

  if (clip(form.get('company'), 40)) return done(request, 'Thanks.', true); // honeypot, quietly accept

  const intent = String(form.get('intent') || '').toLowerCase();
  const route = ROUTE[intent];
  if (!route) return done(request, 'Please choose one of the options.', false);

  const biz = await env.DB.prepare('SELECT id, name, stage FROM businesses WHERE slug = ?1').bind(slug).first();
  if (!biz) return done(request, 'This draft is no longer active.', false);

  const wants = form.getAll('wants').map(w => clip(w, CAP.want)).filter(Boolean).slice(0, 20);
  const r = {
    name: clip(form.get('name'), CAP.name),
    email: clip(form.get('email'), CAP.email),
    phone: clip(form.get('phone'), CAP.phone),
    message: clip(form.get('message'), CAP.message),
    reason: clip(form.get('reason'), CAP.reason),
    timing: clip(form.get('timing'), CAP.timing)
  };

  const who = r.name || biz.name;
  const bits = [
    intent === 'interested' ? 'is interested' : intent === 'later' ? 'is interested later on' : 'is not interested',
    r.timing ? `(${r.timing})` : '',
    wants.length ? `Wants: ${wants.join(', ')}.` : '',
    r.reason ? `Reason: ${r.reason}.` : '',
    r.message ? `"${r.message.slice(0, 160)}"` : ''
  ].filter(Boolean).join(' ');

  const stmts = [
    env.DB.prepare('INSERT INTO replies (business_id, slug, intent, name, email, phone, wants, timing, reason, message) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)')
      .bind(biz.id, slug, intent, r.name, r.email, r.phone, wants.length ? JSON.stringify(wants) : null, r.timing, r.reason, r.message),
    env.DB.prepare("UPDATE businesses SET stage = ?1, updated_at = datetime('now') WHERE id = ?2").bind(route.stage, biz.id),
    env.DB.prepare("INSERT INTO activities (business_id, type, summary, actor) VALUES (?1, 'reply', ?2, ?3)")
      .bind(biz.id, `Replied from their draft page: ${bits}`, who),
    env.DB.prepare("INSERT INTO activities (business_id, type, summary, actor) VALUES (?1, 'stage', ?2, 'Their reply')")
      .bind(biz.id, `Moved from ${biz.stage.replace(/_/g, ' ')} to ${route.stage.replace(/_/g, ' ')}`)
  ];
  if (route.task) {
    const due = new Date(Date.now() + route.due * 86400000).toISOString().slice(0, 10);
    stmts.push(env.DB.prepare("INSERT INTO tasks (business_id, title, due, kind, created_by) VALUES (?1, ?2, ?3, 'reply', 'Their reply')")
      .bind(biz.id, route.task.replace('%s', who), due));
  }
  if (r.email || r.phone) {
    stmts.push(env.DB.prepare("INSERT INTO contacts (business_id, name, role, email, phone, casl_basis, created_by) VALUES (?1, ?2, 'from their reply', ?3, ?4, 'asked us to contact them', 'Their reply')")
      .bind(biz.id, r.name, r.email, r.phone));
  }
  await env.DB.batch(stmts);

  const msg = intent === 'no'
    ? 'Understood, and thank you for telling us. We will not write again, and the draft will come down.'
    : intent === 'later'
      ? 'Thank you. We will leave the draft up and check back in a couple of months. If you want it sooner, just email us.'
      : 'Thank you. We will be in touch within one business day, usually sooner.';
  return done(request, msg, true);
}

function done(request, message, ok) {
  if ((request.headers.get('x-fd-ajax') || '') === '1') {
    return new Response(JSON.stringify({ ok, message }), { status: ok ? 200 : 400, headers: { 'content-type': 'application/json' } });
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Thank you</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#15173A;color:#EEF0F7;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;padding:24px;line-height:1.55}
div{max-width:34rem;text-align:center}h1{font-size:clamp(22px,5vw,32px);color:#fff;margin:0 0 12px}
p{color:rgba(238,240,247,.8);margin:0 0 18px}a{color:#9EA2F2}</style>
<div><h1>${ok ? 'Thank you' : 'Something went wrong'}</h1><p>${esc(message)}</p>
<p><a href="javascript:history.back()">Back to your draft</a></p></div>`,
    { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' } });
}
