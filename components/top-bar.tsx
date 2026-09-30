import Link from "next/link";
import { resetDemoData } from "@/app/actions";
import { SubmitButton } from "@/components/ui";

export function TopBar({ name }: { name?: string }) {
  return (
    <header className="border-b border-kbc-line bg-white">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-[22px] font-bold tracking-tight text-kbc-blue">KBC</span>
          <span className="text-lg font-semibold text-kbc-navy">Compass</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {name ? (
            <>
              <Link href="/settings" className="font-semibold text-kbc-navy">
                Profile
              </Link>
              <Link href="/" className="font-semibold text-kbc-navy">
                {name}
              </Link>
            </>
          ) : null}
          <form action={resetDemoData}>
            <SubmitButton variant="ghost">Reset demo</SubmitButton>
          </form>
        </div>
      </div>
    </header>
  );
}
