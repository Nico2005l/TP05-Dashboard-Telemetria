/**
 * Static configuration for the telemetry dashboard.
 *
 * Every tunable lives here so no panel has to hardcode a magic number.
 * `THRESHOLDS.temperature` is deliberately overridable at runtime: the
 * assignment prescribes 40/60 C, but the lab simulator caps motor
 * temperature at 55 C, so the red band is unreachable unless the operator
 * lowers it. See docs/documento-tecnico.md.
 */
window.TP05 = window.TP05 || {};

TP05.config = {
  // Backend base address. The launcher prints the LAN IP to use; 127.0.0.1
  // is right whenever the simulator runs on this same machine.
  apiHost: '127.0.0.1',
  apiPort: 8001,

  // REST polling period in ms. The assignment caps this at 500 ms.
  pollIntervalMs: 500,

  // Ring buffer capacity: 300 samples = 30 s at the backend's 10 Hz.
  historySize: 300,

  // WebSocket reconnect backoff, in ms, capped at the last value.
  reconnectDelaysMs: [500, 1000, 2000, 5000],

  // A sample older than this marks the link as stale.
  stalenessTimeoutMs: 2000,

  // Motor temperature colour bands, in Celsius (assignment defaults).
  thresholds: {
    temperatureWarning: 40,
    temperatureDanger: 60,
    torqueWarning: 10
  },

  // How many motor curves the chart draws before it gets unreadable.
  maxChartSeries: 6,

  palette: {
    ok: '#4caf50',
    warning: '#ffc107',
    danger: '#f44336',
    idle: '#8a94a6'
  }
};

TP05.config.baseUrl = function () {
  return 'http://' + TP05.config.apiHost + ':' + TP05.config.apiPort;
};

TP05.config.socketUrl = function () {
  return 'ws://' + TP05.config.apiHost + ':' + TP05.config.apiPort + '/ws';
};
