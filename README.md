# Hackachusetts 2026

Built for Hackachusetts powered by Kiro, October 24, 2026.

## Overview

Project description coming soon.

## Features

To be documented as the project is built.

## Demo

Demo link and video coming soon.

## Tech stack

To be documented once implementation begins.

## Getting started

### Setup (development)

Requires Node.js 22 or later (verified on Node 23.4.0). All data is synthetic.

```sh
npm ci                  # install from package-lock.json
cp .env.example .env    # then set OPENAI_API_KEY; the key is read server-side only
npm run setup           # apply SQLite migrations and seed (both safe to re-run)
npm run dev             # development server at http://localhost:3000
```

Production-style run (persistent Node server):

```sh
npm run build
npm run start           # PORT=3100 npm run start to choose a port
curl http://localhost:3000/api/health
```

`/api/health` reports database connectivity, the applied migration version, demo mode, and whether an OpenAI key is configured (as true/false, never the value).

Environment variables are documented in [`.env.example`](.env.example): `OPENAI_API_KEY`, `DATABASE_PATH` (default `./data/app.db`), `DEMO_MODE` (default `true`), `CLINIC_TIMEZONE` (default `America/New_York`).

Note: with npm 10.9.2, `npm install` without the lockfile crashes in npm's dependency resolver (`Cannot read properties of null (reading 'edgesOut')`). `npm ci` works. To re-resolve dependencies, use npm 11 (`npx npm@11 install`).

## Testing

```sh
npm run typecheck   # next typegen && tsc --noEmit
npm test            # vitest run
```

## Built with Kiro

Details of the Kiro features used and how they helped build the project will be added after development. Project Kiro files live in [`.kiro/`](.kiro/).
