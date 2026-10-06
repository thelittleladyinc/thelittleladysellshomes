# Town stats from the hub (backbone phase P4, this site's half)

Written 2026-10-06. **Off by default.** Merging this changes nothing a visitor
sees and nothing in the build or the scheduled workflow, until the setting
`TOWN_STATS_SOURCE=hub` is turned on.

**This change does not touch Signature.** No file, setting or deploy of the
Signature site or its repo is changed here. Turning Signature's MLS Grid job off
is a separate step (step 5 below) that Christine takes, after this site is
reading the hub.

## What it is

The town figures on the community pages come from `build/data/town_market.json`.
Until now that file was a copy of the one Signature computes from its MLS Grid
copy (`build/tools/town-market-stats.js`, refreshed Monday and Thursday by
`.github/workflows/town-market.yml`). The shared data hub now holds one MLS Grid
copy for every app and answers `GET /v1/market/towns` with the **same JSON** as
that file, so `build/build.py` needs no change. This site can read the hub
instead of Signature's file, and Signature's own MLS Grid job can stop.

## The contract this was built against

| | |
| --- | --- |
| Request | `GET ${HUB_API_URL}/v1/market/towns` |
| Authentication | request header `x-hub-key: <HUB_APP_KEY>` |
| Answer | HTTP 200 and the schema of `build/data/town_market.json`: `generated_at` (`YYYY-MM-DD`), `source`, `min_sample`, and `towns`, an object keyed by town name whose values carry `active` (whole number), `median_list` and `median_price_per_sqft` (a number, or `null`). Extra per-town fields (for example days on market) are kept and ignored by the build. |
| Timeout | 15 seconds per attempt; a network error, timeout or HTTP 5xx is tried up to 3 times, any other answer is final |
| Redirects | never followed (they would carry the key elsewhere) |

The hub is built separately. Until it is live this was tested with a fake hub
(`tests/test-townmarket-hub.js`), never with a live call.

## What the tool checks before it writes anything

The same checks Signature's file already goes through, plus two of its own:

- it is a JSON object with a non-empty `towns`, each town carrying numeric
  `active` and `median_list`;
- `generated_at` is a real date, not in the future, not more than 21 days old
  (the same limit as `build.py`), and not older than the file already committed;
- **sample floor:** every town has at least `min_sample` (5) active listings and a
  positive median, and the answer does not claim a lower floor;
- **no partial answer:** at most 5% fewer towns than the committed file (never
  fewer than 2 may go missing). A town just above the floor can drop out between
  two runs; a hub that lists half the towns is not used.

The file is written only after every check passes, by writing a temporary file
and renaming it over the old one. Any failure (missing setting, HTTP error,
timeout, bad shape, stale or future date, too few towns) exits non-zero, leaves
`build/data/town_market.json` exactly as it was, and prints a reason that names
settings (`HUB_API_URL`, `HUB_APP_KEY`) and never their values. The key is never
printed.

## Where it runs

| Where | When | What it does |
| --- | --- | --- |
| `scripts/netlify-build.sh` (the production build and every deploy) | only when `TOWN_STATS_SOURCE` is exactly `hub` | fetches the figures before `build.py` runs. If the hub cannot answer, the build carries on with the committed file (it never blocks a deploy), and `build.py` withholds those figures once they are 21 days old |
| `.github/workflows/town-market.yml` (Mon/Thu 14:50 UTC, optional path) | only when the repository variable `TOWN_STATS_SOURCE` is exactly `hub` | takes the hub's figures instead of Signature's file, then runs `bash tests/run-all.sh` and commits only the data file, as before. A hub failure fails the job and commits nothing |
| `node build/tools/town-market-stats.js --source hub` | by hand | same as above; the flag wins over the setting |

With `TOWN_STATS_SOURCE` unset, empty or `github`, all three behave exactly as
before this change.

## Switch-on (the plan's P4 sequence)

