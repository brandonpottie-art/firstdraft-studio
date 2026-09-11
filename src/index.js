// Serves prospect demos from R2 at /demo/<slug>[/kit], unlisted and noindex.
// Everything else falls through to the static site assets.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/demo\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?\/?$/);
    if (!m) return env.ASSETS.fetch(request);
    if (!url.pathname.endsWith('/') && !m[2]) {
      // keep relative links inside a demo working
      return Response.redirect(url.origin + url.pathname + '/', 301);
    }
    const key = m[2] ? `${m[1]}/${m[2]}/index.html` : `${m[1]}/index.html`;
    const obj = await env.DEMOS.get(key);
    if (!obj) return new Response('This draft is not published.', { status: 404, headers: noindex('text/plain') });
    return new Response(obj.body, { headers: noindex('text/html; charset=utf-8') });
  }
};
function noindex(type) {
  return { 'content-type': type, 'x-robots-tag': 'noindex, nofollow, noarchive', 'cache-control': 'no-store' };
}
