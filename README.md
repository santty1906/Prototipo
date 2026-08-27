# Talent Profile System

A lightweight MVP for storing candidate/employee profiles, searching and
filtering them, and attaching PDF documents.

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres +
Storage) · deployable to Vercel.

## What it does

- **Dashboard** — counts and the most recent profiles and documents.
- **Profile list** — search by name, filter by capabilities and attitudes.
- **Profile detail** — the person's facts, traits and their documents.
- **Upload** — many PDFs at once, straight into a private Storage bucket, with
  per-file status.

Not built yet, deliberately: authentication, RBAC, PDF text extraction,
personality scoring, semantic search.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

Set up Supabase first — see [Supabase setup](#supabase-setup). The environment
is validated at startup, so `npm run dev` and `npm run build` both fail with a
named list of missing variables rather than misbehaving at runtime.

| Script              | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server on http://localhost:3000           |
| `npm run build`     | Production build                              |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm run lint`      | ESLint                                        |
| `npm run db:push`   | Apply `supabase/migrations` to a linked project |
| `npm run db:types`  | Regenerate `src/lib/supabase/database.types.ts` |

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/0001_initial_schema.sql` then
   `0002_storage.sql` — either with `npm run db:push` (after
   `supabase link`) or by pasting them into the SQL editor.
3. Confirm a **private** bucket named `profile-documents` exists.
4. Copy the project URL and keys from **Project Settings → API** into
   `.env.local`.
5. Optional: run `supabase/seed.sql` for sample data.

## Architecture

```
src/
  app/                    routes (App Router)
    page.tsx              dashboard
    profiles/             list, detail, new
    upload/               multi-PDF upload
    api/documents/        upload-url · finalize · [id]/url
  components/             UI, all presentational except the three "use client" ones
  lib/                    env validation, Supabase clients, formatting
  server/                 all data access — the only place that touches the database
supabase/
  migrations/             schema, then storage bucket
  seed.sql                sample data
```

**Data flow.** Pages are Server Components that call `src/server/*`, which is
the only layer holding a Supabase client with write access. There is no auth
yet, so RLS denies the anon key everything and the server uses the service-role
key; ESLint blocks importing that client outside `src/server/**` and the API
routes. Adding auth later means swapping the client and writing policies — not
moving code.

**Uploads.** The browser asks for a signed upload URL, pushes the bytes to
Storage directly, then reports the outcome. Files never pass through this
server, which a 25 MB PDF and a 4.5 MB serverless request body would not allow
anyway.

**Filtering.** Capabilities and attitudes are rows, not arrays, so filtering is
an indexed lookup. Selecting several narrows the results (AND), and every filter
lives in the URL, so a filtered list is shareable and the back button works.

## Deploying to Vercel

Import the repository, set the three environment variables from `.env.example`
in the project settings, and deploy. No other configuration is needed.
