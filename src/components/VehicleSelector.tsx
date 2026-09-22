import { Truck, ChevronDown, Circle } from 'lucide-react';
import type { Vehicle } from '@/types';
import { formatTimeAgo } from '@/types';

interface VehicleSelectorProps {
  vehicles: Vehicle[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function VehicleSelector({ vehicles, selectedId, onSelect }: VehicleSelectorProps) {
  const selected = vehicles.find((v) => v.id === selectedId);

  const statusColor = (status: string) => {
    if (status === 'active') return 'text-emerald-400';
    if (status === 'idle') return 'text-amber-400';
    return 'text-slate-500';
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <select
          value={selectedId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          className="appearance-none bg-slate-800 border border-slate-700 text-white text-sm font-medium pl-11 pr-10 py-2.5 rounded-lg cursor-pointer hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all"
        >
          {vehicles.length === 0 && <option value="">No vehicles registered</option>}
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.vehicle_code})
            </option>
          ))}
        </select>
        <Truck className="w-5 h-5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {selected && (
        <div className="hidden sm:flex items-center gap-2 text-sm">
          <Circle className={`w-2.5 h-2.5 fill-current ${statusColor(selected.status)}`} />
          <span className="text-slate-400">
            Last seen <span className="text-slate-200 font-medium">{formatTimeAgo(selected.last_seen_at)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
