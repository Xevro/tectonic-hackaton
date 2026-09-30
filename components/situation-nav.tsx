import Link from "next/link";

const LINKS = [
  { href: "/", id: "idea", label: "The idea" },
  { href: "/household", id: "household", label: "A household" },
  { href: "/engine", id: "engine", label: "How it builds" },
  { href: "/console", id: "console", label: "Review" },
  { href: "/results", id: "results", label: "What it found" },
] as const;

export function SituationNav({ active }: { active: (typeof LINKS)[number]["id"] }) {
  return (
    <header className="border-b border-white/10 bg-[#031525] text-white">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-[22px] font-bold tracking-tight text-kbc-blue">KBC</span>
          <span className="text-lg font-semibold">Situation 141</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              className={`rounded-full px-3 py-1.5 font-semibold ${
                link.id === active ? "bg-white text-kbc-navy" : "text-white/80 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
