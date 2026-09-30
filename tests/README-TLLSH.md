# What this suite covers, and what still lives with Signature

Until 2026-09-30 this repo's data endpoints were pure pass-throughs to the
Signature deployment, so the tests for that server code lived only in
thelittleladyinc/signature-property-collection/tests/.

Since the Signature move, part 1 (docs/SIGNATURE-MOVE.md), the Signature
backend functions also live here under the same names, each answering here
only once it is switched on (netlify/functions/lib/_backend-mode.js). Their
suites came with them:

- test-sharedproxy.js: the switch itself -- merged but not switched on, every
  function passes through exactly as before; switched on, each answers here
  only when its settings and the shared Blobs store are present.
- test-hidden-listings.js: HIDE_LISTING_IDS, in both modes.
- test-listing-page-tracking.js: /listing/<id> renders in this site's shell,
  with GA4 + the Meta Pixel and a canonical on this domain.
- Ported from Signature (calling each function's copied code through its
  `localHandler`): test-status-privacy, test-google-guard,
  test-mylistings-coords, test-home-search, test-listing-status,
  test-listing-spots, test-bundledfiles, test-mlsusage, test-lofty-mls-check,
  test-lofty-source, test-health-rows, test-healthlive, test-leadprobe,
  test-leadmerged, test-optional, test-tagsnotreturned, test-coverage,
  test-localspots, test-distances, test-searchmemo, test-timing.

Still only in the Signature repo, because the code does not move here: the
MLS Grid job (sync-listings, its schedule, the photo backfill, pacing, the
media resolver and Cloudinary re-hosting) and area-alerts-run.

Also here: every site-facing suite (CSS/WCAG, copy, contact wiring, internal
links, photo pacing in built pages, town data, maps, legal, thank-you), the
lead pipeline (submission-created + notify + the queue drain), and
test-legacypages.js for the iHouseWeb keep-what-ranks layer.
