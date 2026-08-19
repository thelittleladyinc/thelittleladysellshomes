// Credential-free pass-through to the shared Signature backend -- see
// lib/_sig-proxy.js for why this exists (reserved-path proxy rules never fire).
"use strict";
exports.handler = require("./lib/_sig-proxy").makeProxy("nearby-places");
