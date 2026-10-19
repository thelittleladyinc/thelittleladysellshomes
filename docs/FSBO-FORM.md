# "Selling it yourself?" form (FSBO) — off by default

Christine, 2026-10-18: *"Also add a 'Selling it yourself?' form to thelittleladysellshomes and my-lead-pages that tags Funnel - FSBO and Source - Website."*

## What it does

With the setting on, the FSBO guide page that already exists —
`/for-sale-by-owner-northern-colorado-fsbo.html` — gets one more section at the end of the guide, **"Selling It Yourself?"**, with a short form. No new page, no new address, no redirect, no sitemap change; the guide's own words are untouched.

The form is the site's standard lead form (`_tool_lead_form` in `build/build.py`, form name `fsbo-inquiry`):

- name, email, phone (optional, as on every form here), **property address** (required) and an optional **"How far along are you?"** choice: just thinking about it / getting the house ready / it's for sale now / I have an offer or I'm under contract. It asks about the property and the timing, never about the people.
- the site's two consent boxes, word for word (`consent_boxes_html()`): the required Terms/Privacy box and the optional, unticked text-message box.
- the honeypot, and success at `/thank-you.html?from=fsbo-inquiry`, which is the only place the lead is counted (GA4 `generate_lead` and Meta `Lead`, form name only, after a real submit). The submit itself sends `lead_form_attempt` with the form name only. Nothing typed goes to GA4 or Meta.

On submit, the existing Netlify → `submission-created.js` → Lofty path does the work:

| Step | What happens |
|---|---|
| Look-up | Lofty is searched by email and phone first, as for every form. |
| Create | `cannotText: true` always; source label "The Little Lady Sells Homes - Selling It Yourself (FSBO)"; the usual tags (`Hot Lead - Website`, `Website Lead`, `fsbo-inquiry`) plus **`Source - Website`**; the property address goes on the lead's own property field; a note with the property and how far along. |
| Lead type | Seller, on the create, for a contact proven new (the site's rule). |
| `Funnel - FSBO` | Treated as a plan tag (`lib/_form-plans.js` `PLAN_TAGS.FSBO`, its one home): never on the create, added in its own read-merge-write PUT afterwards, **only for a contact proven new**, and never on a lead that is Do Not Contact (`Consent – DNC`) or opted out of email (`Consent – Unsubscribed` / `cannotEmail`), because the plan emails. That check is the shared one in `lib/_notify.js` (`addPlanTags`), unchanged here; `#dnc` now means phone only (calls/texts, email still allowed — Christine 2026-10-18), and that helper is being updated suite-wide by another change. |
| Texting | Off, unless the visitor ticked the site's own text-message box and that number is the only one on the lead (`lib/_lofty-consent.js`, unchanged). |
| Alert email | Christine's usual new-lead email through the hub, as for every form. |

### Returning contacts — read this

The site's plan-tag rule (CLAUDE.md, "Website forms start their Lofty nurture plan") gives a plan tag **only to a contact proven brand new**. So a person already in Lofty who fills in this form gets `Source - Website` (added, nothing replaced), the note, and the Call task + phone push every returning lead gets, but **not `Funnel - FSBO`**, so the FSBO plan does not start for them. The same goes for a phone-only match and for a look-up Lofty could not answer. If Christine wants every FSBO submission tagged, that is a change to the site's plan-tag rule for this one form, her decision.

## Which Lofty plan it starts

`Funnel - FSBO` is meant to start the plan she already runs, **"FSBO – Seller Support (21 Days)"** (the one with the day-8 call and text tasks). The FSBO funnel feeds that plan, or extends it with the three pricing-check emails; **there is never a second FSBO plan.**

**Lofty setting needed:** add `Funnel - FSBO` to that plan's start (trigger) tags in Lofty. Or, if the plan already starts on another tag, tell us its exact spelling and we change the one constant (`PLAN_TAGS.FSBO` in `netlify/functions/lib/_form-plans.js`, byte-identical in the Signature repo). The plan also enrolls only the lead types in its scope: this form creates Seller leads.

**Tag spelling:** both tags use a plain ASCII hyphen, exactly as Christine typed them (`Funnel - FSBO`, `Source - Website`), matching the `Funnel - …` / `Source - …` tags in Command Center's tag list. Lofty matches a start tag character for character, so if the plan's trigger in Lofty uses an EN DASH ("–"), the constant must change to match.

## Switch

| Setting | Where | Default | On means |
|---|---|---|---|
| `FSBO_FORM` | Netlify environment variable (read at build time) | unset = off | exactly `on` (spaces and case forgiven) |

Off (unset, `off`, `yes`, `true`, `1`, anything but `on`): the built `site/` is byte-for-byte what it is today. The function side only acts on a submission of `fsbo-inquiry`, which cannot exist while no page carries the form.

## To turn on

1. In Lofty: add `Funnel - FSBO` to the start tags of "FSBO – Seller Support (21 Days)" (or send us the plan's current trigger tag first).
2. Netlify → this site (thelittleladysellshomes) → Site configuration → Environment variables → Add a variable: key `FSBO_FORM`, value `on`, scopes: all (it is needed at build time).
3. Deploys → Trigger deploy → Deploy site.
4. Open `/for-sale-by-owner-northern-colorado-fsbo.html` and scroll to "Selling It Yourself?". Netlify registers the new form name `fsbo-inquiry` by itself on that deploy.

## To turn off

Netlify → Environment variables → delete `FSBO_FORM` (or set it to `off`) → Trigger deploy. The section disappears; nothing else changes. Leads already in Lofty keep their tags.

## Freshness

The section carries the id `selling-it-yourself`, and `build/postprocess_audit_fixes.py` (`_normalize_for_change_detection`) leaves it out of the "did this page change?" comparison. The committed `site/` is built without Netlify's settings, so without that every deploy with the switch on would re-date the guide "today". A form is a conversion layer, not an edit to the guide; the guide keeps its date (2026-09-29 in the sitemap today, checked in a build with the switch on).

## How it was tested

- Full production build (`scripts/netlify-build.sh`, all three gates) before the change, then after it with `FSBO_FORM` unset, `off`, `yes`, `true`, `1` and `o n`: `site/` byte-identical to the before build every time (`diff -r`, no differences).
- With `FSBO_FORM=" On "`: exactly one file differs, the FSBO guide, by the new section only; the ROI gate added the attribution fields, the audit gate the visible labels; sitemap and the page's last-modified date unchanged.
- `tests/run-all.sh` with the switch off and on: every suite passes (89; 88 before). Run with this repo and the Signature repo side by side, `test-form-plans` and `test-lofty-via-hub` also confirm `_form-plans.js` is byte-identical to Signature's copy.
- `tests/test-fsbo-form.js` (new): the switch; the form's fields, consent pair, thank-you redirect and copy (no questions about people; no fee, commission, lender, discount, guarantee or "best"); the built site with the switch off and on; freshness; analytics carry the form name only (the site's analytics script, the submit marker and the thank-you conversion run in a sandbox with a filled-in form); Lofty with a fake Lofty: tags, plan tag after the create, Seller lead type, returning / phone-only / look-up-down contacts, Do Not Contact and email opt-out holding the plan tag, texting only on the site's own yes. No network.
- `tests/test-form-plans.js`: the FSBO plan added to the plan table.
