import Link from "next/link";
import { SituationNav } from "@/components/situation-nav";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-kbc-canvas">
      <div className="bg-[#031525]">
        <SituationNav active="idea" />
      </div>
      <main className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-kbc-blue">
          What we want to build
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-kbc-navy">
          The next situation builds itself.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-kbc-ink">
          Kate already reacts in more than 140 situations. Every one of them was written by a person
          who noticed a pattern. The limit is not the data. It is how fast people can think of the
          next situation.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-kbc-ink">
          Situation 141 is the one we do not write. It builds itself from a household’s own past, and
          from other people whose lives bent the same way.
        </p>

        <ol className="mt-10 space-y-4">
          <li className="rounded-2xl border border-kbc-line bg-white px-5 py-5">
            <p className="text-sm font-semibold text-kbc-blue">1 · Their own past</p>
            <h2 className="mt-1 text-xl font-semibold text-kbc-navy">
              Compare a household only with itself
            </h2>
            <p className="mt-2 text-kbc-muted">
              We do not tell the engine what a life event is. There are no labels. Each household is
              measured against how that household used to behave. When the pattern bends away from its
              own normal, the engine notices.
            </p>
          </li>
          <li className="rounded-2xl border border-kbc-line bg-white px-5 py-5">
            <p className="text-sm font-semibold text-kbc-blue">2 · Other people</p>
            <h2 className="mt-1 text-xl font-semibold text-kbc-navy">
              Group everyone who bent the same way
            </h2>
            <p className="mt-2 text-kbc-muted">
              One household bending is a coincidence. Many households bending alike is a life moment.
              Nobody authors that group. It is found, because other people already went through it.
              That is the situation.
            </p>
          </li>
          <li className="rounded-2xl border border-kbc-line bg-white px-5 py-5">
            <p className="text-sm font-semibold text-kbc-blue">3 · A person, then the gate</p>
            <h2 className="mt-1 text-xl font-semibold text-kbc-navy">
              Someone approves it. Some things are never an offer.
            </h2>
            <p className="mt-2 text-kbc-muted">
              A human reviews the situation. A human approves it. Kate never acts on her own. The
              engine will also find separation, financial distress, and a family caring for someone who
              is ill. Those are blocked before anyone can treat them as something to sell.
            </p>
          </li>
        </ol>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/household"
            className="rounded-full bg-kbc-navy px-5 py-2.5 text-sm font-semibold text-white"
          >
            Watch one household
          </Link>
          <Link
            href="/engine"
            className="rounded-full border border-kbc-navy px-5 py-2.5 text-sm font-semibold text-kbc-navy"
          >
            See it build itself
          </Link>
        </div>
        <p className="mt-8 text-sm text-kbc-muted">
          The households on the next screens are synthetic. This shows the method we want to run on
          KBC’s own data. It does not claim real-world accuracy yet.
        </p>
      </main>
    </div>
  );
}
