import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Companion } from "@/components/companion";
import { Knowledge } from "@/components/knowledge";
import { TopBar } from "@/components/top-bar";
import { parseBeat } from "@/lib/population";
import { isDemoCustomer } from "@/lib/profiles";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export default async function CompassPage() {
  const jar = await cookies();
  const customerId = jar.get("compass_customer")?.value;
  if (!isDemoCustomer(customerId)) redirect("/");
  const snapshot = await getSnapshot(customerId);
  if (!snapshot) redirect("/");

  return (
    <>
      <TopBar name={snapshot.customer.name} />
      {customerId === "mila" ? (
        <Knowledge snapshot={snapshot} beat={parseBeat(jar.get("compass_beat")?.value)} />
      ) : (
        <Companion snapshot={snapshot} />
      )}
    </>
  );
}
