# Why this suite is smaller than Signature's

This repo's front-end calls the SHARED MLS backend on the Signature
deployment (see netlify.toml's proxy rewrites) and deliberately carries no
MLS-touching functions of its own -- one MLS Grid account, one pacer, one
photo cache. The tests for that server code (sync, pacing, photo caching,
media rules, usage budgets, Cloudinary, health probes) live where the code
lives: thelittleladyinc/signature-property-collection/tests/.

Kept here: every site-facing suite (CSS/WCAG, copy, contact wiring, internal
links, photo pacing in built pages, town data, maps, legal, thank-you), the
lead pipeline that DOES run on this site (submission-created + notify), and
test-legacypages.js for the iHouseWeb keep-what-ranks layer.
