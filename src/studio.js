// What the studio site asks the platform for on load.
//
// Two things, both public and both harmless: which drafts are still in play,
// and the price sheet. A draft is in play while its page is published and the
// owner has not said no; the site removes any card that is not on the list,
// which is how "take it down if they reject us" happens without anyone
// remembering to edit the page. The prices come from the setting Lauren and
// Brandon edit in the platform, so the site and the platform never disagree.
//
// Slugs and numbers only. Nothing here names a person or an address.

export async function handleStudio(env) {
  const [rows, sheet] = await Promise.all([
    env.DB.prepare("SELECT slug FROM businesses WHERE demo_published_at IS NOT NULL AND stage NOT IN ('lost','unsubscribed')").all(),
    env.DB.prepare("SELECT value FROM settings WHERE key = 'price_sheet'").first()
  ]);
  let prices = [];
  try {
    prices = JSON.parse((sheet && sheet.value) || '[]')
      .filter(p => p && p.item)
      .map(p => ({ item: String(p.item), price: Number(p.price) || 0 }));
  } catch { /* a bad setting should not break the site; the static numbers stand */ }
  return new Response(JSON.stringify({ active: rows.results.map(r => r.slug), prices }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' }
  });
}