1. **Compare first.** The hub's town output must match Signature's latest file
   within tolerance: the same towns, counts within 5%. With the hub key in
   `HUB_APP_KEY` in your shell (never pasted into a file or a chat):

   ```
   curl -sS -H "x-hub-key: $HUB_APP_KEY" "$HUB_API_URL/v1/market/towns" -o /tmp/hub-towns.json
   python3 - <<'EOF'
   import json
   mine = json.load(open("build/data/town_market.json"))["towns"]
   hub = json.load(open("/tmp/hub-towns.json"))["towns"]
   print("only in the committed file:", sorted(set(mine) - set(hub)))
   print("only in the hub:", sorted(set(hub) - set(mine)))
   off = [t for t in set(mine) & set(hub) if abs(hub[t]["active"] - mine[t]["active"]) > 0.05 * max(mine[t]["active"], 1)]
   print("active count more than 5% apart:", sorted(off))
   EOF
   ```

   Do not go on until the lists are empty or explained.
2. **Netlify build hook.** TLLSH Netlify, Site configuration, Build and deploy,
   Build hooks: create one named `hub-town-stats` (branch `main`). Its URL is a
   secret. It goes to the hub as the Edge secret `TLLSH_BUILD_HOOK_URL` and
   nowhere else (not into this repo, not into chat). The hub fires it twice a
   week, after it refreshes its town figures, so each firing rebuilds the site
   with the newest figures. Christine creates the hook; the hub owns the schedule.
3. **TLLSH Netlify environment** (Builds scope; each change needs a deploy):
   `HUB_API_URL`, `HUB_APP_KEY` (the key issued on the hub's `/hub` screen),
   `TOWN_STATS_SOURCE=hub`. Then Deploys, Trigger deploy. In the build log look
   for `netlify-build: TOWN_STATS_SOURCE=hub, refreshing ...`,
   `wrote build/data/town_market.json: N towns, generated YYYY-MM-DD by the hub`
   and `town figures refreshed from the hub`. A town page's "as of" date is that
   `generated_at`.
4. **Optional, the GitHub path.** To let the scheduled workflow commit the hub's
   figures too: repository variables `TOWN_STATS_SOURCE=hub` and `HUB_API_URL`,
   repository secret `HUB_APP_KEY`, then run the workflow once with Run workflow.
   Skip it if the build hook is doing the job; the workflow is retired later (see
   below).
5. **Signature (Christine, a separate change, only after steps 1 to 4 work):** on
   the Signature site set `MLSGRID_MARKET_DATA=off` and `MLS_DISABLED=true`, delete
   `MLSGRID_API_TOKEN`, deploy. The Lofty half of its `sync-listings` keeps
   running. This site never receives `MLSGRID_API_TOKEN` and must not.
6. **Verify:** Signature's `/mls-usage` reads "switched OFF", and the MLS Grid
   usage page shows no Signature-pattern requests.

The hub's key goes in `HUB_APP_KEY` only. Never in a file, a commit, a build log
or a message.

## Rollback

1. If Signature's MLS job was already switched off in step 5, put it back first
   (`MLSGRID_MARKET_DATA`, `MLS_DISABLED`, `MLSGRID_API_TOKEN` as they were, and
   deploy), because the GitHub source only works while Signature keeps
   refreshing its file.
2. On this site's Netlify set `TOWN_STATS_SOURCE=github` (or delete it) and
   trigger a deploy. On GitHub, delete the repository variable
   `TOWN_STATS_SOURCE` or set it to `github`.
3. Nothing needs undoing in the repo. The committed
   `build/data/town_market.json` keeps whatever the last good run wrote, and
   `build.py` withholds it 21 days after its `generated_at`, falling back to the
   pages' qualitative copy. A figure is never shown past that.

## Deadline and what happens if the hub is late

The figures on the pages are dated by `generated_at` in
`build/data/town_market.json` and are withheld 22 days after it. The plan wants
the hub live before about 2026-10-15, while Signature's file is still being
refreshed, so there is time to compare (step 1) without any figures going dark.

## Retiring the old path (a later change, not this one)

After the hub source has been stable, remove `.github/workflows/town-market.yml`
here (the build hook then does its job), the `github` branch of
`build/tools/town-market-stats.js`, and the `TOWN_MARKET_URL` override. Signature's
own `town-market.yml` goes in its repo. Not before Christine says so.
