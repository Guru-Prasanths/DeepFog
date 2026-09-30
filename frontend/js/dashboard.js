/**
 * DEEPFOG — Dashboard UI Controller
 * 
 * Handles rendering and interactive updates for the main DEEPFOG dashboard:
 * - Overall Sensor-Fusion Risk Hero (Level, Score, Reasons)
 * - Sensor Cards Grid (Visibility, Gas, Temperature, Humidity, Vibration, Distance, Accel, Tilt, GPS)
 * - Vehicle Information Panel
 * - Risk Factor Breakdown
 * - Leaflet GPS Vehicle Map with dark tiles and vehicle marker
 * - Live Alerts Feed
 */

const DeepFogDashboard = (() => {
    // Leaflet map instance and marker
    let mapInstance = null;
    let vehicleMarker = null;
    let pathPolyline = null;
    let pathCoords = [];

    // Default open-cast mine coordinates (e.g., Noamundi / Keonjhar Iron Ore Mine belt)
    const DEFAULT_LAT = 22.1466;
    const DEFAULT_LNG = 85.4988;

    /**
     * Initialize Leaflet GPS Map
     */
    function initMap() {
        const mapContainer = document.getElementById('vehicleMap');
        if (!mapContainer || typeof L === 'undefined') return;

        if (mapInstance) return; // Already initialized

        try {
            // Create map centered on default mine coordinates
            mapInstance = L.map('vehicleMap', {
                zoomControl: true,
                attributionControl: false
            }).setView([DEFAULT_LAT, DEFAULT_LNG], 15);

            // Dark CartoDB / OSM tiles suitable for industrial telemetry display
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd'
            }).addTo(mapInstance);

            // Vehicle Custom Icon
            const vehicleIcon = L.divIcon({
                className: 'mine-vehicle-marker',
                html: `<div style="
                    background: radial-gradient(circle, #00d4ff 0%, #0077b6 100%);
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 2px solid #ffffff;
                    box-shadow: 0 0 14px rgba(0, 212, 255, 0.9);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 11px;
                ">🚛</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            vehicleMarker = L.marker([DEFAULT_LAT, DEFAULT_LNG], { icon: vehicleIcon }).addTo(mapInstance);
            vehicleMarker.bindPopup(`<b>HEMM Mining Truck</b><br>Initial GPS lock acquired.`);

            // Vehicle tracking trail polyline
            pathPolyline = L.polyline([], {
                color: '#00d4ff',
                weight: 3,
                opacity: 0.6,
                dashArray: '4, 8'
            }).addTo(mapInstance);

            console.log('[Dashboard] Leaflet map initialized successfully.');
        } catch (err) {
            console.error('[Dashboard] Error initializing map:', err);
        }
    }

    /**
     * Invalidate map size (called when switching tabs to ensure tile rendering)
     */
    function resizeMap() {
        if (mapInstance) {
            setTimeout(() => {
                mapInstance.invalidateSize();
            }, 100);
        }
    }

    /**
     * Update GPS Map with vehicle coordinates
     */
    function updateMapLocation(lat, lng, vehicleId, riskLevel) {
        if (!mapInstance || !vehicleMarker) return;

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);

        if (isNaN(latitude) || isNaN(longitude)) return;

        const newPos = [latitude, longitude];
        vehicleMarker.setLatLng(newPos);
        mapInstance.panTo(newPos, { animate: true, duration: 1 });

        // Update popup
        const color = riskLevel === 'HIGH' ? '#ff4757' : riskLevel === 'MEDIUM' ? '#ffa502' : '#2ed573';
        vehicleMarker.setPopupContent(`
            <div style="font-family: inherit; font-size: 12px; color: #1e293b;">
                <b style="font-size: 13px;">${vehicleId || 'Mining Vehicle'}</b><br>
                <span>GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}</span><br>
                <span>Risk Status: <b style="color:${color}">${riskLevel || 'NORMAL'}</b></span>
            </div>
        `);

        // Update trail
        pathCoords.push(newPos);
        if (pathCoords.length > 50) pathCoords.shift();
        pathPolyline.setLatLngs(pathCoords);

        const mapUpdateEl = document.getElementById('mapLastUpdate');
        if (mapUpdateEl) {
            mapUpdateEl.textContent = `Last GPS update: ${new Date().toLocaleTimeString()} (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
        }
    }

    /**
     * Render the overall sensor-fusion risk hero card
     */
    function renderRiskHero(riskLevel, riskScore, riskReasons = []) {
        const heroEl = document.getElementById('riskHero');
        const levelEl = document.getElementById('riskHeroLevel');
        const scoreEl = document.getElementById('riskHeroScore');
        const reasonsEl = document.getElementById('riskHeroReasons');

        if (!heroEl || !levelEl) return;

        // Reset classes
        heroEl.classList.remove('risk-high', 'risk-medium', 'risk-low', 'risk-na');

        const level = (riskLevel || 'N/A').toUpperCase();
        levelEl.textContent = level;

        if (level === 'HIGH') {
            heroEl.classList.add('risk-high');
        } else if (level === 'MEDIUM') {
            heroEl.classList.add('risk-medium');
        } else if (level === 'LOW') {
            heroEl.classList.add('risk-low');
        } else {
            heroEl.classList.add('risk-na');
        }

        if (scoreEl) {
            scoreEl.textContent = `Sensor Fusion Score: ${riskScore !== undefined && riskScore !== null ? riskScore : '—'} / 100`;
        }

        if (reasonsEl) {
            if (Array.isArray(riskReasons) && riskReasons.length > 0) {
                reasonsEl.innerHTML = riskReasons.map(r => `<span class="risk-reason-pill">⚠ ${escapeHtml(r)}</span>`).join('');
            } else {
                reasonsEl.innerHTML = level === 'LOW'
                    ? '<span class="risk-reason-pill normal">✓ All sensor telemetry operating within safe limits</span>'
                    : '';
            }
        }
    }

    /**
     * Helper to set sensor card value and status badge
     */
    function setSensorCard(idPrefix, valueText, statusText, statusClass = '') {
        const valEl = document.getElementById(`${idPrefix}-value`);
        const statusEl = document.getElementById(`${idPrefix}-status`);

        if (valEl) valEl.textContent = valueText;
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.className = 'sensor-status-badge';
            if (statusClass) {
                statusEl.classList.add(statusClass);
            }
        }
    }

    /**
     * Update all individual sensor cards from reading and sensorStatuses
     */
    function renderSensorCards(reading, statuses = {}) {
        if (!reading) {
            const keys = ['visibility', 'gas', 'temperature', 'humidity', 'vibration', 'distance', 'acceleration', 'tilt'];
            keys.forEach(k => setSensorCard(k, '—', 'OFFLINE', 'badge-na'));
            const latEl = document.getElementById('gps-latitude');
            const lngEl = document.getElementById('gps-longitude');
            if (latEl) latEl.textContent = '—';
            if (lngEl) lngEl.textContent = '—';
            return;
        }

        // 1. Visibility (LDR)
        const light = Number(reading.light_level ?? 0);
        const visStatus = statuses.visibility || (light < 500 ? 'POOR' : light < 1500 ? 'MODERATE' : 'GOOD');
        const visBadgeClass = visStatus === 'POOR' ? 'badge-danger' : visStatus === 'MODERATE' ? 'badge-warning' : 'badge-safe';
        setSensorCard('visibility', `${light} ADC`, visStatus, visBadgeClass);

        // 2. Gas / Smoke (MQ-2)
        const gas = Number(reading.gas_level ?? 0);
        const gasStatus = statuses.gas || (gas > 700 ? 'DANGER' : gas > 400 ? 'WARNING' : 'NORMAL');
        const gasBadgeClass = gasStatus === 'DANGER' ? 'badge-danger' : gasStatus === 'WARNING' ? 'badge-warning' : 'badge-safe';
        setSensorCard('gas', `${gas} ADC`, gasStatus, gasBadgeClass);

        // 3. Temperature (DHT11)
        const temp = Number(reading.temperature ?? 0);
        const tempStatus = statuses.temperature || (temp > 45 ? 'HIGH' : temp < 0 ? 'FREEZING' : 'NORMAL');
        const tempBadgeClass = (tempStatus === 'HIGH' || tempStatus === 'FREEZING') ? 'badge-danger' : 'badge-safe';
        setSensorCard('temperature', `${temp.toFixed(1)} °C`, tempStatus, tempBadgeClass);

        // 4. Humidity (DHT11)
        const hum = Number(reading.humidity ?? 0);
        const humStatus = statuses.humidity || (hum > 90 ? 'VERY HIGH' : hum < 20 ? 'VERY LOW' : 'NORMAL');
        const humBadgeClass = (humStatus === 'VERY HIGH' || humStatus === 'VERY LOW') ? 'badge-warning' : 'badge-safe';
        setSensorCard('humidity', `${hum.toFixed(1)} %`, humStatus, humBadgeClass);

        // 5. Vibration (SW-420)
        const vib = Number(reading.vibration_intensity ?? 0);
        const vibStatus = statuses.vibration || (vib > 0.8 ? 'STRONG' : vib > 0.4 ? 'MODERATE' : 'NORMAL');
        const vibBadgeClass = vibStatus === 'STRONG' ? 'badge-danger' : vibStatus === 'MODERATE' ? 'badge-warning' : 'badge-safe';
        setSensorCard('vibration', `${vib.toFixed(2)}`, vibStatus, vibBadgeClass);

        // 6. Obstacle Distance (HC-SR04)
        const dist = Number(reading.distance ?? 0);
        const distStatus = statuses.distance || (dist < 100 ? 'CRITICAL' : dist < 300 ? 'WARNING' : 'CLEAR');
        const distBadgeClass = distStatus === 'CRITICAL' ? 'badge-danger' : distStatus === 'WARNING' ? 'badge-warning' : 'badge-safe';
        setSensorCard('distance', `${dist.toFixed(0)} cm`, distStatus, distBadgeClass);

        // 7. Motion / Acceleration (MPU-6050)
        const accel = Number(reading.acceleration ?? 0);
        const accelStatus = statuses.acceleration || (accel > 4.0 ? 'IMPACT' : accel > 2.5 ? 'SUDDEN' : 'STABLE');
        const accelBadgeClass = accelStatus === 'IMPACT' ? 'badge-danger' : accelStatus === 'SUDDEN' ? 'badge-warning' : 'badge-safe';
        setSensorCard('acceleration', `${accel.toFixed(2)} g`, accelStatus, accelBadgeClass);

        // 8. Vehicle Tilt (MPU-6050)
        const tilt = Number(reading.tilt ?? 0);
        const tiltStatus = statuses.tilt || (tilt > 30 ? 'CRITICAL TILT' : tilt > 15 ? 'HAZARDOUS' : 'LEVEL');
        const tiltBadgeClass = tiltStatus === 'CRITICAL TILT' ? 'badge-danger' : tiltStatus === 'HAZARDOUS' ? 'badge-warning' : 'badge-safe';
        setSensorCard('tilt', `${tilt.toFixed(1)} °`, tiltStatus, tiltBadgeClass);

        // 9. GPS Coordinates
        const latEl = document.getElementById('gps-latitude');
        const lngEl = document.getElementById('gps-longitude');
        if (latEl) latEl.textContent = reading.latitude !== null && reading.latitude !== undefined ? Number(reading.latitude).toFixed(5) : '—';
        if (lngEl) lngEl.textContent = reading.longitude !== null && reading.longitude !== undefined ? Number(reading.longitude).toFixed(5) : '—';
    }

    /**
     * Render Vehicle Info & Connection status
     */
    function renderVehicleInfo(vehicle, reading) {
        const idEl = document.getElementById('vehicle-id');
        const statusEl = document.getElementById('vehicle-status');
        const typeEl = document.getElementById('vehicle-type');
        const connEl = document.getElementById('vehicle-connection');
        const updateEl = document.getElementById('vehicle-last-update');

        if (idEl) idEl.textContent = vehicle?.vehicle_id || (reading ? reading.vehicle_id : 'HEMM-01');
        if (typeEl) typeEl.textContent = vehicle?.type || 'Haul Truck (CAT 777E)';
        if (statusEl) statusEl.textContent = vehicle?.status || 'ACTIVE';

        const isOnline = reading && ((Date.now() - new Date(reading.recorded_at).getTime()) < 60000);
        if (connEl) {
            connEl.textContent = isOnline ? 'ONLINE (ESP32 Live)' : 'IDLE / LAST KNOWN';
            connEl.style.color = isOnline ? '#2ed573' : '#ffa502';
        }

        if (updateEl) {
            if (reading?.recorded_at) {
                updateEl.textContent = new Date(reading.recorded_at).toLocaleTimeString();
            } else {
                updateEl.textContent = '—';
            }
        }
    }

    /**
     * Render Risk Analysis Breakdown
     */
    function renderRiskAnalysis(reading, statuses = {}) {
        const fields = [
            { id: 'risk-visibility',   val: statuses.visibility   || (reading && reading.light_level < 500 ? 'POOR VISIBILITY' : 'NORMAL') },
            { id: 'risk-gas',          val: statuses.gas          || (reading && reading.gas_level > 700 ? 'HAZARDOUS GAS' : 'NORMAL') },
            { id: 'risk-vibration',    val: statuses.vibration    || (reading && reading.vibration_intensity > 0.8 ? 'STRONG ROAD SHOCKS' : 'NORMAL') },
            { id: 'risk-acceleration', val: statuses.acceleration || (reading && reading.acceleration > 3.0 ? 'SUDDEN DECEL/IMPACT' : 'STABLE') },
            { id: 'risk-obstacle',     val: statuses.distance     || (reading && reading.distance < 150 ? 'NEAR OBSTACLE' : 'CLEAR') },
            { id: 'risk-tilt',         val: statuses.tilt         || (reading && reading.tilt > 20 ? 'HAZARDOUS GRADE' : 'NORMAL') },
            { id: 'risk-overall',      val: (reading && reading.risk_level) ? `${reading.risk_level} RISK (${reading.risk_score}/100)` : 'LOW / NORMAL' }
        ];

        fields.forEach(f => {
            const el = document.getElementById(f.id);
            if (!el) return;
            el.textContent = f.val;
            el.className = 'risk-assessment';
            if (f.val.includes('POOR') || f.val.includes('HAZARDOUS') || f.val.includes('CRITICAL') || f.val.includes('HIGH') || f.val.includes('STRONG') || f.val.includes('NEAR')) {
                el.classList.add('risk-factor-danger');
            } else if (f.val.includes('MODERATE') || f.val.includes('WARNING') || f.val.includes('MEDIUM')) {
                el.classList.add('risk-factor-warning');
            } else {
                el.classList.add('risk-factor-safe');
            }
        });
    }

    /**
     * Render Live Alerts List in Dashboard Overview
     */
    function renderLiveAlerts(alerts = []) {
        const listEl = document.getElementById('liveAlertsList');
        const emptyMsg = document.getElementById('noAlertsMsg');

        if (!listEl) return;

        if (!alerts || alerts.length === 0) {
            if (emptyMsg) emptyMsg.style.display = 'flex';
            listEl.innerHTML = '';
            if (emptyMsg) listEl.appendChild(emptyMsg);
            return;
        }

        if (emptyMsg) emptyMsg.style.display = 'none';

        const html = alerts.slice(0, 8).map(alert => {
            const sevClass = alert.severity === 'HIGH' ? 'alert-high' : alert.severity === 'MEDIUM' ? 'alert-medium' : 'alert-low';
            const timeStr = alert.created_at ? new Date(alert.created_at).toLocaleTimeString() : 'Just now';

            return `
                <div class="live-alert-item ${sevClass}">
                    <div class="alert-item-header">
                        <span class="alert-type">${escapeHtml(alert.alert_type || 'SAFETY ALERT')}</span>
                        <span class="alert-severity ${sevClass}">${escapeHtml(alert.severity || 'WARN')}</span>
                        <span class="alert-time">${timeStr}</span>
                    </div>
                    <div class="alert-message">${escapeHtml(alert.message || '')}</div>
                    <div class="alert-footer">
                        <span class="alert-vehicle">Vehicle: ${escapeHtml(alert.vehicle_id || 'HEMM-01')}</span>
                        <span class="alert-status-badge status-${(alert.status || 'ACTIVE').toLowerCase()}">${escapeHtml(alert.status || 'ACTIVE')}</span>
                    </div>
                </div>
            `;
        }).join('');

        listEl.innerHTML = html;
    }

    /**
     * Update entire Dashboard from backend GET /api/dashboard payload
     */
    function update(data) {
        if (!data) return;

        // Extract primary vehicle dashboard
        const vehicleDash = (data.vehicles && data.vehicles.length > 0) ? data.vehicles[0] : null;
        const reading = vehicleDash?.latestReading || null;
        const statuses = vehicleDash?.sensorStatuses || {};
        const riskLevel = vehicleDash?.riskLevel || 'LOW';
        const riskScore = vehicleDash?.riskScore ?? 0;
        const riskReasons = vehicleDash?.riskReasons || [];
        const vehicle = vehicleDash?.vehicle || null;

        // Render components
        renderRiskHero(riskLevel, riskScore, riskReasons);
        renderSensorCards(reading, statuses);
        renderVehicleInfo(vehicle, reading);
        renderRiskAnalysis(reading, statuses);
        renderLiveAlerts(data.recentAlerts || []);

        // Update GPS Map if coordinates available
        if (reading && reading.latitude && reading.longitude) {
            updateMapLocation(reading.latitude, reading.longitude, vehicle?.vehicle_id, riskLevel);
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }

    return {
        initMap,
        resizeMap,
        updateMapLocation,
        renderRiskHero,
        renderSensorCards,
        renderVehicleInfo,
        renderRiskAnalysis,
        renderLiveAlerts,
        update
    };
})();
