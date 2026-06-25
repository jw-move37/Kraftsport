'use strict';

// Kraftsport — kleine Trainings-App (PWA). Eine Übung (bzw. Bein) nach der
// anderen: Bild + Erklärung, Gewicht und Wiederholungen je Satz eintragen,
// weiter zum nächsten. Verlauf bleibt in der App.

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

// Ablauf-Schritte: einbeinige Übungen werden in linkes + rechtes Bein zerlegt.
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
let screen = 'start';
let eintraege = ladeEntwurf();

function ladeEntwurf() {
  try { return JSON.parse(localStorage.getItem('kraftsport_entwurf')) || {}; } catch (e) { return {}; }
}
function speichereEntwurf() { localStorage.setItem('kraftsport_entwurf', JSON.stringify(eintraege)); }
function ladeLog() { try { return JSON.parse(localStorage.getItem('kraftsport_log')) || []; } catch (e) { return []; } }
function speichereLog(log) { localStorage.setItem('kraftsport_log', JSON.stringify(log)); }
function dDe(iso) { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; }

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Wiederholungen einer Eintragung als Text ("12, 12, 10"); auch altes Format (wdh).
function wdhText(e) {
  if (e && Array.isArray(e.saetze)) return e.saetze.filter((x) => x !== '' && x != null).join(', ');
  return (e && e.wdh) ? e.wdh : '';
}

// Export: lesbarer Text einer Einheit bzw. aller Einheiten.
function sessionText(s) {
  let t = 'Kraftsport — ' + dDe(s.datum) + '\n';
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

// Teilen über das Android-Teilen-Menü; sonst Download in den Download-Ordner.
async function exportieren(name, text) {
  try {
    const file = new File([text], name, { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Gewicht der letzten Übung davor (für die Vorbelegung).
function letztesGewicht(i) {
  for (let k = i - 1; k >= 0; k--) {
    const e = eintraege[STEPS[k].key];
    if (e && e.gewicht) return e.gewicht;
  }
  return '';
}

function kopf(idx) {
  const pct = Math.round((idx / STEPS.length) * 100);
  return `<div class="top">
    <div class="zeile"><span class="titel">Kraftsport</span><span class="zaehler">Schritt ${idx + 1} / ${STEPS.length}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

function render() {
  app.innerHTML = '';
  if (screen === 'start') return renderStart();
  if (screen === 'fertig') return renderFertig();
  if (screen === 'verlauf') return renderVerlauf();
  renderStep(screen);
}

function renderStart() {
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
    <div><button class="btn-gross" id="los">Los geht's</button></div>
    ${verlaufBtn}
  </div>`));
  document.getElementById('los').onclick = () => { screen = 0; render(); };
  const v = document.getElementById('verlauf');
  if (v) v.onclick = () => { screen = 'verlauf'; render(); };
}

function renderStep(i) {
  const step = STEPS[i];
  const u = step.u;
  const e = eintraege[step.key] || {};
  const N = saetzeAnzahl(u);
  const saetze = e.saetze || [];
  const gewVal = (e.gewicht !== undefined && e.gewicht !== '') ? e.gewicht : (hatGewicht(u) ? letztesGewicht(i) : '');
  const repsFelder = Array.from({ length: N }, (_, k) =>
    `<div class="feld"><label>Satz ${k + 1}</label><input class="wdh" data-k="${k}" inputmode="numeric" value="${esc(saetze[k] || '')}" placeholder="Wdh"></div>`
  ).join('');

  app.appendChild(el(kopf(i)));
  app.appendChild(el(`<div class="screen">
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
    <div class="block-eingabe">
      <div class="feld"><label>Gewicht (kg)</label><input id="gew" inputmode="decimal" value="${esc(gewVal)}" placeholder="kg"></div>
      <div class="saetze">${repsFelder}</div>
    </div>
    <div class="knoepfe">
      <button class="btn-zurueck" id="zurueck">Zurück</button>
      <button class="btn-weiter" id="weiter">${i === STEPS.length - 1 ? 'Fertig' : 'Weiter'}</button>
    </div>
  </div>`));

  const sichern = () => {
    const arr = [...app.querySelectorAll('.wdh')].map((x) => x.value.trim());
    eintraege[step.key] = { gewicht: document.getElementById('gew').value.trim(), saetze: arr };
    speichereEntwurf();
  };
  document.getElementById('gew').oninput = sichern;
  for (const x of app.querySelectorAll('.wdh')) x.oninput = sichern;
  document.getElementById('zurueck').onclick = () => { sichern(); screen = i === 0 ? 'start' : i - 1; render(); window.scrollTo(0, 0); };
  document.getElementById('weiter').onclick = () => { sichern(); screen = i === STEPS.length - 1 ? 'fertig' : i + 1; render(); window.scrollTo(0, 0); };
}

function zeilenAusEintraegen(quelle) {
  return STEPS.map((step) => {
    const e = (quelle || {})[step.key] || {};
    const r = wdhText(e);
    if (!r && !e.gewicht) return '';
    const name = esc(step.u.name) + (step.seite ? ` <span class="seite-klein">· ${esc(step.seite)}</span>` : '');
    const g = e.gewicht ? ` <small>· ${esc(e.gewicht)} kg</small>` : '';
    return `<div class="zeile-uebung"><span class="n">${name}</span><span class="w">${esc(r || '–')}${g}</span></div>`;
  }).join('');
}

function renderFertig() {
  const zeilen = zeilenAusEintraegen(eintraege) || '<p class="muster">Noch nichts eingetragen.</p>';
  app.appendChild(el(`<div class="screen">
    <div class="fertig-kopf"><div class="haken">✓</div><h1 style="margin:6px 0">Einheit fertig</h1></div>
    <div class="summe">${zeilen}</div>
    <div class="knoepfe">
      <button class="btn-zurueck" id="zurueck">Zurück</button>
      <button class="btn-weiter" id="speichern">Speichern</button>
    </div>
  </div>`));
  document.getElementById('zurueck').onclick = () => { screen = STEPS.length - 1; render(); };
  document.getElementById('speichern').onclick = () => {
    const log = ladeLog();
    log.push({ datum: new Date().toISOString().slice(0, 10), eintraege });
    speichereLog(log);
    eintraege = {};
    localStorage.removeItem('kraftsport_entwurf');
    screen = 'verlauf';
    render();
  };
}

function renderVerlauf() {
  const log = ladeLog();
  const karten = [...log].reverse().map((s, ri) => {
    const idx = log.length - 1 - ri;
    const zeilen = zeilenAusEintraegen(s.eintraege) || '<p class="muster">Keine Einträge.</p>';
    return `<div class="session">
      <div class="session-kopf"><b>${dDe(s.datum)}</b><button class="loesch" data-i="${idx}" title="löschen">✕</button></div>
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
    document.getElementById('exp-neueste').onclick = () => {
      const s = log[log.length - 1];
      exportieren('Kraft_' + s.datum + '.txt', sessionText(s));
    };
    document.getElementById('exp-alle').onclick = () => {
      exportieren('Kraft_alle_' + new Date().toISOString().slice(0, 10) + '.txt', allesText(log));
    };
  }
  for (const b of app.querySelectorAll('.loesch')) {
    b.onclick = () => {
      if (!confirm('Diese Einheit löschen?')) return;
      const log2 = ladeLog();
      log2.splice(Number(b.dataset.i), 1);
      speichereLog(log2);
      render();
    };
  }
}

render();
