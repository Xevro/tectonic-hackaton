import { ReportMissing } from "@/components/report-missing";
import { ReviewConsole } from "@/components/review-console";
import { SituationNav } from "@/components/situation-nav";
import { loadEvalReport } from "@/lib/situations/load-report";

export const dynamic = "force-dynamic";

export default function ConsolePage() {
  const report = loadEvalReport();
  return (
    <div className="min-h-screen bg-kbc-canvas">
      <div className="bg-[#031525]">
        <SituationNav active="console" />
      </div>
      {report ? (
        <ReviewConsole report={report} />
      ) : (
        <div className="bg-[#031525]">
          <ReportMissing />
        </div>
      )}
    </div>
  );
}
