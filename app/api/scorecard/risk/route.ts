import { NextResponse } from 'next/server';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';

const cloudWatchClient = new CloudWatchClient({
  region: process.env.AWS_REGION || 'us-west-2',
});

async function albSum(metricName: string, lbSuffix: string | undefined, minutes: number, stat = 'Sum') {
  if (!lbSuffix) return 0;

  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60 * 1000);

  const response = await cloudWatchClient.send(
    new GetMetricStatisticsCommand({
      Namespace: 'AWS/ApplicationELB',
      MetricName: metricName,
      Dimensions: [{ Name: 'LoadBalancer', Value: lbSuffix }],
      StartTime: start,
      EndTime: end,
      Period: 300,
      Statistics: [stat],
    }),
  );

  const datapoints = response.Datapoints || [];
  const values = datapoints.map((dp) => Number((dp as Record<string, number | undefined>)[stat] || 0));
  return values.reduce((acc, value) => acc + value, 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type FindingsFeed = Record<string, number>;
type CostFeed = Record<string, { actual?: number; forecast?: number }>;

type SystemConfig = {
  key: string;
  name: string;
  lb?: string;
  forecastEnvVar: string;
};

type SystemRisk = {
  key: string;
  name: string;
  risk: number;
  color: 'green' | 'yellow' | 'red';
  burn: number;
  findings: number;
  cost: number;
  action: string;
};

export async function GET() {
  const slo = { availability: 0.999, windowDays: 30 };
  const errorBudgetMinutes = (1 - slo.availability) * slo.windowDays * 24 * 60;

  const systems: SystemConfig[] = [
    { key: 'api', name: 'API', lb: process.env.ALB_SUFFIX_API, forecastEnvVar: 'FORECAST_API' },
    { key: 'ui', name: 'PRISM UI', lb: process.env.ALB_SUFFIX_UI, forecastEnvVar: 'FORECAST_UI' },
    { key: 'ingest-gh', name: 'Ingest GitHub', lb: process.env.ALB_SUFFIX_API, forecastEnvVar: 'FORECAST_ING' },
    { key: 'ingest-lin', name: 'Ingest Linear', lb: process.env.ALB_SUFFIX_API, forecastEnvVar: 'FORECAST_ING' },
    { key: 'ingest-str', name: 'Ingest Stripe', lb: process.env.ALB_SUFFIX_API, forecastEnvVar: 'FORECAST_ING' },
    { key: 'infra', name: 'Infra', lb: process.env.ALB_SUFFIX_API, forecastEnvVar: 'FORECAST_INF' },
    { key: 'data', name: 'Data/dbt', lb: process.env.ALB_SUFFIX_API, forecastEnvVar: 'FORECAST_DAT' },
  ];

  const findingsFeed: FindingsFeed = await fetch(process.env.SEC_FINDINGS_FEED || 'about:blank')
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}));

  const costFeed: CostFeed = await fetch(process.env.COST_FEED || 'about:blank')
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}));

  const systemsWithRisk: SystemRisk[] = [];

  for (const system of systems) {
    const fiveXx = await albSum('HTTPCode_ELB_5XX_Count', system.lb, 60 * 24);
    const downtimeMinutes24h = Math.min(fiveXx * 0.1, errorBudgetMinutes);
    const burn = clamp(downtimeMinutes24h / errorBudgetMinutes, 0, 2);

    const rawFindings = Number(findingsFeed[system.key] ?? 0);
    const findings = clamp(rawFindings / 3, 0, 2);

    const costRecord = costFeed[system.key] || {};
    const actual = Number(costRecord.actual || 0);
    const forecast = Number(costRecord.forecast || 1);
    const over = Math.max(actual / forecast - 1, 0);
    const cost = clamp(over, 0, 1);

    const risk = 0.5 * burn + 0.3 * findings + 0.2 * cost;
    const color: SystemRisk['color'] = risk < 0.4 ? 'green' : risk < 0.8 ? 'yellow' : 'red';

    let action = 'Monitor';
    if (color === 'yellow') {
      action = burn > findings ? 'Verify SLO & canary logs' : 'Triage open findings';
    }
    if (color === 'red') {
      action = burn > findings ? 'Throttle/rollback & deep-dive errors' : 'Escalate security review';
    }

    systemsWithRisk.push({
      key: system.key,
      name: system.name,
      risk: Number(risk.toFixed(2)),
      color,
      burn: Number(burn.toFixed(2)),
      findings: Number(findings.toFixed(2)),
      cost: Number(cost.toFixed(2)),
      action,
    });
  }

  systemsWithRisk.sort((a, b) => b.risk - a.risk);

  return NextResponse.json({
    updated: new Date().toISOString(),
    slo,
    systems: systemsWithRisk,
  });
}
