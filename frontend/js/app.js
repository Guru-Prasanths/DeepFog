/**
 * DEEPFOG — Application Master Controller
 * 
 * Orchestrates navigation, real-time polling, section views, demo fallback,
 * and user interactions across the full DEEPFOG IoT platform.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Application State
    const state = {
        currentSection: 'dashboard',
        isDemoMode: false,
        pollIntervalMs: 5000,
        pollTimer: null,
        lastDashboardData: null,
        vehiclesList: [],
        alertsList: [],
        activeVehicleId: 'HEMM-01',
        historyFetched: false
    };

    // DOM Elements
    const elements = {
        navToggle: document.getElementById('navToggle'),
        navLinks: document.getElementById('navLinks'),
        statusBadge: document.getElementById('systemStatusBadge'),
        statusDot: document.getElementById('statusDot'),
        statusText: document.getElementById('systemStatusText'),
        demoBanner: document.getElementById('demoBanner'),
        demoDismiss: document.getElementById('demoDismiss'),
        noDataBanner: document.getElementById('noDataBanner'),
        applyFiltersBtn: document.getElementById('applyAlertFilters')
    };

    /**
     * Initialize Application
     */
    async function init() {
        console.log('[DEEPFOG] Initializing Mine Safety System Frontend v1.0...');

        // Setup navigation & routing
        setupNavigation();

        // Initialize Map & Charts
        DeepFogDashboard.initMap();
        DeepFogCharts.init();

        // Setup alert filters and action listeners
        setupAlertListeners();

        // Setup Demo Banner Dismiss
        if (elements.demoDismiss) {
            elements.demoDismiss.addEventListener('click', () => {
                if (elements.demoBanner) elements.demoBanner.style.display = 'none';
            });
        }

        // Start Initial Data Fetch & Polling
        await pollData();
        state.pollTimer = setInterval(pollData, state.pollIntervalMs);
    }

    /**
     * Tab Navigation & Routing
     */
    function setupNavigation() {
        // Mobile hamburger toggle
        if (elements.navToggle && elements.navLinks) {
            elements.navToggle.addEventListener('click', () => {
                elements.navLinks.classList.toggle('open');
                elements.navToggle.setAttribute('aria-expanded', elements.navLinks.classList.contains('open'));
            });
        }

        // Section link clicks
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetSection = link.getAttribute('data-section');
                switchSection(targetSection);
                if (elements.navLinks) elements.navLinks.classList.remove('open');
            });
        });

        // Listen for hashchange
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#', '');
            if (hash) switchSection(hash);
        });

        // Read initial hash if present
        if (window.location.hash) {
            switchSection(window.location.hash.replace('#', ''));
        }
    }

    /**
     * Switch between application views
     */
    function switchSection(sectionId) {
        if (!sectionId) return;

        const targetEl = document.getElementById(`section-${sectionId}`);
        if (!targetEl) return;

        state.currentSection = sectionId;

        // Update nav links active class
        document.querySelectorAll('.nav-link').forEach(link => {
            if (link.getAttribute('data-section') === sectionId) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Hide all sections, show target
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.style.display = 'none';
            sec.classList.remove('active');
        });

        targetEl.style.display = 'block';
        targetEl.classList.add('active');

        // Section-specific lifecycle actions
        if (sectionId === 'dashboard') {
            DeepFogDashboard.resizeMap();
        } else if (sectionId === 'sensor-data') {
            loadSensorHistoryData();
        } else if (sectionId === 'vehicles') {
            renderVehiclesTable(state.vehiclesList);
        } else if (sectionId === 'alerts') {
            loadAlertsData();
        } else if (sectionId === 'system-status') {
            renderSystemStatus();
        }
    }

    /**
     * Primary Polling Function
     */
    async function pollData() {
        try {
            const start = performance.now();
            const dashResponse = await apiGetDashboard();
            const latency = Math.round(performance.now() - start);

            if (dashResponse && dashResponse.success && dashResponse.data) {
                // Live backend online
                setOnlineStatus(true, 'ONLINE', latency);
                if (elements.demoBanner) elements.demoBanner.style.display = 'none';
                if (elements.noDataBanner) elements.noDataBanner.style.display = 'none';

                state.lastDashboardData = dashResponse.data;
                state.vehiclesList = dashResponse.data.vehicles?.map(v => v.vehicle) || [];

                // Update Overview Dashboard
                DeepFogDashboard.update(dashResponse.data);

                // Update Live Monitoring Section
                updateLiveMonitoring(dashResponse.data);

                // If on active vehicle, append chart point
                const currentVeh = dashResponse.data.vehicles?.[0];
                if (currentVeh?.latestReading) {
                    DeepFogCharts.addDataPoint(currentVeh.latestReading);
                }

                state.isDemoMode = false;
            } else {
                handleEmptyOrFailedData('No data in backend response');
            }
        } catch (err) {
            console.warn('[DEEPFOG] Backend unavailable, entering fallback demo mode:', err.message);
            handleEmptyOrFailedData(err.message);
        }
    }

    /**
     * Fallback Demo Simulation Mode
     * Runs when backend/PostgreSQL is offline so dashboard is immediately demo-ready.
     */
    function handleEmptyOrFailedData(reason) {
        state.isDemoMode = true;
        setOnlineStatus(false, 'DEMO MODE (OFFLINE)', 0);

        if (elements.demoBanner) {
            elements.demoBanner.style.display = 'flex';
        }

        // Generate realistic simulated telemetry for mine haul truck
        const demoData = generateSimulatedTelemetry();
        state.lastDashboardData = demoData;
        state.vehiclesList = demoData.vehicles.map(v => v.vehicle);

        DeepFogDashboard.update(demoData);
        updateLiveMonitoring(demoData);

        const currentVeh = demoData.vehicles[0];
        if (currentVeh?.latestReading) {
            DeepFogCharts.addDataPoint(currentVeh.latestReading);
        }

        // Pre-fill history if not yet done
        if (!state.historyFetched) {
            const mockHistory = generateMockHistory();
            DeepFogCharts.loadHistory(mockHistory);
            state.historyFetched = true;
        }

        renderVehiclesTable(state.vehiclesList);
        renderAlertsTable(demoData.recentAlerts);
        renderSystemStatus();
    }

    /**
     * Update Header Online Status Badge
     */
    function setOnlineStatus(isLive, label, latencyMs = 0) {
        if (!elements.statusBadge || !elements.statusDot || !elements.statusText) return;

        elements.statusDot.className = 'status-dot';
        if (isLive) {
            elements.statusDot.classList.add('online');
            elements.statusText.textContent = `ONLINE (${latencyMs}ms)`;
            elements.statusBadge.title = 'DEEPFOG REST API and PostgreSQL active';
        } else {
            elements.statusDot.classList.add('demo');
            elements.statusText.textContent = label;
            elements.statusBadge.title = 'Running in simulated demonstration mode';
        }
    }

    /**
     * Update Live Monitoring section with latest sensor readings
     */
    function updateLiveMonitoring(dashData) {
        const vDash = dashData.vehicles?.[0];
        const r = vDash?.latestReading;

        const connStatusEl = document.getElementById('monitoringConnectionStatus');
        if (connStatusEl) {
            connStatusEl.textContent = state.isDemoMode ? 'Simulated Telemetry Generator' : 'Active REST Stream (ESP32)';
            connStatusEl.style.color = state.isDemoMode ? '#ffa502' : '#2ed573';
        }

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        if (r) {
            setVal('live-temperature', `${Number(r.temperature ?? 0).toFixed(1)} °C`);
            setVal('live-humidity', `${Number(r.humidity ?? 0).toFixed(1)} %`);
            setVal('live-gas', `${Number(r.gas_level ?? 0)} ADC`);
            setVal('live-light', `${Number(r.light_level ?? 0)} ADC`);
            setVal('live-distance', `${Number(r.distance ?? 0).toFixed(0)} cm`);
            setVal('live-acceleration', `${Number(r.acceleration ?? 0).toFixed(2)} g`);
            setVal('live-tilt', `${Number(r.tilt ?? 0).toFixed(1)} °`);
            setVal('live-vibration', `${Number(r.vibration_intensity ?? 0).toFixed(2)}`);
            setVal('live-risk', vDash?.riskLevel || 'LOW');
            setVal('live-risk-score', `${vDash?.riskScore ?? 0} / 100`);

            const riskEl = document.getElementById('live-risk');
            if (riskEl) {
                riskEl.style.color = vDash?.riskLevel === 'HIGH' ? '#ff4757' : vDash?.riskLevel === 'MEDIUM' ? '#ffa502' : '#2ed573';
                riskEl.style.fontWeight = 'bold';
            }
        }
    }

    /**
     * Load & Render Sensor History Data for Charts section
     */
    async function loadSensorHistoryData() {
        if (state.isDemoMode) {
            if (!state.historyFetched) {
                DeepFogCharts.loadHistory(generateMockHistory());
                state.historyFetched = true;
            }
            return;
        }

        try {
            const res = await apiGetSensorHistory({ limit: 40 });
            if (res && res.success && res.data && res.data.length > 0) {
                DeepFogCharts.loadHistory(res.data);
                state.historyFetched = true;
            } else {
                DeepFogCharts.loadHistory(generateMockHistory());
            }
        } catch (err) {
            console.warn('[DEEPFOG] Error loading history from API:', err.message);
            DeepFogCharts.loadHistory(generateMockHistory());
        }
    }

    /**
     * Load & Render Alerts Data for Alerts History section
     */
    async function loadAlertsData() {
        const vehicleFilter = document.getElementById('alertFilterVehicle')?.value || '';
        const severityFilter = document.getElementById('alertFilterSeverity')?.value || '';
        const statusFilter = document.getElementById('alertFilterStatus')?.value || '';

        if (state.isDemoMode) {
            let filtered = state.alertsList.length > 0 ? state.alertsList : (state.lastDashboardData?.recentAlerts || []);
            if (severityFilter) filtered = filtered.filter(a => a.severity === severityFilter);
            if (statusFilter) filtered = filtered.filter(a => a.status === statusFilter);
            renderAlertsTable(filtered);
            updateAlertStats(filtered);
            return;
        }

        try {
            const res = await apiGetAlerts({
                vehicleId: vehicleFilter,
                severity: severityFilter,
                status: statusFilter,
                limit: 50
            });

            if (res && res.success && res.data) {
                state.alertsList = res.data;
                renderAlertsTable(res.data);
                updateAlertStats(res.data);
            }
        } catch (err) {
            console.warn('[DEEPFOG] Error loading alerts:', err.message);
            renderAlertsTable(state.lastDashboardData?.recentAlerts || []);
        }
    }

    /**
     * Setup alert filtering and action buttons
     */
    function setupAlertListeners() {
        if (elements.applyFiltersBtn) {
            elements.applyFiltersBtn.addEventListener('click', () => {
                loadAlertsData();
            });
        }

        // Delegate table action buttons
        const tableBody = document.getElementById('alertsTableBody');
        if (tableBody) {
            tableBody.addEventListener('click', async (e) => {
                const target = e.target;
                if (!target.classList.contains('btn-action')) return;

                const alertId = target.getAttribute('data-id');
                const action = target.getAttribute('data-action');
                if (!alertId || !action) return;

                const newStatus = action === 'ack' ? 'ACKNOWLEDGED' : 'RESOLVED';

                if (state.isDemoMode) {
                    const alert = state.alertsList.find(a => String(a.id) === String(alertId));
                    if (alert) alert.status = newStatus;
                    renderAlertsTable(state.alertsList);
                    updateAlertStats(state.alertsList);
                    return;
                }

                try {
                    await apiUpdateAlertStatus(alertId, newStatus);
                    loadAlertsData();
                } catch (err) {
                    console.error('[DEEPFOG] Failed to update alert status:', err);
                }
            });
        }
    }

    /**
     * Render Registered Vehicles Table
     */
    function renderVehiclesTable(vehicles = []) {
        const tbody = document.getElementById('vehiclesTableBody');
        if (!tbody) return;

        if (!vehicles || vehicles.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">No registered vehicles found.</td></tr>`;
            return;
        }

        tbody.innerHTML = vehicles.map(v => `
            <tr>
                <td><strong>${escapeHtml(v.vehicle_id)}</strong></td>
                <td>${escapeHtml(v.name || 'Mining Equipment')}</td>
                <td><span class="type-badge">${escapeHtml(v.type || 'HEMM')}</span></td>
                <td><span class="status-pill status-${(v.status || 'ACTIVE').toLowerCase()}">${escapeHtml(v.status || 'ACTIVE')}</span></td>
                <td>${v.created_at ? new Date(v.created_at).toLocaleDateString() : 'Active'}</td>
            </tr>
        `).join('');

        // Populate vehicle filter dropdown if available
        const filterSelect = document.getElementById('alertFilterVehicle');
        if (filterSelect && filterSelect.options.length <= 1) {
            vehicles.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.vehicle_id;
                opt.textContent = `${v.vehicle_id} - ${v.name || v.type}`;
                filterSelect.appendChild(opt);
            });
        }
    }

    /**
     * Render Alerts Table
     */
    function renderAlertsTable(alerts = []) {
        const tbody = document.getElementById('alertsTableBody');
        if (!tbody) return;

        if (!alerts || alerts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No alerts matching filter criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = alerts.map(a => {
            const sevBadge = a.severity === 'HIGH' ? 'badge-danger' : a.severity === 'MEDIUM' ? 'badge-warning' : 'badge-safe';
            const statusClass = (a.status || 'ACTIVE').toLowerCase();
            const timeStr = a.created_at ? new Date(a.created_at).toLocaleString() : 'Recent';

            return `
                <tr>
                    <td>${timeStr}</td>
                    <td><strong>${escapeHtml(a.vehicle_id || 'HEMM-01')}</strong></td>
                    <td>
                        <div class="alert-desc-title">${escapeHtml(a.alert_type || 'SAFETY')}</div>
                        <div class="alert-desc-msg">${escapeHtml(a.message || '')}</div>
                    </td>
                    <td><span class="sensor-status-badge ${sevBadge}">${escapeHtml(a.severity || 'LOW')}</span></td>
                    <td><strong>${a.risk_score ?? '—'}</strong>/100</td>
                    <td><span class="status-pill status-${statusClass}">${escapeHtml(a.status || 'ACTIVE')}</span></td>
                    <td>
                        ${a.status !== 'RESOLVED' ? `
                            <button class="btn btn-sm btn-action" data-id="${a.id}" data-action="ack" title="Acknowledge">Ack</button>
                            <button class="btn btn-sm btn-success btn-action" data-id="${a.id}" data-action="resolve" title="Resolve">Resolve</button>
                        ` : '<span class="text-muted">Closed</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Update Alert Stats cards
     */
    function updateAlertStats(alerts = []) {
        const total = alerts.length;
        const high = alerts.filter(a => a.severity === 'HIGH').length;
        const med = alerts.filter(a => a.severity === 'MEDIUM').length;
        const active = alerts.filter(a => a.status === 'ACTIVE').length;

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setTxt('alertStatTotal', total);
        setTxt('alertStatHigh', high);
        setTxt('alertStatMedium', med);
        setTxt('alertStatActive', active);
    }

    /**
     * Render System Status Section
     */
    async function renderSystemStatus() {
        const setInd = (id, isOk, text, details = '') => {
            const container = document.getElementById(id);
            if (!container) return;
            const dot = container.querySelector('.status-dot-lg');
            const txt = container.querySelector('.status-text');
            if (dot) dot.className = `status-dot-lg ${isOk ? 'ok' : 'err'}`;
            if (txt) txt.textContent = text;
        };

        if (state.isDemoMode) {
            setInd('statusBackend', false, 'STANDALONE / DEMO');
            setInd('statusDatabase', false, 'MOCK STORAGE');
            setInd('statusESP32', true, 'SIMULATOR ACTIVE');
            setInd('statusVehicles', true, '3 VEHICLES MONITORED');
            return;
        }

        try {
            const health = await apiHealthCheck();
            setInd('statusBackend', true, 'ONLINE (v1.0.0)');
            setInd('statusDatabase', health.database === 'CONNECTED', health.database);
            setInd('statusESP32', true, 'LISTENING ON :4000/api/sensors');
            setInd('statusVehicles', true, `${state.vehiclesList.length} REGISTERED`);
        } catch {
            setInd('statusBackend', false, 'OFFLINE');
            setInd('statusDatabase', false, 'DISCONNECTED');
            setInd('statusESP32', false, 'STANDBY');
            setInd('statusVehicles', false, '—');
        }
    }

    // ============================================================
    // SIMULATED DATA GENERATOR FOR IMMEDIATE DEMO TESTING
    // ============================================================

    let simStep = 0;
    function generateSimulatedTelemetry() {
        simStep++;
        const t = simStep * 0.2;

        // Simulate varying mine pit conditions
        const isFoggy = Math.sin(t) > 0.4;
        const isDusty = Math.cos(t * 0.7) > 0.6;
        const isBumpy = Math.sin(t * 1.5) > 0.8;

        const lightLevel = isFoggy ? Math.round(250 + Math.random() * 200) : Math.round(1800 + Math.random() * 400);
        const gasLevel = isDusty ? Math.round(520 + Math.random() * 220) : Math.round(180 + Math.random() * 90);
        const temperature = 34.5 + Math.sin(t * 0.1) * 3;
        const humidity = isFoggy ? 92.5 : 45.0 + Math.random() * 10;
        const distance = isFoggy ? Math.round(75 + Math.random() * 150) : Math.round(450 + Math.random() * 200);
        const acceleration = isBumpy ? 3.4 : 0.98 + (Math.random() - 0.5) * 0.2;
        const tilt = 6.2 + Math.sin(t * 0.5) * 12;
        const vibration = isBumpy ? 0.88 : 0.18 + Math.random() * 0.15;

        // Sensor fusion risk calculation
        let riskScore = 15;
        const reasons = [];

        if (lightLevel < 500) {
            riskScore += 25;
            reasons.push('Dense fog / low visibility detected (LDR < 500)');
        }
        if (distance < 120) {
            riskScore += 30;
            reasons.push('Proximity alert: Obstacle within 1.2m (HC-SR04)');
        }
        if (gasLevel > 500) {
            riskScore += 25;
            reasons.push('High dust / toxic exhaust concentration (MQ-2)');
        }
        if (tilt > 15) {
            riskScore += 20;
            reasons.push('Excessive haul road incline angle > 15° (MPU6050)');
        }
        if (vibration > 0.7) {
            riskScore += 15;
            reasons.push('Severe ground shock / haul road corrugated impact');
        }

        riskScore = Math.min(100, riskScore);
        const riskLevel = riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';

        // GPS simulation around open-cast iron ore mine pit
        const lat = 22.1466 + Math.sin(t * 0.05) * 0.003;
        const lng = 85.4988 + Math.cos(t * 0.05) * 0.003;

        const currentReading = {
            vehicle_id: 'HEMM-01',
            temperature,
            humidity,
            gas_level: gasLevel,
            light_level: lightLevel,
            distance,
            acceleration,
            tilt,
            vibration_intensity: vibration,
            latitude: lat,
            longitude: lng,
            risk_level: riskLevel,
            risk_score: riskScore,
            risk_reasons: reasons,
            recorded_at: new Date().toISOString()
        };

        const demoAlerts = [
            {
                id: 101,
                vehicle_id: 'HEMM-01',
                alert_type: 'LOW_VISIBILITY_FOG',
                severity: 'HIGH',
                message: 'Severe fog in bench sector 4; visibility below 300 ADC',
                risk_score: 84,
                status: 'ACTIVE',
                created_at: new Date(Date.now() - 120000).toISOString()
            },
            {
                id: 102,
                vehicle_id: 'HEMM-02',
                alert_type: 'PROXIMITY_OBSTACLE',
                severity: 'MEDIUM',
                message: 'Obstacle detected within 1.4m of haul road berm',
                risk_score: 55,
                status: 'ACKNOWLEDGED',
                created_at: new Date(Date.now() - 600000).toISOString()
            },
            {
                id: 103,
                vehicle_id: 'HEMM-03',
                alert_type: 'DUST_SMOKE_ELEVATED',
                severity: 'LOW',
                message: 'Elevated dust after blast in western loading zone',
                risk_score: 32,
                status: 'RESOLVED',
                created_at: new Date(Date.now() - 1800000).toISOString()
            }
        ];

        state.alertsList = demoAlerts;

        return {
            system: {
                status: 'DEMO',
                timestamp: new Date().toISOString(),
                totalVehicles: 3,
                activeVehicles: 3,
                systemRiskLevel: riskLevel
            },
            vehicles: [
                {
                    vehicle: {
                        vehicle_id: 'HEMM-01',
                        name: 'Haul Truck Alpha',
                        type: 'CAT 777E 100-Ton Hauler',
                        status: 'ACTIVE',
                        created_at: '2026-01-10T08:00:00Z'
                    },
                    latestReading: currentReading,
                    sensorStatuses: {
                        visibility: lightLevel < 500 ? 'POOR' : 'GOOD',
                        gas: gasLevel > 500 ? 'WARNING' : 'NORMAL',
                        temperature: 'NORMAL',
                        humidity: isFoggy ? 'VERY HIGH' : 'NORMAL',
                        vibration: isBumpy ? 'STRONG' : 'NORMAL',
                        distance: distance < 120 ? 'CRITICAL' : 'CLEAR',
                        acceleration: isBumpy ? 'SUDDEN' : 'STABLE',
                        tilt: tilt > 15 ? 'HAZARDOUS' : 'LEVEL'
                    },
                    riskLevel: riskLevel,
                    riskScore: riskScore,
                    riskReasons: reasons,
                    activeAlerts: reasons.length > 0 ? 1 : 0,
                    lastUpdate: new Date().toISOString(),
                    isOnline: true
                },
                {
                    vehicle: {
                        vehicle_id: 'HEMM-02',
                        name: 'Excavator Bravo',
                        type: 'Komatsu PC2000 Shovel',
                        status: 'ACTIVE',
                        created_at: '2026-01-15T10:30:00Z'
                    },
                    latestReading: null,
                    sensorStatuses: null,
                    riskLevel: 'LOW',
                    riskScore: 18,
                    riskReasons: [],
                    activeAlerts: 0,
                    lastUpdate: new Date(Date.now() - 40000).toISOString(),
                    isOnline: true
                },
                {
                    vehicle: {
                        vehicle_id: 'HEMM-03',
                        name: 'Water Sprinkler Truck',
                        type: 'Volvo FMX 460 Dust Suppressor',
                        status: 'ACTIVE',
                        created_at: '2026-02-01T12:00:00Z'
                    },
                    latestReading: null,
                    sensorStatuses: null,
                    riskLevel: 'LOW',
                    riskScore: 22,
                    riskReasons: [],
                    activeAlerts: 0,
                    lastUpdate: new Date(Date.now() - 120000).toISOString(),
                    isOnline: false
                }
            ],
            recentAlerts: demoAlerts
        };
    }

    /**
     * Generate synthetic historical sensor readings for initial chart display
     */
    function generateMockHistory() {
        const history = [];
        const now = Date.now();
        for (let i = 25; i >= 0; i--) {
            const time = new Date(now - i * 5000).toISOString();
            const t = i * 0.25;
            history.push({
                recorded_at: time,
                temperature: (32 + Math.sin(t) * 3).toFixed(1),
                humidity: (70 + Math.cos(t) * 20).toFixed(1),
                gas_level: Math.round(220 + Math.sin(t * 1.5) * 180),
                light_level: Math.round(1100 + Math.sin(t) * 800),
                distance: Math.round(280 + Math.cos(t * 2) * 160),
                acceleration: (1.0 + Math.abs(Math.sin(t * 3)) * 1.8).toFixed(2),
                risk_score: Math.round(30 + Math.sin(t) * 35)
            });
        }
        return history;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
    }

    // Launch App
    init();
});
