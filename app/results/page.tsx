import { ReportMissing } from "@/components/report-missing";
import { ResultsView } from "@/components/results-view";
import { SituationNav } from "@/components/situation-nav";
import { loadEvalReport } from "@/lib/situations/load-report";

export const dynamic = "force-dynamic";

export default function ResultsPage() {
  const report = loadEvalReport();
  return (
    <div className="min-h-screen bg-[#031525]">
      <SituationNav active="results" />
      {report ? <ResultsView report={report} /> : <ReportMissing />}
    </div>
  );
}
