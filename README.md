# Paper Radar

Local research topics now show a deterministic query preview. Discovery and classification come in later parts after personal verification.

## Start

Requires Node.js 22 or newer. From this directory:

```sh
npm ci
npm run db:init
npm run dev
```

Open <http://127.0.0.1:3001>. Port 3000 is occupied by another local app on this Mac. Paper Radar creates `data/paper-radar.sqlite` and applies migrations automatically; `db:init` lets you do that explicitly. No inference PC is needed for the query preview. Set `DATABASE_PATH` to use another SQLite file. `.env` is local and ignored by Git; `.env.example` documents the inference settings for later parts.

Create two topics using the form. The first can use the example in [the PRD](Paper_Radar_PRD.md). Enter each interest in its own box and use **Add interest** for another; non-interests work the same way and are optional. Open a topic to inspect its fields, edit it, refresh, and restart the app to confirm persistence. Try a blank name and a blank interests box to see validation errors. Delete the second topic using the confirmation prompt; the first remains.

## Query preview

Open a topic to see the queries that will be used for discovery. The rule trims outer punctuation and collapses whitespace. It uses the first distinct interest as an anchor, pairs it with up to six later distinct interests in their entered order, then adds one question query and one description query. The question query pairs the anchor with the final phrase after `across`, `about`, `for`, `in`, `on`, `with`, `between`, or `among` when that phrase has at least two words. Otherwise it removes a leading question word and auxiliary verb, then uses the first seven words. The description query uses the first clause before a comma, period, semicolon, exclamation, or question mark, removes a leading `Research on` or `Study of`, and takes its first seven words. Empty queries and case-insensitive duplicates are removed; at most eight queries remain. Non-interests are excluded from positive searches.

For the [PRD example profile](Paper_Radar_PRD.md#5-research-profile), the exact preview is:

```text
coding agents context management
coding agents agent memory
coding agents dependency tracking
coding agents stale context detection
coding agents parallel branches
context management for long-horizon coding agents
```

To verify, create or edit a topic to match the PRD example, open its page, and compare the preview with this list. Refresh and reopen it to confirm the order. Add `workflow repair` as a sixth interest; `coding agents workflow repair` should appear. Change `parallel branches` in the question to `parallel workflows`; the question query should change accordingly. Change the description's opening clause and check the final query. Repeated interests, extra whitespace, and trailing punctuation should add no empty or duplicate queries. Review whether the searches describe your topic before approving discovery work. Previously saved comma-separated interests remain in one box until you split them into separate boxes and save.

## Back up and restore

Stop the app before copying its database. Run these commands from the project directory:

```sh
mkdir -p backups
cp data/paper-radar.sqlite backups/paper-radar.sqlite
cp backups/paper-radar.sqlite data/verify-restore.sqlite
DATABASE_PATH=data/verify-restore.sqlite npm run dev
```

Open <http://127.0.0.1:3001> and check the restored topic. Stop the app, then run `npm run dev` to return to the original database. The restore check uses a separate file and does not overwrite your working data. Keep the backup outside this Mac as well if you need protection from disk loss.

## Developer checks

```sh
npm test
npm run typecheck
npm run build
```
