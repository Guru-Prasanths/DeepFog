import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { VehicleSelector } from '@/components/VehicleSelector';
import { SensorCards } from '@/components/SensorCards';
import { SensorCharts } from '@/components/SensorCharts';
import { RiskGauge } from '@/components/RiskGauge';
import { AlertsPanel } from '@/components/AlertsPanel';
import { GPSMap } from '@/components/GPSMap';
import { VehicleManagement } from '@/components/VehicleManagement';
import { useDeepfogData } from '@/hooks/useDeepfogData';
import { getRiskStyle } from '@/types';
import { Activity, Radio, Wifi } from 'lucide-react';

function App() {
  const [activeView, setActiveView] = useState('overview');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const {
    vehicles,
    latestReading,
    latestRisk,
    riskHistory,
    readingHistory,
    alerts,
    loading,
    error,
    acknowledgeAlert,
    acknowledgeAll,
    refresh,
  } = useDeepfogData(selectedVehicleId);

  // Auto-select first vehicle
  useEffect(() => {
    if (!selectedVehicleId && vehicles.length > 0) {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [vehicles, selectedVehicleId]);

  const unackCount = alerts.filter((a) => !a.acknowledged).length;
  const riskStyle = getRiskStyle(latestRisk?.risk_level ?? 'safe');
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  const renderView = () => {
    if (loading && vehicles.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-12 h-12 border-4 border-slate-700 border-t-cyan-400 rounded-full animate-spin mb-4" />
          <p className="text-slate-500 text-sm">Initializing DEEPFOG monitoring system...</p>
        </div>
      );
    }

    if (vehicles.length === 0) {
      return (
        <div className="flex justify-center py-12">
          <VehicleManagement vehicles={vehicles} onRefresh={refresh} />
        </div>
      );
    }

    switch (activeView) {
      case 'overview':
        return (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <SensorCards reading={latestReading} />
              <SensorCharts readings={readingHistory} risks={riskHistory} />
            </div>
            <div className="space-y-6">
              <RiskGauge risk={latestRisk} />
              <AlertsPanel
                alerts={alerts}
                onAcknowledge={acknowledgeAlert}
                onAcknowledgeAll={acknowledgeAll}
              />
              <VehicleManagement vehicles={vehicles} onRefresh={refresh} />
            </div>
          </div>
        );

      case 'sensors':
        return (
          <div className="space-y-6">
            <SensorCards reading={latestReading} />
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Latest Raw Reading</h3>
              {latestReading ? (
                <pre className="text-xs text-slate-400 font-mono bg-slate-950 rounded-lg p-4 overflow-x-auto">
{JSON.stringify(latestReading, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-slate-500">No sensor readings received yet.</p>
              )}
            </div>
          </div>
        );

      case 'charts':
        return <SensorCharts readings={readingHistory} risks={riskHistory} />;

      case 'map':
        return (
          <GPSMap
            vehicles={vehicles}
            selectedId={selectedVehicleId}
            latitude={latestReading?.latitude ?? selectedVehicle?.latitude ?? null}
            longitude={latestReading?.longitude ?? selectedVehicle?.longitude ?? null}
          />
        );

      case 'alerts':
        return (
          <div className="max-w-2xl">
            <AlertsPanel
              alerts={alerts}
              onAcknowledge={acknowledgeAlert}
              onAcknowledgeAll={acknowledgeAll}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={setActiveView} alertCount={unackCount} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-white capitalize">{activeView}</h2>
            {latestRisk && (
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${riskStyle.bg} ${riskStyle.ring} ring-1`}>
                <div className={`w-2 h-2 rounded-full ${riskStyle.bg} animate-pulse`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${riskStyle.text}`}>
                  {riskStyle.label} · {latestRisk.overall_risk}
                </span>
              </div>
            )}
          </div>
          <VehicleSelector vehicles={vehicles} selectedId={selectedVehicleId} onSelect={setSelectedVehicleId} />
        </header>

        {/* Status bar */}
        <div className="flex items-center gap-6 px-6 py-2 bg-slate-900/50 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Realtime <span className="text-emerald-400">Connected</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">{readingHistory.length} readings</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-400">{alerts.length} alerts</span>
          </div>
          {error && (
            <span className="text-red-400 text-xs ml-auto">{error}</span>
          )}
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default App;
