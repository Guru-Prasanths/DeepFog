import { useState } from 'react';
import { Truck, Plus, X, Cpu, Code2, Copy, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SENSOR_INGEST_URL } from '@/lib/supabase';
import type { Vehicle } from '@/types';

interface VehicleManagementProps {
  vehicles: Vehicle[];
  onRefresh: () => void;
}

export function VehicleManagement({ vehicles, onRefresh }: VehicleManagementProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !code.trim()) {
      setError('Name and vehicle code are required');
      return;
    }
    const { error: err } = await supabase.from('vehicles').insert({
      name: name.trim(),
      vehicle_code: code.trim().toUpperCase(),
      latitude: lat ? parseFloat(lat) : null,
      longitude: lng ? parseFloat(lng) : null,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setName('');
    setCode('');
    setLat('');
    setLng('');
    setShowForm(false);
    onRefresh();
  };

  const samplePayload = `{
  "vehicle_code": "${code.trim().toUpperCase() || 'TRUCK01'}",
  "visibility_m": 45.0,
  "co_ppm": 12.5,
  "ch4_ppm": 800,
  "h2s_ppm": 3.2,
  "vibration_mm_s": 4.5,
  "temperature_c": 52.0,
  "humidity_pct": 65,
  "dust_pm25": 78,
  "dust_pm10": 120,
  "battery_pct": 87,
  "latitude": -27.5015,
  "longitude": 153.0250,
  "speed_kmh": 22.5
}`;

  const copyPayload = () => {
    navigator.clipboard.writeText(samplePayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Registered Vehicles</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? 'Cancel' : 'Register Vehicle'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Vehicle name (e.g. Haul Truck 03)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
            <input
              type="text"
              placeholder="Vehicle code (e.g. TRUCK03)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/40 font-mono uppercase"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Latitude (optional)"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/40 font-mono"
            />
            <input
              type="text"
              placeholder="Longitude (optional)"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/40 font-mono"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Register Vehicle
          </button>
        </form>
      )}

      <div className="space-y-2">
        {vehicles.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">
            No vehicles registered yet. Register one to start receiving sensor data.
          </p>
        ) : (
          vehicles.map((v) => (
            <div key={v.id} className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-800">
              <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 font-medium truncate">{v.name}</p>
                <p className="text-xs text-slate-500 font-mono">{v.vehicle_code}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                v.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' :
                v.status === 'idle' ? 'bg-amber-500/10 text-amber-400' :
                'bg-slate-500/10 text-slate-400'
              }`}>
                {v.status}
              </span>
            </div>
          ))
        )}
      </div>

      {/* API Info */}
      <div className="mt-4 pt-4 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <Code2 className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">ESP32 API Endpoint</span>
        </div>
        <code className="block text-xs text-cyan-400 font-mono bg-slate-950 rounded-lg p-2 mb-2 break-all">
          POST {SENSOR_INGEST_URL}
        </code>
        <div className="relative">
          <pre className="text-[10px] text-slate-400 font-mono bg-slate-950 rounded-lg p-3 overflow-x-auto max-h-40">
{samplePayload}
          </pre>
          <button
            onClick={copyPayload}
            className="absolute top-2 right-2 text-slate-500 hover:text-cyan-400 transition-colors"
            title="Copy"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
