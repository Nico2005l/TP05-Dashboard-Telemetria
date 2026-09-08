/**
 * In-memory state: rolling history for the charts plus the manually
 * captured samples that feed the CSV export.
 *
 * The history is a fixed-capacity ring buffer (`historySize`, 300 by
 * default = 30 s at 10 Hz). It is filled by push/shift over a plain array:
 * once full, the oldest sample drops so the chart keeps a sliding window
 * and never has to be recreated.
 */
window.TP05 = window.TP05 || {};

(function () {
  var cfg = TP05.config;

  function RingBuffer(capacity) {
    this.capacity = capacity;
    this.values = [];
  }

  RingBuffer.prototype.push = function (value) {
    this.values.push(value);
    if (this.values.length > this.capacity) this.values.shift();
    return this;
  };

  RingBuffer.prototype.last = function () {
    return this.values.length ? this.values[this.values.length - 1] : null;
  };

  function Store() {
    this.profile = null;        // GET /info payload
    this.latest = null;         // last telemetry frame
    this.lastUpdate = 0;        // Date.now() of that frame
    this.timeline = new RingBuffer(cfg.historySize);   // 'ts' per sample
    this.motorTemperature = {}; // motorId -> RingBuffer
    this.motorTorque = {};
    this.imu = {
      roll: new RingBuffer(cfg.historySize),
      pitch: new RingBuffer(cfg.historySize),
      yaw: new RingBuffer(cfg.historySize)
    };
    this.samples = [];          // manual captures, exported as CSV
  }

  Store.prototype.setProfile = function (profile) {
    this.profile = profile;
    return this;
  };

  /** Feed one telemetry frame into every history series. */
  Store.prototype.ingest = function (telemetry) {
    this.latest = telemetry;
    this.lastUpdate = Date.now();
    this.timeline.push(telemetry.ts);

    var motors = telemetry.motores || [];
    for (var i = 0; i < motors.length; i++) {
      var motor = motors[i];
      if (!this.motorTemperature[motor.id]) {
        this.motorTemperature[motor.id] = new RingBuffer(cfg.historySize);
        this.motorTorque[motor.id] = new RingBuffer(cfg.historySize);
      }
      this.motorTemperature[motor.id].push(motor.temperatura);
      this.motorTorque[motor.id].push(motor.torque);
    }

    var imu = telemetry.imu || {};
    this.imu.roll.push(imu.roll);
    this.imu.pitch.push(imu.pitch);
    this.imu.yaw.push(imu.yaw);
    return this;
  };

  /** True when the newest frame is older than the staleness timeout. */
  Store.prototype.isStale = function () {
    if (!this.lastUpdate) return true;
    return (Date.now() - this.lastUpdate) > cfg.stalenessTimeoutMs;
  };

  /**
   * Snapshot the current frame into the session sample list.
   *
   * The row is flattened here rather than at export time so the CSV columns
   * stay stable even if the operator switches robots mid-session.
   */
  Store.prototype.captureSample = function (reason) {
    if (!this.latest) return null;
    var t = this.latest;
    var row = {
      capturado_en: new Date().toISOString(),
      motivo: reason || 'manual',
      modelo: t.modelo,
      ts: t.ts,
      roll: t.imu.roll,
      pitch: t.imu.pitch,
      yaw: t.imu.yaw,
      ax: t.imu.ax,
      ay: t.imu.ay,
      az: t.imu.az,
      bms_soc: t.bms.soc,
      bms_corriente: t.bms.corriente,
      bms_temperatura: t.bms.temperatura
    };

    (t.bms.celdas || []).forEach(function (volt, index) {
      row['celda_' + (index + 1) + '_v'] = volt;
    });

    (t.motores || []).forEach(function (motor) {
      var prefix = 'm' + motor.id + '_' + motor.nombre + '_';
      row[prefix + 'angulo'] = motor.angulo;
      row[prefix + 'velocidad'] = motor.velocidad;
      row[prefix + 'torque'] = motor.torque;
      row[prefix + 'temperatura'] = motor.temperatura;
    });

    Object.keys(t.fuerzas || {}).forEach(function (leg) {
      row['pata_' + leg] = t.fuerzas[leg];
    });

    this.samples.push(row);
    return row;
  };

  Store.prototype.clearSamples = function () {
    this.samples = [];
  };

  TP05.RingBuffer = RingBuffer;
  TP05.store = new Store();
})();
