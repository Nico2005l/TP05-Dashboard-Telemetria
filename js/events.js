/**
 * Minimal synchronous event emitter — the Observer pattern the assignment
 * asks for, without pulling in a library.
 *
 * Panels subscribe to 'telemetry' and 'status'; transports publish them.
 * Neither side knows the other exists, which is what lets the same panels
 * run off REST polling or off the WebSocket with no change.
 */
window.TP05 = window.TP05 || {};

TP05.Emitter = function () {
  this._listeners = {};
};

TP05.Emitter.prototype.on = function (event, handler) {
  (this._listeners[event] = this._listeners[event] || []).push(handler);
  return this;
};

TP05.Emitter.prototype.emit = function (event, payload) {
  var handlers = this._listeners[event];
  if (!handlers) return;
  // A throwing subscriber must not stop the others: one broken panel should
  // never take the whole dashboard down.
  for (var i = 0; i < handlers.length; i++) {
    try {
      handlers[i](payload);
    } catch (err) {
      console.error('[TP05] listener de "' + event + '" fallo:', err);
    }
  }
};
