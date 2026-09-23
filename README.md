# Paper Radar

Part 1 provides local research topics. Discovery and classification come in later parts after personal verification.

## Start

Requires Node.js 22 or newer. From this directory:

```sh
npm ci
npm run db:init
npm run dev
```

Open <http://127.0.0.1:3001>. Port 3000 is occupied by another local app on this Mac. Paper Radar creates `data/paper-radar.sqlite` and applies migrations automatically; `db:init` lets you do that explicitly. No inference PC is needed for Part 1. Set `DATABASE_PATH` to use another SQLite file. `.env` is local and ignored by Git; `.env.example` documents the inference settings for later parts.

Create two topics using the form. The first can use the example in [the PRD](Paper_Radar_PRD.md). Open a topic to inspect its fields, edit it, refresh, and restart the app to confirm persistence. Try a blank name and a blank interests box to see validation errors. Delete the second topic using the confirmation prompt; the first remains.

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
