/**
 * Chart.js wrappers.
 *
 * The rule these enforce: a chart object is created ONCE and then only ever
 * fed. Every frame pushes one point per series and drops the oldest, then
 * calls `update('none')` to redraw without the entry animation. Nothing here
 * calls `new Chart()` on a data update — that is the difference between a
 * sliding window and a chart that is rebuilt 10 times a second.
 *
 * If the Chart.js CDN is unreachable, `available()` returns false and the
 * dashboard runs without charts instead of throwing on load.
 */
window.TP05 = window.TP05 || {};

(function () {
  var cfg = TP05.config;

  function available() {
    return typeof window.Chart !== 'undefined';
  }

  /**
   * @param {string} canvasId
   * @param {{yTitle:string, capacity:number, suggestedMin?:number, suggestedMax?:number}} options
   */
  function LineChart(canvasId, options) {
    this.canvasId = canvasId;
    this.options = options || {};
    this.capacity = this.options.capacity || cfg.historySize;
    this.chart = null;
    this.keys = [];       // series identity, in dataset order
    this.guides = [];     // constant reference lines, appended after series
  }

  LineChart.prototype.isReady = function () {
    return this.chart !== null;
  };

  /** Horizontal reference lines (thresholds). Declared before build(). */
  LineChart.prototype.withGuides = function (guides) {
    this.guides = guides || [];
    return this;
  };

  LineChart.prototype.build = function () {
    if (!available()) return this;
    var canvas = document.getElementById(this.canvasId);
    if (!canvas) return this;

    this.chart = new Chart(canvas, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        normalized: true,
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: {
            title: { display: true, text: 'tiempo (s)' },
            ticks: {
              maxTicksLimit: 8,
              autoSkip: true,
              callback: function (value) {
                var label = this.getLabelForValue(value);
                return typeof label === 'number' ? label.toFixed(1) : label;
              }
            }
          },
          y: {
            title: { display: true, text: this.options.yTitle || '' },
            suggestedMin: this.options.suggestedMin,
            suggestedMax: this.options.suggestedMax
          }
        },
        plugins: {
          legend: { display: true, labels: { boxWidth: 12, usePointStyle: true } },
          tooltip: { enabled: true }
        },
        elements: { point: { radius: 0 }, line: { borderWidth: 1.8, tension: 0.2 } }
      }
    });
    return this;
  };

  /**
   * Declare which series the chart shows, seeding them from history.
   *
   * Datasets are rebuilt only when the SELECTION changes — not on every
   * frame. `seed` lets a series that was just switched on appear with the
   * history the store already holds instead of starting from a blank line.
   *
   * @param {Array<{key:string,label:string,color:string}>} series
   * @param {Array<number>} labels
   * @param {Object<string,Array<number>>} seed
   */
  LineChart.prototype.setSeries = function (series, labels, seed) {
    if (!this.chart) return this;
    var nextKeys = series.map(function (s) { return s.key; });
    if (nextKeys.join('|') === this.keys.join('|')) return this;

    this.keys = nextKeys;
    var self = this;
    this.chart.data.labels = (labels || []).slice(-this.capacity);
    this.chart.data.datasets = series.map(function (s) {
      return {
        label: s.label,
        borderColor: s.color,
        backgroundColor: s.color,
        data: ((seed && seed[s.key]) || []).slice(-self.capacity),
        spanGaps: true
      };
    }).concat(this.guides.map(function (guide) {
      return {
        label: guide.label,
        borderColor: guide.color,
        borderDash: [6, 4],
        borderWidth: 1,
        pointRadius: 0,
        data: self.chart.data.labels.map(function () { return guide.value; })
      };
    }));
    this.chart.update('none');
    return this;
  };

  /**
   * Append one sample. `values` maps series key -> number; a missing key
   * pushes null so the series keeps its alignment with the x axis.
   */
  LineChart.prototype.push = function (label, values) {
    if (!this.chart) return this;
    var data = this.chart.data;
    data.labels.push(label);
    if (data.labels.length > this.capacity) data.labels.shift();

    for (var i = 0; i < data.datasets.length; i++) {
      var dataset = data.datasets[i];
      var isGuide = i >= this.keys.length;
      var value = isGuide
        ? this.guides[i - this.keys.length].value
        : values[this.keys[i]];
      dataset.data.push(value === undefined ? null : value);
      if (dataset.data.length > this.capacity) dataset.data.shift();
    }
    return this;
  };

  /** Redraw with no animation. Called once per frame, after push(). */
  LineChart.prototype.render = function () {
    if (this.chart) this.chart.update('none');
    return this;
  };

  /**
   * Release the Chart instance so its canvas can be used again.
   *
   * Chart.js keeps a registry keyed by canvas element. Building a second
   * chart over a canvas that still holds a live one throws
   * "Canvas is already in use", so every path that rebuilds a panel has to
   * come through here first.
   */
  LineChart.prototype.destroy = function () {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    this.keys = [];
    return this;
  };

  /** Distinct-enough colours for up to `maxChartSeries` motor curves. */
  var SERIES_COLORS = [
    '#2f6fed', '#e8590c', '#2b8a3e', '#9c36b5',
    '#0b7285', '#c2255c', '#5c7cfa', '#f59f00'
  ];

  TP05.charts = {
    available: available,
    LineChart: LineChart,
    colorFor: function (index) {
      return SERIES_COLORS[index % SERIES_COLORS.length];
    }
  };
})();
