# Situation 141

Kate already covers more than 140 situations. A person wrote every one of them.

Situation 141 is the one we do not write. It builds itself from a household’s own past, and from other people whose lives bent the same way. A person still approves it. Some moments are blocked before anyone can treat them as something to sell.

The households here are synthetic. This shows the method. It is not a claim about real-world accuracy.

There is no database.

## Run it

You need Node.js 20 or newer.

```bash
npm install
npm run eval
npm run dev
```

`npm run eval` writes `out/eval_report.json`. The screens read that file. They do not invent the counts.

Open [http://localhost:3000](http://localhost:3000).

- **The idea** explains what we want to build.
- **A household** follows Sofie. The tool learns from her past and from other people, then acts on what she needs after a person approves.
- **How it builds** shows households leaving their own past and gathering with other people.
- **Review** is where a person approves a situation the engine found.
- **What it found** shows the counts from the evaluation.

## Deploy on Google Cloud

Build type: **Dockerfile**. Container port: **8080**. No environment variables are required.

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/situation-141
gcloud run deploy situation-141 \
  --image gcr.io/PROJECT_ID/situation-141 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080
```
