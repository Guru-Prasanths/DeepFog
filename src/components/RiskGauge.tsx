import { getRiskStyle } from '@/types';
import type { RiskScore } from '@/types';
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';

interface RiskGaugeProps {
  risk: RiskScore | null;
}

export function RiskGauge({ risk }: RiskGaugeProps) {
  const style = useMemo(() => getRiskStyle(risk?.risk_level ?? 'safe'), [risk]);
  const score = risk?.overall_risk ?? 0;
  const Icon = score < 20 ? ShieldCheck : score < 60 ? Shield : ShieldAlert;

  const circumference = 2 * Math.PI * 70;
  const dashOffset = circumference - (score / 100) * circumference;

  const breakdown = [
    { label: 'Visibility', value: risk?.visibility_risk ?? 0 },
    { label: 'Gas', value: risk?.gas_risk ?? 0 },
    { label: 'Vibration', value: risk?.vibration_risk ?? 0 },
    { label: 'Thermal', value: risk?.thermal_risk ?? 0 },
    { label: 'Dust', value: risk?.dust_risk ?? 0 },
  ];

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Overall Risk</h2>
        <Icon className="w-5 h-5 text-slate-500" />
      </div>

      <div className="flex flex-col items-center">
        <div className="relative w-44 h-44">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="70" fill="none" stroke="rgb(30 41 59)" strokeWidth="12" />
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              stroke={style.color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-white tabular-nums">{score}</span>
            <span className={`text-sm font-semibold uppercase tracking-wide ${style.text}`}>{style.label}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {breakdown.map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">{item.label}</span>
              <span className="text-slate-300 font-medium tabular-nums">{item.value}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${item.value}%`,
                  backgroundColor: item.value >= 80 ? '#ef4444' : item.value >= 60 ? '#f97316' : item.value >= 40 ? '#f59e0b' : item.value >= 20 ? '#84cc16' : '#10b981',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
