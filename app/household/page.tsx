import { HouseholdSim } from "@/components/household-sim";
import { SituationNav } from "@/components/situation-nav";
import { loadEvalReport } from "@/lib/situations/load-report";

export const dynamic = "force-dynamic";

export default function HouseholdPage() {
  const report = loadEvalReport();
  const selfEmployment = report?.candidates.find((candidate) => candidate.id === "self_employment");
  const leadDays = selfEmployment?.medianLeadTimeDays ?? report?.medianLeadTimeDays ?? 120;
  const similarHouseholds = selfEmployment?.cohortSize ?? 700;

  return (
    <div className="min-h-screen bg-kbc-canvas">
      <div className="bg-[#031525]">
        <SituationNav active="household" />
      </div>
      <HouseholdSim leadDays={leadDays} similarHouseholds={similarHouseholds} />
    </div>
  );
}
