/**
 * Foot contact panel.
 *
 * The assignment names four legs (FR / FL / RR / RL), which is the Go2. The
 * G1 reports two feet under different keys (R_foot / L_foot), so the leg
 * list is read from GET /info and the indicators are built from it. A
 * hardcoded quadruped layout renders an empty panel on the humanoid.
 *
 * When the four Go2 keys are present the indicators are laid out as a
 * top-down view of the robot; anything else falls back to a plain row.
 */
window.TP05 = window.TP05 || {};

(function () {
  // Grid positions for the quadruped top-down view: front is up.
  var QUADRUPED_LAYOUT = { FL: 1, FR: 2, RL: 3, RR: 4 };

  var LEG_LABELS = {
    FR: 'delantera derecha',
    FL: 'delantera izquierda',
    RR: 'trasera derecha',
    RL: 'trasera izquierda',
    R_foot: 'pie derecho',
    L_foot: 'pie izquierdo'
  };

  function FeetPanel() {
    this.indicators = {};
  }

  FeetPanel.prototype.mount = function (profile) {
    var host = document.getElementById('feet-grid');
    var legs = profile.patas || [];
    host.innerHTML = '';
    this.indicators = {};

    var isQuadruped = legs.length === 4 &&
      legs.every(function (leg) { return QUADRUPED_LAYOUT[leg]; });
    host.className = isQuadruped ? 'feet-grid is-quadruped' : 'feet-grid is-row';

    var self = this;
    legs.forEach(function (leg) {
      var box = document.createElement('div');
      box.className = 'foot';
      if (isQuadruped) box.style.gridArea = 'a' + QUADRUPED_LAYOUT[leg];

      var name = document.createElement('strong');
      name.textContent = leg;
      var state = document.createElement('span');
      state.className = 'foot-state';
      state.textContent = '—';
      var hint = document.createElement('small');
      hint.textContent = LEG_LABELS[leg] || '';

      box.appendChild(name);
      box.appendChild(state);
      box.appendChild(hint);
      host.appendChild(box);
      self.indicators[leg] = { box: box, state: state };
    });

    document.getElementById('feet-note').textContent = legs.length
      ? legs.length + ' apoyos reportados por /info'
      : 'Este robot no reporta apoyos.';
    return this;
  };

  FeetPanel.prototype.render = function (telemetry) {
    var forces = telemetry.fuerzas || {};
    var keys = Object.keys(this.indicators);
    var down = 0;

    for (var i = 0; i < keys.length; i++) {
      var leg = keys[i];
      var planted = forces[leg] === 1;
      if (planted) down++;
      this.indicators[leg].box.className = 'foot ' + (planted ? 'is-down' : 'is-up');
      this.indicators[leg].state.textContent = planted ? 'apoyada' : 'en el aire';
    }

    document.getElementById('feet-summary').textContent =
      down + ' / ' + keys.length + ' apoyadas';
  };

  TP05.FeetPanel = FeetPanel;
})();
