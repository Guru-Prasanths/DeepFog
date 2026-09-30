/**
 * DEEPFOG — Sensor Data Charts Module
 * 
 * Manages Chart.js instances for real-time and historical sensor visualization.
 * Configured with an industrial dark-mode aesthetic for mine control-room displays.
 * 
 * Visualizes:
 * - Temperature (°C)
 * - Humidity (%)
 * - Gas / Smoke (MQ-2 raw / ppm)
 * - Visibility / Light (LDR ADC value)
 * - Distance (HC-SR04 cm)
 * - Acceleration (MPU-6050 g-force)
 * - Overall Sensor-Fusion Risk Score (0 - 100)
 */

const DeepFogCharts = (() => {
    // Chart instances storage
    const instances = {};

    // Maximum data points retained in live rolling charts
    const MAX_DATA_POINTS = 30;

    // Common Dark Theme Chart Configuration
    const CHART_THEME = {
        gridColor: 'rgba(255, 255, 255, 0.06)',
        textColor: '#94a3b8',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        fontSize: 11
    };

    /**
     * Create a standard Chart.js configuration
     */
    function createConfig(label, colorHex, unit, min = null, max = null) {
        return {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: `${label} (${unit})`,
                    data: [],
                    borderColor: colorHex,
                    backgroundColor: `${colorHex}18`, // 10% opacity for fill
                    borderWidth: 2,
                    pointBackgroundColor: colorHex,
                    pointBorderColor: '#0f172a',
                    pointRadius: 2.5,
                    pointHoverRadius: 5,
                    tension: 0.35,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 400 },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#f1f5f9',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: (context) => ` ${context.parsed.y} ${unit}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: CHART_THEME.gridColor,
                            drawBorder: false
                        },
                        ticks: {
                            color: CHART_THEME.textColor,
                            font: { family: CHART_THEME.fontFamily, size: CHART_THEME.fontSize },
                            maxTicksLimit: 6,
                            maxRotation: 0
                        }
                    },
                    y: {
                        min: min,
                        max: max,
                        grid: {
                            color: CHART_THEME.gridColor,
                            drawBorder: false
                        },
                        ticks: {
                            color: CHART_THEME.textColor,
                            font: { family: CHART_THEME.fontFamily, size: CHART_THEME.fontSize },
                            callback: (val) => `${val}${unit ? ' ' + unit : ''}`
                        }
                    }
                }
            }
        };
    }

    /**
     * Initialize all 7 sensor history charts
     */
    function init() {
        if (typeof Chart === 'undefined') {
            console.warn('[Charts] Chart.js not loaded. Sensor history charts disabled.');
            return;
        }

        const chartConfigs = {
            chartTemperature: { label: 'Temperature', color: '#ff7675', unit: '°C' },
            chartHumidity:    { label: 'Humidity',    color: '#00d4ff', unit: '%' },
            chartGas:         { label: 'Gas / Smoke', color: '#fab1a0', unit: 'raw' },
            chartLight:       { label: 'Visibility',  color: '#ffeaa7', unit: 'lux' },
            chartDistance:    { label: 'Distance',    color: '#55efc4', unit: 'cm' },
            chartAcceleration:{ label: 'Accel.',      color: '#a29bfe', unit: 'g' },
            chartRiskScore:   { label: 'Risk Score',  color: '#ff4757', unit: '/100', min: 0, max: 100 }
        };

        for (const [id, cfg] of Object.entries(chartConfigs)) {
            const canvas = document.getElementById(id);
            if (!canvas) continue;

            const ctx = canvas.getContext('2d');
            if (instances[id]) {
                instances[id].destroy();
            }

            instances[id] = new Chart(ctx, createConfig(cfg.label, cfg.color, cfg.unit, cfg.min, cfg.max));
        }

        console.log('[Charts] Initialized sensor history charts.');
    }

    /**
     * Populate charts with historical sensor readings array from backend
     * @param {Array} readings - Array of sensor readings (chronological order)
     */
    function loadHistory(readings) {
        if (!readings || readings.length === 0) {
            const emptyEl = document.getElementById('chartEmptyState');
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }

        const emptyEl = document.getElementById('chartEmptyState');
        if (emptyEl) emptyEl.style.display = 'none';

        // Sort chronologically ascending
        const sorted = [...readings].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
        const labels = sorted.map(r => formatTime(r.recorded_at));

        const mapping = {
            chartTemperature: sorted.map(r => Number(r.temperature ?? 0)),
            chartHumidity:    sorted.map(r => Number(r.humidity ?? 0)),
            chartGas:         sorted.map(r => Number(r.gas_level ?? 0)),
            chartLight:       sorted.map(r => Number(r.light_level ?? 0)),
            chartDistance:    sorted.map(r => Number(r.distance ?? 0)),
            chartAcceleration:sorted.map(r => Number(r.acceleration ?? 0)),
            chartRiskScore:   sorted.map(r => Number(r.risk_score ?? 0))
        };

        for (const [chartId, dataSeries] of Object.entries(mapping)) {
            const chart = instances[chartId];
            if (chart) {
                chart.data.labels = labels;
                chart.data.datasets[0].data = dataSeries;
                chart.update('none'); // Update without full animation for performance
            }
        }
    }

    /**
     * Append a single new sensor reading in real-time
     * @param {Object} reading - Latest reading object
     */
    function addDataPoint(reading) {
        if (!reading) return;

        const timeLabel = formatTime(reading.recorded_at || new Date().toISOString());

        const values = {
            chartTemperature: Number(reading.temperature ?? 0),
            chartHumidity:    Number(reading.humidity ?? 0),
            chartGas:         Number(reading.gas_level ?? 0),
            chartLight:       Number(reading.light_level ?? 0),
            chartDistance:    Number(reading.distance ?? 0),
            chartAcceleration:Number(reading.acceleration ?? 0),
            chartRiskScore:   Number(reading.risk_score ?? 0)
        };

        for (const [chartId, val] of Object.entries(values)) {
            const chart = instances[chartId];
            if (chart) {
                chart.data.labels.push(timeLabel);
                chart.data.datasets[0].data.push(val);

                // Maintain fixed rolling window
                if (chart.data.labels.length > MAX_DATA_POINTS) {
                    chart.data.labels.shift();
                    chart.data.datasets[0].data.shift();
                }

                chart.update('none');
            }
        }
    }

    /**
     * Format timestamp to HH:mm:ss for chart axis
     */
    function formatTime(isoString) {
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        } catch {
            return '';
        }
    }

    return {
        init,
        loadHistory,
        addDataPoint
    };
})();
