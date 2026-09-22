import { Bell, Check, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { Alert } from '@/types';
import { formatTimeAgo } from '@/types';

interface AlertsPanelProps {
  alerts: Alert[];
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
}

const SEVERITY_STYLES: Record<string, { border: string; bg: string; text: string; icon: typeof AlertTriangle }> = {
  critical: { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-400', icon: XCircle },
  high: { border: 'border-orange-500/40', bg: 'bg-orange-500/10', text: 'text-orange-400', icon: AlertTriangle },
  medium: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400', icon: AlertTriangle },
  low: { border: 'border-yellow-500/30', bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: Bell },
};

export function AlertsPanel({ alerts, onAcknowledge, onAcknowledgeAll }: AlertsPanelProps) {
  const unackCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 flex flex-col" style={{ maxHeight: '700px' }}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Alerts</h3>
          {unackCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unackCount}</span>
          )}
        </div>
        {unackCount > 0 && (
          <button
            onClick={onAcknowledgeAll}
            className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Ack All
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/50 mb-2" />
            <p className="text-sm text-slate-500">No alerts. All systems normal.</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.low;
            const Icon = style.icon;
            return (
              <div
                key={alert.id}
                className={`rounded-lg border ${style.border} ${style.bg} p-3 flex items-start gap-3 transition-opacity ${
                  alert.acknowledged ? 'opacity-50' : ''
                }`}
              >
                <Icon className={`w-5 h-5 ${style.text} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${alert.acknowledged ? 'text-slate-500' : 'text-slate-200'}`}>
                    {alert.message}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] uppercase font-bold tracking-wider ${style.text}`}>
                      {alert.severity}
                    </span>
                    <span className="text-[10px] text-slate-500">·</span>
                    <span className="text-[10px] text-slate-500">{alert.alert_type.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] text-slate-500">·</span>
                    <span className="text-[10px] text-slate-500">{formatTimeAgo(alert.created_at)}</span>
                  </div>
                </div>
                {!alert.acknowledged && (
                  <button
                    onClick={() => onAcknowledge(alert.id)}
                    className="shrink-0 text-slate-500 hover:text-cyan-400 transition-colors"
                    title="Acknowledge"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
