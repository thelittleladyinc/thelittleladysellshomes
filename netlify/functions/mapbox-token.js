// Credential-free pass-through to the shared Signature backend -- see
// lib/_sig-proxy.js for why this exists (reserved-path proxy rules never fire).
//
// Serves the shared Mapbox PUBLIC token (pk. -- public by design; the URL
// restriction in the Mapbox dashboard is the security model, and it must
// list thelittleladysellshomes.com alongside signaturepropertycollection.com
// for this brand's map to load tiles). One token, configured once in the
// Signature deployment's env vars, used by both brands' /explore maps.
"use strict";
exports.handler = require("./lib/_sig-proxy").makeProxy("mapbox-token");
