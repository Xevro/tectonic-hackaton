# KBC Compass

KBC Compass is a financial companion that learns with the customer. Each conversation can save confirmed context, refresh the numbers, and propose one next step. Money moves only after an explicit approval.

Account data is synthetic. There is no connection to real KBC accounts. Figures are calculated as of 30 September 2026 so the demo stays stable. Choose Mila, Sofie, or Noah to start. **Reset demo** in the header restores every customer.

## Run it

You need Node.js 20 or newer.

### 1. Create the database on Prisma

This app does not ship with a database. Create one in Prisma Postgres:

1. Open the [Prisma Console](https://console.prisma.io) and sign in.
2. Create a project and choose **Prisma Postgres**. Pick a region and create the database.
3. Open the database, then **Connect to your database** (or the **Connection strings** tab).
4. Generate a connection string and copy the **pooled** URL. The host is `pooled.db.prisma.io`, and the URL includes `sslmode=require`.

Keep that URL private. Do not commit it.

A temporary database from [`npx create-db`](https://www.prisma.io/docs/postgres/npx-create-db) also works. Copy the Postgres connection string it prints and claim the database if you want to keep it.

### 2. Install and configure

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```bash
DATABASE_URL="postgres://USER:PASSWORD@pooled.db.prisma.io:5432/postgres?sslmode=require"
```

Use the pooled string from the Prisma Console. `GOOGLE_GENERATIVE_AI_API_KEY` is optional. The example prompts work without it. Balances and proposals are always calculated in the app, not by the model.

### 3. Create the tables and load the demo customers

`db:push` creates the tables from `prisma/schema.prisma`. `db:seed` loads Mila, Sofie, and Noah. Running the seed again resets every customer to the start.

```bash
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Google Cloud

Build type: **Dockerfile**. The image is meant for Cloud Run. Create the tables and seed the demo data locally first (`npm run db:push` and `npm run db:seed`). Container port: **8080**.

Set these environment variables on the service:

- `DATABASE_URL` — the pooled Prisma Postgres URL
- `GOOGLE_GENERATIVE_AI_API_KEY` — optional

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/kbc-compass
gcloud run deploy kbc-compass \
  --image gcr.io/PROJECT_ID/kbc-compass \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "DATABASE_URL=YOUR_POOLED_URL"
```

Pass secrets as Cloud Run environment variables. Do not bake them into the image.
