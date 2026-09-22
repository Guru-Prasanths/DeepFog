import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, Legend,
} from 'recharts';
import { useMemo } from 'react';
import type { SensorReading, RiskScore } from '@/types';
import { formatTimestamp } from '@/types';

interface SensorChartsProps {
  readings: SensorReading[];
  risks: RiskScore[];
}

export function SensorCharts({ readings, risks }: SensorChartsProps) {
  const chartData = useMemo(() => {
    return readings.map((r) => ({
      time: formatTimestamp(r.created_at),
      visibility: r.visibility_m,
      co: r.co_ppm,
      ch4: r.ch4_ppm,
      h2s: r.h2s_ppm,
      vibration: r.vibration_mm_s,
      temperature: r.temperature_c,
      humidity: r.humidity_pct,
      pm25: r.dust_pm25,
      pm10: r.dust_pm10,
    }));
  }, [readings]);

  const riskData = useMemo(() => {
    return risks.map((r) => ({
      time: formatTimestamp(r.created_at),
      overall: r.overall_risk,
      visibility: r.visibility_risk,
      gas: r.gas_risk,
      vibration: r.vibration_risk,
      thermal: r.thermal_risk,
      dust: r.dust_risk,
    }));
  }, [risks]);

  const tooltipStyle = {
    backgroundColor: 'rgb(15 23 42)',
    border: '1px solid rgb(51 65 85)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#e2e8f0',
  };

  const axisStyle = { fontSize: 11, fill: '#64748b' };

  if (readings.length === 0) {
    return (
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 flex flex-col items-center justify-center">
        <p className="text-slate-500 text-sm">No sensor data yet. Waiting for ESP32 to transmit readings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Risk Score Chart */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Risk Score History</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={riskData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59)" />
            <XAxis dataKey="time" tick={axisStyle} stroke="rgb(51 65 85)" />
            <YAxis domain={[0, 100]} tick={axisStyle} stroke="rgb(51 65 85)" />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="overall" stroke="#06b6d4" strokeWidth={2} fill="url(#riskGrad)" name="Overall" />
            <Line type="monotone" dataKey="visibility" stroke="#22d3ee" strokeWidth={1.5} dot={false} name="Visibility" />
            <Line type="monotone" dataKey="gas" stroke="#f97316" strokeWidth={1.5} dot={false} name="Gas" />
            <Line type="monotone" dataKey="dust" stroke="#94a3b8" strokeWidth={1.5} dot={false} name="Dust" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Visibility Chart */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Visibility (m)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59)" />
              <XAxis dataKey="time" tick={axisStyle} stroke="rgb(51 65 85)" />
              <YAxis tick={axisStyle} stroke="rgb(51 65 85)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="visibility" stroke="#22d3ee" strokeWidth={2} dot={false} name="Visibility (m)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Gas Chart */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Gas Concentrations (ppm)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59)" />
              <XAxis dataKey="time" tick={axisStyle} stroke="rgb(51 65 85)" />
              <YAxis tick={axisStyle} stroke="rgb(51 65 85)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="co" stroke="#f97316" strokeWidth={2} dot={false} name="CO" />
              <Line type="monotone" dataKey="ch4" stroke="#eab308" strokeWidth={2} dot={false} name="CH₄" />
              <Line type="monotone" dataKey="h2s" stroke="#ef4444" strokeWidth={2} dot={false} name="H₂S" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Vibration Chart */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Vibration (mm/s)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59)" />
              <XAxis dataKey="time" tick={axisStyle} stroke="rgb(51 65 85)" />
              <YAxis tick={axisStyle} stroke="rgb(51 65 85)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="vibration" stroke="#a855f7" strokeWidth={2} dot={false} name="Vibration" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Temperature & Humidity Chart */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Temperature & Humidity</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59)" />
              <XAxis dataKey="time" tick={axisStyle} stroke="rgb(51 65 85)" />
              <YAxis yAxisId="temp" tick={axisStyle} stroke="rgb(51 65 85)" />
              <YAxis yAxisId="hum" orientation="right" tick={axisStyle} stroke="rgb(51 65 85)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="temp" type="monotone" dataKey="temperature" stroke="#fb7185" strokeWidth={2} dot={false} name="Temp (°C)" />
              <Line yAxisId="hum" type="monotone" dataKey="humidity" stroke="#38bdf8" strokeWidth={2} dot={false} name="Humidity (%)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Dust Chart */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Particulate Matter (µg/m³)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59)" />
              <XAxis dataKey="time" tick={axisStyle} stroke="rgb(51 65 85)" />
              <YAxis tick={axisStyle} stroke="rgb(51 65 85)" />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="pm25" stroke="#94a3b8" strokeWidth={2} dot={false} name="PM2.5" />
              <Line type="monotone" dataKey="pm10" stroke="#475569" strokeWidth={2} dot={false} name="PM10" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
