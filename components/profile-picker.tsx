import { selectCustomer } from "@/app/actions";
import { DEMO_PROFILES } from "@/lib/profiles";

export function ProfilePicker() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-lg flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-kbc-navy">Who are you?</h1>
      <p className="mt-2 text-kbc-muted">Banking that starts with the person, not the product.</p>
      <div className="mt-8 space-y-3">
        {DEMO_PROFILES.map((profile) => (
          <form key={profile.id} action={selectCustomer}>
            <input type="hidden" name="customerId" value={profile.id} />
            <button
              type="submit"
              className="flex w-full items-center gap-4 rounded-2xl border border-kbc-line bg-white px-4 py-4 text-left shadow-[0_8px_30px_rgba(0,55,104,0.05)] hover:border-kbc-blue"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-kbc-navy text-sm font-semibold text-white">
                {profile.initials}
              </span>
              <span>
                <span className="block font-semibold text-kbc-navy">{profile.name}</span>
                <span className="block text-sm text-kbc-muted">{profile.line}</span>
              </span>
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
