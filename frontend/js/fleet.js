/**
 * DEEPFOG v3.0 — Fleet Operations Dashboard Controller
 * Tactical Mine Haul Radar & Open-Pit Topography
 *
 * Connects to: http://localhost:4000/api
 * WebSocket:   ws://localhost:4000/ws
 *
 * Fleet: DF-01 (CAT 797F), DF-02 (Komatsu 930E), DF-03 (BelAZ 75710)
 *
 * PROTOTYPE — Safe-speed recommendations are DRIVER ADVISORY ONLY.
 * Simulated data clearly labeled. No autonomous vehicle control.
 */

;(() => {
'use strict';

/* ============================================================
   CONFIGURATION
   ============================================================ */
const CFG = {
    apiBase:         'http://localhost:4000/api',
    wsUrl:           'ws://localhost:4000/ws',
    pollInterval:    5000,    // ms — API polling fallback
    wsReconnect:     3000,    // ms — WS reconnect delay
    radarFPS:        20,      // radar canvas target FPS
    camFPS:          12,      // cam canvas target FPS
    v2vMaxPackets:   40,
    bbMaxEvents:     60,
    selectedTruck:   'DF-02', // default selected for cab feed
    maxSpeed:        60,      // km/h max for bar calc
};

/* ============================================================
   FLEET STATE
   ============================================================ */
const fleet = {
    'DF-01': {
        id: 'DF-01', type: 'CAT 797F (240t)', payloadStatus: 'LOADED',
        sector: 'Sector-4A',
        speed: 18, safeSpeed: 25, riskLevel: 'LOW', riskScore: 22,
        riskReasons: [],
        distance: 340,  // cm — HC-SR04
        tilt: 1.8, roll: 0.6, acceleration: 0.9, vibration: 0.2,
        temperature: 31, humidity: 64, gasLevel: 180, lightLevel: 2800,
        lat: 22.1470, lng: 85.4992, heading: 45,
        riskReasons: [],
        online: true, source: 'SIMULATED',
    },
    'DF-02': {
        id: 'DF-02', type: 'Komatsu 930E', payloadStatus: 'EMPTY',
        sector: 'Sector-4B',
        speed: 44, safeSpeed: 22, riskLevel: 'HIGH', riskScore: 74,
        riskReasons: ['Poor visibility', 'Close obstacle detected', 'High speed relative to condition'],
        distance: 95,
        tilt: 3.2, roll: 1.4, acceleration: 1.8, vibration: 0.9,
        temperature: 33, humidity: 72, gasLevel: 420, lightLevel: 1100,
        lat: 22.1455, lng: 85.4985, heading: 200,
        online: true, source: 'SIMULATED',
    },
    'DF-03': {
        id: 'DF-03', type: 'BelAZ 75710', payloadStatus: 'LOADING',
        sector: 'Sector-4C',
        speed: 0, safeSpeed: 10, riskLevel: 'LOW', riskScore: 15,
        riskReasons: [],
        distance: 480,
        tilt: 0.5, roll: 0.3, acceleration: 0.4, vibration: 0.1,
        temperature: 30, humidity: 60, gasLevel: 160, lightLevel: 3200,
        lat: 22.1480, lng: 85.5000, heading: 90,
        online: true, source: 'SIMULATED',
    },
};

/* ============================================================
   APP STATE
   ============================================================ */
const state = {
    selectedTruck: CFG.selectedTruck,
    ws: null,
    wsConnected: false,
    backendConnected: false,
    systemMode: 'SIMULATION',
    uptime: 0,
    v2vPackets: [],
    blackboxEvents: [],
    bbEventCount: 0,
    radarTick: 0,
    camTick: 0,
    sweepAngle: 0,
    fogCondition: 'MODERATE',
    radarAnimId: null,
    camAnimId: null,
    pollTimer: null,
};

/* ============================================================
   HELPERS
   ============================================================ */
function el(id) { return document.getElementById(id); }
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function jitter(mag) { return (Math.random() - 0.5) * 2 * mag; }
function formatTime(date) {
    return date.toISOString().split('T')[1].split('.')[0];
}
function formatUTC() {
    return new Date().toUTCString().split(' ')[4];
}
function riskClass(level) {
    return { LOW:'LOW', MEDIUM:'MEDIUM', HIGH:'HIGH', CRITICAL:'CRITICAL' }[level] || 'LOW';
}
function calcSafeSpeed(truck) {
    // Advisory-only safe speed calculation based on sensor conditions
    let base = 40;
    // Visibility degradation
    const visRatio = truck.lightLevel / 4095;
    base *= clamp(0.3 + visRatio * 0.7, 0.3, 1.0);
    // Obstacle proximity
    if (truck.distance < 150) base *= 0.4;
    else if (truck.distance < 300) base *= 0.7;
    // Slope
    const slopeFactor = clamp(1 - Math.abs(truck.tilt) / 20, 0.5, 1.0);
    base *= slopeFactor;
    // Vibration
    if (truck.vibration > 1.0) base *= 0.75;
    // Gas
    if (truck.gasLevel > 600) base *= 0.7;
    return Math.max(5, Math.round(base));
}
function calcBrakingDist(speed, tilt) {
    const grade = Math.abs(tilt || 0);
    const factor = 1 + grade / 30;
    return Math.round((speed * speed) / (2 * 9.81 * 0.35) * factor / 100 * 10) / 10;
}
function calcRiskReasons(truck) {
    const reasons = [];
    if (truck.lightLevel < 1500)    reasons.push('Poor visibility / Low ambient light');
    if (truck.distance < 200)       reasons.push('Close obstacle detected (' + Math.round(truck.distance) + ' cm)');
    if (truck.gasLevel > 500)       reasons.push('Elevated gas/smoke indication (MQ-2)');
    if (truck.vibration > 0.8)      reasons.push('High vibration / rough terrain');
    if (truck.speed > truck.safeSpeed + 5) reasons.push('Speed exceeds safe advisory');
    if (Math.abs(truck.tilt) > 8)   reasons.push('Hazardous tilt angle (' + truck.tilt.toFixed(1) + '°)');
    return reasons;
}

/* ============================================================
   CLOCK + UPTIME
   ============================================================ */
function startClock() {
    function tick() {
        const t = el('headerClock');
        if (t) t.textContent = formatUTC();
        const u = el('hdrUptime');
        if (u) {
            state.uptime++;
            const h = String(Math.floor(state.uptime / 3600)).padStart(2,'0');
            const m = String(Math.floor((state.uptime % 3600) / 60)).padStart(2,'0');
            const s = String(state.uptime % 60).padStart(2,'0');
            u.textContent = `${h}:${m}:${s}`;
        }
    }
    tick();
    setInterval(tick, 1000);
}

/* ============================================================
   TRUCK CARD UPDATE
   ============================================================ */
function updateTruckCard(truck) {
    const id = truck.id;
    const safe = calcSafeSpeed(truck);
    truck.safeSpeed = safe;

    // Risk badge
    const riskEl = el(`truckRisk-${id}`);
    if (riskEl) {
        riskEl.textContent = truck.riskLevel + ' RISK';
        riskEl.className = `truck-risk-badge ${truck.riskLevel}`;
    }

    // Card border class
    const card = el(`truckCard-${id}`);
    if (card) {
        card.className = `truck-card ${state.selectedTruck === id ? 'selected' : ''} risk-${truck.riskLevel.toLowerCase()}`;
    }

    // Type
    const typeEl = el(`truckType-${id}`);
    if (typeEl) typeEl.textContent = `${truck.type} · ${truck.payloadStatus}`;

    // Speed
    const spEl = el(`truckSpeed-${id}`);
    if (spEl) spEl.textContent = truck.speed.toFixed(0) + ' km/h';

    // Safe speed
    const safeEl = el(`truckSafe-${id}`);
    if (safeEl) safeEl.textContent = safe + ' km/h';

    // Radar distance
    const radEl = el(`truckRadar-${id}`);
    if (radEl) {
        const d = truck.distance;
        radEl.textContent = d < 100 ? d.toFixed(0)+' cm ⚠' : d.toFixed(0)+' cm';
        radEl.className = `tt-value ${d < 100 ? 'red' : d < 250 ? 'amber' : 'green'}`;
    }

    // Road clearance (distance mapped to road edge clearance)
    const clrEl = el(`truckClear-${id}`);
    if (clrEl) {
        const clr = Math.min(truck.distance * 0.45, 180);
        clrEl.textContent = clr.toFixed(0) + ' cm';
        clrEl.className = `tt-value ${clr < 80 ? 'red' : clr < 130 ? 'amber' : 'green'}`;
    }

    // Speed bar
    const barEl = el(`truckBar-${id}`);
    const markerEl = el(`truckSafeMarker-${id}`);
    const valsEl = el(`truckSpeedVals-${id}`);
    if (barEl) barEl.style.width = clamp((truck.speed / CFG.maxSpeed) * 100, 0, 100) + '%';
    if (markerEl) markerEl.style.left = clamp((safe / CFG.maxSpeed) * 100, 0, 100) + '%';
    if (valsEl) valsEl.textContent = `${truck.speed.toFixed(0)} / ${safe} km/h`;

    // Location
    const locEl = el(`truckLoc-${id}`);
    if (locEl) locEl.textContent = `${truck.lat.toFixed(4)}°N, ${truck.lng.toFixed(4)}°E · ${truck.sector}`;
}

/* ============================================================
   RIGHT PANEL UPDATE — CAB / SPEED / IMU / ATMO
   ============================================================ */
function updateRightPanel() {
    const truck = fleet[state.selectedTruck];
    if (!truck) return;

    // Cam panel title
    const camVeh = el('camFeedVehicle');
    if (camVeh) camVeh.textContent = truck.id;

    // Camera radar bar
    const d = truck.distance;
    const dEl = el('camRadarDist');
    if (dEl) {
        dEl.textContent = d.toFixed(0) + ' cm';
        dEl.className = `crb-value ${d < 100 ? 'danger' : d < 250 ? 'warn' : ''}`;
    }

    const reEl = el('camRoadEdge');
    if (reEl) {
        const conf = clamp(80 + jitter(10), 60, 99);
        reEl.textContent = d < 150 ? 'ALERT' : 'CLEAR';
        reEl.className = `crb-value ${d < 150 ? 'danger' : ''}`;
        const confEl = el('camConfidence');
        if (confEl) confEl.textContent = conf.toFixed(0) + '%';
    }

    // Speed advisory
    const spCur = el('speedCurrent');
    const spRec = el('speedRecommended');
    const brkDist = el('brakingDist');
    const stpDist = el('stoppingDist');
    if (spCur)  spCur.textContent = truck.speed.toFixed(0);
    if (spRec)  spRec.textContent = truck.safeSpeed;
    if (brkDist) brkDist.textContent = calcBrakingDist(truck.speed, truck.tilt) + ' m';
    if (stpDist) stpDist.textContent = calcBrakingDist(truck.speed * 1.2, truck.tilt) + ' m';

    // Speed color
    if (spCur) spCur.className = `sb-value ${truck.speed > truck.safeSpeed + 5 ? 'danger-val' : truck.speed > truck.safeSpeed ? '' : 'recommended-val'}`;

    // Speed reasons
    const reasons = calcRiskReasons(truck);
    const reasonList = el('speedReasonList');
    if (reasonList) {
        if (reasons.length === 0) {
            reasonList.innerHTML = `<span class="srl-item" style="color:var(--green)">Conditions nominal — speed advisory met</span>`;
        } else {
            reasonList.innerHTML = reasons.map(r => `<span class="srl-item">${r}</span>`).join('');
        }
    }

    // IMU
    const pitchEl = el('imuPitch');
    const rollEl  = el('imuRoll');
    const shockEl = el('imuShock');
    const axEl    = el('imuAccelX');
    const ayEl    = el('imuAccelY');
    const vibEl   = el('imuVib');

    if (pitchEl) { pitchEl.textContent = truck.tilt.toFixed(1) + '°'; pitchEl.className = `imu-value ${Math.abs(truck.tilt) > 8 ? 'danger' : Math.abs(truck.tilt) > 5 ? 'warn' : ''}`; }
    if (rollEl)  { rollEl.textContent  = truck.roll.toFixed(1) + '°'; rollEl.className  = `imu-value ${Math.abs(truck.roll) > 6 ? 'danger' : Math.abs(truck.roll) > 4 ? 'warn' : ''}`; }
    if (shockEl) { const shk = truck.vibration > 1.2 ? 'HIGH' : truck.vibration > 0.6 ? 'MED' : 'LOW';
                   shockEl.textContent = shk;
                   shockEl.className = `imu-value ${shk === 'HIGH' ? 'danger' : shk === 'MED' ? 'warn' : ''}`; }
    if (axEl)  axEl.textContent  = (truck.acceleration * 0.8 + jitter(0.05)).toFixed(2) + ' g';
    if (ayEl)  ayEl.textContent  = (truck.acceleration * 0.6 + jitter(0.04)).toFixed(2) + ' g';
    if (vibEl) { vibEl.textContent = truck.vibration.toFixed(2) + ' g'; vibEl.className = `imu-value ${truck.vibration > 1.0 ? 'warn' : ''}`; }

    // Atmospheric sensors
    const luxEl = el('atmoLux');
    const tmpEl = el('atmoTemp');
    const humEl = el('atmoHumidity');
    const gasEl = el('atmoGas');

    const luxVal = truck.lightLevel;
    const luxDisplay = luxVal.toFixed(0);
    if (luxEl) luxEl.textContent = luxDisplay;
    if (tmpEl) tmpEl.textContent = truck.temperature.toFixed(1) + ' °C';
    if (humEl) humEl.textContent = truck.humidity.toFixed(1) + ' %';
    if (gasEl) gasEl.textContent = truck.gasLevel.toFixed(0) + ' ADC';

    // Atmo bars
    const lb = el('atmoLuxBar');  if (lb) lb.style.width = clamp((luxVal/4095)*100,0,100)+'%';
    const tb = el('atmoTempBar'); if (tb) tb.style.width = clamp(((truck.temperature-10)/50)*100,0,100)+'%';
    const hb = el('atmoHumBar');  if (hb) hb.style.width = clamp(truck.humidity,0,100)+'%';
    const gb = el('atmoGasBar');  if (gb) gb.style.width = clamp((truck.gasLevel/900)*100,0,100)+'%';
}

/* ============================================================
   HEADER UPDATE
   ============================================================ */
function updateHeader() {
    // Fleet active
    const activeCount = Object.values(fleet).filter(t => t.online).length;
    const fleetEl = el('hdrFleetActive');
    if (fleetEl) fleetEl.textContent = `${activeCount} Trucks Active`;

    // Fleet risk summary
    const riskLevels = Object.values(fleet).map(t => t.riskLevel);
    let fleetRisk = 'LOW';
    if (riskLevels.includes('CRITICAL')) fleetRisk = 'CRITICAL';
    else if (riskLevels.includes('HIGH')) fleetRisk = 'HIGH';
    else if (riskLevels.includes('MEDIUM')) fleetRisk = 'MEDIUM';
    const riskEl = el('hdrRisk');
    if (riskEl) {
        riskEl.textContent = fleetRisk;
        riskEl.className = `hsr-value ${fleetRisk === 'HIGH' || fleetRisk === 'CRITICAL' ? 'red' : fleetRisk === 'MEDIUM' ? 'amber' : 'green'}`;
    }

    // Atmosphere from fog selector
    const fogSel = el('fogConditionSelect');
    const fogTxt = fogSel ? fogSel.options[fogSel.selectedIndex].text : 'Moderate Fog (38% VIS)';
    const atmEl = el('hdrAtmosphere');
    if (atmEl) atmEl.textContent = fogTxt;
}

/* ============================================================
   TRUCK CARD CLICK / SELECTION
   ============================================================ */
function selectTruck(id) {
    if (!fleet[id]) return;
    state.selectedTruck = id;
    Object.keys(fleet).forEach(tid => {
        const card = el(`truckCard-${tid}`);
        if (card) {
            const isSelected = tid === id;
            const riskLow = fleet[tid].riskLevel === 'LOW';
            card.className = `truck-card ${isSelected ? 'selected' : ''} risk-${fleet[tid].riskLevel.toLowerCase()}`;
        }
    });
    updateRightPanel();
}

function initTruckCardClicks() {
    Object.keys(fleet).forEach(id => {
        const card = el(`truckCard-${id}`);
        if (card) {
            card.addEventListener('click', () => selectTruck(id));
            card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') selectTruck(id); });
        }
    });
}

/* ============================================================
   FOG CONDITION SELECTOR
   ============================================================ */
function initFogSelector() {
    const sel = el('fogConditionSelect');
    if (!sel) return;
    sel.addEventListener('change', () => {
        state.fogCondition = sel.value;
        updateHeader();
        // Adjust fleet light levels based on fog condition
        const lightMap = { CLEAR: 3800, LIGHT: 2800, MODERATE: 1400, DENSE: 600, ZERO: 120 };
        const base = lightMap[state.fogCondition] || 1400;
        Object.values(fleet).forEach(t => {
            t.lightLevel = base + jitter(200);
            t.safeSpeed = calcSafeSpeed(t);
        });
    });
}

/* ============================================================
   V2V RADIO PACKET STREAM
   ============================================================ */
const V2V_MESSAGES = [
    { from: 'DF-01', to: 'DF-02', msg: 'PROXIMITY ALERT — Approaching from Sector-4A', risk: 'MEDIUM' },
    { from: 'DF-02', to: 'DF-01', msg: 'SPEED ADVISORY — Exceeding safe speed for conditions', risk: 'HIGH' },
    { from: 'DF-03', to: 'ALL',   msg: 'LOADING COMPLETE — Departing Sector-4C', risk: 'LOW' },
    { from: 'DF-01', to: 'DF-03', msg: 'ROAD CLEAR — Sector-4A to Sector-4C confirmed', risk: 'LOW' },
    { from: 'DF-02', to: 'DF-03', msg: 'CLOSE OBSTACLE ahead — reduce speed', risk: 'HIGH' },
    { from: 'DF-03', to: 'DF-01', msg: 'V2V RANGE CHECK — Signal strength: -68dBm', risk: 'LOW' },
    { from: 'DF-01', to: 'ALL',   msg: 'FOG DENSITY INCREASED — recommend 15 km/h max', risk: 'MEDIUM' },
    { from: 'DF-02', to: 'DF-01', msg: 'PROXIMITY MAINTAINED — Safe separation achieved', risk: 'LOW' },
    { from: 'DF-03', to: 'DF-02', msg: 'SECTOR-4C CLEAR — Haul route open', risk: 'LOW' },
    { from: 'DF-01', to: 'DF-02', msg: 'GAS INDICATION ELEVATED — monitor MQ-2', risk: 'MEDIUM' },
    { from: 'DF-02', to: 'ALL',   msg: 'EMERGENCY — HIGH RISK ZONE — immediate advisory', risk: 'HIGH' },
    { from: 'DF-03', to: 'DF-01', msg: 'POSITION BROADCAST — 22.1480°N, 85.5000°E', risk: 'LOW' },
];

function pushV2VPacket() {
    const tmpl = V2V_MESSAGES[Math.floor(Math.random() * V2V_MESSAGES.length)];
    const ts = formatTime(new Date());
    const packet = { ...tmpl, ts };
    state.v2vPackets.unshift(packet);
    if (state.v2vPackets.length > CFG.v2vMaxPackets) state.v2vPackets.pop();
    renderV2V();
}

function renderV2V() {
    const list = el('v2vList');
    if (!list) return;
    const html = state.v2vPackets.slice(0, 20).map(p => `
        <div class="v2v-packet">
            <span class="vp-time">${p.ts}</span>
            <span class="vp-from">${p.from}</span>
            <span class="vp-arrow">→</span>
            <span class="vp-to">${p.to}</span>
            <span class="vp-msg">${p.msg}</span>
            <span class="vp-risk ${p.risk}">${p.risk}</span>
        </div>
    `).join('');
    list.innerHTML = html;
}

/* ============================================================
   BLACK BOX EVENT LOG
   ============================================================ */
function pushBlackboxEvent(vehicleId, msg, sev) {
    const ts = formatTime(new Date());
    const truck = fleet[vehicleId] || {};
    const ev = {
        ts, vehicleId,
        msg: msg || `Sensor update — risk ${truck.riskLevel || 'LOW'}`,
        sev: sev || truck.riskLevel || 'LOW',
        gps: `${(truck.lat||0).toFixed(4)}°N,${(truck.lng||0).toFixed(4)}°E`,
        speed: Math.round(truck.speed || 0),
        recSpd: truck.safeSpeed || 0,
    };
    state.blackboxEvents.unshift(ev);
    state.bbEventCount++;
    if (state.blackboxEvents.length > CFG.bbMaxEvents) state.blackboxEvents.pop();
    renderBlackbox();
}

function renderBlackbox() {
    const list = el('blackboxList');
    if (!list) return;
    const html = state.blackboxEvents.slice(0, 25).map(ev => `
        <div class="bb-event sev-${ev.sev}">
            <span class="bb-ts">${ev.ts}</span>
            <span class="bb-vid">${ev.vehicleId}</span>
            <span class="bb-msg">${ev.msg} · ${ev.gps} · ${ev.speed}→${ev.recSpd}km/h</span>
        </div>
    `).join('');
    list.innerHTML = html;
    const badge = el('blackboxCountBadge');
    if (badge) badge.textContent = `${state.bbEventCount} Events`;
}

/* ============================================================
   RADAR CANVAS — TACTICAL MINE HAUL RADAR
   ============================================================ */
let radarCtx = null;

function initRadarCanvas() {
    const canvas = el('radarCanvas');
    if (!canvas) return;
    radarCtx = canvas.getContext('2d');

    function resize() {
        const wrapper = canvas.parentElement;
        const w = wrapper.clientWidth - 12;
        const h = wrapper.clientHeight - 12;
        const sz = Math.min(w, h);
        canvas.width  = w;
        canvas.height = h;
    }
    resize();
    window.addEventListener('resize', resize);
}

function drawRadar() {
    const canvas = el('radarCanvas');
    if (!canvas || !radarCtx) return;
    const ctx = radarCtx;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W * 0.5;
    const cy = H * 0.5;
    const R  = Math.min(W, H) * 0.42;

    // Clear
    ctx.fillStyle = '#020508';
    ctx.fillRect(0, 0, W, H);

    // ── Open-pit topography background ──
    drawPitTopography(ctx, W, H, cx, cy, R);

    // ── Radar rings ──
    for (let i = 1; i <= 4; i++) {
        const r = (R / 4) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,180,220,${0.06 + i * 0.03})`;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Range label
        const rangem = Math.round((i / 4) * 500);
        ctx.fillStyle = 'rgba(0,150,180,0.5)';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText(`${rangem}m`, cx + r + 3, cy + 8);
    }

    // ── Crosshair lines ──
    ['h','v','d1','d2'].forEach((dir, idx) => {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,180,220,0.08)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 8]);
        if (dir === 'h') { ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy); }
        else if (dir === 'v') { ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R); }
        else if (dir === 'd1') { ctx.moveTo(cx-R*0.7,cy-R*0.7); ctx.lineTo(cx+R*0.7,cy+R*0.7); }
        else { ctx.moveTo(cx+R*0.7,cy-R*0.7); ctx.lineTo(cx-R*0.7,cy+R*0.7); }
        ctx.stroke();
        ctx.setLineDash([]);
    });

    // ── Fog zone ──
    drawFogZone(ctx, cx, cy, R);

    // ── Road network ──
    drawMineRoads(ctx, cx, cy, R);

    // ── Sector boundaries ──
    drawSectorLabels(ctx, cx, cy, R);

    // ── V2V range circles ──
    drawV2VRanges(ctx, cx, cy, R);

    // ── Vehicle blips (DF-01, DF-02, DF-03) ──
    drawVehicles(ctx, cx, cy, R);

    // ── Radar sweep ──
    drawSweep(ctx, cx, cy, R);

    // ── Corner HUD labels ──
    drawHUD(ctx, W, H);

    state.sweepAngle = (state.sweepAngle + (2 * Math.PI / (CFG.radarFPS * 3))) % (Math.PI * 2);
    state.radarTick++;
}

function drawPitTopography(ctx, W, H, cx, cy, R) {
    // Pit boundary (oval contour)
    const levels = [
        { r: R * 1.05, color: 'rgba(30,45,20,0.4)', lineW: 1 },
        { r: R * 0.85, color: 'rgba(40,60,30,0.3)', lineW: 0.5 },
        { r: R * 0.65, color: 'rgba(50,70,40,0.2)', lineW: 0.5 },
    ];
    levels.forEach(l => {
        ctx.beginPath();
        ctx.ellipse(cx, cy * 1.05, l.r, l.r * 0.7, 0, 0, Math.PI * 2);
        ctx.strokeStyle = l.color;
        ctx.lineWidth = l.lineW;
        ctx.setLineDash([6, 10]);
        ctx.stroke();
        ctx.setLineDash([]);
    });

    // Pit floor fill
    const pitGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
    pitGrad.addColorStop(0, 'rgba(8,20,14,0.6)');
    pitGrad.addColorStop(1, 'rgba(2,5,8,0)');
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 0.65, R * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = pitGrad;
    ctx.fill();
}

function drawFogZone(ctx, cx, cy, R) {
    const fogIntensity = {
        CLEAR: 0, LIGHT: 0.06, MODERATE: 0.14, DENSE: 0.28, ZERO: 0.45
    }[state.fogCondition] || 0.14;

    if (fogIntensity === 0) return;

    // Draw drifting fog patches
    const patches = [
        { ox: -0.15, oy: -0.1, rx: 0.35, ry: 0.2 },
        { ox:  0.1,  oy:  0.2, rx: 0.28, ry: 0.18 },
        { ox: -0.05, oy:  0.05,rx: 0.4,  ry: 0.22 },
    ];
    const t = state.radarTick * 0.008;
    patches.forEach(p => {
        const x = cx + (p.ox + Math.sin(t + p.rx) * 0.04) * R;
        const y = cy + (p.oy + Math.cos(t + p.ry) * 0.03) * R;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, p.rx * R);
        grad.addColorStop(0, `rgba(120,180,220,${fogIntensity})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.ellipse(x, y, p.rx * R, p.ry * R, 0, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
    });
}

function drawMineRoads(ctx, cx, cy, R) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,100,0,0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);

    // Main haul road - centre
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.8, cy + R * 0.05);
    ctx.bezierCurveTo(cx - R*0.3, cy - R*0.15, cx + R*0.3, cy - R*0.15, cx + R*0.8, cy + R*0.05);
    ctx.strokeStyle = 'rgba(255,100,0,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Secondary ramp road
    ctx.beginPath();
    ctx.moveTo(cx + R * 0.05, cy - R * 0.8);
    ctx.bezierCurveTo(cx + R*0.15, cy - R*0.4, cx + R*0.2, cy - R*0.1, cx + R*0.05, cy + R*0.2);
    ctx.strokeStyle = 'rgba(255,120,0,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Loading bay road
    ctx.beginPath();
    ctx.moveTo(cx - R*0.6, cy - R*0.4);
    ctx.lineTo(cx - R*0.1, cy - R*0.05);
    ctx.strokeStyle = 'rgba(255,120,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
}

