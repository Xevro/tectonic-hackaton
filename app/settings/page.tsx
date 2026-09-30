import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SettingsPanel } from "@/components/settings-panel";
import { TopBar } from "@/components/top-bar";
import { prisma } from "@/lib/db";
import { formatEuro } from "@/lib/format";
import { MILA_MONTHLY_SAVE_CENTS } from "@/lib/fixtures";
import { isDemoCustomer } from "@/lib/profiles";

export const dynamic = "force-dynamic";

const factOrder = ["age", "household", "car", "work", "housing"];

export default async function SettingsPage() {
  const jar = await cookies();
  const customerId = jar.get("compass_customer")?.value;
  if (!isDemoCustomer(customerId)) redirect("/");

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      name: true,
      memories: {
        where: { source: "profile", status: "confirmed" },
        select: { key: true, label: true, value: true },
      },
    },
  });
  if (!customer) redirect("/");

  const facts = [...customer.memories].sort(
    (a, b) => factOrder.indexOf(a.key) - factOrder.indexOf(b.key),
  );
  const savingsNote =
    customerId === "mila" ? `About ${formatEuro(MILA_MONTHLY_SAVE_CENTS)} a month` : null;

  return (
    <>
      <TopBar name={customer.name} />
      <SettingsPanel name={customer.name} facts={facts} savingsNote={savingsNote} />
    </>
  );
}
