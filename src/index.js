// Serves prospect demos from R2 at /demo/<slug>[/kit], unlisted and noindex,
// with the First Draft band injected at serve time. Everything else falls
// through to the static site assets.
import { injectBanner, injectHead } from './banner.js';
import { handleReply } from './reply.js';
import { handleIntake } from './intake.js';
import { handleEnquiry } from './enquiry.js';
import { handleTrack, recordView } from './track.js';
import { handleInbound } from './inbound.js';
import { handleStudio } from './studio.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Someone asking for a free draft from the studio site. Public by design.
    if (url.pathname === '/enquiry') return handleEnquiry(request, env);
    // The narrow door for scheduled Claude routines.
    if (url.pathname.startsWith('/intake/')) return handleIntake(request, env, url);
    // Opens and dwell time. Answers fast and writes afterwards.
    if (url.pathname.startsWith('/t/')) return handleTrack(request, env, ctx, url);
    // Mail coming back, posted by Resend and checked against the secret.
    if (url.pathname === '/hooks/resend') return handleInbound(request, env);
    // Which drafts are still in play, and the current prices, for the studio site.
    if (url.pathname === '/studio.json') return handleStudio(env);

    // The card image the og tags point at, served before anything that would
    // add a trailing slash to it. Cached for an hour because it only changes
    // when the draft is republished and unfurlers do not come back often.
    const card = url.pathname.match(/^\/demo\/([a-z0-9-]+)\/og\.jpg$/);
    if (card) {
      const img = await env.DEMOS.get(`${card[1]}/og.jpg`);
      if (!img) return notFound();
      return new Response(img.body, {
        headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600', 'x-robots-tag': 'noindex' }
      });
    }

    const m = url.pathname.match(/^\/demo\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?\/?$/);
    if (!m) return env.ASSETS.fetch(request);

    // What the owner sends back from their own draft page.
    if (m[2] === 'reply') {
      if (request.method !== 'POST') return Response.redirect(`${url.origin}/demo/${m[1]}/`, 303);
      return handleReply(request, env, m[1]);
    }
    if (!url.pathname.endsWith('/')) {
      return Response.redirect(url.origin + url.pathname + '/' + url.search, 301);
    }
    const [, slug, sub] = m;
    const kit = sub === 'kit';
    if (sub && !kit) return notFound();
    const key = kit ? `${slug}/kit/index.html` : `${slug}/index.html`;
    const [obj, other] = await Promise.all([
      env.DEMOS.get(key),
      env.DEMOS.head(kit ? `${slug}/index.html` : `${slug}/kit/index.html`)
    ]);
    if (!obj) return notFound();

    const html = injectBanner(injectHead(await obj.text(), {
      name: obj.customMetadata?.name || other?.customMetadata?.name || '',
      slug, kit, origin: url.origin
    }), {
      name: obj.customMetadata?.name || other?.customMetadata?.name || '',
      slug, kit,
      hasDemo: kit ? !!other : true,
      hasKit: kit ? true : !!other,
      email: env.STUDIO_EMAIL,
      site: env.STUDIO_SITE,
      phone: env.STUDIO_PHONE || ''
    });

    // Counted server-side, so a visit registers with JavaScript off.
    const cookies = recordView(env, ctx, request, url, { slug, page: kit ? 'kit' : 'demo' });
    const res = new Response(html, { headers: headers('text/html; charset=utf-8') });
    for (const c of cookies) res.headers.append('set-cookie', c);
    return res;
  }
};

function notFound() {
  return new Response('This draft is not published.', { status: 404, headers: headers('text/plain; charset=utf-8') });
}
function headers(type) {
  return { 'content-type': type, 'x-robots-tag': 'noindex, nofollow, noarchive', 'cache-control': 'no-store' };
}