function drawSectorLabels(ctx, cx, cy, R) {
    const sectors = [
        { label: 'Sector-4A', x: cx - R * 0.55, y: cy - R * 0.55 },
        { label: 'Sector-4B', x: cx + R * 0.35, y: cy + R * 0.15 },
        { label: 'Sector-4C', x: cx - R * 0.15, y: cy + R * 0.55 },
        { label: 'Dump Zone', x: cx + R * 0.55, y: cy - R * 0.55 },
    ];
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(0,150,180,0.45)';
    sectors.forEach(s => {
        ctx.fillText(s.label, s.x, s.y);
    });
}

function vehicleToCanvas(truck, cx, cy, R) {
    // Map lat/lng to canvas coords
    const baseLat = 22.147, baseLng = 85.499;
    const scale = R / 0.01;
    const x = cx + (truck.lng - baseLng) * scale * 1.5;
    const y = cy - (truck.lat - baseLat) * scale;
    return { x, y };
}

function drawV2VRanges(ctx, cx, cy, R) {
    Object.values(fleet).forEach(truck => {
        const pos = vehicleToCanvas(truck, cx, cy, R);
        const range = R * 0.28;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, range, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,230,118,0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    });

    // Draw V2V link lines between vehicles
    const vList = Object.values(fleet);
    for (let i = 0; i < vList.length; i++) {
        for (let j = i+1; j < vList.length; j++) {
            const pa = vehicleToCanvas(vList[i], cx, cy, R);
            const pb = vehicleToCanvas(vList[j], cx, cy, R);
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.strokeStyle = `rgba(0,230,118,0.15)`;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

function drawVehicles(ctx, cx, cy, R) {
    const colors = { 'DF-01': '#00d4ff', 'DF-02': '#ff3b3b', 'DF-03': '#f59e0b' };
    Object.values(fleet).forEach(truck => {
        const pos = vehicleToCanvas(truck, cx, cy, R);
        const color = colors[truck.id] || '#fff';
        const t = state.radarTick;

        // Obstacle ring pulse for high risk
        if (truck.riskLevel === 'HIGH' || truck.riskLevel === 'CRITICAL') {
            const pulse = Math.abs(Math.sin(t * 0.15));
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 14 + pulse * 8, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,59,59,${0.3 * pulse})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // Vehicle body (triangle in direction of heading)
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate((truck.heading * Math.PI) / 180);
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(-5, 6);
        ctx.lineTo(5, 6);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // ID label
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = color;
        ctx.fillText(truck.id, pos.x + 10, pos.y - 8);

        // Speed label
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(200,220,240,0.7)';
        ctx.fillText(`${Math.round(truck.speed)}km/h`, pos.x + 10, pos.y + 2);

        // Risk indicator
        ctx.font = '7px "JetBrains Mono", monospace';
        const riskColors = { LOW:'#00e676', MEDIUM:'#f59e0b', HIGH:'#ff3b3b', CRITICAL:'#ff0040' };
        ctx.fillStyle = riskColors[truck.riskLevel] || '#00e676';
        ctx.fillText(truck.riskLevel, pos.x + 10, pos.y + 12);

        // Radar distance arc (HC-SR04 / mmWave)
        const distPx = clamp((truck.distance / 500) * R * 0.6, 8, R * 0.5);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, distPx, -0.5, 0.5);
        ctx.strokeStyle = `rgba(0,212,255,0.4)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });
}

function drawSweep(ctx, cx, cy, R) {
    // Sweep gradient
    const sweep = state.sweepAngle - Math.PI / 2;
    const grad = ctx.createConicalGradient
        ? ctx.createConicalGradient(cx, cy, sweep)
        : null;

    // Fallback: draw sweep sector
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sweep);
    const sweepGrad = ctx.createLinearGradient(0, -R, 0, 0);
    sweepGrad.addColorStop(0, 'rgba(0,212,255,0.0)');
    sweepGrad.addColorStop(0.7, 'rgba(0,212,255,0.12)');
    sweepGrad.addColorStop(1, 'rgba(0,212,255,0.25)');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -Math.PI/2, -Math.PI/2 + 0.5, false);
    ctx.closePath();
    ctx.fillStyle = sweepGrad;
    ctx.fill();

    // Sweep line
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -R);
    ctx.strokeStyle = 'rgba(0,212,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

function drawHUD(ctx, W, H) {
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(0,180,220,0.5)';
    ctx.fillText('77 GHz FMCW RADAR', 8, 14);
    ctx.fillText('V2V MESH ACTIVE', 8, 24);

    const modeLabel = state.backendConnected ? 'LIVE DATA' : '⚙ DEMO/SIM';
    ctx.fillStyle = state.backendConnected ? 'rgba(0,230,118,0.7)' : 'rgba(245,158,11,0.7)';
    ctx.fillText(modeLabel, 8, 34);

    // Timestamp
    ctx.fillStyle = 'rgba(0,150,180,0.4)';
    ctx.fillText(formatTime(new Date()), W - 60, H - 6);
}

function radarLoop() {
    drawRadar();
    state.radarAnimId = requestAnimationFrame(radarLoop);
}

/* ============================================================
   CAMERA CANVAS — ESP32-CAM ROAD VIEW
   ============================================================ */
let camCtx = null;

function initCamCanvas() {
    const canvas = el('camCanvas');
    if (!canvas) return;
    camCtx = canvas.getContext('2d');

    function resize() {
        const area = canvas.parentElement;
        canvas.width  = area.clientWidth;
        canvas.height = area.clientHeight;
    }
    resize();
    window.addEventListener('resize', resize);
}

function drawCamFrame() {
    const canvas = el('camCanvas');
    if (!canvas || !camCtx) return;
    const ctx = camCtx;
    const W = canvas.width;
    const H = canvas.height;
    const t = state.camTick;

    // Sky/Ground
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0a0f14');
    bgGrad.addColorStop(0.4, '#101820');
    bgGrad.addColorStop(1, '#050a10');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Fog overlay
    const fogStr = { CLEAR:0, LIGHT:0.12, MODERATE:0.28, DENSE:0.48, ZERO:0.7 }[state.fogCondition] || 0.28;
    if (fogStr > 0) {
        const fogGrad = ctx.createRadialGradient(W/2, H*0.3, 0, W/2, H*0.3, W*0.8);
        fogGrad.addColorStop(0, `rgba(130,180,200,${fogStr})`);
        fogGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, 0, W, H);
    }

    // Road surface
    const vanishX = W / 2 + Math.sin(t * 0.02) * 5;
    const vanishY = H * 0.42;
    const roadGrad = ctx.createLinearGradient(0, H, 0, vanishY);
    roadGrad.addColorStop(0, '#1a1a1a');
    roadGrad.addColorStop(1, '#0d1020');
    ctx.beginPath();
    ctx.moveTo(vanishX, vanishY);
    ctx.lineTo(W * 0.05, H);
    ctx.lineTo(W * 0.95, H);
    ctx.closePath();
    ctx.fillStyle = roadGrad;
    ctx.fill();

    // Road edge lines (detection overlay — green)
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00e676';
    ctx.shadowBlur = 4;
    ctx.setLineDash([6, 4]);

    // Left edge
    ctx.beginPath();
    ctx.moveTo(vanishX - 4, vanishY + 2);
    ctx.lineTo(W * 0.12, H);
    ctx.stroke();

    // Right edge
    ctx.beginPath();
    ctx.moveTo(vanishX + 4, vanishY + 2);
    ctx.lineTo(W * 0.88, H);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Centre dashes
    ctx.strokeStyle = 'rgba(255,200,60,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(vanishX, vanishY + 2);
    ctx.lineTo(W * 0.5, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Obstacle indicator
    const truck = fleet[state.selectedTruck];
    if (truck && truck.distance < 250) {
        const obstAlpha = clamp(1 - truck.distance / 250, 0.2, 0.8);
        const obstSize  = clamp((1 - truck.distance / 250) * 30, 5, 28);
        ctx.fillStyle = `rgba(255,60,60,${obstAlpha})`;
        ctx.beginPath();
        ctx.arc(vanishX, vanishY - obstSize * 0.3, obstSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,60,60,0.9)';
        ctx.font = '7px "JetBrains Mono", monospace';
        ctx.fillText(`${Math.round(truck.distance)}cm`, vanishX - 10, vanishY - obstSize * 0.3 + obstSize + 8);
    }

    // Radar distance bar at bottom
    if (truck) {
        const barW = W * 0.7;
        const barX = (W - barW) / 2;
        const barY = H - 14;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, 10);
        const fill = clamp(truck.distance / 500, 0, 1);
        const fillColor = truck.distance < 100 ? '#ff3b3b' : truck.distance < 250 ? '#f59e0b' : '#00d4ff';
        ctx.fillStyle = fillColor;
        ctx.fillRect(barX, barY, barW * fill, 6);
        ctx.font = '6px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(200,220,240,0.6)';
        ctx.fillText(`RADAR: ${Math.round(truck.distance)}cm`, barX, barY - 3);
    }

    // Timestamp overlay
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(0,212,255,0.5)';
    ctx.fillText(formatTime(new Date()), 4, H - 4);

    state.camTick++;
}

function camLoop() {
    drawCamFrame();
    setTimeout(() => requestAnimationFrame(camLoop), 1000 / CFG.camFPS);
}

/* ============================================================
   SIMULATION TICK (client-side, fallback when backend offline)
   ============================================================ */
function simulateTruckTick() {
    Object.values(fleet).forEach(truck => {
        // Speed drift
        truck.speed = clamp(truck.speed + jitter(3), 0, 50);
        if (truck.id === 'DF-03') truck.speed = clamp(truck.speed * 0.1, 0, 5);

        // Radar distance drift
        truck.distance = clamp(truck.distance + jitter(30), 20, 500);

        // IMU drift
        truck.tilt      = clamp(truck.tilt + jitter(0.4), -10, 12);
        truck.roll      = clamp(truck.roll + jitter(0.2), -6, 6);
        truck.acceleration = clamp(truck.acceleration + jitter(0.15), 0.3, 2.5);
        truck.vibration = clamp(truck.vibration + jitter(0.1), 0, 1.5);

        // Atmo drift
        truck.temperature = clamp(truck.temperature + jitter(0.3), 18, 50);
        truck.humidity    = clamp(truck.humidity + jitter(1), 30, 95);
        truck.gasLevel    = clamp(truck.gasLevel + jitter(25), 50, 900);
        truck.lightLevel  = clamp(truck.lightLevel + jitter(80), 10, 4095);

        // GPS drift
        truck.lat = truck.lat + jitter(0.00005);
        truck.lng = truck.lng + jitter(0.00005);

        // Update safe speed
        truck.safeSpeed = calcSafeSpeed(truck);
        truck.riskReasons = calcRiskReasons(truck);

        // Update risk
        let score = 0;
        score += (1 - truck.lightLevel / 4095) * 40;
        score += (truck.gasLevel / 900) * 25;
        score += (1 - truck.distance / 500) * 20;
        score += truck.vibration * 8;
        if (truck.speed > truck.safeSpeed + 10) score += 10;
        score = clamp(Math.round(score), 0, 100);
        truck.riskScore = score;
        if (score >= 70) truck.riskLevel = 'HIGH';
        else if (score >= 40) truck.riskLevel = 'MEDIUM';
        else truck.riskLevel = 'LOW';
    });
}

/* ============================================================
   APPLY BACKEND DATA (from API or WebSocket)
   ============================================================ */
const VEHICLE_ID_MAP = {
    'HMV-042': 'DF-02',
    'HMV-018': 'DF-01',
    'WTL-003': 'DF-03',
    'DZR-011': 'DF-01',
    'DF-01': 'DF-01',
    'DF-02': 'DF-02',
    'DF-03': 'DF-03',
};

function applyBackendReading(reading) {
    const targetId = VEHICLE_ID_MAP[reading.vehicle_id] || reading.vehicle_id;
    const truck = fleet[targetId];
    if (!truck) return;

    if (reading.temperature    != null) truck.temperature   = reading.temperature;
    if (reading.humidity       != null) truck.humidity      = reading.humidity;
    if (reading.gas_level      != null) truck.gasLevel      = reading.gas_level;
    if (reading.light_level    != null) truck.lightLevel    = reading.light_level;
    if (reading.distance       != null) truck.distance      = reading.distance;
    if (reading.acceleration   != null) truck.acceleration  = reading.acceleration;
    if (reading.tilt           != null) truck.tilt          = reading.tilt;
    if (reading.vibration_intensity != null) truck.vibration = reading.vibration_intensity;
    if (reading.latitude       != null) truck.lat           = reading.latitude;
    if (reading.longitude      != null) truck.lng           = reading.longitude;
    if (reading.risk_level     != null) truck.riskLevel     = reading.risk_level;
    if (reading.risk_score     != null) truck.riskScore     = reading.risk_score;
    if (reading.risk_reasons   != null && reading.risk_reasons.length > 0) truck.riskReasons = reading.risk_reasons;

    // Derive speed from distance change / sensor fusion
    truck.safeSpeed = calcSafeSpeed(truck);
    truck.source = reading.source || 'SIMULATED';
}

/* ============================================================
   WEBSOCKET CONNECTION
   ============================================================ */
function connectWS() {
    // If hosted on HTTPS (e.g. GitHub Pages) without local proxy, run client-side offline mode cleanly
    if (window.location.protocol === 'https:' && !window.location.host.includes('localhost')) {
        updateConnBadge(false);
        return;
    }
    try {
        const ws = new WebSocket(CFG.wsUrl);
        state.ws = ws;

        ws.onopen = () => {
            state.wsConnected = true;
            state.backendConnected = true;
            updateConnBadge(true);
            pushBlackboxEvent('DF-01', 'WebSocket connected to backend', 'LOW');
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'SENSOR_BATCH' && msg.data && msg.data.readings) {
                    msg.data.readings.forEach(applyBackendReading);
                } else if (msg.type === 'SENSOR_UPDATE' && msg.data) {
                    applyBackendReading(msg.data);
                } else if (msg.type === 'ALERT' && msg.data) {
                    const a = msg.data;
                    const targetId = VEHICLE_ID_MAP[a.vehicle_id] || a.vehicle_id;
                    pushBlackboxEvent(targetId, `ALERT: ${a.alert_type} — ${a.message}`, a.severity);
                } else if (msg.type === 'SYSTEM_STATE' && msg.data) {
                    state.systemMode = msg.data.mode || 'SIMULATION';
                    updateConnBadge(true);
                }
            } catch(e) {}
        };

        ws.onerror = () => { state.wsConnected = false; };

        ws.onclose = () => {
            state.wsConnected = false;
            state.backendConnected = false;
            updateConnBadge(false);
            setTimeout(connectWS, CFG.wsReconnect);
        };
    } catch(e) {
        setTimeout(connectWS, CFG.wsReconnect);
    }
}

/* ============================================================
   API POLL FALLBACK
   ============================================================ */
async function pollAPI() {
    if (window.location.protocol === 'https:' && !window.location.host.includes('localhost')) {
        updateConnBadge(false);
        return;
    }
    try {
        // Check health
        const health = await fetch(`${CFG.apiBase}/health`, { signal: AbortSignal.timeout(3000) });
        if (!health.ok) throw new Error('Backend not OK');
        state.backendConnected = true;

        // Poll latest sensor readings
        const resp = await fetch(`${CFG.apiBase}/sensors/latest`, { signal: AbortSignal.timeout(3000) });
        if (!resp.ok) return;
        const json = await resp.json();
        if (json.success && Array.isArray(json.data)) {
            json.data.forEach(applyBackendReading);
        }

        // Poll system mode
        const modeResp = await fetch(`${CFG.apiBase}/system/mode`, { signal: AbortSignal.timeout(3000) });
        if (modeResp.ok) {
            const modeJson = await modeResp.json();
            if (modeJson.success && modeJson.data) {
                state.systemMode = modeJson.data.mode || state.systemMode;
            }
        }

        updateConnBadge(true);
    } catch(e) {
        state.backendConnected = false;
        updateConnBadge(false);
    }
}

function updateConnBadge(connected) {
    const badge = el('connBadge');
    const label = el('connLabel');
    if (!badge || !label) return;
    if (connected) {
        badge.className = 'conn-badge live';
        label.textContent = state.systemMode === 'SIMULATION' ? 'SIM LIVE' : 'LIVE DATA';
    } else {
        badge.className = 'conn-badge sim';
        label.textContent = 'SIMULATION';
    }
}

/* ============================================================
   ESP32 DIAGNOSTICS UPDATE
   ============================================================ */
function updateESP32Panel() {
    const truck = fleet[state.selectedTruck];
    if (!truck) return;

    const mainOnline = state.backendConnected || true; // sim always shows online
    const camOnline  = true;

    // Main ESP32
    const mainStatus = el('esp32MainStatus');
    if (mainStatus) { mainStatus.textContent = mainOnline ? 'ONLINE' : 'OFFLINE'; mainStatus.className = `esp32-status-badge ${mainOnline ? 'online' : 'offline'}`; }

    const gpsEl = el('esp32GPS');
    if (gpsEl) gpsEl.textContent = `OK — ${Math.floor(6 + Math.random()*4)} sats`;

    const mpuEl = el('esp32MPU');
    if (mpuEl) mpuEl.textContent = `OK — ${truck.tilt.toFixed(1)}° pitch`;

    const radarEl = el('esp32Radar');
    if (radarEl) radarEl.textContent = `OK — ${truck.distance.toFixed(0)}cm`;

    const hcEl = el('esp32HC');
    if (hcEl) hcEl.textContent = `OK — ${truck.distance.toFixed(0)}cm`;

    const dhtEl = el('esp32DHT');
    if (dhtEl) dhtEl.textContent = `OK — ${truck.temperature.toFixed(1)}°C`;

    const envEl = el('esp32EnvSensors');
    if (envEl) envEl.textContent = `OK — LUX:${truck.lightLevel.toFixed(0)} GAS:${truck.gasLevel.toFixed(0)}`;

    const v2vEl = el('esp32V2V');
    if (v2vEl) v2vEl.textContent = state.wsConnected ? 'ACTIVE — WS' : 'ACTIVE — SIM';

    // ESP32-CAM
    const camStatus = el('esp32CamStatus');
    if (camStatus) { camStatus.textContent = 'ONLINE'; camStatus.className = 'esp32-status-badge online'; }

    const fps = el('esp32FPS');
    if (fps) fps.textContent = `${CFG.camFPS} fps`;

    const streamEl = el('esp32Stream');
    if (streamEl) streamEl.textContent = 'ACTIVE';
}

/* ============================================================
   MAIN UPDATE LOOP
   ============================================================ */
function mainTick() {
    // Client-side sim (always runs; backend data overlays if available)
    simulateTruckTick();

    // Update all truck cards
    Object.values(fleet).forEach(updateTruckCard);

    // Right panel (selected truck)
    updateRightPanel();

    // Header
    updateHeader();

    // ESP32 diag
    updateESP32Panel();

    // V2V stream (push new packet occasionally)
    if (Math.random() < 0.45) pushV2VPacket();

    // Black box (push event for risk changes)
    Object.values(fleet).forEach(truck => {
        if (truck.riskLevel === 'HIGH' || truck.riskLevel === 'CRITICAL') {
            if (Math.random() < 0.15) {
                pushBlackboxEvent(truck.id, `${truck.riskLevel} risk — spd ${truck.speed.toFixed(0)}km/h safe ${truck.safeSpeed}km/h`, truck.riskLevel);
            }
        } else if (Math.random() < 0.05) {
            pushBlackboxEvent(truck.id, `Sensor telemetry logged`, 'LOW');
        }
    });
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
    startClock();
    initFogSelector();
    initTruckCardClicks();
    initRadarCanvas();
    initCamCanvas();

    // Initial data render
    Object.values(fleet).forEach(t => { t.safeSpeed = calcSafeSpeed(t); });
    Object.values(fleet).forEach(updateTruckCard);
    updateRightPanel();
    updateHeader();

    // Seed V2V and Black Box with initial events
    pushBlackboxEvent('DF-01', 'System online — DEEPFOG Fleet Operations active', 'LOW');
    pushBlackboxEvent('DF-02', 'HIGH RISK detected — proximity alert issued', 'HIGH');
    pushBlackboxEvent('DF-03', 'Loading in progress at Sector-4C', 'LOW');
    pushV2VPacket();
    pushV2VPacket();
    pushV2VPacket();

    // Start canvas loops
    radarLoop();
    camLoop();

    // Start main simulation tick
    setInterval(mainTick, 1500);

    // WebSocket connection
    connectWS();

    // API polling fallback
    pollAPI();
    setInterval(pollAPI, CFG.pollInterval);
}

// Boot
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
