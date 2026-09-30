# KBC Compass

KBC Compass is a hackathon proof of concept for a financial companion that learns with the customer. Each conversation can save confirmed context, refresh the numbers, and propose one next step. Money moves only after an explicit approval.

The pitch: Compass turns each interaction into better understanding — and that understanding into practical, customer-controlled financial support.

Account data is synthetic. There is no connection to real KBC accounts. Figures are calculated as of 30 September 2026 so the demo stays stable.

## What was built

A small Next.js app, styled after KBC: navy and blue, lots of white space, and one thing on screen at a time.

1. **Who you are.** Choose Mila, Sofie, or Noah.
2. **Suggestions from patterns.** For Mila, Compass matches her profile to what similar customers usually set up. Sofie and Noah go to a conversation. Money moves only if you approve it.

- **Mila Janssen** is 28, lives alone, owns a car, and saves more than people her age. Her settings are the facts behind the suggestions.
- **Sofie Martens** is salaried and already has a monthly savings plan. This is the moving-home journey below.
- **Noah Peeters** is freelance, with uneven invoices, rent due soon, and quarterly VAT. Compass does not offer him a fixed monthly savings-plan change. It protects rent first, then offers a VAT set-aside.

Profiles, accounts, bills, goals, memories, conversations, and approved actions are stored with Prisma in PostgreSQL. The database is not included in this repo. You create an empty one on [Prisma Postgres](https://www.prisma.io/docs/postgres) and this project creates the tables and demo data.

## What the demo shows

Suggestions come from patterns learned from other customers with a similar life.

**Mila Janssen**

1. Choose Mila.
2. Open **Profile** to see the facts used for matching.
3. On Compass, **From people like you** lists three outcomes: car insurance (suggest), home deposit (later), family insurance (skip).
4. Press **Show that update**. She mentions apartments, and the home deposit becomes ready.
5. Approve moving €500 into the home deposit. The balance and progress update.

The cohort figures are synthetic. They illustrate the idea. They are not from a model trained on real customers.

**Sofie Martens**

1. She says she is moving in November, needs €1,500 for the deposit, and wants €1,000 kept available.
2. Compass saves the move date, deposit, and buffer, then proposes pausing the October savings transfer. The plan is not changed.
3. She says not to change anything yet, and that she prefers a weekly review. Compass saves that preference and leaves the plan untouched.
4. Press **New conversation**, then ask what to focus on this week. Compass remembers the move and the weekly preference, and proposes a one-off transfer into the moving-deposit pot.
5. She approves it. The current-account balance and the deposit progress both update.

**Noah Peeters** can say that this month’s invoice was small. Compass keeps the uneven-income note and suggests reserving VAT only after rent is covered.

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

`db:push` creates the tables from `prisma/schema.prisma` in the empty Prisma Postgres database. `db:seed` loads Mila, Sofie, and Noah. Running the seed again resets every customer to the start of the story.

```bash
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and choose Mila. Compass shows suggestions from people like her. Press **Show that update**, then approve the home deposit. Sofie and Noah are still there for the earlier journeys. **Reset demo** in the header restores every customer.

`npm run check` verifies the projection maths. `npm run demo` runs the Sofie and Noah stories against the database, including a check that one customer cannot approve the other's action. That script ends on the post-approval state, so run `npm run db:seed` again before presenting.

## Deploy on Google Cloud (Dockerfile)

Build type: **Dockerfile**. The image is meant for Cloud Run.

1. Create tables and seed the demo data against your Prisma Postgres URL (`npm run db:push` and `npm run db:seed` locally once).
2. In Google Cloud, create a Cloud Run service with build type Dockerfile (or Cloud Build from this repo).
3. Set these environment variables on the service:
   - `DATABASE_URL` — the pooled Prisma Postgres URL
   - `GOOGLE_GENERATIVE_AI_API_KEY` — optional
4. Container port: **8080**.

Example with `gcloud`:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/kbc-compass
gcloud run deploy kbc-compass \
  --image gcr.io/PROJECT_ID/kbc-compass \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "DATABASE_URL=YOUR_POOLED_URL"
```

Do not bake secrets into the image. Pass them as Cloud Run environment variables or secrets.

## Security notes for review

- The database URL and any model key stay in `.env.local`. Do not commit them.
- The profile picker sets an httpOnly cookie. Server actions load data for that customer only and ignore any other customer id.
- Action approval and memory confirmation check that the row belongs to the signed-in customer.
- A proposal can be approved once. Approval is refused if it would overdraw the current account, break a confirmed buffer, or leave this week's bills unpaid.
- The model cannot move money. Only the approve action can, and only for the stored proposal.

## Out of scope

This prototype does not prove lower churn, shorter calls, or better financial outcomes. It demonstrates the learning loop for three synthetic customers. At a real scale, account events would refresh financial facts and the same profile would feed each channel.
