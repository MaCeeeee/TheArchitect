import { Scale, TrendingUp, AlertTriangle, GitCompare, Target } from 'lucide-react';
import type { CeoView as CeoViewData } from '@thearchitect/shared';
import HeadlineCard from './HeadlineCard';
import KpiCard from './KpiCard';
import TopDecisionsCard from './TopDecisionsCard';

interface Props {
  data: CeoViewData;
}

export default function CeoView({ data }: Props) {
  return (
    <div className="space-y-4">
      <HeadlineCard headline={data.headline} />
      <TopDecisionsCard decisions={data.topDecisions} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          icon={Target}
          iconColor="#22c55e"
          label="Strategic Goal Attainment"
          value={`${data.strategicRoi.goalAttainmentPct}%`}
          sub={data.strategicRoi.description}
          target="impact"
          testId="ceo-strategic-roi"
        />
        <KpiCard
          icon={Scale}
          iconColor="#a78bfa"
          label="Compliance Coverage"
          value={`${data.complianceCoverage.mappingCoveragePct}%`}
          sub={`${data.complianceCoverage.standardMappings} mapped · ${data.complianceCoverage.regulationsCrawled} regulations`}
          testId="ceo-compliance"
        />
        <KpiCard
          icon={TrendingUp}
          iconColor="#06b6d4"
          label="Transformation Progress"
          value={`${data.transformationProgress.percent}%`}
          sub={`${data.transformationProgress.atTarget} of ${data.transformationProgress.total} at target`}
          target="impact"
          testId="ceo-progress"
        />
        <KpiCard
          icon={AlertTriangle}
          iconColor="#f97316"
          label="Strategic Risks"
          value={data.strategicRisks.criticalDriverCount}
          sub={data.strategicRisks.topRiskName ?? 'No critical drivers'}
          target="risk"
          testId="ceo-risks"
        />
        <KpiCard
          icon={GitCompare}
          iconColor="#22c55e"
          label="Active Initiatives"
          value={data.activeInitiatives.scenarioCount}
          sub={`Roadmap: ${data.activeInitiatives.roadmapStatus ?? 'not started'}`}
          target="scenarios"
          testId="ceo-initiatives"
        />
      </div>
    </div>
  );
}
