/**
 * IMU panel: roll / pitch / yaw as numbers, as a historical line chart and
 * as a small artificial horizon.
 *
 * Note for the reader: in the lab simulator roll and pitch are DERIVED (a
 * walking oscillation) and only yaw is measured. In the backend's --demo
 * mode the quaternion only rotates about one axis, so roll and yaw sit flat
 * at 0.00 and just pitch moves. That is the data source behaving as
 * documented, not a bug in this panel.
 */
window.TP05 = window.TP05 || {};

(function () {
  var AXES = [
    { key: 'roll', label: 'roll', color: '#2f6fed' },
    { key: 'pitch', label: 'pitch', color: '#e8590c' },
    { key: 'yaw', label: 'yaw', color: '#2b8a3e' }
  ];

  function ImuPanel() {
    this.chart = null;
    this.readouts = {};
  }

  ImuPanel.prototype.mount = function () {
    var self = this;
    AXES.forEach(function (axis) {
      self.readouts[axis.key] = document.getElementById('imu-' + axis.key);
    });
    this.readouts.accel = document.getElementById('imu-accel');
    this.horizon = document.getElementById('imu-horizon-plane');

    if (TP05.charts.available()) {
      this.chart = new TP05.charts.LineChart('chart-imu', {
        yTitle: 'grados',
        suggestedMin: -20,
        suggestedMax: 20
      }).build();
      // Fixed series: unlike the motor chart, the axes never change.
      this.chart.setSeries(AXES, TP05.store.timeline.values, {
        roll: TP05.store.imu.roll.values,
        pitch: TP05.store.imu.pitch.values,
        yaw: TP05.store.imu.yaw.values
      });
    }
    return this;
  };

  ImuPanel.prototype.render = function (telemetry) {
    var fmt = TP05.format;
    var imu = telemetry.imu || {};
    var self = this;

    AXES.forEach(function (axis) {
      var node = self.readouts[axis.key];
      if (node) node.textContent = fmt.number(imu[axis.key], 2, ' °');
    });

    if (this.readouts.accel) {
      var hasAccel = fmt.isNumber(imu.ax) && fmt.isNumber(imu.ay) &&
        fmt.isNumber(imu.az);
      this.readouts.accel.textContent = hasAccel
        ? 'ax ' + imu.ax.toFixed(2) + '  ay ' + imu.ay.toFixed(2) +
          '  az ' + imu.az.toFixed(2) + ' m/s²'
        : 'el frame no trae aceleraciones';
    }

    // Artificial horizon: the plane rolls and shifts with pitch. Deliberately
    // exaggerated (x4) because the simulated oscillation is only a couple of
    // degrees and would otherwise be invisible. Without both angles the
    // attitude is unknown, so the plane is left where it was rather than
    // snapped to a level it cannot vouch for.
    if (this.horizon && fmt.isNumber(imu.pitch) && fmt.isNumber(imu.roll)) {
      this.horizon.style.transform =
        'translateY(' + (imu.pitch * 4) + 'px) rotate(' + (imu.roll * 4) + 'deg)';
    }

    if (this.chart && this.chart.isReady()) {
      this.chart.push(telemetry.ts, {
        roll: imu.roll, pitch: imu.pitch, yaw: imu.yaw
      }).render();
    }
  };

  /** Same contract as the motor panel: free the canvas before a remount. */
  ImuPanel.prototype.unmount = function () {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  };

  TP05.ImuPanel = ImuPanel;
})();
