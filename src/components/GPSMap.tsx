import { MapPin, Navigation } from 'lucide-react';
import type { Vehicle } from '@/types';

interface GPSMapProps {
  vehicles: Vehicle[];
  selectedId: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function GPSMap({ vehicles, selectedId, latitude, longitude }: GPSMapProps) {
  // Determine bounds from all vehicle positions + selected reading
  const allPoints = vehicles
    .filter((v) => v.latitude !== null && v.longitude !== null)
    .map((v) => ({ lat: v.latitude!, lng: v.longitude!, id: v.id, name: v.name, code: v.vehicle_code }));

  if (latitude !== null && longitude !== null) {
    allPoints.push({ lat: latitude, lng: longitude, id: 'live', name: 'Live Position', code: 'LIVE' });
  }

  if (allPoints.length === 0) {
    return (
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-12 flex flex-col items-center justify-center">
        <MapPin className="w-12 h-12 text-slate-700 mb-3" />
        <p className="text-slate-500 text-sm">No GPS data available. Waiting for ESP32 position reports...</p>
      </div>
    );
  }

  // Calculate bounds
  const lats = allPoints.map((p) => p.lat);
  const lngs = allPoints.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const padLat = (maxLat - minLat) * 0.2 || 0.001;
  const padLng = (maxLng - minLng) * 0.2 || 0.001;

  const bounds = {
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
    minLng: minLng - padLng,
    maxLng: maxLng + padLng,
  };

  const project = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const y = (1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;
    return { x, y };
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Vehicle GPS Positions</h3>
      </div>
      <div className="relative w-full" style={{ height: '500px' }}>
        {/* Grid background */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgb(15 23 42) 0%, rgb(2 6 23) 100%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(rgb(30 41 59) 1px, transparent 1px),
              linear-gradient(90deg, rgb(30 41 59) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Coordinate labels */}
        <div className="absolute top-2 left-2 text-[10px] font-mono text-slate-600">
          {bounds.maxLat.toFixed(4)}, {bounds.minLng.toFixed(4)}
        </div>
        <div className="absolute bottom-2 right-2 text-[10px] font-mono text-slate-600">
          {bounds.minLat.toFixed(4)}, {bounds.maxLng.toFixed(4)}
        </div>

        {/* Vehicle markers */}
        {allPoints.map((point) => {
          const { x, y } = project(point.lat, point.lng);
          const isSelected = point.id === selectedId || point.id === 'live';
          return (
            <div
              key={`${point.id}-${point.code}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {isSelected ? (
                <div className="relative">
                  <div className="absolute inset-0 w-12 h-12 rounded-full bg-cyan-500/20 animate-ping -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2" />
                  <div className="relative w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/50">
                    <Navigation className="w-4 h-4 text-white" />
                  </div>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-slate-600 border-2 border-slate-400 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                </div>
              )}
              <div className={`absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`}>
                {point.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Position info */}
      {latitude !== null && longitude !== null && (
        <div className="px-6 py-3 border-t border-slate-800 flex items-center gap-3 text-sm">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <span className="text-slate-400">Live position:</span>
          <span className="font-mono text-slate-200">{latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
        </div>
      )}
    </div>
  );
}
