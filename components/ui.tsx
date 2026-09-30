"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-kbc-navy text-white hover:bg-[#002a52]",
    secondary: "border border-kbc-navy bg-white text-kbc-navy hover:bg-kbc-mist",
    ghost: "text-kbc-navy hover:bg-kbc-mist",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${styles}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
