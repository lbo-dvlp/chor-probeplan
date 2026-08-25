/* =========================================================================
 * Chor · Probeplan & Absenzen – Frontend (kein Build, reines Vanilla-JS)
 *
 * Datenfluss: Diese App holt alle Daten von der Apps-Script-Web-App
 * (siehe README.md) und schreibt Absenzen dorthin zurück.
 * ========================================================================= */

// --- Konfiguration -------------------------------------------------------
// Nach dem Deploy des Apps Scripts hier die /exec-URL eintragen:
var API_URL = 'https://script.google.com/macros/s/AKfycbydzKCw_T7bCEyLSw7jQSB41CrMAIKSE_QDYBl9cjc-kvfG-DpECzndsf8JsP3Kc5mP7Q/exec';

// Feste Anzeige-Reihenfolge der Stimmlagen. Unbekannte Register werden
// hinten angehängt, damit nichts verloren geht.
var REGISTER_ORDER = ['Sopran', 'Alt', 'Tenor', 'Bass'];

// Deutsche Monatskürzel für den Datums-Chip.
var MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// Anlässe, die nicht in der Liste erscheinen sollen (klein geschrieben, ohne
// Randleerzeichen verglichen). Hier bei Bedarf weitere Einträge ergänzen.
var HIDE_ANLASS = ['keine chorprobe'];

// --- Zustand -------------------------------------------------------------
var state = {
  proben: [],
  mitglieder: [],
  absenzen: [],
  selectedDatum: null // Datum der aktuell geöffneten Probe (TT.MM.JJJJ) oder null
};

// --- DOM-Referenzen ------------------------------------------------------
var statusEl = document.getElementById('status');
var viewEl = document.getElementById('view');
document.getElementById('reload-btn').addEventListener('click', loadData);

// =========================================================================
// Datum-Helfer
// =========================================================================

/** Parst "TT.MM.JJJJ" zu einem Date (lokale Mitternacht) oder null. */
function parseDatum(s) {
  var m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s).trim());
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

