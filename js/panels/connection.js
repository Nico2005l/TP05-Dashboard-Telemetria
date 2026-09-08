/**
 * Link status panel.
 *
 * Worth stating why this exists as its own panel: the reference snippet in
 * the assignment swallows fetch errors in an empty `catch`, so a dashboard
 * built from it keeps showing the last values forever and gives the operator
 * no way to tell live data from a frozen screen. Telemetry that might be
 * stale without saying so is worse than telemetry that is plainly absent.
 *
 * Two independent signals are tracked:
 *   - transport state, reported by the transport itself
 *   - staleness, from a watchdog: an open socket that stopped sending frames
 *     still counts as a loss of telemetry
 */
window.TP05 = window.TP05 || {};

(function () {
  var cfg = TP05.config;

  var STATE_TEXT = {
    connecting: 'conectando…',
    online: 'en línea',
    offline: 'sin conexión'
  };

  function ConnectionPanel() {
    this.state = 'connecting';
    this.detail = '';
    this.watchdog = null;
  }

  ConnectionPanel.prototype.mount = function () {
    this.nodes = {
      badge: document.getElementById('link-badge'),
      transport: document.getElementById('link-transport'),
      age: document.getElementById('link-age'),
      detail: document.getElementById('link-detail'),
      frames: document.getElementById('link-frames')
    };
    this.frames = 0;

    var self = this;
    this.watchdog = setInterval(function () { self._refresh(); }, 250);
    return this;
  };

  ConnectionPanel.prototype.onStatus = function (status) {
    this.state = status.state;
    this.detail = status.detail || '';
    this.nodes.transport.textContent =
      status.transport === 'websocket' ? 'WebSocket · push ~10 Hz'
        : 'REST polling · ' + cfg.pollIntervalMs + ' ms';
    this._refresh();
  };

  ConnectionPanel.prototype.onTelemetry = function () {
    this.frames++;
  };

  ConnectionPanel.prototype._refresh = function () {
    var store = TP05.store;
    var stale = store.isStale();
    // An 'online' transport with no recent frame is still a data outage.
    var effective = (this.state === 'online' && stale) ? 'offline' : this.state;

    this.nodes.badge.textContent = STATE_TEXT[effective] || effective;
    this.nodes.badge.className = 'badge ' +
      (effective === 'online' ? 'is-ok'
        : effective === 'connecting' ? 'is-warning' : 'is-danger');
    document.body.classList.toggle('link-offline', effective === 'offline');

    this.nodes.age.textContent = store.lastUpdate
      ? 'última muestra hace ' +
        ((Date.now() - store.lastUpdate) / 1000).toFixed(1) + ' s'
      : 'sin muestras todavía';
    this.nodes.frames.textContent = this.frames + ' frames recibidos';
    this.nodes.detail.textContent = (effective === 'offline' && this.detail)
      ? this.detail
      : (effective === 'offline' && stale ? 'no llegan frames nuevos' : '');
  };

  TP05.ConnectionPanel = ConnectionPanel;
})();
