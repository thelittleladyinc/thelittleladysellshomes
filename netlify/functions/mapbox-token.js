// ---- The Little Lady copy (2026-09-30, Signature move, part 1) --------------
// Copied from the Signature repo (signature-property-collection, including its
// 2026-09-30 audit fixes) under the SAME function name, because this site's pages,
// its map and other apps call it by that name. It answers HERE only once Christine
// switches it on -- lib/_backend-mode.js, docs/SIGNATURE-MOVE.md. Until then every
// request passes through to the same function on the Signature site exactly as
// before (lib/_sig-proxy.js). Below this block is the Signature code; anything
// changed for this site is marked "(Little Lady copy)".
// -----------------------------------------------------------------------------
// Serves the site's Mapbox PUBLIC token to the /explore map.
//
// 2026-08-20 (Christine: "lets do it all!" — putting the Mapbox map on the
// site). A Mapbox pk. token is public by design — it ships in the HTML of
// every site that uses Mapbox GL and is secured by the URL restriction set
// on it in the Mapbox dashboard (restrict it to signaturepropertycollection
// .com/* there; that, not secrecy, is the security model). Serving it from
// a function instead of baking it into the built HTML means Christine can
// add or rotate the token in Netlify env vars (MAPBOX_PUBLIC_TOKEN) and the
// map picks it up on the next page load — no rebuild, same pattern as every
// other optional integration here.
//
// Not configured yet = {"error":"not_configured"} and the explore page
// shows a friendly note instead of a broken map.
const localHandler = async () => {
  const token = process.env.MAPBOX_PUBLIC_TOKEN || "";
  const ok = /^pk\./.test(token);
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      // Cacheable: rotation takes effect within an hour, which is fine for
      // a credential whose real control is the dashboard URL restriction.
      "Cache-Control": ok ? "public, max-age=3600" : "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(ok ? { token } : { error: "not_configured" }),
  };
};

// (Little Lady copy) Answer here only when switched on; otherwise pass through to
// the Signature site exactly as before. See lib/_backend-mode.js.
const { backendSwitch } = require("./lib/_backend-mode");
exports.localHandler = localHandler;
exports.handler = backendSwitch("mapbox-token", localHandler);
