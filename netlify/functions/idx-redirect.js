// iHouseWeb IDX URL rescue (2026-08-19, pre-cutover traffic protection).
//
// The old platform's IDX pages live under /idx/* and /-/* -- they were never
// CMS pages, so the keep-what-ranks migration couldn't rebuild them, but they
// are indexed and earning (individual listings at 500-800 users each, county
// searches at 300+ views). Without this, every one 404s the day DNS moves.
//
// This function TOUCHES NO DATA -- it only translates old URLs into their
// closest living equivalent and answers 301, so search engines transfer the
// URL's standing to the successor. Netlify routes /idx/* and /-/* here (see
// netlify.toml); unknown shapes fall through to the search page, which is the
// honest generic successor for an IDX url.
"use strict";

// County-search URLs name counties like "Larimer-County,CO_county".
const COUNTY_PAGES = {
  larimer: "/communities/larimer.html",
  weld: "/communities/weld.html",
  boulder: "/communities/boulder.html",
  broomfield: "/communities/broomfield.html",
  jefferson: "/communities/jefferson.html",
  denver: "/communities/denver.html",
  arapahoe: "/communities/arapahoe.html",
  adams: "/communities/adams.html",
  morgan: "/communities/morgan.html",
};

function redirect(to) {
  return {
    statusCode: 301,
    headers: {
      Location: to,
      // Cacheable but revisitable -- if a mapping improves, the edge picks
      // it up within a day.
      "Cache-Control": "public, max-age=86400",
    },
    body: "",
  };
}

exports.handler = async (event) => {
  const path = decodeURIComponent((event && event.path) || "");

  // /idx/listing/CO-IRES/1000585/621-Nokomis-... -> /listing/IRE1000585
  // (also tolerates other feed prefixes; the number is the listing key)
  let m = path.match(/^\/idx\/listing\/[^/]+\/(\d+)(\/|$)/i);
  if (m) return redirect(`/listing/IRE${m[1]}`);

  // /idx/search/homes-for-sale[-and-pending]/<place>[/filters...]
  m = path.match(/^\/idx\/search\/[^/]+\/([^/]+)/i);
  if (m) {
    const place = m[1];
    if (/^any$/i.test(place) || /_beds|_baths|_type|price_sort/i.test(place)) {
      return redirect("/search-homes.html?noFloor=true");
    }
    const county = place.match(/^([A-Za-z-]+)-County/i);
    if (county) {
      const page = COUNTY_PAGES[county[1].toLowerCase().replace(/-/g, "")];
      if (page) return redirect(page);
    }
    // "Loveland,CO" / "Red-Feather-Lakes,CO" -> city-scoped search
    const city = place.match(/^([A-Za-z.-]+),\s*CO/i);
    if (city) {
      const name = city[1].replace(/-/g, " ");
      return redirect(`/search-homes.html?cities=${encodeURIComponent(name)}&noFloor=true`);
    }
    return redirect("/search-homes.html?noFloor=true");
  }

  // Old platform utility URLs: forms -> contact, saved searches -> search.
  if (/^\/-\/WebForm\//i.test(path)) return redirect("/contact.html");
  if (/^\/-\/ListingSearch\//i.test(path)) return redirect("/search-homes.html?noFloor=true");

  // Anything else under /idx/ -- the search page is the honest successor.
  return redirect("/search-homes.html?noFloor=true");
};
