/**
 * Transport layer: the only code that talks to the backend.
 *
 * Two interchangeable implementations behind one interface (start/stop plus
 * the 'telemetry' and 'status' events):
 *
 *   PollingTransport  — REST, GET /telemetria every `pollIntervalMs`
 *   SocketTransport   — WS /ws, ~10 Hz push, reconnects on its own
 *
 * Swapping one for the other is a single call in main.js. Panels are not
 * aware of which one is running.
 *
 * Status values: 'connecting' | 'online' | 'offline'
 */
window.TP05 = window.TP05 || {};

(function () {
  var cfg = TP05.config;

  /** GET /info — robot shape (motor count, motor names, leg names). */
  TP05.fetchProfile = function () {
    return fetch(cfg.baseUrl() + '/info').then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  };

  // ---------------------------------------------------------------- polling

  function PollingTransport() {
    TP05.Emitter.call(this);
    this.name = 'polling';
    this._timer = null;
    this._inFlight = false;
  }
  PollingTransport.prototype = Object.create(TP05.Emitter.prototype);
  PollingTransport.prototype.constructor = PollingTransport;

  PollingTransport.prototype.start = function () {
    var self = this;
    if (this._timer) return;
    this.emit('status', { state: 'connecting', transport: this.name });
    this._tick();
    this._timer = setInterval(function () { self._tick(); }, cfg.pollIntervalMs);
  };

  PollingTransport.prototype.stop = function () {
    clearInterval(this._timer);
    this._timer = null;
  };

  PollingTransport.prototype._tick = function () {
    var self = this;
    // Skip the tick if the previous request has not come back yet, otherwise
    // a slow backend builds an ever-growing queue of pending fetches.
    if (this._inFlight) return;
    this._inFlight = true;

    fetch(cfg.baseUrl() + '/telemetria')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        self.emit('status', { state: 'online', transport: self.name });
        self.emit('telemetry', data);
      })
      .catch(function (err) {
        // Keep the last values on screen and say so, rather than blanking
        // the panels: a dropped sample is not a reason to lose context.
        self.emit('status', {
          state: 'offline', transport: self.name, detail: err.message
        });
      })
      .then(function () { self._inFlight = false; });
  };

  // -------------------------------------------------------------- websocket

  function SocketTransport() {
    TP05.Emitter.call(this);
    this.name = 'websocket';
    this._socket = null;
    this._attempt = 0;
    this._retryTimer = null;
    this._closedByUs = false;
  }
  SocketTransport.prototype = Object.create(TP05.Emitter.prototype);
  SocketTransport.prototype.constructor = SocketTransport;

  SocketTransport.prototype.start = function () {
    var self = this;
    this._closedByUs = false;
    this.emit('status', { state: 'connecting', transport: this.name });

    var socket = new WebSocket(cfg.socketUrl());
    this._socket = socket;

    socket.onopen = function () {
      self._attempt = 0;
      self.emit('status', { state: 'online', transport: self.name });
    };

    socket.onmessage = function (event) {
      try {
        self.emit('telemetry', JSON.parse(event.data));
      } catch (err) {
        console.error('[TP05] frame invalido:', err);
      }
    };

    socket.onerror = function () {
      self.emit('status', {
        state: 'offline', transport: self.name, detail: 'error de socket'
      });
    };

    socket.onclose = function () {
      if (self._closedByUs) return;
      self.emit('status', {
        state: 'offline', transport: self.name, detail: 'socket cerrado'
      });
      self._scheduleReconnect();
    };
  };

  SocketTransport.prototype.stop = function () {
    this._closedByUs = true;
    clearTimeout(this._retryTimer);
    this._retryTimer = null;
    if (this._socket) {
      this._socket.close();
      this._socket = null;
    }
  };

  /** Backoff reconnect: the lab docs ask for this explicitly. */
  SocketTransport.prototype._scheduleReconnect = function () {
    var self = this;
    var delays = cfg.reconnectDelaysMs;
    var delay = delays[Math.min(this._attempt, delays.length - 1)];
    this._attempt++;
    clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(function () { self.start(); }, delay);
  };

  TP05.PollingTransport = PollingTransport;
  TP05.SocketTransport = SocketTransport;

  TP05.createTransport = function (kind) {
    return kind === 'websocket' ? new SocketTransport() : new PollingTransport();
  };
})();