/** Vergleichbarer Schlüssel "JJJJMMTT" für ein Datum – toleriert Formatierung. */
function datumKey(s) {
  var d = parseDatum(s);
  if (!d) return '';
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function heuteMitternacht() {
  var n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** Tag (mit führender Null) und Monatskürzel für den Datums-Chip. */
function chipParts(datum) {
  var d = parseDatum(datum);
  if (!d) return { day: '?', mon: '' };
  var day = d.getDate();
  return { day: (day < 10 ? '0' : '') + day, mon: MONTHS_SHORT[d.getMonth()] };
}

/** Relative Kennzeichnung: 'today', 'tomorrow' oder null. */
function relativeDay(datum) {
  var d = parseDatum(datum);
  if (!d) return null;
  var diff = Math.round((d.getTime() - heuteMitternacht().getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return null;
}

// =========================================================================
// Mitglieder-Helfer
// =========================================================================

/** Anzeige-Label: "Vorname N." (erster Buchstabe des Nachnamens). */
function displayName(m) {
  var initial = m.name ? m.name.trim().charAt(0).toUpperCase() + '.' : '';
  return (m.vorname + ' ' + initial).trim();
}

/** Initialen "VN" für den Avatar. */
function initials(m) {
  var a = m.vorname ? m.vorname.trim().charAt(0) : '';
  var b = m.name ? m.name.trim().charAt(0) : '';
  return (a + b).toUpperCase();
}

/** Eindeutiger Schlüssel eines Mitglieds/einer Absenz (Vorname + Name). */
function personKey(vorname, name) {
  return (String(vorname).trim().toLowerCase() + '|' + String(name).trim().toLowerCase());
}

// =========================================================================
// Daten laden
// =========================================================================
function setStatus(msg, isError) {
  if (!msg) {
    statusEl.className = 'status hidden';
    statusEl.textContent = '';
    return;
  }
  statusEl.className = 'status' + (isError ? ' error' : '');
  statusEl.textContent = msg;
}

function loadData() {
  if (API_URL.indexOf('HIER_APPS_SCRIPT') === 0) {
    setStatus('⚠️ API-URL noch nicht konfiguriert. Bitte API_URL in app.js eintragen (siehe README).', true);
    return;
  }
  setStatus('Lade Daten…');
  fetch(API_URL, { method: 'GET' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.ok) throw new Error((data && data.error) || 'Unbekannter Fehler');
      state.proben = data.proben || [];
      state.mitglieder = data.mitglieder || [];
      state.absenzen = data.absenzen || [];
      setStatus('');
      render();
    })
    .catch(function (err) {
      setStatus('Fehler beim Laden: ' + err.message, true);
    });
}

// =========================================================================
// Rendering – Router
// =========================================================================
function render() {
  if (state.selectedDatum) {
    renderDetail(state.selectedDatum);
  } else {
    renderListe();
  }
}

// --- Probenliste ---------------------------------------------------------
function renderListe() {
  var heute = heuteMitternacht().getTime();
  var kommende = state.proben
    .filter(function (p) {
      var d = parseDatum(p.datum);
      if (!d || d.getTime() < heute) return false;
      var anlass = String(p.anlass || '').trim().toLowerCase();
      return HIDE_ANLASS.indexOf(anlass) === -1;
    })
    .sort(function (a, b) { return datumKey(a.datum) - datumKey(b.datum); });

  var html = '<div class="section-label">Kommende Proben</div>';

  if (kommende.length === 0) {
    html += '<p class="empty-hint">Keine kommenden Proben gefunden.</p>';
  } else {
    kommende.forEach(function (p) {
      var chip = chipParts(p.datum);
      var rel = relativeDay(p.datum);
      var subParts = [];
      if (p.wochentag) subParts.push(escapeHtml(p.wochentag));
      if (p.ort) subParts.push(escapeHtml(p.ort));
      var badge = rel === 'today' ? '<span class="today-badge">Heute</span>'
                : rel === 'tomorrow' ? '<span class="today-badge">Morgen</span>' : '';

      html += '' +
        '<button class="probe-card' + (rel === 'today' ? ' is-today' : '') + '" data-datum="' + escapeAttr(p.datum) + '">' +
          '<div class="date-chip"><span class="d">' + chip.day + '</span><span class="m">' + chip.mon + '</span></div>' +
          '<div class="probe-body">' +
            '<div class="probe-title">' + escapeHtml(p.anlass || 'Probe') + badge + '</div>' +
            (subParts.length ? '<div class="probe-sub">' + subParts.join(' · ') + '</div>' : '') +
          '</div>' +
          '<div class="chevron">›</div>' +
        '</button>';
    });
  }

  viewEl.innerHTML = html;
  Array.prototype.forEach.call(viewEl.querySelectorAll('.probe-card'), function (btn) {
    btn.addEventListener('click', function () {
      state.selectedDatum = btn.getAttribute('data-datum');
      window.scrollTo(0, 0);
      render();
    });
  });
}

// --- Detailansicht -------------------------------------------------------
function renderDetail(datum) {
  var probe = findProbe(datum);
  if (!probe) { // Datum nicht mehr vorhanden -> zurück zur Liste
    state.selectedDatum = null;
    renderListe();
    return;
  }

  var key = datumKey(datum);
  var aktive = state.mitglieder;

  // Wer hat sich für dieses Datum abgemeldet?
  var abgemeldetKeys = {};
  state.absenzen.forEach(function (a) {
    if (datumKey(a.datum) === key) {
      abgemeldetKeys[personKey(a.vorname, a.name)] = true;
    }
  });

  // Abgemeldete Mitglieder (nur aktive, in Sheet-Reihenfolge).
  var abgemeldete = aktive.filter(function (m) {
    return abgemeldetKeys[personKey(m.vorname, m.name)];
  });

  // Anwesend = aktive minus abgemeldete, gruppiert nach Register.
  var counts = {};
  var totals = {};
  aktive.forEach(function (m) {
    var reg = m.register || '—';
    totals[reg] = (totals[reg] || 0) + 1;
    if (!abgemeldetKeys[personKey(m.vorname, m.name)]) {
      counts[reg] = (counts[reg] || 0) + 1;
    }
  });

  var registerReihenfolge = orderedRegisters(totals);

  // --- HTML zusammenbauen ---
  var chip = chipParts(probe.datum);
  var html = '<button class="back-btn" id="back-btn">← Alle Proben</button>';

  html += '<div class="detail-hero">' +
    '<div class="date-chip"><span class="d">' + chip.day + '</span><span class="m">' + chip.mon + '</span></div>' +
    '<div>' +
      '<h2>' + escapeHtml(probe.anlass || 'Probe') + '</h2>' +
      '<div class="detail-meta">' +
        '<div>' + escapeHtml(probe.datum) + (probe.wochentag ? ' · ' + escapeHtml(probe.wochentag) : '') + '</div>' +
        (probe.ort ? '<div>' + escapeHtml(probe.ort) + '</div>' : '') +
      '</div>' +
    '</div>' +
  '</div>';

  // Abmelde-Formular
  html += '<div class="card">' +
    '<label class="field-label" for="member-select">Abmelden für diese Probe</label>' +
    '<div class="abmelde-row">' +
      buildMemberSelect(aktive, abgemeldetKeys) +
      '<button class="primary" id="abmelde-btn">Abmelden</button>' +
    '</div>' +
  '</div>';

  // Anwesend nach Stimmlage
  html += '<div class="section-label">Anwesend nach Stimmlage</div>';
  html += '<div class="register-grid">';
  registerReihenfolge.forEach(function (reg) {
    html += '<div class="register-tile">' +
      '<div class="count">' + (counts[reg] || 0) + '</div>' +
      '<div class="label">' + escapeHtml(reg) + '</div>' +
      '<div class="total-hint">von ' + totals[reg] + '</div>' +
    '</div>';
  });
  html += '</div>';

  // Abgemeldete
  html += '<div class="section-label">Abgemeldet (' + abgemeldete.length + ')</div>';
  if (abgemeldete.length === 0) {
    html += '<p class="empty-hint">Niemand abgemeldet.</p>';
  } else {
    html += '<ul class="abwesend-list">';
    abgemeldete.forEach(function (m) {
      html += '<li>' +
        '<span class="person">' +
          '<span class="avatar">' + escapeHtml(initials(m)) + '</span>' +
          '<span>' + escapeHtml(displayName(m)) + '</span>' +
        '</span>' +
        '<span class="reg-badge">' + escapeHtml(m.register || '—') + '</span>' +
      '</li>';
    });
    html += '</ul>';
  }

  viewEl.innerHTML = html;

  // --- Events ---
  document.getElementById('back-btn').addEventListener('click', function () {
    state.selectedDatum = null;
    window.scrollTo(0, 0);
    render();
  });
  document.getElementById('abmelde-btn').addEventListener('click', function () {
    submitAbmeldung(probe.datum);
  });
}

/** Baut das <select> der aktiven Mitglieder. Bereits Abgemeldete sind deaktiviert. */
function buildMemberSelect(aktive, abgemeldetKeys) {
  var sorted = aktive.slice().sort(function (a, b) {
    return displayName(a).localeCompare(displayName(b), 'de');
  });
  var opts = '<option value="">– Mitglied wählen –</option>';
  sorted.forEach(function (m, idx) {
    // Index in die (Original-)Mitgliederliste als Wert speichern.
    var originalIdx = state.mitglieder.indexOf(m);
    var abgemeldet = abgemeldetKeys[personKey(m.vorname, m.name)];
    opts += '<option value="' + originalIdx + '"' + (abgemeldet ? ' disabled' : '') + '>' +
      escapeHtml(displayName(m)) + (abgemeldet ? ' (bereits abgemeldet)' : '') +
    '</option>';
  });
  return '<select id="member-select">' + opts + '</select>';
}

// =========================================================================
// Abmeldung absenden
// =========================================================================
function submitAbmeldung(datum) {
  var select = document.getElementById('member-select');
  var btn = document.getElementById('abmelde-btn');
  var idx = select.value;
  if (idx === '') {
    toast('Bitte zuerst ein Mitglied wählen.', 'err');
    return;
  }
  var m = state.mitglieder[Number(idx)];
  if (!m) { toast('Mitglied nicht gefunden.', 'err'); return; }

  btn.disabled = true;
  btn.textContent = '…';

  var payload = { vorname: m.vorname, name: m.name, datum: datum };

  fetch(API_URL, {
    method: 'POST',
    // Bewusst text/plain: vermeidet den CORS-Preflight bei Apps Script.
    body: JSON.stringify(payload)
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'Speichern fehlgeschlagen');
      // Frische Absenzenliste vom Server übernehmen.
      if (res.absenzen) state.absenzen = res.absenzen;
      toast(displayName(m) + ' abgemeldet.', 'ok');
      render();
    })
    .catch(function (err) {
      toast('Fehler: ' + err.message, 'err');
      btn.disabled = false;
      btn.textContent = 'Abmelden';
    });
}

// =========================================================================
// Kleine Helfer
// =========================================================================
function findProbe(datum) {
  var key = datumKey(datum);
  for (var i = 0; i < state.proben.length; i++) {
    if (datumKey(state.proben[i].datum) === key) return state.proben[i];
  }
  return null;
}

/** Register in fester Reihenfolge, unbekannte hinten angehängt. */
function orderedRegisters(totals) {
  var result = [];
  REGISTER_ORDER.forEach(function (r) {
    if (totals[r] !== undefined) result.push(r);
  });
  Object.keys(totals).forEach(function (r) {
    if (REGISTER_ORDER.indexOf(r) === -1) result.push(r);
  });
  return result;
}

var toastTimer = null;
function toast(msg, kind) {
  var el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast show ' + (kind || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    el.className = 'toast ' + (kind || '');
  }, 2600);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) { return escapeHtml(s); }

// --- Start ---------------------------------------------------------------
loadData();
