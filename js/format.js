/**
 * Value formatting shared by the panels.
 *
 * This exists for one reason: a telemetry frame is not guaranteed to carry
 * every field. A source that stops reporting `imu.ax`, or a motor that comes
 * through without a temperature, used to throw on `.toFixed()`. The emitter
 * caught the throw so the dashboard stayed up, but the panel was left half
 * painted with nothing on screen saying so — the same silent-stale-data
 * problem the link panel exists to prevent.
 *
 * A missing reading renders as an em dash, which is the placeholder the
 * markup already ships with, and never as 0: a zero is a measurement.
 */
window.TP05 = window.TP05 || {};

TP05.format = {
  MISSING: '—',

  /** Finite numbers only: null, undefined, NaN and Infinity are 'no reading'. */
  isNumber: function (value) {
    return typeof value === 'number' && isFinite(value);
  },

  /** number(21.5, 1, ' °C') -> '21.5 °C'; a missing value -> '—'. */
  number: function (value, digits, suffix) {
    if (!TP05.format.isNumber(value)) return TP05.format.MISSING;
    return value.toFixed(digits) + (suffix || '');
  }
};
