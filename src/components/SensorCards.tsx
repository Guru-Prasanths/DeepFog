import {
  Eye, Wind, Flame, Vibrate, Thermometer, Droplets, Cloud, Battery, Gauge, MapPin,
} from 'lucide-react';
import type { SensorReading } from '@/types';
import { formatTimestamp } from '@/types';

interface SensorCardsProps {
  reading: SensorReading | null;
}

interface CardDef {
  label: string;
  icon: typeof Eye;
  value: number | null | undefined;
  unit: string;
  color: string;
  bg: string;
  format: (v: number) => string;
}

export function SensorCards({ reading }: SensorCardsProps) {
  const cards: CardDef[] = [
    { label: 'Visibility', icon: Eye, value: reading?.visibility_m, unit: 'm', color: 'text-cyan-400', bg: 'bg-cyan-500/10', format: (v) => v.toFixed(0) },
    { label: 'CO', icon: Flame, value: reading?.co_ppm, unit: 'ppm', color: 'text-orange-400', bg: 'bg-orange-500/10', format: (v) => v.toFixed(1) },
    { label: 'Methane (CH₄)', icon: Wind, value: reading?.ch4_ppm, unit: 'ppm', color: 'text-yellow-400', bg: 'bg-yellow-500/10', format: (v) => v.toFixed(0) },
    { label: 'H₂S', icon: Flame, value: reading?.h2s_ppm, unit: 'ppm', color: 'text-red-400', bg: 'bg-red-500/10', format: (v) => v.toFixed(1) },
    { label: 'Vibration', icon: Vibrate, value: reading?.vibration_mm_s, unit: 'mm/s', color: 'text-purple-400', bg: 'bg-purple-500/10', format: (v) => v.toFixed(2) },
    { label: 'Temperature', icon: Thermometer, value: reading?.temperature_c, unit: '°C', color: 'text-rose-400', bg: 'bg-rose-500/10', format: (v) => v.toFixed(1) },
    { label: 'Humidity', icon: Droplets, value: reading?.humidity_pct, unit: '%', color: 'text-blue-400', bg: 'bg-blue-500/10', format: (v) => v.toFixed(0) },
    { label: 'PM2.5', icon: Cloud, value: reading?.dust_pm25, unit: 'µg/m³', color: 'text-slate-300', bg: 'bg-slate-500/10', format: (v) => v.toFixed(0) },
    { label: 'PM10', icon: Cloud, value: reading?.dust_pm10, unit: 'µg/m³', color: 'text-slate-400', bg: 'bg-slate-600/10', format: (v) => v.toFixed(0) },
    { label: 'Battery', icon: Battery, value: reading?.battery_pct, unit: '%', color: 'text-emerald-400', bg: 'bg-emerald-500/10', format: (v) => v.toFixed(0) },
    { label: 'Speed', icon: Gauge, value: reading?.speed_kmh, unit: 'km/h', color: 'text-teal-400', bg: 'bg-teal-500/10', format: (v) => v.toFixed(1) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Live Sensor Readings</h2>
        {reading && (
          <span className="text-xs text-slate-500 font-mono">
            Updated {formatTimestamp(reading.created_at)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const hasValue = card.value !== null && card.value !== undefined;
          return (
            <div
              key={card.label}
              className="bg-slate-900 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${card.color}`} />
                </div>
                <span className="text-xs text-slate-400 font-medium">{card.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                {hasValue ? (
                  <>
                    <span className="text-2xl font-bold text-white tabular-nums">
                      {card.format(card.value!)}
                    </span>
                    <span className="text-xs text-slate-500">{card.unit}</span>
                  </>
                ) : (
                  <span className="text-sm text-slate-600 italic">No data</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {reading?.latitude !== null && reading?.latitude !== undefined && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <span className="font-mono">
            {reading.latitude?.toFixed(6)}, {reading.longitude?.toFixed(6)}
          </span>
        </div>
      )}
    </div>
  );
}
