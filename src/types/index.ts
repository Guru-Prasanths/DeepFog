export interface Vehicle {
  id: string;
  name: string;
  vehicle_code: string;
  latitude: number | null;
  longitude: number | null;
  status: 'active' | 'idle' | 'maintenance';
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SensorReading {
  id: string;
  vehicle_id: string;
  visibility_m: number | null;
  co_ppm: number | null;
  ch4_ppm: number | null;
  h2s_ppm: number | null;
  vibration_mm_s: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  dust_pm25: number | null;
  dust_pm10: number | null;
  battery_pct: number | null;
  latitude: number | null;
  longitude: number | null;
  speed_kmh: number | null;
  created_at: string;
}

export interface RiskScore {
  id: string;
  vehicle_id: string;
  reading_id: string | null;
  overall_risk: number;
  visibility_risk: number;
  gas_risk: number;
  vibration_risk: number;
  thermal_risk: number;
  dust_risk: number;
  risk_level: 'safe' | 'caution' | 'warning' | 'danger' | 'critical';
  created_at: string;
}

export interface Alert {
  id: string;
  vehicle_id: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

export type RiskLevel = 'safe' | 'caution' | 'warning' | 'danger' | 'critical';

export const RISK_LEVELS: { level: RiskLevel; label: string; color: string; bg: string; text: string; ring: string }[] = [
  { level: 'safe', label: 'Safe', color: '#10b981', bg: 'bg-emerald-500', text: 'text-emerald-400', ring: 'ring-emerald-500/30' },
  { level: 'caution', label: 'Caution', color: '#84cc16', bg: 'bg-lime-500', text: 'text-lime-400', ring: 'ring-lime-500/30' },
  { level: 'warning', label: 'Warning', color: '#f59e0b', bg: 'bg-amber-500', text: 'text-amber-400', ring: 'ring-amber-500/30' },
  { level: 'danger', label: 'Danger', color: '#f97316', bg: 'bg-orange-500', text: 'text-orange-400', ring: 'ring-orange-500/30' },
  { level: 'critical', label: 'Critical', color: '#ef4444', bg: 'bg-red-500', text: 'text-red-400', ring: 'ring-red-500/30' },
];

export function getRiskStyle(level: RiskLevel) {
  return RISK_LEVELS.find((r) => r.level === level) ?? RISK_LEVELS[0];
}

export function riskScoreToLevel(score: number): RiskLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'danger';
  if (score >= 40) return 'warning';
  if (score >= 20) return 'caution';
  return 'safe';
}

export function formatTimeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('en-US', { hour12: false });
}
