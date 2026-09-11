/**
 * Bootstrap and wiring. This is the only file that knows about all the
 * pieces at once; the panels and the transports never reference each other.
 *
 * Boot order:
 *   1. GET /info  -> the robot profile (motor count, names, leg names)
 *   2. mount the panels against that profile
 *   3. start a transport and let the panels observe it
 *
 * Step 1 is a hard dependency: without the profile there is no way to know
 * whether to draw 12 rows or 29, or which leg keys to expect. If it fails,
 * the dashboard says so and retries instead of guessing a Go2.
 */
window.TP05 = window.TP05 || {};

(function () {
  var cfg = TP05.config;
  var store = TP05.store;

  var app = {
    transport: null,
    panels: {},
    booted: false
  };

  // ------------------------------------------------------------- boot

  function boot() {
    readSettingsFromUrl();
    bindControls();
    app.panels.link = new TP05.ConnectionPanel().mount();
    loadProfile();
  }

  /**
   * Read overrides from the query string, so the same file works against the
   * lab machine, and against either robot, without editing config.js:
   *
   *   ?host=10.0.0.5&port=8001   backend address
   *   ?amarillo=34&rojo=40       temperature thresholds
   *   ?transporte=websocket      start on the socket instead of polling
   *
   * The threshold overrides exist for the same reason the inputs do: the
   * simulator never reaches the prescribed 60 C, so the red band can only be
   * exercised by lowering it.
   */
  function readSettingsFromUrl() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('host')) cfg.apiHost = params.get('host');
    if (params.get('port')) cfg.apiPort = parseInt(params.get('port'), 10);

    var warning = parseFloat(params.get('amarillo'));
    var danger = parseFloat(params.get('rojo'));
    if (!isNaN(warning)) cfg.thresholds.temperatureWarning = warning;
    if (!isNaN(danger)) cfg.thresholds.temperatureDanger = danger;

    var transport = params.get('transporte');
    if (transport === 'websocket' || transport === 'polling') {
      var radio = document.querySelector(
        'input[name="transport"][value="' + transport + '"]');
      if (radio) radio.checked = true;
    }

    document.getElementById('input-host').value = cfg.apiHost;
    document.getElementById('input-port').value = cfg.apiPort;
  }

  function loadProfile() {
    setBanner('Consultando ' + cfg.baseUrl() + '/info …', 'info');

    TP05.fetchProfile().then(function (profile) {
      // A profile load opens a new session: drop the previous history before
      // the first frame of this one arrives. See Store.prototype.reset.
      store.reset();
      store.setProfile(profile);
      renderProfile(profile);
      mountPanels(profile);
      clearBanner();
      startTransport(currentTransportKind());
    }).catch(function (err) {
      // A failing profile fetch is itself a link outage: say so on the badge,
      // not only in the banner.
      app.panels.link.onStatus({
        state: 'offline',
        transport: currentTransportKind(),
        detail: '/info no responde'
      });
      setBanner('No se pudo leer ' + cfg.baseUrl() + '/info (' + err.message +
        '). Verificá que el backend esté levantado y que la dirección sea la ' +
        'que imprimió el script. Reintentando en 3 s…', 'error');
      setTimeout(loadProfile, 3000);
    });
  }

  function renderProfile(profile) {
    document.getElementById('robot-name').textContent = profile.nombre;
    document.getElementById('robot-meta').textContent =
      profile.tipo + ' · ' + profile.n_motores + ' motores · modo ' +
      profile.modo + ' · ' + profile.frecuencia_hz + ' Hz';
  }

  /**
   * Tear down the data panels before they are rebuilt. The ones that own a
   * Chart hold on to their canvas until they are told to let go, so this has
   * to run before mountPanels() and not after.
   *
   * The link panel is not on the list: it is mounted once at boot and owns
   * the staleness watchdog.
   */
  function unmountPanels() {
    ['motors', 'imu', 'bms', 'feet'].forEach(function (key) {
      var panel = app.panels[key];
      if (panel && panel.unmount) panel.unmount();
      app.panels[key] = null;
    });
    app.booted = false;
  }

  function mountPanels(profile) {
    // Panels are rebuilt from scratch on a profile change: switching robots
    // changes the motor count and the leg keys, so patching is not enough.
    unmountPanels();
    app.panels.motors = new TP05.MotorsPanel().mount(profile);
    app.panels.imu = new TP05.ImuPanel().mount();
    app.panels.bms = new TP05.BmsPanel().mount();
    app.panels.feet = new TP05.FeetPanel().mount(profile);
    app.booted = true;
  }

  // -------------------------------------------------------- transport

  function currentTransportKind() {
    var checked = document.querySelector('input[name="transport"]:checked');
    return checked ? checked.value : 'polling';
  }

  function startTransport(kind) {
    if (app.transport) app.transport.stop();

    app.transport = TP05.createTransport(kind);
    app.transport.on('telemetry', onTelemetry);
    app.transport.on('status', function (status) {
      app.panels.link.onStatus(status);
    });
    app.transport.start();
  }

  function onTelemetry(telemetry) {
    // Guard against a frame from the wrong robot: the backend answers 409 on
    // a model mismatch, but a stale socket could still deliver one.
    if (store.profile && telemetry.modelo !== store.profile.modelo) return;

    store.ingest(telemetry);
    app.panels.link.onTelemetry();
    if (!app.booted) return;

    app.panels.motors.render(telemetry);
    app.panels.imu.render(telemetry);
    app.panels.bms.render(telemetry);
    app.panels.feet.render(telemetry);
  }

  // --------------------------------------------------------- controls

  function bindControls() {
    var radios = document.querySelectorAll('input[name="transport"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].addEventListener('change', function () {
        startTransport(currentTransportKind());
      });
    }

    document.getElementById('btn-apply-address').addEventListener('click', function () {
      cfg.apiHost = document.getElementById('input-host').value.trim() || '127.0.0.1';
      cfg.apiPort = parseInt(document.getElementById('input-port').value, 10) || 8001;
      if (app.transport) app.transport.stop();
      app.booted = false;
      loadProfile();
    });

    document.getElementById('btn-capture').addEventListener('click', function () {
      captureSample('manual');
    });

    document.getElementById('btn-export').addEventListener('click', function () {
      var ok = TP05.csv.download(store.samples,
        'telemetria_' + (store.profile ? store.profile.modelo : 'robot'));
      if (!ok) setBanner('No hay muestras capturadas para exportar.', 'warn');
    });

    document.getElementById('btn-clear').addEventListener('click', function () {
      store.clearSamples();
      refreshSampleCount();
    });

    bindThreshold('input-temp-warning', 'temperatureWarning');
    bindThreshold('input-temp-danger', 'temperatureDanger');
  }

  /**
   * The thresholds are editable on purpose. The assignment fixes them at
   * 40 / 60 C, but the simulator caps motor temperature at 55 C, so the red
   * band is unreachable there and the panel could never be shown working.
   * The defaults stay at the prescribed values; the operator can lower them.
   */
  function bindThreshold(inputId, key) {
    var input = document.getElementById(inputId);
    input.value = cfg.thresholds[key];
    input.addEventListener('change', function () {
      var value = parseFloat(input.value);
      if (isNaN(value)) return;
      cfg.thresholds[key] = value;
      if (app.panels.motors) app.panels.motors.onThresholdsChanged();
      if (store.latest) app.panels.motors.render(store.latest);
    });
  }

  function captureSample(reason) {
    var row = store.captureSample(reason);
    if (!row) {
      setBanner('Todavía no llegó ninguna muestra para capturar.', 'warn');
      return;
    }
    refreshSampleCount();
  }

  function refreshSampleCount() {
    document.getElementById('sample-count').textContent = store.samples.length;
    document.getElementById('btn-export').disabled = store.samples.length === 0;
    document.getElementById('btn-clear').disabled = store.samples.length === 0;
  }

  // ----------------------------------------------------------- banner

  var stickyBanner = null;

  function setBanner(text, kind, sticky) {
    var banner = document.getElementById('banner');
    banner.textContent = text;
    banner.className = 'banner is-' + (kind || 'info');
    banner.hidden = false;
    if (sticky) stickyBanner = { text: text, kind: kind };
  }

  /** Restores the sticky warning, if any, instead of hiding it for good. */
  function clearBanner() {
    if (stickyBanner) {
      setBanner(stickyBanner.text, stickyBanner.kind);
      return;
    }
    document.getElementById('banner').hidden = true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!TP05.charts.available()) {
      setBanner('Chart.js no cargó (¿sin internet?). Los paneles numéricos ' +
        'funcionan igual; los gráficos quedan deshabilitados.', 'warn', true);
    }
    boot();
    refreshSampleCount();
  });
})();
