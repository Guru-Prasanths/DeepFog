import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Vehicle, SensorReading, RiskScore, Alert } from '@/types';

const CHART_HISTORY_LIMIT = 60;

export function useDeepfogData(vehicleId: string | null) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [latestReading, setLatestReading] = useState<SensorReading | null>(null);
  const [latestRisk, setLatestRisk] = useState<RiskScore | null>(null);
  const [riskHistory, setRiskHistory] = useState<RiskScore[]>([]);
  const [readingHistory, setReadingHistory] = useState<SensorReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load vehicles
  const loadVehicles = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('vehicles')
      .select('*')
      .order('name');
    if (err) {
      setError(err.message);
      return;
    }
    setVehicles(data as Vehicle[]);
  }, []);

  // Load all data for selected vehicle
  const loadVehicleData = useCallback(async () => {
    if (!vehicleId) {
      setLatestReading(null);
      setLatestRisk(null);
      setRiskHistory([]);
      setReadingHistory([]);
      setAlerts([]);
      return;
    }

    const [readingRes, riskRes, alertsRes, historyRes] = await Promise.all([
      supabase
        .from('sensor_readings')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('risk_scores')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('alerts')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('sensor_readings')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('created_at', { ascending: false })
        .limit(CHART_HISTORY_LIMIT),
    ]);

    if (readingRes.data) setLatestReading(readingRes.data as SensorReading);
    else setLatestReading(null);
    if (riskRes.data) setLatestRisk(riskRes.data as RiskScore);
    else setLatestRisk(null);
    if (alertsRes.data) setAlerts(alertsRes.data as Alert[]);
    else setAlerts([]);

    if (historyRes.data) {
      const sorted = (historyRes.data as SensorReading[]).slice().reverse();
      setReadingHistory(sorted);
    }

    // Load risk history aligned with readings
    const { data: riskHist } = await supabase
      .from('risk_scores')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false })
      .limit(CHART_HISTORY_LIMIT);
    if (riskHist) {
      setRiskHistory((riskHist as RiskScore[]).slice().reverse());
    }

    setLoading(false);
  }, [vehicleId]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    loadVehicleData();
  }, [loadVehicleData]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`deepfog-${vehicleId ?? 'all'}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'vehicles' },
        () => loadVehicles()
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_readings', filter: vehicleId ? `vehicle_id=eq.${vehicleId}` : undefined },
        (payload) => {
          const newReading = payload.new as SensorReading;
          if (!vehicleId) return;
          setLatestReading(newReading);
          setReadingHistory((prev) => {
            const next = [...prev, newReading];
            return next.length > CHART_HISTORY_LIMIT ? next.slice(-CHART_HISTORY_LIMIT) : next;
          });
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'risk_scores', filter: vehicleId ? `vehicle_id=eq.${vehicleId}` : undefined },
        (payload) => {
          const newRisk = payload.new as RiskScore;
          if (!vehicleId) return;
          setLatestRisk(newRisk);
          setRiskHistory((prev) => {
            const next = [...prev, newRisk];
            return next.length > CHART_HISTORY_LIMIT ? next.slice(-CHART_HISTORY_LIMIT) : next;
          });
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: vehicleId ? `vehicle_id=eq.${vehicleId}` : undefined },
        (payload) => {
          const newAlert = payload.new as Alert;
          setAlerts((prev) => [newAlert, ...prev].slice(0, 50));
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts' },
        (payload) => {
          const updated = payload.new as Alert;
          setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [vehicleId, loadVehicles]);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    const { error: err } = await supabase
      .from('alerts')
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('id', alertId);
    if (err) {
      setError(err.message);
    }
  }, []);

  const acknowledgeAll = useCallback(async () => {
    if (!vehicleId) return;
    const { error: err } = await supabase
      .from('alerts')
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('vehicle_id', vehicleId)
      .eq('acknowledged', false);
    if (err) {
      setError(err.message);
    }
  }, [vehicleId]);

  return {
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
    refresh: loadVehicleData,
  };
}
