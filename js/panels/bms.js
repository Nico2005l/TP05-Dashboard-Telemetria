/**
 * Battery panel: state of charge, current, pack temperature and the
 * individual cell voltages.
 *
 * The cell count is NOT a constant: the backend forwards whatever the source
 * reports. The simulator sends 10 identical cells, --demo sends 8 that do
 * vary, and a source that reports none at all yields an empty array — which
 * the panel has to survive, so it says "sin datos" instead of rendering an
 * empty grid.
 *
 * Current is signed: the simulator reports negative values while
 * discharging, so the panel labels the direction instead of showing a bare
 * minus sign.
 */
window.TP05 = window.TP05 || {};

(function () {
  function BmsPanel() {
    this.nodes = {};
    this.cellNodes = [];
  }

  BmsPanel.prototype.mount = function () {
    this.nodes = {
      soc: document.getElementById('bms-soc'),
      socBar: document.getElementById('bms-soc-bar'),
      current: document.getElementById('bms-current'),
      temperature: document.getElementById('bms-temperature'),
      cells: document.getElementById('bms-cells'),
      cellSpread: document.getElementById('bms-cell-spread')
    };
    return this;
  };

  /** Rebuild the cell grid only when the reported cell count changes. */
  BmsPanel.prototype._syncCells = function (cells) {
    if (this.cellNodes.length === cells.length) return;
    this.nodes.cells.innerHTML = '';
    this.cellNodes = [];

    if (!cells.length) {
      var empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'La fuente no reporta voltajes de celda.';
      this.nodes.cells.appendChild(empty);
      return;
    }

    for (var i = 0; i < cells.length; i++) {
      var box = document.createElement('div');
      box.className = 'cell';
      var name = document.createElement('span');
      name.className = 'cell-label';
      name.textContent = 'C' + (i + 1);
      var value = document.createElement('strong');
      value.textContent = '—';
      box.appendChild(name);
      box.appendChild(value);
      this.nodes.cells.appendChild(box);
      this.cellNodes.push(value);
    }
  };

  BmsPanel.prototype.render = function (telemetry) {
    var bms = telemetry.bms || {};
    var cells = bms.celdas || [];

    this.nodes.soc.textContent = bms.soc + ' %';
    this.nodes.socBar.style.width = Math.max(0, Math.min(100, bms.soc)) + '%';
    this.nodes.socBar.className = 'bar-fill ' +
      (bms.soc < 20 ? 'is-danger' : bms.soc < 40 ? 'is-warning' : 'is-ok');

    var current = bms.corriente || 0;
    var direction = current < 0 ? 'descarga' : current > 0 ? 'carga' : '';
    this.nodes.current.innerHTML = '';
    this.nodes.current.appendChild(
      document.createTextNode(Math.abs(current) + ' mA '));
    if (direction) {
      var tag = document.createElement('small');
      tag.textContent = direction;
      this.nodes.current.appendChild(tag);
    }
    this.nodes.temperature.textContent = (bms.temperatura || 0).toFixed(1) + ' °C';

    this._syncCells(cells);
    for (var i = 0; i < this.cellNodes.length; i++) {
      this.cellNodes[i].textContent = cells[i].toFixed(3) + ' V';
    }

    // Cell spread is the number that actually matters on a real pack: a
    // healthy one stays tight. The simulator sends identical cells, so this
    // reads 0.000 V there and is only meaningful against the physical robot.
    if (cells.length) {
      var spread = Math.max.apply(null, cells) - Math.min.apply(null, cells);
      this.nodes.cellSpread.textContent =
        'dispersión ' + spread.toFixed(3) + ' V';
    } else {
      this.nodes.cellSpread.textContent = '';
    }
  };

  TP05.BmsPanel = BmsPanel;
})();
