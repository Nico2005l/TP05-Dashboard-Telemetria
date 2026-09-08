/**
 * Motor panel: one row per motor with temperature, angle, angular velocity
 * and estimated torque, plus the historical temperature chart.
 *
 * Two things this panel does on purpose:
 *
 * 1. Rows are created ONCE (from GET /info) and afterwards only their cell
 *    text and colours change. Rebuilding 29 rows x 6 cells at 10 Hz over
 *    the WebSocket is wasted DOM work and makes text unselectable.
 *
 * 2. The motor count and the motor NAMES come from the profile, never from
 *    a constant. Go2 reports 12 motors, G1 reports 29, with different names.
 */
window.TP05 = window.TP05 || {};

(function () {
  var cfg = TP05.config;

  function MotorsPanel() {
    this.rows = {};             // motorId -> {cells}
    this.selected = [];         // motorIds drawn in the chart
    this.chart = null;
    this.tbody = null;
    this.selectorHost = null;
  }

  /** Assignment thresholds: green < 40, yellow 40-60, red > 60 (Celsius). */
  MotorsPanel.prototype.temperatureClass = function (celsius) {
    var t = cfg.thresholds;
    if (celsius > t.temperatureDanger) return 'is-danger';
    if (celsius >= t.temperatureWarning) return 'is-warning';
    return 'is-ok';
  };

  MotorsPanel.prototype.mount = function (profile) {
    this.tbody = document.querySelector('#motors-table tbody');
    this.selectorHost = document.getElementById('motor-selector');
    this.tbody.innerHTML = '';
    this.selectorHost.innerHTML = '';
    this.rows = {};

    var names = profile.motores_nombres || [];
    for (var id = 0; id < profile.n_motores; id++) {
      this.tbody.appendChild(this._buildRow(id, names[id] || ('motor ' + id)));
      this.selectorHost.appendChild(this._buildCheckbox(id, names[id] || ('' + id)));
    }

    // Default selection: the first few motors, so the chart is readable on
    // the G1 too (29 overlapping curves are not a visualisation).
    this.selected = [];
    for (var i = 0; i < Math.min(cfg.maxChartSeries, profile.n_motores); i++) {
      this.selected.push(i);
      this.selectorHost.querySelector('input[value="' + i + '"]').checked = true;
    }

    document.getElementById('motors-count').textContent =
      profile.n_motores + ' motores';

    this._mountChart();
    this._syncSeries();
    return this;
  };

  MotorsPanel.prototype._buildRow = function (id, name) {
    var tr = document.createElement('tr');
    var cells = {};
    [
      ['id', id],
      ['name', name],
      ['temperature', '—'],
      ['angle', '—'],
      ['velocity', '—'],
      ['torque', '—']
    ].forEach(function (pair) {
      var td = document.createElement('td');
      td.textContent = pair[1];
      td.className = 'cell-' + pair[0];
      cells[pair[0]] = td;
      tr.appendChild(td);
    });
    this.rows[id] = cells;
    return tr;
  };

  MotorsPanel.prototype._buildCheckbox = function (id, name) {
    var self = this;
    var label = document.createElement('label');
    label.className = 'chip';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.value = id;
    input.addEventListener('change', function () { self._onToggle(id, input); });
    label.appendChild(input);
    label.appendChild(document.createTextNode(name));
    return label;
  };

  MotorsPanel.prototype._onToggle = function (id, input) {
    if (input.checked) {
      if (this.selected.length >= cfg.maxChartSeries) {
        input.checked = false;
        document.getElementById('motor-selector-hint').textContent =
          'Máximo ' + cfg.maxChartSeries + ' curvas a la vez.';
        return;
      }
      this.selected.push(id);
      this.selected.sort(function (a, b) { return a - b; });
    } else {
      this.selected = this.selected.filter(function (x) { return x !== id; });
    }
    document.getElementById('motor-selector-hint').textContent = '';
    this._syncSeries();
  };

  MotorsPanel.prototype._mountChart = function () {
    if (this.chart || !TP05.charts.available()) return;
    var t = cfg.thresholds;
    this.chart = new TP05.charts.LineChart('chart-temperature', {
      yTitle: 'temperatura (°C)',
      suggestedMin: 25,
      suggestedMax: 70
    }).withGuides([
      { label: 'umbral amarillo', value: t.temperatureWarning, color: cfg.palette.warning },
      { label: 'umbral rojo', value: t.temperatureDanger, color: cfg.palette.danger }
    ]).build();
  };

  /** Rebuild datasets after a selection change, seeded from stored history. */
  MotorsPanel.prototype._syncSeries = function () {
    if (!this.chart || !this.chart.isReady()) return;
    var store = TP05.store;
    var profile = store.profile || { motores_nombres: [] };
    var seed = {};
    var series = this.selected.map(function (id, index) {
      var buffer = store.motorTemperature[id];
      seed['m' + id] = buffer ? buffer.values : [];
      return {
        key: 'm' + id,
        label: (profile.motores_nombres[id] || ('motor ' + id)),
        color: TP05.charts.colorFor(index)
      };
    });
    this.chart.setSeries(series, store.timeline.values, seed);
  };

  /** Called once per telemetry frame. */
  MotorsPanel.prototype.render = function (telemetry) {
    var motors = telemetry.motores || [];
    var hottest = null;

    for (var i = 0; i < motors.length; i++) {
      var motor = motors[i];
      var cells = this.rows[motor.id];
      if (!cells) continue;

      cells.temperature.textContent = motor.temperatura.toFixed(1) + ' °C';
      cells.temperature.className =
        'cell-temperature ' + this.temperatureClass(motor.temperatura);
      cells.angle.textContent = motor.angulo.toFixed(2) + ' °';
      cells.velocity.textContent = motor.velocidad.toFixed(3) + ' rad/s';
      cells.torque.textContent = motor.torque.toFixed(2) + ' N·m';
      cells.torque.className = 'cell-torque' +
        (Math.abs(motor.torque) > cfg.thresholds.torqueWarning ? ' is-warning' : '');

      if (!hottest || motor.temperatura > hottest.temperatura) hottest = motor;
    }

    if (hottest) {
      var badge = document.getElementById('motors-hottest');
      badge.textContent = 'más caliente: ' + hottest.nombre + ' ' +
        hottest.temperatura.toFixed(1) + ' °C';
      badge.className = 'badge ' + this.temperatureClass(hottest.temperatura);
    }

    if (this.chart && this.chart.isReady()) {
      var values = {};
      for (var j = 0; j < motors.length; j++) {
        values['m' + motors[j].id] = motors[j].temperatura;
      }
      this.chart.push(telemetry.ts, values).render();
    }
  };

  /** Re-colour and re-draw guides after the operator moves a threshold. */
  MotorsPanel.prototype.onThresholdsChanged = function () {
    if (!this.chart || !this.chart.isReady()) return;
    var t = cfg.thresholds;
    this.chart.guides[0].value = t.temperatureWarning;
    this.chart.guides[1].value = t.temperatureDanger;
    // Force a dataset rebuild so the guide lines redraw at the new level.
    this.chart.keys = [];
    this._syncSeries();
  };

  TP05.MotorsPanel = MotorsPanel;
})();
