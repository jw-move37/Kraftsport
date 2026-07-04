'use strict';

// Kraftsport — Trainings-App (PWA) mit Zeitmessung.
// Ablauf: Training starten → Aufwärmen (eigene Uhr) → je Übung nacheinander.
// Pro Übung wird JEDER Satz einzeln gestoppt: "Start" beginnt die Wiederholungs-
// phase, "Stop" beendet sie (die Satzzeit steht fest), danach die Wiederholungen
// eintippen. Die Zeit zwischen Stop und dem nächsten Start (auch Gewicht-Eintippen)
// zählt als Pause. Gewicht einmal pro Übung, vorbelegt aus dem letzten Trainingstag.
// Am Ende: Gesamtzeit inkl. Aufwärmen, Aufwärmzeit separat, Aktiv (Summe der Sätze),
// Pause als Rest.

const UEBUNGEN = [
  { id: 'goblet', name: 'Goblet Squat', muster: 'Knie, bilateral',
    ziel: '3 × 12–15', pause: '75 s', gewicht: '16–18 kg/Hand',
    cues: ['Eine Hantel eng vor der Brust', 'Oberschenkel parallel zum Boden', 'Rücken aufrecht'] },
  { id: 'rdl', name: 'RDL (Rumänisches Kreuzheben)', muster: 'Hüfte / hintere Kette',
    ziel: '3 × 8–12', pause: '90 s', gewicht: '16–20 kg/Hand',
    cues: ['Hüfte nach hinten schieben', 'Rücken gerade halten', 'Hanteln dicht am Schienbein'] },
  // Bulgarian Split Squat ist archiviert (Bilder bleiben unter bilder/bulgarian-*.png) und kann jederzeit zurückgeholt werden.
  { id: 'ausfall', name: 'Rückwärts-Ausfallschritt (Reverse Lunge)', muster: 'Knie, unilateral',
    ziel: '3 × 8–12', pause: '75 s', gewicht: '12–14 kg/Hand',
    cues: ['Schritt nach hinten setzen', 'Hinteres Knie Richtung Boden senken', 'Vorderes Knie über dem Fuß, Oberkörper aufrecht'] },
  { id: 'rudern', name: 'Rudern zweiarmig vorgebeugt', muster: 'Zug horizontal',
    ziel: '3 × 8–12', pause: '75 s', gewicht: '14–16 kg/Hand',
    cues: ['Etwa 45° vorgebeugt', 'Hanteln zur Hüfte ziehen', 'Ellbogen nah am Körper'] },
  { id: 'lat', name: 'Lat-Pulldown (Band über Ast)', muster: 'Zug vertikal',
    ziel: '3 × bis Spannungsversagen', pause: '60 s', gewicht: 'Band',
    hinweis: 'Jetzt auf das leichte Paar umstecken (~7 kg/Hand).',
    cues: ['Stehend leicht vorgebeugt', 'Band zur oberen Brust ziehen', 'Ellbogen nach unten/hinten'] },
  { id: 'liege', name: 'Liegestütze', muster: 'Druck horizontal',
    ziel: '3 × ~2 Wdh vor Versagen', pause: '60 s', gewicht: 'Körpergewicht',
    cues: ['Gerade Linie Kopf bis Ferse', 'Körper fest, nicht durchhängen'] },
  { id: 'schulter', name: 'Schulterdrücken', muster: 'Druck vertikal',
    ziel: '3 × 8–12 (oder 15–20 bei 7 kg)', pause: '60 s', gewicht: '9–11 kg/Hand (bzw. 7)',
    cues: ['Von Schulterhöhe nach oben drücken', 'Rumpf fest, nicht ins Hohlkreuz'] },
  { id: 'seit', name: 'Seitheben', muster: 'Isolation Schulter',
    ziel: '3 × 15–20', pause: '45 s', gewicht: '6–7 kg/Hand',
    cues: ['Arme seitlich auf Schulterhöhe', 'Ellbogen leicht gebeugt'] },
];

