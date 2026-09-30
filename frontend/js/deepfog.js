/**
 * DEEPFOG v2.0 — Complete Dashboard Controller
 * Intelligent Mine Vehicle Safety & Low-Visibility Monitoring System
 * 
 * This is a PROTOTYPE / DEMONSTRATION system.
 * All sensor data shown is simulated for demonstration purposes.
 * Safe-speed recommendations are driver decision-support only.
 */

;(() => {
    'use strict';

    /* ============================================================
       CONFIGURATION
       ============================================================ */
    const CONFIG = {
        updateInterval: 1500,      // ms between data updates
        chartMaxPoints: 40,        // max points on analytics chart
        eventLogMax: 60,           // max events in log
        radarRange: 200,           // meters
        maxSpeed: 60,              // km/h max gauge
        toastDuration: 5000,       // ms toast display
        v2vVehicleCount: 5,        // nearby vehicles to simulate
    };

    /* ============================================================
       STATE
       ============================================================ */
    const state = {
        uptime: 0,
        tickCount: 0,
        currentSpeed: 22,
        recommendedSpeed: 25,
        zoneLimit: 40,
        visibility: 180,
        fogDensity: 35,
        dustLevel: 22,
        rainIntensity: 0,
        ambientTemp: 31.5,
        humidity: 68,
        ambientLight: 4500,
        riskScore: 28,
        riskLevel: 'LOW',
        riskTrend: 'stable',
        fuel: 72,
        engineRPM: 1450,
        payload: 182,
        lat: 22.1466,
        lng: 85.4988,
        heading: 45,
        pitch: 2.1,
        roll: 0.8,
        nearbyVehicles: [],
        events: [],
        chartData: { speed: [], visibility: [], risk: [], labels: [] },
        activeChartType: 'speed',
        analyticsChart: null,
    };

    /* ============================================================
       NEARBY VEHICLES SEED DATA
       ============================================================ */
    const vehicleTemplates = [
        { id: 'HMV-018', type: 'Haul Truck 150T', icon: '🚛', baseDist: 85, baseSpeed: 18, bearing: 35 },
        { id: 'HMV-027', type: 'Haul Truck 240T', icon: '🚛', baseDist: 140, baseSpeed: 15, bearing: 160 },
        { id: 'WTL-003', type: 'Wheel Loader', icon: '🏗️', baseDist: 55, baseSpeed: 8, bearing: 275 },
        { id: 'DZR-011', type: 'Dozer D9', icon: '🚜', baseDist: 120, baseSpeed: 6, bearing: 310 },
        { id: 'GRD-007', type: 'Motor Grader', icon: '🔧', baseDist: 195, baseSpeed: 12, bearing: 95 },
        { id: 'HMV-051', type: 'Haul Truck 240T', icon: '🚛', baseDist: 170, baseSpeed: 20, bearing: 210 },
        { id: 'EXC-002', type: 'Excavator', icon: '⛏️', baseDist: 45, baseSpeed: 0, bearing: 15 },
    ];

    /* ============================================================
       INITIALIZATION
       ============================================================ */
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[DEEPFOG] Initializing Mine Safety Dashboard v2.0...');
        
        initFogCanvas();
        initClock();
        initAnalyticsChart();
        initChartTabs();
        initEventFilter();
        generateInitialEvents();
        generateNearbyVehicles();

        // Start main update loop
        updateDashboard();
        setInterval(updateDashboard, CONFIG.updateInterval);
        
        // Uptime counter
        setInterval(() => {
            state.uptime++;
            updateUptime();
        }, 1000);

        console.log('[DEEPFOG] Dashboard initialized successfully.');
    });

    /* ============================================================
       FOG PARTICLE BACKGROUND
       ============================================================ */
    function initFogCanvas() {
        const canvas = document.getElementById('fogCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        let particles = [];
        const PARTICLE_COUNT = 50;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        class FogParticle {
            constructor() { this.reset(); }
            reset() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 120 + 40;
                this.speedX = (Math.random() - 0.5) * 0.3;
                this.speedY = (Math.random() - 0.5) * 0.15;
                this.opacity = Math.random() * 0.04 + 0.01;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                if (this.x < -this.size || this.x > canvas.width + this.size ||
                    this.y < -this.size || this.y > canvas.height + this.size) {
                    this.reset();
                }
            }
            draw() {
                const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
                gradient.addColorStop(0, `rgba(0, 180, 255, ${this.opacity})`);
                gradient.addColorStop(1, 'rgba(0, 180, 255, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push(new FogParticle());
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => { p.update(); p.draw(); });
            requestAnimationFrame(animate);
        }
        animate();
    }

    /* ============================================================
       CLOCK
       ============================================================ */
    function initClock() {
        updateClock();
        setInterval(updateClock, 1000);
    }

    function updateClock() {
        const now = new Date();
        const dateEl = document.getElementById('headerDate');
        const timeEl = document.getElementById('headerTime');
        if (dateEl) dateEl.textContent = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
        if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-IN', { hour12: false });
    }

    function updateUptime() {
        const h = String(Math.floor(state.uptime / 3600)).padStart(2, '0');
        const m = String(Math.floor((state.uptime % 3600) / 60)).padStart(2, '0');
        const s = String(state.uptime % 60).padStart(2, '0');
        const el = document.getElementById('systemUptime');
        if (el) el.textContent = `${h}:${m}:${s}`;
    }

    /* ============================================================
       MAIN UPDATE LOOP
       ============================================================ */
    function updateDashboard() {
        state.tickCount++;
        
        simulateSensorData();
        calculateRisk();
        calculateRecommendedSpeed();
        updateNearbyVehicles();

        // Update all UI sections
        updateMetricsStrip();
        updateVehiclePanel();
        updateSensorFusionPanel();
        updateSpeedGauge();
        updateRadarCanvas();
        updateRiskPanel();
        updateV2VPanel();
        updateAnalyticsData();

        // Generate occasional events
        if (state.tickCount % 3 === 0) generateRandomEvent();
        
        // Occasional toast notification
        if (state.tickCount % 12 === 0) generateToast();
    }

    /* ============================================================
       SENSOR DATA SIMULATION
       ============================================================ */
    function simulateSensorData() {
        const t = state.tickCount;
        
        // Visibility (meters) — oscillates with occasional drops
        const visCycle = Math.sin(t * 0.05) * 60 + Math.sin(t * 0.13) * 30;
        state.visibility = clamp(150 + visCycle + jitter(20), 20, 400);
        
        // Fog density (%) — inversely correlated with visibility
        state.fogDensity = clamp(100 - (state.visibility / 4) + jitter(8), 0, 100);
        
        // Dust level
        state.dustLevel = clamp(20 + Math.sin(t * 0.08) * 15 + jitter(5), 0, 100);
        
        // Rain intensity (0-100, with occasional storms)
        const rainChance = Math.sin(t * 0.02);
        state.rainIntensity = rainChance > 0.7 ? clamp(30 + jitter(20), 0, 100) : clamp(jitter(5), 0, 15);
        
        // Temperature
        state.ambientTemp = clamp(30 + Math.sin(t * 0.03) * 4 + jitter(1), 20, 48);
        
        // Humidity
        state.humidity = clamp(65 + Math.sin(t * 0.04) * 12 + jitter(3), 30, 98);
        
        // Ambient light (lux)
        state.ambientLight = clamp(4000 + Math.sin(t * 0.06) * 3000 + jitter(500), 50, 80000);
        
        // Vehicle dynamics
        state.currentSpeed = clamp(22 + Math.sin(t * 0.07) * 8 + jitter(3), 0, 55);
        state.engineRPM = clamp(1400 + Math.sin(t * 0.09) * 200 + jitter(50), 800, 2200);
        state.fuel = clamp(state.fuel - 0.008, 10, 100);
        
        // GPS drift simulation
        state.lat += (Math.random() - 0.5) * 0.00005;
        state.lng += (Math.random() - 0.5) * 0.00005;
        state.heading = (state.heading + jitter(2) + 360) % 360;
        
        // IMU
        state.pitch = clamp(2 + Math.sin(t * 0.1) * 1.5 + jitter(0.3), -8, 12);
        state.roll = clamp(0.5 + Math.sin(t * 0.12) * 0.8 + jitter(0.2), -5, 5);
    }

    /* ============================================================
       RISK CALCULATION
       ============================================================ */
    function calculateRisk() {
        // Factor scores (0-100, higher = more risky)
        const visRisk = clamp(100 - (state.visibility / 4), 0, 100);
        const proxRisk = calculateProximityRisk();
        const roadEdgeRisk = clamp(30 + Math.sin(state.tickCount * 0.06) * 20 + jitter(5), 0, 100);
        const speedRisk = (state.currentSpeed / CONFIG.maxSpeed) * 100;
        const weatherRisk = (state.fogDensity * 0.4 + state.dustLevel * 0.2 + state.rainIntensity * 0.3 + (state.humidity > 80 ? 10 : 0));
        const terrainRisk = clamp(Math.abs(state.pitch) * 5 + Math.abs(state.roll) * 8, 0, 100);

        // Weighted risk score
        state.riskScore = clamp(Math.round(
            visRisk * 0.30 +
            proxRisk * 0.25 +
            speedRisk * 0.15 +
            weatherRisk * 0.15 +
            roadEdgeRisk * 0.10 +
            terrainRisk * 0.05
        ), 0, 100);

        // Risk factors for display
        state.riskFactors = {
            visibility: Math.round(visRisk),
            proximity: Math.round(proxRisk),
            roadEdge: Math.round(roadEdgeRisk),
            speed: Math.round(speedRisk),
            weather: Math.round(weatherRisk),
            terrain: Math.round(terrainRisk)
        };

        // Determine risk level
        const prevLevel = state.riskLevel;
        if (state.riskScore >= 75) state.riskLevel = 'CRITICAL';
        else if (state.riskScore >= 55) state.riskLevel = 'HIGH';
        else if (state.riskScore >= 35) state.riskLevel = 'MEDIUM';
        else state.riskLevel = 'LOW';

        // Trend
        if (state.chartData.risk.length >= 3) {
            const recent = state.chartData.risk.slice(-3);
            const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
            if (state.riskScore > avg + 3) state.riskTrend = 'worsening';
            else if (state.riskScore < avg - 3) state.riskTrend = 'improving';
            else state.riskTrend = 'stable';
        }

        // Alert on level change
        if (prevLevel !== state.riskLevel && state.tickCount > 2) {
            const isWorse = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(state.riskLevel) >
                            ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(prevLevel);
            if (isWorse) {
                showToast(
                    `Risk Level: ${state.riskLevel}`,
                    `Overall risk escalated from ${prevLevel} to ${state.riskLevel} (Score: ${state.riskScore}/100)`,
                    state.riskLevel === 'CRITICAL' ? 'danger' : 'warning',
                    state.riskLevel === 'CRITICAL' ? '🚨' : '⚠️'
                );
            }
        }
    }

    function calculateProximityRisk() {
        if (!state.nearbyVehicles.length) return 0;
        const closestDist = Math.min(...state.nearbyVehicles.map(v => v.distance));
        if (closestDist < 30) return 100;
        if (closestDist < 50) return 75;
        if (closestDist < 80) return 50;
        if (closestDist < 120) return 30;
        return 10;
    }

    /* ============================================================
       SAFE SPEED RECOMMENDATION
       ============================================================ */
    function calculateRecommendedSpeed() {
        let maxSafe = state.zoneLimit;
        
        // Visibility reduction
        if (state.visibility < 50) maxSafe = Math.min(maxSafe, 8);
        else if (state.visibility < 100) maxSafe = Math.min(maxSafe, 15);
        else if (state.visibility < 200) maxSafe = Math.min(maxSafe, 25);
        else if (state.visibility < 300) maxSafe = Math.min(maxSafe, 35);
        
        // Proximity reduction
        const closestDist = state.nearbyVehicles.length > 0
            ? Math.min(...state.nearbyVehicles.map(v => v.distance))
            : 999;
        if (closestDist < 30) maxSafe = Math.min(maxSafe, 5);
        else if (closestDist < 60) maxSafe = Math.min(maxSafe, 15);
        else if (closestDist < 100) maxSafe = Math.min(maxSafe, 25);
        
        // Rain reduction
        if (state.rainIntensity > 60) maxSafe = Math.min(maxSafe, 15);
        else if (state.rainIntensity > 30) maxSafe = Math.min(maxSafe, 25);
        
        // Gradient reduction
        if (Math.abs(state.pitch) > 5) maxSafe = Math.min(maxSafe, 20);
        
        state.recommendedSpeed = Math.max(5, Math.round(maxSafe));
    }

    /* ============================================================
       NEARBY VEHICLES SIMULATION
       ============================================================ */
    function generateNearbyVehicles() {
        const count = CONFIG.v2vVehicleCount;
        const selected = vehicleTemplates.sort(() => Math.random() - 0.5).slice(0, count);
        state.nearbyVehicles = selected.map(v => ({
            ...v,
            distance: v.baseDist + jitter(20),
            speed: Math.max(0, v.baseSpeed + jitter(3)),
            bearing: (v.bearing + jitter(5) + 360) % 360,
            lastUpdate: Date.now(),
            alert: false
        }));
    }

    function updateNearbyVehicles() {
        state.nearbyVehicles.forEach(v => {
            v.distance = clamp(v.baseDist + Math.sin(state.tickCount * 0.1 + v.bearing) * 30 + jitter(5), 15, 250);
            v.speed = Math.max(0, v.baseSpeed + Math.sin(state.tickCount * 0.08) * 3 + jitter(1));
            v.bearing = (v.bearing + jitter(1) + 360) % 360;
            v.alert = v.distance < 50;
            v.lastUpdate = Date.now();
        });
    }

    /* ============================================================
       UI UPDATE: METRICS STRIP
       ============================================================ */
    function updateMetricsStrip() {
        setText('visibilityDistance', Math.round(state.visibility));
        setBar('visibilityBar', clamp(state.visibility / 4, 0, 100));
        
        setText('fogDensity', Math.round(state.fogDensity));
        setBar('fogBar', state.fogDensity);
        
        setText('dustLevel', Math.round(state.dustLevel));
        setBar('dustBar', state.dustLevel);
        
        setText('ambientTemp', state.ambientTemp.toFixed(1));
        setBar('tempBar', clamp((state.ambientTemp - 15) / 35 * 100, 0, 100));
        
        setText('humidityVal', Math.round(state.humidity));
        setBar('humidityBar', state.humidity);
        
        const rainLabel = state.rainIntensity < 5 ? 'None' : state.rainIntensity < 25 ? 'Light' : state.rainIntensity < 55 ? 'Moderate' : 'Heavy';
        setText('rainIntensity', rainLabel);
        setBar('rainBar', state.rainIntensity);
        
        setText('ambientLight', formatNumber(Math.round(state.ambientLight)));
        setBar('lightBar', clamp(state.ambientLight / 800, 0, 100));
    }

    /* ============================================================
       UI UPDATE: VEHICLE PANEL
       ============================================================ */
    function updateVehiclePanel() {
        setText('vehicleId', 'HMV-042');
        setText('vehicleType', '240T Haul Truck');
        setText('vehicleOperator', 'Demo Operator');
        setText('vehicleShift', 'Day Shift — A');
        setText('vehiclePayload', `${Math.round(state.payload)} T`);
        setText('fuelValue', `${Math.round(state.fuel)}%`);
        setBar('fuelBar', state.fuel);
        setText('engineRPM', formatNumber(Math.round(state.engineRPM)));
        setText('vehicleGPS', `${state.lat.toFixed(4)}° N, ${state.lng.toFixed(4)}° E`);
    }

    /* ============================================================
       UI UPDATE: SENSOR FUSION PANEL
       ============================================================ */
    function updateSensorFusionPanel() {
        const sensors = [
            { key: 'lidar', quality: clamp(85 + Math.sin(state.tickCount * 0.07) * 8 + jitter(2), 60, 99),
              detail: `${Math.round(180 + jitter(20))}m range · ${Math.round(145 + jitter(10))}k pts/s` },
            { key: 'radar', quality: clamp(88 + Math.sin(state.tickCount * 0.05) * 6 + jitter(2), 65, 99),
              detail: `${Math.round(140 + jitter(10))}m range · ${Math.round(2 + Math.random() * 4)} targets` },
            { key: 'camera', quality: clamp(70 + Math.sin(state.tickCount * 0.09) * 15 + jitter(3), 30, 99),
              detail: `1080p · ${Math.round(28 + jitter(2))}fps` },
            { key: 'thermal', quality: clamp(92 + Math.sin(state.tickCount * 0.04) * 4 + jitter(1), 75, 99),
              detail: `640×480 · ${Math.round(8 + jitter(1))}fps` },
            { key: 'gps', quality: clamp(82 + Math.sin(state.tickCount * 0.06) * 8 + jitter(2), 50, 99),
              detail: `${Math.round(10 + Math.random() * 4)} sats · ±${(1 + Math.random() * 2).toFixed(1)}m` },
            { key: 'imu', quality: clamp(95 + jitter(3), 85, 99),
              detail: `Pitch ${state.pitch.toFixed(1)}° · Roll ${state.roll.toFixed(1)}°` },
            { key: 'ultrasonic', quality: clamp(88 + Math.sin(state.tickCount * 0.08) * 6 + jitter(2), 60, 99),
              detail: `Range: ${Math.round(300 + jitter(80))} cm` },
        ];

        let totalQuality = 0;
        sensors.forEach(s => {
            const qualityEl = document.getElementById(`${s.key}Quality`);
            const pctEl = document.getElementById(`${s.key}Pct`);
            const detailEl = document.getElementById(`${s.key}Detail`);
            const statusEl = document.getElementById(`${s.key}Status`);
            
            if (qualityEl) qualityEl.style.width = `${s.quality}%`;
            if (pctEl) pctEl.textContent = `${Math.round(s.quality)}%`;
            if (detailEl) detailEl.textContent = s.detail;
            
            if (statusEl) {
                statusEl.className = 'si-status';
                if (s.quality >= 70) statusEl.classList.add('online');
                else if (s.quality >= 40) statusEl.classList.add('warning');
                else statusEl.classList.add('offline');
            }

            // Color quality bar based on value
            if (qualityEl) {
                if (s.quality >= 70) qualityEl.style.background = 'var(--color-success)';
                else if (s.quality >= 40) qualityEl.style.background = 'var(--color-warning)';
                else qualityEl.style.background = 'var(--color-danger)';
            }

            totalQuality += s.quality;
        });

        const avgQuality = Math.round(totalQuality / sensors.length);
        const fusionBadge = document.getElementById('sensorFusionScore');
        if (fusionBadge) {
            fusionBadge.textContent = `${avgQuality}% fused`;
            fusionBadge.style.color = avgQuality >= 70 ? 'var(--color-success)' : avgQuality >= 40 ? 'var(--color-warning)' : 'var(--color-danger)';
        }
    }

    /* ============================================================
       UI UPDATE: SPEED GAUGE
       ============================================================ */
    function updateSpeedGauge() {
        const speed = state.currentSpeed;
        const pct = clamp(speed / CONFIG.maxSpeed, 0, 1);
        
        // Update arc (stroke-dashoffset, total arc length ≈ 345)
        const arcLength = 345;
        const offset = arcLength * (1 - pct);
        const arc = document.getElementById('gaugeArc');
        if (arc) arc.setAttribute('stroke-dashoffset', offset);
        
        // Update recommended speed marker position
        updateRecommendedMarker();
        
        // Update text
        const speedEl = document.getElementById('currentSpeed');
        if (speedEl) {
            speedEl.textContent = Math.round(speed);
            if (speed > state.recommendedSpeed) {
                speedEl.style.color = '#ef4444';
                speedEl.style.textShadow = '0 0 20px rgba(239,68,68,0.3)';
            } else {
                speedEl.style.color = 'var(--text-primary)';
                speedEl.style.textShadow = '0 0 20px rgba(0,212,255,0.2)';
            }
        }
        
        setText('currentSpeedVal', `${Math.round(speed)} km/h`);
        setText('recommendedSpeed', `${state.recommendedSpeed} km/h`);
        setText('zoneLimitSpeed', `${state.zoneLimit} km/h`);
        
        // Speed factors
        const visLabel = state.visibility < 100 ? 'Reduced' : state.visibility < 200 ? 'Moderate' : 'Good';
        setText('sfVisibility', visLabel);
        colorize('sfVisibility', state.visibility < 100 ? 'danger' : state.visibility < 200 ? 'warning' : 'success');
        
        const roadLabel = state.riskFactors?.roadEdge < 30 ? 'Clear' : state.riskFactors?.roadEdge < 60 ? 'Caution' : 'Narrow';
        setText('sfRoad', roadLabel);
        colorize('sfRoad', state.riskFactors?.roadEdge < 30 ? 'success' : state.riskFactors?.roadEdge < 60 ? 'warning' : 'danger');
        
        const proxLabel = state.riskFactors?.proximity < 30 ? 'Clear' : state.riskFactors?.proximity < 60 ? 'Moderate' : 'Close';
        setText('sfProximity', proxLabel);
        colorize('sfProximity', state.riskFactors?.proximity < 30 ? 'success' : state.riskFactors?.proximity < 60 ? 'warning' : 'danger');
        
        setText('sfGradient', `${state.pitch.toFixed(1)}°`);
        colorize('sfGradient', Math.abs(state.pitch) > 5 ? 'warning' : 'success');
    }

    function updateRecommendedMarker() {
        const marker = document.getElementById('recommendedMarker');
        if (!marker) return;
        
        const pct = clamp(state.recommendedSpeed / CONFIG.maxSpeed, 0, 1);
        // Approximate position on the arc (from -150° to +150°, mapped to 0-1)
        const angle = -150 + pct * 300;
        const rad = angle * Math.PI / 180;
        const cx = 140 + 110 * Math.cos(rad - Math.PI / 2 + Math.PI);
        const cy = 160 + 110 * Math.sin(rad - Math.PI / 2 + Math.PI);
        
        marker.setAttribute('cx', cx);
        marker.setAttribute('cy', Math.min(cy, 160));
    }

    /* ============================================================
       UI UPDATE: RADAR CANVAS
       ============================================================ */
    function updateRadarCanvas() {
        const canvas = document.getElementById('radarCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const maxR = Math.min(cx, cy) - 20;

        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = '#060a13';
        ctx.fillRect(0, 0, w, h);

        // Grid rings
        const rings = [50, 100, 150, 200];
        rings.forEach(dist => {
            const r = (dist / CONFIG.radarRange) * maxR;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Distance label
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.font = '10px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(`${dist}m`, cx + r - 16, cy - 4);
        });

        // Cross-hairs
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, 10);
        ctx.lineTo(cx, h - 10);
        ctx.moveTo(10, cy);
        ctx.lineTo(w - 10, cy);
        ctx.stroke();

        // Compass directions
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '600 11px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('N', cx, 18);
        ctx.fillText('S', cx, h - 8);
        ctx.fillText('E', w - 10, cy + 4);
        ctx.fillText('W', 14, cy + 4);

        // Visibility range circle (semi-transparent fill)
        const visR = (state.visibility / CONFIG.radarRange) * maxR;
        const visGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, visR);
        visGrad.addColorStop(0, 'rgba(0, 212, 255, 0.03)');
        visGrad.addColorStop(0.8, 'rgba(0, 212, 255, 0.02)');
        visGrad.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx.fillStyle = visGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, visR, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(cx, cy, visR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Radar sweep line
        const sweepAngle = (Date.now() / 2000) % (Math.PI * 2);
        const sweepGrad = ctx.createLinearGradient(
            cx, cy,
            cx + maxR * Math.cos(sweepAngle),
            cy + maxR * Math.sin(sweepAngle)
        );
        sweepGrad.addColorStop(0, 'rgba(0, 212, 255, 0.3)');
        sweepGrad.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx.strokeStyle = sweepGrad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + maxR * Math.cos(sweepAngle), cy + maxR * Math.sin(sweepAngle));
        ctx.stroke();

        // Sweep trail (fading arc)
        for (let i = 0; i < 30; i++) {
            const a = sweepAngle - (i * 0.015);
            const opacity = 0.08 * (1 - i / 30);
            ctx.strokeStyle = `rgba(0, 212, 255, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + maxR * Math.cos(a), cy + maxR * Math.sin(a));
            ctx.stroke();
        }

        // Road edges (two curved lines)
        drawRoadEdges(ctx, cx, cy, maxR);

        // Nearby vehicles
        state.nearbyVehicles.forEach(v => {
            const bearingRad = (v.bearing - 90) * Math.PI / 180; // -90 to put N at top
            const distR = (v.distance / CONFIG.radarRange) * maxR;
            const vx = cx + distR * Math.cos(bearingRad);
            const vy = cy + distR * Math.sin(bearingRad);

            // Vehicle dot
            const dotColor = v.alert ? '#ef4444' : '#f59e0b';
            ctx.beginPath();
            ctx.arc(vx, vy, v.alert ? 6 : 5, 0, Math.PI * 2);
            ctx.fillStyle = dotColor;
            ctx.fill();
            
            // Glow
            if (v.alert) {
                ctx.beginPath();
                ctx.arc(vx, vy, 12, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
                ctx.fill();
            }
            
            // Label
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '500 9px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(v.id, vx, vy - 10);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '9px JetBrains Mono';
            ctx.fillText(`${Math.round(v.distance)}m`, vx, vy + 16);
        });

        // Center vehicle (self)
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#00d4ff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Heading indicator
        const headRad = (state.heading - 90) * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(cx + 8 * Math.cos(headRad), cy + 8 * Math.sin(headRad));
        ctx.lineTo(cx + 22 * Math.cos(headRad), cy + 22 * Math.sin(headRad));
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function drawRoadEdges(ctx, cx, cy, maxR) {
        const roadWidth = 50; // meters
        const roadR = (roadWidth / CONFIG.radarRange) * maxR;
        
        // Left edge
        ctx.beginPath();
        ctx.moveTo(cx - roadR, cy + maxR);
        ctx.quadraticCurveTo(cx - roadR - 10, cy, cx - roadR + 5, cy - maxR);
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Right edge
        ctx.beginPath();
        ctx.moveTo(cx + roadR, cy + maxR);
        ctx.quadraticCurveTo(cx + roadR + 10, cy, cx + roadR - 5, cy - maxR);
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Road center line (dashed)
        ctx.beginPath();
        ctx.moveTo(cx, cy + maxR);
        ctx.lineTo(cx, cy - maxR);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 12]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /* ============================================================
       UI UPDATE: RISK PANEL
       ============================================================ */
    function updateRiskPanel() {
        // Risk ring arc
        const arcEl = document.getElementById('riskArc');
        if (arcEl) {
            const pct = state.riskScore / 100;
            const totalLength = 327;
            arcEl.setAttribute('stroke-dashoffset', totalLength * (1 - pct));
            
            // Color based on risk
            const gradEl = document.getElementById('riskGrad');
            if (gradEl) {
                const stops = gradEl.querySelectorAll('stop');
                if (state.riskScore < 35) {
                    stops[0]?.setAttribute('stop-color', '#22c55e');
                    stops[1]?.setAttribute('stop-color', '#14b8a6');
                } else if (state.riskScore < 55) {
                    stops[0]?.setAttribute('stop-color', '#f59e0b');
                    stops[1]?.setAttribute('stop-color', '#d97706');
                } else if (state.riskScore < 75) {
                    stops[0]?.setAttribute('stop-color', '#ef4444');
                    stops[1]?.setAttribute('stop-color', '#dc2626');
                } else {
                    stops[0]?.setAttribute('stop-color', '#ff1a1a');
                    stops[1]?.setAttribute('stop-color', '#dc2626');
                }
            }
        }

        setText('riskScore', state.riskScore);
        setText('riskLevelText', state.riskLevel);

        const badgeEl = document.getElementById('riskLevelBadge');
        if (badgeEl) {
            badgeEl.className = 'risk-level-badge';
            if (state.riskLevel === 'MEDIUM') badgeEl.classList.add('medium');
            else if (state.riskLevel === 'HIGH') badgeEl.classList.add('high');
            else if (state.riskLevel === 'CRITICAL') badgeEl.classList.add('critical');
        }

        // Trend
        const arrows = { improving: '↓', worsening: '↑', stable: '→' };
        const trendColors = { improving: 'var(--color-success)', worsening: 'var(--color-danger)', stable: 'var(--text-muted)' };
        setText('trendArrow', arrows[state.riskTrend] || '→');
        setText('trendLabel', state.riskTrend.charAt(0).toUpperCase() + state.riskTrend.slice(1));
        const arrowEl = document.getElementById('trendArrow');
        if (arrowEl) arrowEl.style.color = trendColors[state.riskTrend] || 'inherit';

        // Risk factors
        if (state.riskFactors) {
            const factors = ['visibility', 'proximity', 'roadEdge', 'speed', 'weather', 'terrain'];
            const factorIds = ['rfVisibility', 'rfProximity', 'rfRoadEdge', 'rfSpeed', 'rfWeather', 'rfTerrain'];
            
            factors.forEach((f, i) => {
                const val = state.riskFactors[f] || 0;
                const fillEl = document.getElementById(factorIds[i]);
                const valEl = document.getElementById(factorIds[i] + 'Val');
                
                if (fillEl) {
                    fillEl.style.width = `${val}%`;
                    if (val < 35) fillEl.style.background = 'var(--color-success)';
                    else if (val < 60) fillEl.style.background = 'var(--color-warning)';
                    else fillEl.style.background = 'var(--color-danger)';
                }
                if (valEl) valEl.textContent = `${val}%`;
            });
        }

        // Alert count
        const activeAlerts = state.nearbyVehicles.filter(v => v.alert).length + (state.riskLevel === 'HIGH' || state.riskLevel === 'CRITICAL' ? 1 : 0);
        setText('alertCount', activeAlerts);
        const countEl = document.getElementById('alertCount');
        if (countEl) countEl.setAttribute('data-count', activeAlerts);
    }

    /* ============================================================
       UI UPDATE: V2V PANEL
       ============================================================ */
    function updateV2VPanel() {
        setText('v2vCount', `${state.nearbyVehicles.length} nearby`);
        
        const list = document.getElementById('v2vList');
        if (!list) return;

        // Only rebuild if count changed
        if (list.children.length !== state.nearbyVehicles.length) {
            list.innerHTML = '';
            state.nearbyVehicles.forEach(v => {
                const item = document.createElement('div');
                item.className = 'v2v-item';
                item.dataset.vehicleId = v.id;
                item.innerHTML = `
                    <div class="v2v-icon">${v.icon}</div>
                    <div class="v2v-info">
                        <div class="v2v-name">${v.id} <span class="v2v-type">${v.type}</span></div>
                        <div class="v2v-meta">
                            <span class="v2v-speed-val">${Math.round(v.speed)} km/h</span>
                            <span class="v2v-heading">Hdg ${Math.round(v.bearing)}°</span>
                        </div>
                    </div>
                    <div class="v2v-distance">
                        <span class="v2v-dist-val">${Math.round(v.distance)}m</span>
                        <span class="v2v-bearing">${getBearingLabel(v.bearing)}</span>
                    </div>
                `;
                list.appendChild(item);
            });
        } else {
            // Update existing items
            state.nearbyVehicles.forEach(v => {
                const item = list.querySelector(`[data-vehicle-id="${v.id}"]`);
                if (!item) return;
                
                const distEl = item.querySelector('.v2v-dist-val');
                const speedEl = item.querySelector('.v2v-speed-val');
                const bearingEl = item.querySelector('.v2v-bearing');
                const headingEl = item.querySelector('.v2v-heading');
                
                if (distEl) {
                    distEl.textContent = `${Math.round(v.distance)}m`;
                    distEl.style.color = v.alert ? 'var(--color-danger)' : 'var(--text-primary)';
                }
                if (speedEl) speedEl.textContent = `${Math.round(v.speed)} km/h`;
                if (bearingEl) bearingEl.textContent = getBearingLabel(v.bearing);
                if (headingEl) headingEl.textContent = `Hdg ${Math.round(v.bearing)}°`;

                // Alert indicator
                if (v.alert) {
                    if (!item.querySelector('.v2v-alert')) {
                        const alertBadge = document.createElement('span');
                        alertBadge.className = 'v2v-alert';
                        alertBadge.textContent = 'CLOSE';
                        item.querySelector('.v2v-distance')?.appendChild(alertBadge);
                    }
                } else {
                    item.querySelector('.v2v-alert')?.remove();
                }
            });
        }
    }

    function getBearingLabel(bearing) {
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return dirs[Math.round(bearing / 45) % 8];
    }

    /* ============================================================
       ANALYTICS CHART
       ============================================================ */
    function initAnalyticsChart() {
        const canvas = document.getElementById('analyticsChart');
        if (!canvas || typeof Chart === 'undefined') return;

        // Seed initial data
        for (let i = 0; i < 20; i++) {
            const label = new Date(Date.now() - (20 - i) * CONFIG.updateInterval).toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            state.chartData.labels.push(label);
            state.chartData.speed.push(20 + Math.random() * 10);
            state.chartData.visibility.push(120 + Math.random() * 80);
            state.chartData.risk.push(20 + Math.random() * 20);
        }

        state.analyticsChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: state.chartData.labels,
                datasets: [{
                    label: 'Speed (km/h)',
                    data: state.chartData.speed,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.05)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#182340',
                        titleColor: '#e4eaf6',
                        bodyColor: '#7b8ba8',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        padding: 10,
                        titleFont: { family: 'Inter', size: 12, weight: '600' },
                        bodyFont: { family: 'JetBrains Mono', size: 11 },
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#4a5670', font: { family: 'JetBrains Mono', size: 9 }, maxRotation: 0, maxTicksLimit: 8 },
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        border: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { color: '#4a5670', font: { family: 'JetBrains Mono', size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        border: { color: 'rgba(255,255,255,0.05)' }
                    }
                },
                animation: { duration: 500 }
            }
        });
    }

    function initChartTabs() {
        document.querySelectorAll('.chart-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                state.activeChartType = tab.dataset.chart;
                switchChartData();
            });
        });
    }

    function switchChartData() {
        if (!state.analyticsChart) return;
        
        const chartConfigs = {
            speed: { label: 'Speed (km/h)', color: '#00d4ff', data: state.chartData.speed },
            visibility: { label: 'Visibility (m)', color: '#22c55e', data: state.chartData.visibility },
            risk: { label: 'Risk Score', color: '#f59e0b', data: state.chartData.risk },
        };

        const config = chartConfigs[state.activeChartType];
        if (!config) return;

        state.analyticsChart.data.datasets[0].label = config.label;
        state.analyticsChart.data.datasets[0].data = config.data;
        state.analyticsChart.data.datasets[0].borderColor = config.color;
        state.analyticsChart.data.datasets[0].backgroundColor = config.color.replace(')', ', 0.05)').replace('rgb', 'rgba');
        state.analyticsChart.update('none');
    }

    function updateAnalyticsData() {
        const now = new Date();
        const label = now.toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        state.chartData.labels.push(label);
        state.chartData.speed.push(state.currentSpeed);
        state.chartData.visibility.push(state.visibility);
        state.chartData.risk.push(state.riskScore);

        // Trim to max points
        if (state.chartData.labels.length > CONFIG.chartMaxPoints) {
            state.chartData.labels.shift();
            state.chartData.speed.shift();
            state.chartData.visibility.shift();
            state.chartData.risk.shift();
        }

        if (state.analyticsChart) {
            state.analyticsChart.data.labels = state.chartData.labels;
            switchChartData();
            state.analyticsChart.update('none');
        }
    }

    /* ============================================================
       EVENT LOG
       ============================================================ */
    function generateInitialEvents() {
        const initialEvents = [
            { msg: 'DEEPFOG system initialized — all sensors operational', category: 'system', severity: 'success' },
            { msg: 'GPS lock acquired — 12 satellites, ±1.2m accuracy', category: 'sensor', severity: 'info' },
            { msg: 'V2V mesh network connected — 5 vehicles in range', category: 'communication', severity: 'info' },
            { msg: 'LiDAR point cloud calibration complete', category: 'sensor', severity: 'success' },
            { msg: 'Road edge detection model loaded (demo weights)', category: 'navigation', severity: 'info' },
            { msg: 'Safe-speed advisory engine started — driver decision-support mode', category: 'safety', severity: 'info' },
            { msg: 'Fog density sensor initialized — current reading 35%', category: 'sensor', severity: 'info' },
            { msg: 'Mine-wide risk aggregation service connected', category: 'system', severity: 'success' },
        ];

        initialEvents.forEach((e, i) => {
            const time = new Date(Date.now() - (initialEvents.length - i) * 3000);
            state.events.push({ ...e, time });
        });

        renderEventLog();
    }

    const eventTemplates = {
        sensor: [
            'LiDAR range updated: {val}m effective range',
            'Camera visibility score adjusted to {val}%',
            'IMU pitch reading: {val}° — within normal range',
            'Ultrasonic obstacle detection: nearest object at {val}cm',
            'Thermal camera detected warm body at {val}m bearing 045°',
            'GPS accuracy improved to ±{val}m with {val2} satellites',
        ],
        navigation: [
            'Road edge confidence: {val}% — lane position nominal',
            'Approaching haul road junction in {val}m',
            'Grade change detected: {val}% incline ahead',
            'Route waypoint passed — {val}m to next checkpoint',
        ],
        safety: [
            'Visibility dropped below {val}m — speed advisory reduced',
            'Proximity alert: Vehicle {veh} at {val}m closing',
            'Speed exceeds recommended limit: {val} km/h vs {val2} km/h advisory',
            'Fog density increase detected: now {val}%',
        ],
        communication: [
            'V2V heartbeat received from {veh}',
            'Vehicle {veh} reported position update at {val}m',
            'Mesh network latency: {val}ms — link quality good',
            'New vehicle entered V2V range: {veh} at {val}m',
        ],
        system: [
            'Sensor fusion confidence: {val}% — all sources nominal',
            'Data packet transmitted to mine control center',
            'Risk calculation cycle completed in {val}ms',
            'System health check passed — {val} sensors active',
        ]
    };

    function generateRandomEvent() {
        const categories = Object.keys(eventTemplates);
        const category = categories[Math.floor(Math.random() * categories.length)];
        const templates = eventTemplates[category];
        let msg = templates[Math.floor(Math.random() * templates.length)];

        // Fill placeholders
        const veh = state.nearbyVehicles.length > 0
            ? state.nearbyVehicles[Math.floor(Math.random() * state.nearbyVehicles.length)].id
            : 'HMV-018';
        msg = msg.replace('{val}', Math.round(30 + Math.random() * 200));
        msg = msg.replace('{val2}', Math.round(10 + Math.random() * 30));
        msg = msg.replace('{veh}', veh);

        const severities = { sensor: 'info', navigation: 'info', safety: 'warning', communication: 'info', system: 'success' };
        // Occasionally make safety events critical
        let severity = severities[category];
        if (category === 'safety' && Math.random() > 0.7) severity = 'danger';

        state.events.unshift({ msg, category, severity, time: new Date() });
        if (state.events.length > CONFIG.eventLogMax) state.events.pop();
        
        renderEventLog();
    }

    function initEventFilter() {
        const filter = document.getElementById('eventFilter');
        if (filter) {
            filter.addEventListener('change', renderEventLog);
        }
    }

    function renderEventLog() {
        const list = document.getElementById('eventLogList');
        if (!list) return;

        const filter = document.getElementById('eventFilter')?.value || 'all';
        const filtered = filter === 'all' ? state.events : state.events.filter(e => e.category === filter);
        
        list.innerHTML = filtered.slice(0, 30).map(e => `
            <div class="event-entry">
                <div class="event-severity ${e.severity}"></div>
                <div class="event-content">
                    <div class="event-msg">${e.msg}</div>
                    <div class="event-meta">
                        <span class="event-time">${e.time.toLocaleTimeString('en-IN', { hour12: false })}</span>
                        <span class="event-category">${e.category}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    /* ============================================================
       TOAST NOTIFICATIONS
       ============================================================ */
    function generateToast() {
        const toasts = [
            { title: 'Sensor Update', msg: `LiDAR effective range: ${Math.round(state.visibility * 1.1)}m`, type: 'info', icon: '📡' },
            { title: 'V2V Ping', msg: `Received heartbeat from ${state.nearbyVehicles[0]?.id || 'HMV-018'}`, type: 'info', icon: '📶' },
            { title: 'Speed Advisory', msg: `Recommended: ${state.recommendedSpeed} km/h based on conditions`, type: 'warning', icon: '⚡' },
            { title: 'System Check', msg: 'All 7 sensor modules reporting nominal', type: 'success', icon: '✅' },
        ];
        
        const toast = toasts[Math.floor(Math.random() * toasts.length)];
        showToast(toast.title, toast.msg, toast.type, toast.icon);
    }

    function showToast(title, msg, type = 'info', icon = 'ℹ️') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <div class="toast-body">
                <div class="toast-title">${title}</div>
                <div class="toast-msg">${msg}</div>
            </div>
        `;
        container.appendChild(toast);

        // Auto-remove
        setTimeout(() => {
            toast.classList.add('leaving');
            setTimeout(() => toast.remove(), 300);
        }, CONFIG.toastDuration);

        // Limit total toasts
        while (container.children.length > 4) {
            container.firstChild.remove();
        }
    }

    /* ============================================================
       UTILITY FUNCTIONS
       ============================================================ */
    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function jitter(magnitude) {
        return (Math.random() - 0.5) * 2 * magnitude;
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function setBar(id, pct) {
        const el = document.getElementById(id);
        if (el) el.style.width = `${clamp(pct, 0, 100)}%`;
    }

    function colorize(id, type) {
        const el = document.getElementById(id);
        if (!el) return;
        const colors = {
            success: 'var(--color-success)',
            warning: 'var(--color-warning)',
            danger: 'var(--color-danger)',
            info: 'var(--color-info)',
        };
        el.style.color = colors[type] || 'inherit';
    }

    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

})();
