# nrlschedulescraper Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-26

## Active Technologies
- TypeScript 5.x (React 18.x for frontend, Node.js 20 LTS for server) + React 18, MUI (Material-UI) 5.x, Vite (build tool), concurrently (dev launch) (002-nrl-schedule-ui)
- In-memory only (existing server implementation) (002-nrl-schedule-ui)
- TypeScript 5.x (Node.js 20 LTS for server, React 18.x for frontend) + Express.js 4.x (server), React 18, MUI 5.x, Vite (frontend), Zod (validation), Cheerio (parsing) (003-compact-season-view)
- In-memory database with indexed lookups (existing implementation) (003-compact-season-view)
- TypeScript 5.x (Node.js 20 LTS for server, React 18.x for frontend) + React 18, MUI 5.x, Vite (frontend); Express.js 4.x (server) (004-bye-overview)
- In-memory database (existing implementation) (004-bye-overview)
- TypeScript 5.x with strict mode + Hono (edge-native HTTP framework), Cheerio (HTML parsing), Zod (validation), React 18, MUI 5.x (005-serverless-edge-refactor)
- In-memory cache within worker isolate (no persistent storage) (005-serverless-edge-refactor)

- TypeScript 5.x (Node.js 20 LTS) + Express.js (HTTP server), Cheerio (HTML parsing), Zod (validation) (001-nrl-schedule-scraper)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (Node.js 20 LTS): Follow standard conventions

## Recent Changes
- 005-serverless-edge-refactor: Added TypeScript 5.x with strict mode + Hono (edge-native HTTP framework), Cheerio (HTML parsing), Zod (validation), React 18, MUI 5.x
- 004-bye-overview: Added TypeScript 5.x (Node.js 20 LTS for server, React 18.x for frontend) + React 18, MUI 5.x, Vite (frontend); Express.js 4.x (server)
- 003-compact-season-view: Added TypeScript 5.x (Node.js 20 LTS for server, React 18.x for frontend) + Express.js 4.x (server), React 18, MUI 5.x, Vite (frontend), Zod (validation), Cheerio (parsing)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
