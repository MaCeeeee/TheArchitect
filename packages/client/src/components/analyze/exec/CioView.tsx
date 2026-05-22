import { Flame, Wrench, AlertOctagon, ShieldCheck, Map } from 'lucide-react';
import type { CioView as CioViewData } from '@thearchitect/shared';
import HeadlineCard from './HeadlineCard';
import KpiCard from './KpiCard';

interface Props {
  data: CioViewData;
}

export default function CioView({ data }: Props) {
  return (
    <div className="space-y-4">
      <HeadlineCard headline={data.headline} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          icon={Flame}
          iconColor="#f97316"
          label="Critical Hotspots"
          value={data.criticalHotspots.count}
          sub={data.criticalHotspots.topName ?? 'No hotspots'}
          target="risk"
          testId="cio-hotspots"
        />
        <KpiCard
          icon={Wrench}
          iconColor="#facc15"
          label="Tech-Debt Index"
          value={`${data.techDebtIndex.score}/100`}
          sub={`${data.techDebtIndex.immatureElements} immature`}
          target="risk"
          testId="cio-techdebt"
        />
        <KpiCard
          icon={AlertOctagon}
          iconColor="#ef4444"
          label="SPOFs"
          value={data.spofs.count}
          sub={data.spofs.topElement ?? 'None'}
          target="risk"
          testId="cio-spofs"
        />
        <KpiCard
          icon={ShieldCheck}
          iconColor="#22c55e"
          label="Compliance"
          value={`${data.complianceStatus.coveragePct}%`}
          sub={`${data.complianceStatus.regulationsCrawled} regulations · ${data.complianceStatus.mappedElementCount} mappings`}
          testId="cio-compliance"
        />
        <KpiCard
          icon={Map}
          iconColor="#f59e0b"
          label="Roadmap"
          value={data.roadmapHealth.status ?? 'Not started'}
          sub={`${data.roadmapHealth.waves} wave${data.roadmapHealth.waves === 1 ? '' : 's'}`}
          target="roadmap"
          testId="cio-roadmap"
        />
      </div>
    </div>
  );
}
