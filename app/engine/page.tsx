import { PipelineView } from "@/components/pipeline-view";
import { ReportMissing } from "@/components/report-missing";
import { SituationNav } from "@/components/situation-nav";
import { loadPipeline } from "@/lib/situations/load-report";

export const dynamic = "force-dynamic";

export default function EnginePage() {
  const pipeline = loadPipeline();
  return (
    <div className="min-h-screen bg-[#031525]">
      <SituationNav active="engine" />
      {pipeline ? <PipelineView pipeline={pipeline} /> : <ReportMissing />}
    </div>
  );
}
