/**
 * CSV export, done entirely in the browser: the captured rows never travel
 * back to the backend, which is read-only by design.
 *
 * The column set is the UNION of the keys of every captured row, not the
 * keys of the first one. A session can legitimately hold rows of different
 * shapes — a different robot has different motor names, and the pack can
 * report a different cell count — and taking only the first row's keys
 * would silently drop those columns.
 */
window.TP05 = window.TP05 || {};

(function () {
  /** RFC 4180 quoting: wrap when the value holds a comma, quote or newline. */
  function escapeField(value) {
    if (value === null || value === undefined) return '';
    var text = String(value);
    if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function unionColumns(rows) {
    var seen = {};
    var columns = [];
    rows.forEach(function (row) {
      Object.keys(row).forEach(function (key) {
        if (!seen[key]) {
          seen[key] = true;
          columns.push(key);
        }
      });
    });
    return columns;
  }

  TP05.csv = {
    build: function (rows) {
      if (!rows.length) return '';
      var columns = unionColumns(rows);
      var lines = [columns.map(escapeField).join(',')];
      rows.forEach(function (row) {
        lines.push(columns.map(function (col) {
          return escapeField(row[col]);
        }).join(','));
      });
      // CRLF and a UTF-8 BOM so Excel opens the accented headers correctly.
      return '﻿' + lines.join('\r\n') + '\r\n';
    },

    download: function (rows, filenamePrefix) {
      var text = this.build(rows);
      if (!text) return false;

      var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = (filenamePrefix || 'telemetria') + '_' + stamp + '.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Release the blob once the download has been handed to the browser.
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    }
  };
})();