const STEPS = [];
for (const u of UEBUNGEN) {
  if (u.einbeinig) {
    STEPS.push({ u, key: u.id + '-l', seite: 'Linkes Bein' });
    STEPS.push({ u, key: u.id + '-r', seite: 'Rechtes Bein' });
  } else {
    STEPS.push({ u, key: u.id });
  }
}

function saetzeAnzahl(u) { const m = u.ziel.match(/^(\d+)\s*×/); return m ? Number(m[1]) : 3; }
function hatGewicht(u) { return /kg/.test(u.gewicht); }

const app = document.getElementById('app');
let screen = 'start';     // 'start' | 'aufwaermen' | <index> | 'fertig' | 'verlauf'
let phase = 'vorschau';   // bei <index>: 'vorschau' | 'aktiv'
let pauseStart = null;    // ms, Beginn der laufenden Pause (Rest zwischen Sätzen/Übungen)
let laufStart = null;     // ms, Beginn des gerade laufenden Satzes (sonst null)
let ticker = null;

let eintraege = ladeJSON('kraftsport_entwurf', {});
let sitzung = ladeJSON('kraftsport_sitzung', { start: null, aufwaermEnde: null, ende: null });

function ladeJSON(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch (e) { return fallback; } }
function speichereEntwurf() { localStorage.setItem('kraftsport_entwurf', JSON.stringify(eintraege)); }
function speichereSitzung() { localStorage.setItem('kraftsport_sitzung', JSON.stringify(sitzung)); }
function ladeLog() { try { return JSON.parse(localStorage.getItem('kraftsport_log')) || []; } catch (e) { return []; } }
function speichereLog(log) { localStorage.setItem('kraftsport_log', JSON.stringify(log)); }
function dDe(iso) { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; }

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function fmtZeit(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sek).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
function hhmm(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

// Sätze eines Eintrags auf N Objekte { reps, ms } bringen (und altes Format migrieren).
function richteSaetze(e, N) {
  const alt = Array.isArray(e.saetze) ? e.saetze : [];
  e.saetze = alt.map((s) => (s && typeof s === 'object')
    ? { reps: s.reps || '', ms: (s.ms == null ? null : s.ms) }
    : { reps: (s == null ? '' : String(s)), ms: null });
  while (e.saetze.length < N) e.saetze.push({ reps: '', ms: null });
  if (e.saetze.length > N) e.saetze.length = N;
  return e;
}
function wdhText(e) {
  if (e && Array.isArray(e.saetze)) {
    return e.saetze.map((s) => (s && typeof s === 'object') ? s.reps : s).filter((x) => x !== '' && x != null).join(', ');
  }
  return (e && e.wdh) ? e.wdh : '';
}
// Aktivzeit einer Übung in Sekunden: Summe der Satzzeiten (neu) oder alt aktivStart/Ende.
function aktivSek(e) {
  if (e && Array.isArray(e.saetze) && e.saetze.some((s) => s && typeof s === 'object' && s.ms != null)) {
    return Math.round(e.saetze.reduce((a, s) => a + ((s && s.ms) || 0), 0) / 1000);
  }
  if (e && e.aktivStart && e.aktivEnde) return Math.round((e.aktivEnde - e.aktivStart) / 1000);
  return 0;
}
function satzZeiten(e) {
  if (e && Array.isArray(e.saetze)) return e.saetze.filter((s) => s && typeof s === 'object' && s.ms != null).map((s) => fmtZeit(s.ms));
  return [];
}
function aufwaermMs(s) { return (s && s.start && s.aufwaermEnde) ? (s.aufwaermEnde - s.start) : 0; }

// Gewicht aus dem letzten gespeicherten Trainingstag für diese Übung übernehmen.
function letztesGewicht(key) {
  const log = ladeLog();
  for (let i = log.length - 1; i >= 0; i--) {
    const es = log[i].eintraege || {};
    let e = es[key];
    if (!e && key === 'ausfall') e = es['ausfall-l'] || es['ausfall-r']; // Übergang vom alten Links/Rechts-Split
    if (e && e.gewicht) return e.gewicht;
  }
  return '';
}

// ---- laufende Uhr ----
function startTick() { stopTick(); ticker = setInterval(updateTimers, 500); updateTimers(); }
function stopTick() { if (ticker) { clearInterval(ticker); ticker = null; } }
function updateTimers() {
  const now = Date.now();
  const t = document.getElementById('timer');
  if (t && sitzung.start) t.textContent = fmtZeit(now - sitzung.start);
  const w = document.getElementById('warmuhr');
  if (w && sitzung.start) w.textContent = fmtZeit(now - sitzung.start);
  const p = document.getElementById('pause');
  if (p && pauseStart) p.textContent = fmtZeit(now - pauseStart);
  const big = document.getElementById('bigt');
  if (big) {
    if (laufStart) big.textContent = fmtZeit(now - laufStart);
    else if (pauseStart) big.textContent = fmtZeit(now - pauseStart);
    else big.textContent = '0:00';
  }
}

function render() {
  app.innerHTML = '';
  if (screen === 'start') return renderStart();
  if (screen === 'aufwaermen') return renderAufwaermen();
  if (screen === 'fertig') return renderFertig();
  if (screen === 'verlauf') return renderVerlauf();
  renderStep(screen);
}

function renderStart() {
  stopTick();
  const log = ladeLog();
  const verlaufBtn = log.length
    ? `<div><button class="btn-link" id="verlauf">Verlauf ansehen (${log.length})</button></div>`
    : '';
  app.appendChild(el(`<div class="screen start">
    <div>
      <h1>Kraftsport</h1>
      <p>8 Übungen, jeden 2. Tag.</p>
    </div>
    <p>Zuerst Aufwärmen, dann jede Übung Satz für Satz mit Start/Stop.</p>
    <div><button class="btn-gross" id="los">Training starten</button></div>
    ${verlaufBtn}
  </div>`));
  document.getElementById('los').onclick = () => {
    eintraege = {}; speichereEntwurf();
    sitzung = { start: Date.now(), aufwaermEnde: null, ende: null }; speichereSitzung();
    screen = 'aufwaermen'; phase = 'vorschau'; pauseStart = null; laufStart = null;
    startTick(); render();
  };
  const v = document.getElementById('verlauf');
  if (v) v.onclick = () => { screen = 'verlauf'; render(); };
}

function renderAufwaermen() {
  app.appendChild(el(`<div class="screen aktiv">
    <div class="bigtimer" id="bigt">0:00</div>
    <div class="bigcap aktiv-cap">Aufwärmen läuft</div>
    <div class="aktiv-name" style="margin-top:20px">Warm werden</div>
    <p class="hinweis">5 min: locker einlaufen, Bein-/Hüft-/Armkreisen, ein paar Kniebeugen ohne Gewicht.</p>
    <button class="btn-beenden" id="warmfertig">Aufwärmen fertig – erste Übung</button>
  </div>`));
  laufStart = null; pauseStart = null; updateTimers();
  document.getElementById('warmfertig').onclick = () => {
    sitzung.aufwaermEnde = Date.now(); speichereSitzung();
    pauseStart = Date.now(); screen = 0; phase = 'vorschau';
    render(); window.scrollTo(0, 0);
  };
}

function renderStep(i) {
  const step = STEPS[i];
  const u = step.u;
  const e = eintraege[step.key] || {};
  if (phase === 'vorschau') return renderVorschau(i, step, u, e);
  return renderAktiv(i, step, u);
}

function renderVorschau(i, step, u, e) {
  app.appendChild(el(kopf(i)));
  const pauseBox = pauseStart
    ? `<div class="pausebox">Pause <span id="pause">0:00</span></div>` : '';
  app.appendChild(el(`<div class="screen">
    ${pauseBox}
    <div class="bild">
      <img class="frame f1" src="bilder/${u.id}-anfang.png" alt="">
      <img class="frame f2" src="bilder/${u.id}-mitte.png" alt="">
      <img class="frame f3" src="bilder/${u.id}-unten.png" alt="">
    </div>
    <div class="uname">${esc(u.name)}</div>
    ${step.seite ? `<div class="seite">${esc(step.seite)}</div>` : `<div class="muster">${esc(u.muster)}</div>`}
    <div class="ziel"><span>Ziel <b>${esc(u.ziel)}</b></span><span>Pause <b>${esc(u.pause)}</b></span><span>Gewicht <b>${esc(u.gewicht)}</b></span></div>
    ${u.hinweis ? `<p class="hinweis">${esc(u.hinweis)}</p>` : ''}
    <ul class="cues">${u.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <div class="knoepfe">
      <button class="btn-zurueck" id="zurueck">Zurück</button>
      <button class="btn-weiter" id="starten">Übung starten</button>
    </div>
  </div>`));
  updateTimers();
  document.getElementById('zurueck').onclick = () => { screen = i === 0 ? 'start' : i - 1; phase = 'vorschau'; render(); window.scrollTo(0, 0); };
  document.getElementById('starten').onclick = () => { phase = 'aktiv'; render(); window.scrollTo(0, 0); };
}

function renderAktiv(i, step, u) {
  const N = saetzeAnzahl(u);
  const e = richteSaetze(eintraege[step.key] || {}, N);
  eintraege[step.key] = e;
  laufStart = e.laufStart || null;
  const gewVal = (e.gewicht !== undefined && e.gewicht !== '') ? e.gewicht : (hatGewicht(u) ? letztesGewicht(step.key) : '');
  const curIdx = e.saetze.findIndex((s) => s.ms == null);   // nächster offener Satz (-1 = alle fertig)
  const running = laufStart != null;
  const letzte = i === STEPS.length - 1;

  const reihen = e.saetze.map((s, k) => {
    if (s.ms != null) {
      return `<div class="satz done">
        <span class="satz-lbl">Satz ${k + 1}</span>
        <span class="satz-zeit">${fmtZeit(s.ms)}</span>
        <input class="wdh" data-k="${k}" inputmode="numeric" value="${esc(s.reps || '')}" placeholder="Wdh">
      </div>`;
    }
    if (k === curIdx) {
      return running
        ? `<div class="satz laeuft">
            <span class="satz-lbl">Satz ${k + 1}</span>
            <span class="satz-zeit">läuft…</span>
            <button class="btn-stop" id="stop">Stop</button>
          </div>`
        : `<div class="satz dran">
            <span class="satz-lbl">Satz ${k + 1}</span>
            <span class="satz-zeit">–</span>
            <button class="btn-start" id="start">Start</button>
          </div>`;
    }
    return `<div class="satz offen"><span class="satz-lbl">Satz ${k + 1}</span><span class="satz-zeit">–</span></div>`;
  }).join('');

  const cap = running ? '<div class="bigcap aktiv-cap">Satz läuft</div>'
    : (pauseStart ? '<div class="bigcap pause-cap">Pause</div>' : '<div class="bigcap">&nbsp;</div>');

  app.appendChild(el(`<div class="screen aktiv">
    <div class="bigtimer" id="bigt">0:00</div>
    ${cap}
    <div class="aktiv-name">${esc(u.name)}</div>
    <div class="block-eingabe">
      <div class="feld feld-gross"><label>Gewicht (kg)</label><input id="gew" inputmode="decimal" value="${esc(gewVal)}" placeholder="kg"></div>
      <div class="saetze-liste">${reihen}</div>
    </div>
    <button class="btn-beenden" id="beenden"${running ? ' disabled' : ''}>${letzte ? 'Training fertig' : 'Weiter zur nächsten Übung'}</button>
  </div>`));
  updateTimers();

  const sichern = () => {
    const g = document.getElementById('gew');
    if (g) e.gewicht = g.value.trim();
    for (const x of app.querySelectorAll('.wdh')) {
      const k = Number(x.dataset.k);
      if (e.saetze[k]) e.saetze[k].reps = x.value.trim();
    }
    eintraege[step.key] = e; speichereEntwurf();
  };
  const g = document.getElementById('gew');
  if (g) g.oninput = sichern;
  for (const x of app.querySelectorAll('.wdh')) x.oninput = sichern;

  const startBtn = document.getElementById('start');
  if (startBtn) startBtn.onclick = () => {
    sichern();
    laufStart = Date.now(); e.laufStart = laufStart; pauseStart = null;
    eintraege[step.key] = e; speichereEntwurf();
    startTick(); render(); window.scrollTo(0, 0);
  };
  const stopBtn = document.getElementById('stop');
  if (stopBtn) stopBtn.onclick = () => {
    sichern();
    const idx = e.saetze.findIndex((s) => s.ms == null);
    if (idx !== -1) e.saetze[idx].ms = Date.now() - laufStart;
    e.laufStart = null; laufStart = null;
    pauseStart = Date.now();   // Rest bis zum nächsten Start (inkl. Wiederholungen/Gewicht eintippen)
    eintraege[step.key] = e; speichereEntwurf();
    render(); window.scrollTo(0, 0);
  };
  document.getElementById('beenden').onclick = () => {
    sichern();
    if (letzte) {
      sitzung.ende = Date.now(); speichereSitzung(); stopTick();
      screen = 'fertig'; pauseStart = null;
    } else {
      pauseStart = Date.now(); screen = i + 1; phase = 'vorschau';
    }
    render(); window.scrollTo(0, 0);
  };
}

function kopf(i) {
  const pct = Math.round((i / STEPS.length) * 100);
  return `<div class="top">
    <div class="zeile"><span class="titel"><span id="timer">0:00</span></span><span class="zaehler">Übung ${i + 1} / ${STEPS.length}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

function zeilenAusEintraegen(quelle) {
  return STEPS.map((step) => {
    const e = (quelle || {})[step.key] || {};
    const r = wdhText(e);
    if (!r && !e.gewicht && !aktivSek(e)) return '';
    const name = esc(step.u.name) + (step.seite ? ` <span class="seite-klein">· ${esc(step.seite)}</span>` : '');
    const g = e.gewicht ? ` <small>· ${esc(e.gewicht)} kg</small>` : '';
    const zt = satzZeiten(e);
    const z = zt.length ? ` <small>· ${zt.join(' / ')}</small>` : (aktivSek(e) ? ` <small>· ${fmtZeit(aktivSek(e) * 1000)}</small>` : '');
    return `<div class="zeile-uebung"><span class="n">${name}</span><span class="w">${esc(r || '–')}${g}${z}</span></div>`;
  }).join('');
}

function gesamtZeile(s) {
  if (!s || !s.start || !s.ende) return '';
  const gesamt = s.ende - s.start;
  const warm = aufwaermMs(s);
  let aktiv = 0;
  for (const step of STEPS) aktiv += aktivSek((s.eintraege || s)[step.key] || {}) * 1000;
  const pause = Math.max(0, gesamt - warm - aktiv);
  const warmSpan = warm ? `<span>Aufwärmen <b>${fmtZeit(warm)}</b></span>` : '';
  return `<div class="zeiten"><span>Gesamt <b>${fmtZeit(gesamt)}</b></span>${warmSpan}<span>Aktiv <b>${fmtZeit(aktiv)}</b></span><span>Pause <b>${fmtZeit(pause)}</b></span></div>`;
}

function renderFertig() {
  const zeilen = zeilenAusEintraegen(eintraege) || '<p class="muster">Nichts eingetragen.</p>';
  const zeiten = sitzung.start && sitzung.ende
    ? gesamtZeile({ start: sitzung.start, aufwaermEnde: sitzung.aufwaermEnde, ende: sitzung.ende, eintraege }) : '';
  app.appendChild(el(`<div class="screen">
    <div class="fertig-kopf"><div class="haken">✓</div><h1 style="margin:6px 0">Einheit fertig</h1></div>
    ${zeiten}
    <div class="summe">${zeilen}</div>
    <div class="knoepfe">
      <button class="btn-zurueck" id="zurueck">Zurück</button>
      <button class="btn-weiter" id="speichern">Speichern</button>
    </div>
  </div>`));
  document.getElementById('zurueck').onclick = () => { screen = STEPS.length - 1; phase = 'aktiv'; render(); };
  document.getElementById('speichern').onclick = () => {
    const log = ladeLog();
    log.push({ datum: new Date().toISOString().slice(0, 10), start: sitzung.start, aufwaermEnde: sitzung.aufwaermEnde, ende: sitzung.ende, eintraege });
    speichereLog(log);
    eintraege = {}; localStorage.removeItem('kraftsport_entwurf');
    sitzung = { start: null, aufwaermEnde: null, ende: null }; localStorage.removeItem('kraftsport_sitzung');
    screen = 'verlauf'; render();
  };
}

// ---- Export ----
function sessionText(s) {
  let t = 'Kraftsport — ' + dDe(s.datum) + '\n';
  if (s.start && s.ende) {
    t += 'Zeit: ' + hhmm(s.start) + '–' + hhmm(s.ende) + '\n';
    let aktiv = 0; for (const step of STEPS) aktiv += aktivSek((s.eintraege || {})[step.key] || {}) * 1000;
    const gesamt = s.ende - s.start; const warm = aufwaermMs(s);
    t += 'Gesamtzeit: ' + fmtZeit(gesamt) + (warm ? ' · Aufwärmen: ' + fmtZeit(warm) : '')
      + ' · Aktiv: ' + fmtZeit(aktiv) + ' · Pause: ' + fmtZeit(Math.max(0, gesamt - warm - aktiv)) + '\n';
  }
  for (const step of STEPS) {
    const e = (s.eintraege || {})[step.key] || {};
    const r = wdhText(e);
    if (!r && !e.gewicht) continue;
    const name = step.u.name + (step.seite ? ' (' + step.seite + ')' : '');
    t += '- ' + name + ': ' + (r || '–') + (e.gewicht ? ' · ' + e.gewicht + ' kg' : '') + '\n';
  }
  return t;
}
function allesText(log) { return log.map(sessionText).join('\n'); }

async function exportieren(name, text) {
  try {
    const file = new File([text], name, { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function renderVerlauf() {
  stopTick();
  const log = ladeLog();
  const karten = [...log].reverse().map((s, ri) => {
    const idx = log.length - 1 - ri;
    const zeiten = gesamtZeile(s);
    const zeilen = zeilenAusEintraegen(s.eintraege) || '<p class="muster">Keine Einträge.</p>';
    return `<div class="session">
      <div class="session-kopf"><b>${dDe(s.datum)}</b><button class="loesch" data-i="${idx}" title="löschen">✕</button></div>
      ${zeiten}
      ${zeilen}
    </div>`;
  }).join('') || '<p class="muster">Noch keine gespeicherte Einheit.</p>';

  app.appendChild(el(`<div class="top"><div class="zeile"><span class="titel">Verlauf</span><span class="zaehler">${log.length} Einheit${log.length === 1 ? '' : 'en'}</span></div></div>`));
  app.appendChild(el(`<div class="screen">
    <div class="verlauf">${karten}</div>
    <div class="knoepfe"><button class="btn-weiter" id="zurueck">Zurück</button></div>
    ${log.length ? `<button class="btn-export" id="export">Exportieren</button>
    <div class="export-wahl" id="export-wahl" hidden>
      <p class="export-frage">Was möchtest du exportieren?</p>
      <div class="knoepfe">
        <button class="btn-zurueck" id="exp-neueste">Nur neueste</button>
        <button class="btn-weiter" id="exp-alle">Alle</button>
      </div>
    </div>` : ''}
  </div>`));
  document.getElementById('zurueck').onclick = () => { screen = 'start'; render(); };
  const exp = document.getElementById('export');
  if (exp) {
    exp.onclick = () => { exp.hidden = true; document.getElementById('export-wahl').hidden = false; };
    document.getElementById('exp-neueste').onclick = () => { const s = log[log.length - 1]; exportieren('Kraft_' + s.datum + '.txt', sessionText(s)); };
    document.getElementById('exp-alle').onclick = () => { exportieren('Kraft_alle_' + new Date().toISOString().slice(0, 10) + '.txt', allesText(log)); };
  }
  for (const b of app.querySelectorAll('.loesch')) {
    b.onclick = () => {
      if (!confirm('Diese Einheit löschen?')) return;
      const log2 = ladeLog(); log2.splice(Number(b.dataset.i), 1); speichereLog(log2); render();
    };
  }
}

render();
