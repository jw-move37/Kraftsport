'use strict';

// Kraftsport — Trainings-App (PWA) mit Zeitmessung.
// Ablauf: Training starten (Session-Timer) → je Übung "starten" (große,
// reduzierte Ansicht: Timer + Gewicht + Wiederholungen) → "beenden" → Pause
// läuft automatisch bis zur nächsten Übung → am Ende Übersicht mit Zeiten.

const UEBUNGEN = [
  { id: 'goblet', name: 'Goblet Squat', muster: 'Knie, bilateral',
    ziel: '3 × 12–15', pause: '75 s', gewicht: '16–18 kg/Hand',
    cues: ['Eine Hantel eng vor der Brust', 'Oberschenkel parallel zum Boden', 'Rücken aufrecht'] },
  { id: 'rdl', name: 'RDL (Rumänisches Kreuzheben)', muster: 'Hüfte / hintere Kette',
    ziel: '3 × 8–12', pause: '90 s', gewicht: '16–20 kg/Hand',
    cues: ['Hüfte nach hinten schieben', 'Rücken gerade halten', 'Hanteln dicht am Schienbein'] },
  // Bulgarian Split Squat ist archiviert (Bilder bleiben unter bilder/bulgarian-*.png) und kann jederzeit zurückgeholt werden.
  { id: 'ausfall', name: 'Rückwärts-Ausfallschritt (Reverse Lunge)', muster: 'Knie, unilateral', einbeinig: true,
    ziel: '3 × 8–12 / Bein', pause: '75 s', gewicht: '12–14 kg/Hand',
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
    ziel: '2 × 15–20', pause: '45 s', gewicht: '6–7 kg/Hand',
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
let screen = 'start';     // 'start' | <index> | 'fertig' | 'verlauf'
let phase = 'vorschau';   // bei <index>: 'vorschau' | 'aktiv'
let pauseStart = null;    // ms, Beginn der laufenden Pause (in der Vorschau)
let ticker = null;

let eintraege = ladeJSON('kraftsport_entwurf', {});
let sitzung = ladeJSON('kraftsport_sitzung', { start: null, ende: null });

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
function wdhText(e) {
  if (e && Array.isArray(e.saetze)) return e.saetze.filter((x) => x !== '' && x != null).join(', ');
  return (e && e.wdh) ? e.wdh : '';
}
function aktivSek(e) { return (e && e.aktivStart && e.aktivEnde) ? Math.round((e.aktivEnde - e.aktivStart) / 1000) : 0; }
function letztesGewicht(i) {
  for (let k = i - 1; k >= 0; k--) { const e = eintraege[STEPS[k].key]; if (e && e.gewicht) return e.gewicht; }
  return '';
}

// ---- laufende Uhr ----
function startTick() { stopTick(); ticker = setInterval(updateTimers, 1000); updateTimers(); }
function stopTick() { if (ticker) { clearInterval(ticker); ticker = null; } }
function updateTimers() {
  const t = document.getElementById('timer');
  if (t && sitzung.start) t.textContent = fmtZeit(Date.now() - sitzung.start);
  const p = document.getElementById('pause');
  if (p && pauseStart) p.textContent = fmtZeit(Date.now() - pauseStart);
}

function render() {
  app.innerHTML = '';
  if (screen === 'start') return renderStart();
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
    <p>Aufwärmen 5 min: locker einlaufen, Bein-/Hüft-/Armkreisen, ein paar Kniebeugen ohne Gewicht.</p>
    <div><button class="btn-gross" id="los">Training starten</button></div>
    ${verlaufBtn}
  </div>`));
  document.getElementById('los').onclick = () => {
    eintraege = {}; speichereEntwurf();
    sitzung = { start: Date.now(), ende: null }; speichereSitzung();
    screen = 0; phase = 'vorschau'; pauseStart = null;
    startTick(); render();
  };
  const v = document.getElementById('verlauf');
  if (v) v.onclick = () => { screen = 'verlauf'; render(); };
}

function renderStep(i) {
  const step = STEPS[i];
  const u = step.u;
  const e = eintraege[step.key] || {};
  if (phase === 'vorschau') return renderVorschau(i, step, u, e);
  return renderAktiv(i, step, u, e);
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
  document.getElementById('starten').onclick = () => {
    const cur = eintraege[step.key] || {};
    cur.aktivStart = Date.now(); cur.aktivEnde = null;
    eintraege[step.key] = cur; speichereEntwurf();
    phase = 'aktiv'; pauseStart = null; render(); window.scrollTo(0, 0);
  };
}

function renderAktiv(i, step, u, e) {
  const N = saetzeAnzahl(u);
  const saetze = e.saetze || [];
  const gewVal = (e.gewicht !== undefined && e.gewicht !== '') ? e.gewicht : (hatGewicht(u) ? letztesGewicht(i) : '');
  const repsFelder = Array.from({ length: N }, (_, k) =>
    `<div class="feld"><label>Satz ${k + 1}</label><input class="wdh" data-k="${k}" inputmode="numeric" value="${esc(saetze[k] || '')}" placeholder="Wdh"></div>`
  ).join('');
  const letzte = i === STEPS.length - 1;

  app.appendChild(el(`<div class="screen aktiv">
    <div class="bigtimer" id="timer">0:00</div>
    <div class="aktiv-name">${esc(u.name)}${step.seite ? ` <span class="seite-klein">· ${esc(step.seite)}</span>` : ''}</div>
    <div class="block-eingabe">
      <div class="feld feld-gross"><label>Gewicht (kg)</label><input id="gew" inputmode="decimal" value="${esc(gewVal)}" placeholder="kg"></div>
      <div class="saetze">${repsFelder}</div>
    </div>
    <button class="btn-beenden" id="beenden">Übung beenden${letzte ? ' & Training fertig' : ''}</button>
  </div>`));
  updateTimers();

  const sichern = () => {
    const arr = [...app.querySelectorAll('.wdh')].map((x) => x.value.trim());
    const cur = eintraege[step.key] || {};
    cur.gewicht = document.getElementById('gew').value.trim();
    cur.saetze = arr;
    eintraege[step.key] = cur; speichereEntwurf();
  };
  document.getElementById('gew').oninput = sichern;
  for (const x of app.querySelectorAll('.wdh')) x.oninput = sichern;
  document.getElementById('beenden').onclick = () => {
    sichern();
    const cur = eintraege[step.key]; cur.aktivEnde = Date.now(); speichereEntwurf();
    if (letzte) {
      sitzung.ende = Date.now(); speichereSitzung(); stopTick();
      screen = 'fertig';
    } else {
      pauseStart = cur.aktivEnde; screen = i + 1; phase = 'vorschau';
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
    const z = aktivSek(e) ? ` <small>· ${fmtZeit(aktivSek(e) * 1000)}</small>` : '';
    return `<div class="zeile-uebung"><span class="n">${name}</span><span class="w">${esc(r || '–')}${g}${z}</span></div>`;
  }).join('');
}

function gesamtZeile(s) {
  if (!s || !s.start || !s.ende) return '';
  const gesamt = s.ende - s.start;
  let aktiv = 0;
  for (const step of STEPS) aktiv += aktivSek((s.eintraege || s)[step.key] || {}) * 1000;
  const pause = Math.max(0, gesamt - aktiv);
  return `<div class="zeiten"><span>Gesamt <b>${fmtZeit(gesamt)}</b></span><span>Aktiv <b>${fmtZeit(aktiv)}</b></span><span>Pause <b>${fmtZeit(pause)}</b></span></div>`;
}

function renderFertig() {
  const zeilen = zeilenAusEintraegen(eintraege) || '<p class="muster">Nichts eingetragen.</p>';
  const zeiten = sitzung.start && sitzung.ende
    ? gesamtZeile({ start: sitzung.start, ende: sitzung.ende, eintraege }) : '';
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
    log.push({ datum: new Date().toISOString().slice(0, 10), start: sitzung.start, ende: sitzung.ende, eintraege });
    speichereLog(log);
    eintraege = {}; localStorage.removeItem('kraftsport_entwurf');
    sitzung = { start: null, ende: null }; localStorage.removeItem('kraftsport_sitzung');
    screen = 'verlauf'; render();
  };
}

// ---- Export ----
function sessionText(s) {
  let t = 'Kraftsport — ' + dDe(s.datum) + '\n';
  if (s.start && s.ende) {
    let aktiv = 0; for (const step of STEPS) aktiv += aktivSek((s.eintraege || {})[step.key] || {}) * 1000;
    const gesamt = s.ende - s.start;
    t += 'Gesamtzeit: ' + fmtZeit(gesamt) + ' · Aktiv: ' + fmtZeit(aktiv) + ' · Pause: ' + fmtZeit(Math.max(0, gesamt - aktiv)) + '\n';
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
