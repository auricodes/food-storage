// ============================================================
// STORAGE — ora su Supabase (database condiviso), non più localStorage
// ============================================================
// PRIMA: i dati vivevano nel browser (localStorage), quindi ogni
// dispositivo aveva la sua dispensa indipendente.
// ORA: i dati vivono in un database Postgres ospitato su Supabase,
// quindi tu e il tuo compagno, aprendo questa pagina da due PC
// diversi, vedete e modificate gli stessi identici dati.
//
// Configurazione: Project URL e anon key del progetto Supabase.
// La "anon key" è pensata per essere usata lato client (nel browser),
// non è una password segreta — è normale che sia qui nel codice.
// ============================================================

const SUPABASE_URL = "https://biomtgkflxlcjwtdmuub.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpb210Z2tmbHhsY2p3dGRtdXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjYwODIsImV4cCI6MjA5NzY0MjA4Mn0.lDYK142R79S0YvmstOxtcQaJo7waItbcTDiH2lpsb70";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Le tabelle Supabase usano colonne minuscole standard (nome, quantita,
// formato, categoria, posizione, scadenza, note / nome, categoria,
// acquisto, apertura, durata, note) — stessa struttura che avevi già
// in JSON, quindi nessuna conversione complicata necessaria.

async function loadDataRemote(table) {
  const { data, error } = await supabaseClient.from(table).select("*");
  if (error) {
    console.error(`Errore lettura tabella ${table}`, error);
    alert(`Errore di connessione al database (${table}). Controlla la connessione internet e riprova.`);
    return [];
  }
  return data || [];
}

async function insertRemote(table, payload) {
  const { error } = await supabaseClient.from(table).insert(payload);
  if (error) {
    console.error(`Errore inserimento in ${table}`, error);
    alert("Errore durante il salvataggio. Riprova.");
    return false;
  }
  return true;
}

async function updateRemote(table, id, payload) {
  const { error } = await supabaseClient.from(table).update(payload).eq("id", id);
  if (error) {
    console.error(`Errore aggiornamento in ${table}`, error);
    alert("Errore durante l'aggiornamento. Riprova.");
    return false;
  }
  return true;
}

async function deleteRemote(table, id) {
  const { error } = await supabaseClient.from(table).delete().eq("id", id);
  if (error) {
    console.error(`Errore eliminazione in ${table}`, error);
    alert("Errore durante l'eliminazione. Riprova.");
    return false;
  }
  return true;
}

// Stato locale in memoria: viene popolato leggendo da Supabase all'avvio
// e tenuto sincronizzato dopo ogni operazione, così il resto del codice
// (drill-down, grafico, filtri) continua a leggere semplicemente "cibo"
// e "cura" come prima, senza dover essere riscritto da capo.
let cibo = [];
let cura = [];
let listaSpesa = [];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ============================================================
// STATO DI NAVIGAZIONE DRILL-DOWN (solo per il tab Cibo)
// view: "positions" | "categories" | "products"
// Si parte sempre da "positions". Cliccando una posizione si passa
// a "categories" (solo le categorie presenti in quella posizione).
// Cliccando una categoria si passa a "products" (la lista filtrata).
// La ricerca testuale bypassa la navigazione e va sempre dritta
// alla vista prodotti, perché cercare un nome ha senso indipendentemente
// da dove ti trovi nella gerarchia.
// ============================================================
let ciboView = "positions";
let ciboSelectedPosition = null;
let ciboSelectedCategory = null;
let ciboExpiryFilter = null; // "soon" | "expired" | null — attivo quando si viene dalle card statistiche

// ============================================================
// COLORI CATEGORIA
// Palette fissa: ogni categoria ha sempre lo stesso colore,
// sia nella card di navigazione, sia nel tag prodotto, sia nelle
// fette del grafico a ciambella. Se in futuro scrivi una categoria
// custom non in lista, le viene assegnato un colore generato in modo
// deterministico dal nome (hash → HSL), così resta stabile anche
// dopo un refresh.
// ============================================================
const CATEGORY_COLORS = {
  "Frutta":              "#e07a5f",
  "Verdura":             "#6aa84f",
  "Pane":                "#d9a441",
  "Pasta":               "#e8c468",
  "Riso":                "#cdb88a",
  "Biscotti":            "#c08552",
  "Legumi":              "#8d6e4a",
  "Latte e derivati":    "#5b8cff",
  "Formaggio":           "#f2c14e",
  "Carne":               "#c1453b",
  "Pesce":               "#5b9bd5",
  "Uova":                "#e8b04b",
  "Condimenti":          "#a37fc9",
  "Conserve":            "#7d8c4a",
  "Surgelati":           "#5bc8d5",
  "Snack":               "#e88dab",
  "Bevande":             "#4ea8a0",
  "Caffè/Tè":            "#6f4e37",
  "Cereali colazione":   "#d4a857",
  "Spezie":              "#b5552e",
  "Altro":               "#7a7f8a",
};

function colorForCategory(cat) {
  if (!cat) return CATEGORY_COLORS["Altro"];
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  let hash = 0;
  for (let i = 0; i < cat.length; i++) hash = (hash * 31 + cat.charCodeAt(i)) % 360;
  return `hsl(${hash}, 55%, 55%)`;
}

// Calcola se il testo sopra il colore di sfondo della categoria deve essere
// bianco o nero, in base alla luminosità percepita (formula YIQ standard).
// Così il tag resta sempre leggibile, sia su colori chiari (es. Riso) che scuri (es. Pesce).
function textColorForCategory(cat) {
  const color = colorForCategory(cat);
  let r, g, b;
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    r = parseInt(hex.substring(0,2), 16);
    g = parseInt(hex.substring(2,4), 16);
    b = parseInt(hex.substring(4,6), 16);
  } else {
    const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    const h = parseInt(match[1]) / 360, s = parseInt(match[2]) / 100, l = parseInt(match[3]) / 100;
    const k = n => (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    r = Math.round(f(0) * 255); g = Math.round(f(8) * 255); b = Math.round(f(4) * 255);
  }
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#000000" : "#ffffff";
}

// ============================================================
// TAB SWITCHING
// ============================================================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-content").forEach(t => t.style.display = "none");
    document.getElementById("tab-" + btn.dataset.tab).style.display = "block";
  });
});

// ============================================================
// HELPERS DATA / SCADENZE
// ============================================================
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(dateStr);
  target.setHours(0,0,0,0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function expiryStatus(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0) return { cls: "expiry-bad", label: `Scaduto da ${Math.abs(days)}g` };
  if (days === 0) return { cls: "expiry-bad", label: "Scade oggi" };
  if (days <= 7) return { cls: "expiry-soon", label: `Scade in ${days}g` };
  return { cls: "expiry-ok", label: `Scade il ${formatDate(dateStr)}` };
}

// Per la cura personale: calcola quanti giorni di uso e se è "in scadenza"
// rispetto alla durata stimata post-apertura (tipo PAO - Period After Opening)
function curaStatus(item) {
  if (!item.apertura) {
    return { cls: "tag", label: "Non aperto" };
  }
  const opened = new Date(item.apertura);
  const today = new Date();
  const daysUsed = Math.round((today - opened) / (1000 * 60 * 60 * 24));
  const monthsUsed = daysUsed / 30;

  if (!item.durata) {
    return { cls: "tag", label: `In uso da ${daysUsed}g` };
  }

  const monthsLeft = item.durata - monthsUsed;
  if (monthsLeft < 0) {
    return { cls: "expiry-bad", label: `Oltre durata stimata (${item.durata}m)` };
  }
  if (monthsLeft <= 1) {
    return { cls: "expiry-soon", label: `In uso da ${daysUsed}g · ~${Math.round(monthsLeft*30)}g rimasti` };
  }
  return { cls: "expiry-ok", label: `In uso da ${daysUsed}g · ~${Math.round(monthsLeft)} mesi rimasti` };
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// ============================================================
// RENDER CIBO — STATISTICHE (sempre visibili, indipendenti dalla vista)
// ============================================================
function renderCiboStats() {
  const total = cibo.length;
  const scaduti = cibo.filter(i => i.scadenza && daysUntil(i.scadenza) < 0).length;
  const inScadenza = cibo.filter(i => i.scadenza && daysUntil(i.scadenza) >= 0 && daysUntil(i.scadenza) <= 7).length;
  const totQty = cibo.reduce((sum, i) => sum + (parseInt(i.quantita) || 0), 0);

  document.getElementById("cibo-stats").innerHTML = `
    <div class="stat-box"><div class="num">${total}</div><div class="label">Prodotti diversi</div></div>
    <div class="stat-box"><div class="num">${totQty}</div><div class="label">Confezioni totali</div></div>
    <div class="stat-box stat-box-clickable" onclick="goToExpiryView('soon')"><div class="num" style="color:var(--yellow)">${inScadenza}</div><div class="label">In scadenza (7gg)</div></div>
    <div class="stat-box stat-box-clickable" onclick="goToExpiryView('expired')"><div class="num" style="color:var(--red)">${scaduti}</div><div class="label">Scaduti</div></div>
  `;
}

function populateCategoryFilters() {
  const categorieFisse = Object.keys(CATEGORY_COLORS);
  const cats = [...new Set([...categorieFisse, ...cibo.map(i => i.categoria).filter(Boolean)])].sort();
  const filterSel = document.getElementById("cibo-filter-cat");
  const current = filterSel.value;
  filterSel.innerHTML = '<option value="">Tutte le categorie</option>' +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  filterSel.value = current;
}

// ============================================================
// GRAFICO A CIAMBELLA — quantità per posizione + categoria
// Ogni fetta rappresenta una combinazione "posizione/categoria"
// (es. "Frigo / Frutta"), non solo la categoria da sola. Questo
// evita di mescolare nella stessa fetta prodotti che stanno in
// posti diversi della casa, e permette alla legenda di essere
// raggruppata per posizione (Frigo: Frutta (5), Verdura (3) / 
// Dispensa: Pasta (5)...) invece di un'unica lista piatta.
//
// Le fette sono ordinate per POSIZIONE prima (nell'ordine fisso
// Dispensa, Frigo, Freezer, Freezer giù) e per quantità decrescente
// dentro ogni posizione: così l'ordine delle fette nella ciambella
// corrisponde esattamente all'ordine dei gruppi nella legenda.
// Resta sempre relativo a TUTTA la dispensa, non alla vista corrente.
// ============================================================
let ciboChartInstance = null;
const POSITION_ORDER = ["Dispensa", "Frigo", "Freezer", "Freezer giù"];

function renderCiboChart() {
  const canvas = document.getElementById("cibo-chart");
  const legendEl = document.getElementById("cibo-chart-legend");

  if (typeof Chart === "undefined") {
    canvas.style.display = "none";
    legendEl.innerHTML = `<div class="chart-empty">⚠️ Chart.js non caricato.<br>Controlla che la cartella "lib" con chart.umd.js sia accanto a index.html.</div>`;
    return;
  }

  // Aggrego per posizione -> categoria -> quantità
  const byPosition = {};
  cibo.forEach(item => {
    const pos = item.posizione || "Dispensa";
    const cat = item.categoria || "Altro";
    if (!byPosition[pos]) byPosition[pos] = {};
    byPosition[pos][cat] = (byPosition[pos][cat] || 0) + (parseInt(item.quantita) || 0);
  });

  // Costruisco la lista ordinata di fette: prima per posizione (ordine fisso),
  // poi per quantità decrescente dentro ogni posizione
  const slices = [];
  POSITION_ORDER.forEach(pos => {
    if (!byPosition[pos]) return;
    const catEntries = Object.entries(byPosition[pos]).filter(([, qty]) => qty > 0);
    catEntries.sort((a, b) => b[1] - a[1]);
    catEntries.forEach(([cat, qty]) => slices.push({ pos, cat, qty }));
  });

  if (slices.length === 0) {
    if (ciboChartInstance) { ciboChartInstance.destroy(); ciboChartInstance = null; }
    canvas.style.display = "none";
    legendEl.innerHTML = `<div class="chart-empty">Nessun dato ancora</div>`;
    return;
  }
  canvas.style.display = "block";

  const labels = slices.map(s => `${s.pos} · ${s.cat}`);
  const data = slices.map(s => s.qty);
  const colors = slices.map(s => colorForCategory(s.cat));

  if (ciboChartInstance) {
    ciboChartInstance.data.labels = labels;
    ciboChartInstance.data.datasets[0].data = data;
    ciboChartInstance.data.datasets[0].backgroundColor = colors;
    ciboChartInstance.update();
  } else {
    ciboChartInstance = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: "#feffd2",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "58%",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed} confezioni`,
            },
          },
        },
      },
    });
  }

  // Legenda raggruppata per posizione, con un titolo per ogni gruppo
  let legendHtml = "";
  POSITION_ORDER.forEach(pos => {
    if (!byPosition[pos]) return;
    const catEntries = Object.entries(byPosition[pos]).filter(([, qty]) => qty > 0);
    if (catEntries.length === 0) return;
    catEntries.sort((a, b) => b[1] - a[1]);

    legendHtml += `<div class="chart-legend-group">
      <div class="chart-legend-group-title">${escapeHtml(pos)}</div>
      <div class="chart-legend">`;
    catEntries.forEach(([cat, qty]) => {
      legendHtml += `
        <div class="chart-legend-item">
          <span class="chart-legend-dot" style="background:${colorForCategory(cat)}"></span>
          ${escapeHtml(cat)} (${qty})
        </div>`;
    });
    legendHtml += `</div></div>`;
  });

  legendEl.innerHTML = legendHtml;
}

// ============================================================
// BREADCRUMB — mostra dove ti trovi nella navigazione e permette
// di tornare indietro con un click su un livello precedente
// ============================================================
function renderBreadcrumb() {
  const el = document.getElementById("cibo-breadcrumb");
  let html = `<span class="breadcrumb-link" onclick="goToPositions()">Tutte le posizioni</span>`;

  if (ciboView === "positions") {
    el.innerHTML = `<span class="breadcrumb-current">Tutte le posizioni</span>`;
    return;
  }

  if (ciboView === "expiry") {
    const label = ciboExpiryFilter === "expired" ? "Prodotti scaduti" : "Prodotti in scadenza";
    el.innerHTML = `${html} <span class="breadcrumb-sep">›</span> <span class="breadcrumb-current">${label}</span>`;
    return;
  }

  if (ciboSelectedPosition) {
    if (ciboView === "categories") {
      html += ` <span class="breadcrumb-sep">›</span> <span class="breadcrumb-current">${escapeHtml(ciboSelectedPosition)}</span>`;
    } else {
      html += ` <span class="breadcrumb-sep">›</span> <span class="breadcrumb-link" onclick="goToCategories('${escapeHtml(ciboSelectedPosition)}')">${escapeHtml(ciboSelectedPosition)}</span>`;
    }
  }
  if (ciboView === "products" && ciboSelectedCategory) {
    html += ` <span class="breadcrumb-sep">›</span> <span class="breadcrumb-current">${escapeHtml(ciboSelectedCategory)}</span>`;
  }

  el.innerHTML = html;
}

// Funzioni di navigazione richiamate dagli onclick nell'HTML generato
function goToPositions() {
  ciboView = "positions";
  ciboSelectedPosition = null;
  ciboSelectedCategory = null;
  ciboExpiryFilter = null;
  document.getElementById("cibo-search").value = "";
  renderCibo();
}

function goToCategories(position) {
  ciboView = "categories";
  ciboSelectedPosition = position;
  ciboSelectedCategory = null;
  ciboExpiryFilter = null;
  document.getElementById("cibo-search").value = "";
  renderCibo();
}

function goToProducts(position, category) {
  ciboView = "products";
  ciboSelectedPosition = position;
  ciboSelectedCategory = category;
  ciboExpiryFilter = null;
  renderCibo();
}

// Apre la vista filtrata richiamata dalle card "In scadenza" / "Scaduti".
// Mostra subito i prodotti pertinenti, raggruppati per posizione come
// fa la ricerca, bypassando completamente il drill-down per posizione/categoria.
function goToExpiryView(filter) {
  ciboView = "expiry";
  ciboSelectedPosition = null;
  ciboSelectedCategory = null;
  ciboExpiryFilter = filter;
  document.getElementById("cibo-search").value = "";
  renderCibo();
}

// ============================================================
// RENDER VISTA 1 — POSIZIONI (Dispensa, Frigo, Freezer, Freezer giù)
// ============================================================
function renderPositionsView() {
  const POSITIONS = [
    { key: "Dispensa", icon: "🥫" },
    { key: "Frigo", icon: "🧊" },
    { key: "Freezer", icon: "❄️" },
    { key: "Freezer giù", icon: "🧊" },
  ];

  const container = document.getElementById("cibo-content");

  if (cibo.length === 0) {
    container.innerHTML = `<div class="empty-state">Nessun prodotto in dispensa. Aggiungine uno con il bottone qui sopra.</div>`;
    return;
  }

  let html = `<div class="nav-grid nav-grid-positions">`;
  POSITIONS.forEach(pos => {
    const items = cibo.filter(i => i.posizione === pos.key);
    const totQty = items.reduce((sum, i) => sum + (parseInt(i.quantita) || 0), 0);
    html += `
      <div class="nav-card" onclick="goToCategories('${pos.key}')">
        <span class="nav-card-icon">${pos.icon}</span>
        <div class="nav-card-title">${pos.key}</div>
        <div class="nav-card-count">${items.length} prodott${items.length === 1 ? 'o' : 'i'} · ${totQty} confezion${totQty === 1 ? 'e' : 'i'}</div>
      </div>`;
  });
  html += `</div>`;

  container.innerHTML = html;
}

// ============================================================
// RENDER VISTA 2 — CATEGORIE presenti in una data posizione
// ============================================================
function renderCategoriesView(position) {
  const container = document.getElementById("cibo-content");
  const itemsInPosition = cibo.filter(i => i.posizione === position);

  if (itemsInPosition.length === 0) {
    container.innerHTML = `<div class="empty-state">Nessun prodotto in "${escapeHtml(position)}" al momento.</div>`;
    return;
  }

  // Aggrego per categoria, contando prodotti diversi e confezioni totali
  const grouped = {};
  itemsInPosition.forEach(i => {
    const cat = i.categoria || "Altro";
    if (!grouped[cat]) grouped[cat] = { count: 0, qty: 0 };
    grouped[cat].count++;
    grouped[cat].qty += parseInt(i.quantita) || 0;
  });

  // Ordino per quantità decrescente, così le categorie più "piene" sono in alto
  const entries = Object.entries(grouped).sort((a, b) => b[1].qty - a[1].qty);

  let html = `<div class="nav-grid">`;
  entries.forEach(([cat, info]) => {
    html += `
      <div class="nav-card nav-card-category" onclick="goToProducts('${escapeHtml(position)}', '${escapeHtml(cat)}')">
        <span class="cat-swatch" style="background:${colorForCategory(cat)}"></span>
        <div>
          <div class="nav-card-title">${escapeHtml(cat)}</div>
          <div class="nav-card-count">${info.count} prodott${info.count === 1 ? 'o' : 'i'} · ${info.qty} confezion${info.qty === 1 ? 'e' : 'i'}</div>
        </div>
      </div>`;
  });
  html += `</div>`;

  container.innerHTML = html;
}

// ============================================================
// RENDER VISTA 3 — PRODOTTI (lista filtrata, con tutte le azioni)
// Questa è anche la vista usata quando si effettua una RICERCA
// testuale: in quel caso ignora posizione/categoria selezionate
// e mostra tutti i risultati che matchano il testo, raggruppati
// per posizione come prima, per restare orientati.
// ============================================================
function renderProductsView({ isSearch = false, isExpiry = false } = {}) {
  const search = document.getElementById("cibo-search").value.toLowerCase();
  const filterLoc = document.getElementById("cibo-filter-loc").value;
  const filterCat = document.getElementById("cibo-filter-cat").value;
  const sortBy = document.getElementById("cibo-sort").value;

  let filtered = cibo.filter(i => {
    const matchSearch = !search || i.nome.toLowerCase().includes(search);
    if (isExpiry) {
      // Vista richiamata dalle card "In scadenza" / "Scaduti": ignoro
      // posizione/categoria del drill-down e filtro solo per urgenza scadenza
      if (ciboExpiryFilter === "expired") {
        return i.scadenza && daysUntil(i.scadenza) < 0;
      }
      return i.scadenza && daysUntil(i.scadenza) >= 0 && daysUntil(i.scadenza) <= 7;
    }
    if (isSearch) {
      // In modalità ricerca libera, applico anche eventuali filtri manuali del toolbar
      const matchLoc = !filterLoc || i.posizione === filterLoc;
      const matchCat = !filterCat || i.categoria === filterCat;
      return matchSearch && matchLoc && matchCat;
    }
    // In modalità drill-down, filtro per la posizione/categoria scelte nel percorso
    const matchPos = i.posizione === ciboSelectedPosition;
    const matchCat = (i.categoria || "Altro") === ciboSelectedCategory;
    return matchSearch && matchPos && matchCat;
  });

  filtered.sort((a, b) => {
    if (sortBy === "nome") return a.nome.localeCompare(b.nome);
    if (sortBy === "categoria") return (a.categoria || "").localeCompare(b.categoria || "");
    const da = a.scadenza ? new Date(a.scadenza) : new Date("9999-12-31");
    const db = b.scadenza ? new Date(b.scadenza) : new Date("9999-12-31");
    return da - db;
  });

  const container = document.getElementById("cibo-content");

  if (filtered.length === 0) {
    const emptyMsg = isExpiry
      ? (ciboExpiryFilter === "expired" ? "Nessun prodotto scaduto. 🎉" : "Nessun prodotto in scadenza nei prossimi 7 giorni.")
      : "Nessun prodotto trovato.";
    container.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    return;
  }

  // In modalità ricerca o vista scadenza raggruppo per posizione per
  // restare leggibili; in modalità drill-down è già tutto filtrato su
  // una sola categoria, quindi mostro una lista semplice senza sottotitoli.
  let html = "";
  if (isSearch || isExpiry) {
    const groups = { Dispensa: [], Frigo: [], Freezer: [], "Freezer giù": [] };
    filtered.forEach(i => {
      if (groups[i.posizione]) groups[i.posizione].push(i);
      else groups.Dispensa.push(i);
    });
    const icons = { Dispensa: "🥫", Frigo: "🧊", Freezer: "❄️", "Freezer giù": "🧊" };
    for (const [loc, items] of Object.entries(groups)) {
      if (items.length === 0) continue;
      html += `<div class="section-group">
        <div class="section-title">${icons[loc]} ${loc} <span class="count-badge">${items.length}</span></div>
        <div class="grid">${items.map(renderProductCard).join("")}</div>
      </div>`;
    }
  } else {
    html = `<div class="grid">${filtered.map(renderProductCard).join("")}</div>`;
  }

  container.innerHTML = html;
}

// Estratto come funzione riusabile sia dalla vista ricerca che drill-down
function renderProductCard(item) {
  const status = expiryStatus(item.scadenza);
  return `
    <div class="item-card">
      <div class="item-top">
        <div class="item-name">${escapeHtml(item.nome)}</div>
        <div class="item-qty">×${item.quantita}</div>
      </div>
      <div class="item-meta">${escapeHtml(item.formato || "")}</div>
      <div class="item-tags">
        ${item.categoria ? `<span class="tag" style="background:${colorForCategory(item.categoria)};color:${textColorForCategory(item.categoria)}">${escapeHtml(item.categoria)}</span>` : ""}
        ${status ? `<span class="tag ${status.cls}">${status.label}</span>` : ""}
      </div>
      ${item.note ? `<div class="item-meta" style="margin-top:6px">📝 ${escapeHtml(item.note)}</div>` : ""}
      <div class="item-actions">
        <button onclick="adjustQty('${item.id}', -1)">− unità</button>
        <button onclick="adjustQty('${item.id}', 1)">+ unità</button>
        <button onclick="openCiboModal('${item.id}')">Modifica</button>
        <button onclick="deleteCibo('${item.id}')">🗑</button>
      </div>
    </div>`;
}

// ============================================================
// ORCHESTRATORE PRINCIPALE — decide quale vista mostrare
// ============================================================
function renderCibo() {
  renderCiboStats();
  renderCiboChart();
  populateCategoryFilters();
  renderBreadcrumb();

  const search = document.getElementById("cibo-search").value.trim();
  const toolbar = document.getElementById("cibo-toolbar");

  // Una ricerca testuale attiva bypassa sempre il drill-down:
  // ha senso poter cercare un prodotto senza dover prima
  // navigare manualmente fino alla categoria giusta.
  if (search) {
    toolbar.style.display = "flex";
    renderProductsView({ isSearch: true });
    return;
  }

  if (ciboView === "positions") {
    toolbar.style.display = "none";
    renderPositionsView();
  } else if (ciboView === "categories") {
    toolbar.style.display = "none";
    renderCategoriesView(ciboSelectedPosition);
  } else if (ciboView === "expiry") {
    toolbar.style.display = "none";
    renderProductsView({ isExpiry: true });
  } else {
    toolbar.style.display = "flex";
    renderProductsView({ isSearch: false });
  }
}

// adjustQty/deleteCibo ora scrivono su Supabase (await) e poi
// aggiornano lo stato locale solo se l'operazione remota è andata a buon fine,
// così se la rete cade non si crea un disallineamento tra ciò che vedi
// e ciò che è davvero salvato nel database condiviso.
async function adjustQty(id, delta) {
  const item = cibo.find(i => i.id === id);
  if (!item) return;
  const newQty = Math.max(0, (parseInt(item.quantita) || 0) + delta);
  const ok = await updateRemote("cibo", id, { quantita: newQty });
  if (!ok) return;
  item.quantita = newQty;
  renderCibo();
}

async function deleteCibo(id) {
  if (!confirm("Eliminare questo prodotto?")) return;
  const ok = await deleteRemote("cibo", id);
  if (!ok) return;
  cibo = cibo.filter(i => i.id !== id);
  renderCibo();
}

// ============================================================
// MODAL CIBO (add/edit condiviso)
// ============================================================
function openCiboModal(id = null) {
  const overlay = document.getElementById("overlay-cibo");
  document.getElementById("cibo-id").value = "";
  document.getElementById("cibo-nome").value = "";
  document.getElementById("cibo-quantita").value = "1";
  document.getElementById("cibo-formato").value = "";
  document.getElementById("cibo-categoria").value = "";
  document.getElementById("cibo-posizione").value = "Dispensa";
  document.getElementById("cibo-scadenza").value = "";
  document.getElementById("cibo-note").value = "";

  if (id) {
    const item = cibo.find(i => i.id === id);
    if (item) {
      document.getElementById("cibo-modal-title").textContent = "Modifica prodotto";
      document.getElementById("cibo-id").value = item.id;
      document.getElementById("cibo-nome").value = item.nome;
      document.getElementById("cibo-quantita").value = item.quantita;
      document.getElementById("cibo-formato").value = item.formato || "";
      document.getElementById("cibo-categoria").value = item.categoria || "";
      document.getElementById("cibo-posizione").value = item.posizione || "Dispensa";
      document.getElementById("cibo-scadenza").value = item.scadenza || "";
      document.getElementById("cibo-note").value = item.note || "";
    }
  } else {
    document.getElementById("cibo-modal-title").textContent = "Aggiungi prodotto";
    // Comodità: se sto aggiungendo un prodotto mentre sono già dentro
    // una posizione/categoria specifica nel drill-down, precompilo quei
    // campi così non devo riselezionarli manualmente ogni volta.
    if (ciboSelectedPosition) {
      document.getElementById("cibo-posizione").value = ciboSelectedPosition;
    }
    if (ciboSelectedCategory && ciboSelectedCategory !== "Altro") {
      document.getElementById("cibo-categoria").value = ciboSelectedCategory;
    }
  }
  overlay.classList.add("show");
  document.getElementById("cibo-nome").focus();
}

function closeCiboModal() {
  document.getElementById("overlay-cibo").classList.remove("show");
}

document.getElementById("add-cibo-btn").addEventListener("click", () => openCiboModal());
document.getElementById("cibo-cancel").addEventListener("click", closeCiboModal);

document.getElementById("cibo-save").addEventListener("click", async () => {
  const nome = document.getElementById("cibo-nome").value.trim();
  if (!nome) { alert("Inserisci almeno il nome del prodotto"); return; }

  const id = document.getElementById("cibo-id").value;
  const payload = {
    nome,
    quantita: parseInt(document.getElementById("cibo-quantita").value) || 0,
    formato: document.getElementById("cibo-formato").value.trim(),
    categoria: document.getElementById("cibo-categoria").value.trim(),
    posizione: document.getElementById("cibo-posizione").value,
    scadenza: document.getElementById("cibo-scadenza").value || null,
    note: document.getElementById("cibo-note").value.trim(),
  };

  const saveBtn = document.getElementById("cibo-save");
  saveBtn.disabled = true;
  saveBtn.textContent = "Salvataggio...";

  if (id) {
    const ok = await updateRemote("cibo", id, payload);
    if (ok) {
      const item = cibo.find(i => i.id === id);
      Object.assign(item, payload);
    }
  } else {
    const newItem = { id: uid(), ...payload };
    const ok = await insertRemote("cibo", newItem);
    if (ok) cibo.push(newItem);
  }

  saveBtn.disabled = false;
  saveBtn.textContent = "Salva";
  closeCiboModal();
  renderCibo();
});

// ============================================================
// CURA PERSONALE — drill-down a 2 macro-categorie:
// "Detersivi & Pulizie"  -> direttamente ai prodotti (nessuna sotto-categoria)
// "Cura personale"       -> 4 categorie specifiche (Skincare, Corpo,
//                           Igiene, Capelli) -> prodotti
// "Posizione" (Bagno/Cucina/Balcone) NON è un livello di navigazione:
// è solo un tag opzionale mostrato sulla card, esattamente come la
// quantità, perché l'utente l'ha richiesto così esplicitamente.
// ============================================================
let curaView = "macro"; // "macro" | "categories" | "products"
let curaSelectedMacro = null;
let curaSelectedCategory = null;

const CURA_MACRO = [
  { key: "Detersivi & Pulizie", icon: "🧹", hasSubcategories: false },
  { key: "Cura personale", icon: "🧴", hasSubcategories: true },
];
const CURA_SUBCATEGORIES = ["Skincare", "Corpo", "Igiene", "Capelli"];

// Palette azzurra/fresca per la cura personale, distinta da quella
// del cibo così le due sezioni si riconoscono visivamente a colpo d'occhio.
const CURA_CATEGORY_COLORS = {
  "Detersivi & Pulizie": "#5b8cff",
  "Skincare":            "#6fb8e0",
  "Corpo":               "#8fd0d8",
  "Igiene":              "#7aa8e8",
  "Capelli":             "#4ea8c8",
};

function colorForCuraCategory(cat) {
  if (!cat) return "#7a7f8a";
  if (CURA_CATEGORY_COLORS[cat]) return CURA_CATEGORY_COLORS[cat];
  let hash = 0;
  for (let i = 0; i < cat.length; i++) hash = (hash * 31 + cat.charCodeAt(i)) % 360;
  return `hsl(${hash}, 60%, 60%)`;
}

function renderCuraStats() {
  const total = cura.length;
  const aperti = cura.filter(i => i.apertura).length;
  const inScadenza = cura.filter(i => {
    const s = curaStatus(i);
    return s.cls === "expiry-soon" || s.cls === "expiry-bad";
  }).length;

  document.getElementById("cura-stats").innerHTML = `
    <div class="stat-box"><div class="num">${total}</div><div class="label">Prodotti totali</div></div>
    <div class="stat-box"><div class="num">${aperti}</div><div class="label">Attualmente aperti</div></div>
    <div class="stat-box"><div class="num" style="color:var(--yellow)">${inScadenza}</div><div class="label">Da rinnovare presto</div></div>
  `;
}

function populateCuraCategoryFilter() {
  const cats = [...new Set([...CURA_SUBCATEGORIES, "Detersivi & Pulizie", ...cura.map(i => i.categoria).filter(Boolean)])].sort();
  const filterSel = document.getElementById("cura-filter-cat");
  const current = filterSel.value;
  filterSel.innerHTML = '<option value="">Tutte le categorie</option>' +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  filterSel.value = current;
}

// ============================================================
// GRAFICO A CIAMBELLA CURA PERSONALE — stessa logica del cibo:
// conta la QUANTITÀ totale per categoria (non solo il numero di
// prodotti diversi), usando la palette azzurra dedicata.
// ============================================================
let curaChartInstance = null;

function renderCuraChart() {
  const canvas = document.getElementById("cura-chart");
  const legendEl = document.getElementById("cura-chart-legend");

  if (typeof Chart === "undefined") {
    canvas.style.display = "none";
    legendEl.innerHTML = `<div class="chart-empty">⚠️ Chart.js non caricato.</div>`;
    return;
  }

  const totals = {};
  cura.forEach(item => {
    const cat = item.categoria || item.macrocategoria || "Altro";
    totals[cat] = (totals[cat] || 0) + (parseInt(item.quantita) || 0);
  });

  const entries = Object.entries(totals).filter(([, qty]) => qty > 0);
  entries.sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    if (curaChartInstance) { curaChartInstance.destroy(); curaChartInstance = null; }
    canvas.style.display = "none";
    legendEl.innerHTML = `<div class="chart-empty">Nessun dato ancora</div>`;
    return;
  }
  canvas.style.display = "block";

  const labels = entries.map(([cat]) => cat);
  const data = entries.map(([, qty]) => qty);
  const colors = labels.map(cat => colorForCuraCategory(cat));

  if (curaChartInstance) {
    curaChartInstance.data.labels = labels;
    curaChartInstance.data.datasets[0].data = data;
    curaChartInstance.data.datasets[0].backgroundColor = colors;
    curaChartInstance.update();
  } else {
    curaChartInstance = new Chart(canvas, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: "#feffd2", borderWidth: 2 }] },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "58%",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed} pz` } },
        },
      },
    });
  }

  legendEl.innerHTML = `<div class="chart-legend">` + entries.map(([cat, qty]) => `
    <div class="chart-legend-item">
      <span class="chart-legend-dot" style="background:${colorForCuraCategory(cat)}"></span>
      ${escapeHtml(cat)} (${qty})
    </div>
  `).join("") + `</div>`;
}

// ============================================================
// BREADCRUMB CURA
// ============================================================
function renderCuraBreadcrumb() {
  const el = document.getElementById("cura-breadcrumb");
  let html = `<span class="breadcrumb-link" onclick="goToCuraMacro()">Tutte le categorie</span>`;

  if (curaView === "macro") {
    el.innerHTML = `<span class="breadcrumb-current">Tutte le categorie</span>`;
    return;
  }

  if (curaSelectedMacro) {
    if (curaView === "categories") {
      html += ` <span class="breadcrumb-sep">›</span> <span class="breadcrumb-current">${escapeHtml(curaSelectedMacro)}</span>`;
    } else {
      html += ` <span class="breadcrumb-sep">›</span> <span class="breadcrumb-link" onclick="goToCuraCategories('${escapeHtml(curaSelectedMacro)}')">${escapeHtml(curaSelectedMacro)}</span>`;
    }
  }
  if (curaView === "products" && curaSelectedCategory) {
    html += ` <span class="breadcrumb-sep">›</span> <span class="breadcrumb-current">${escapeHtml(curaSelectedCategory)}</span>`;
  }

  el.innerHTML = html;
}

// Funzioni di navigazione richiamate dagli onclick nell'HTML generato
function goToCuraMacro() {
  curaView = "macro";
  curaSelectedMacro = null;
  curaSelectedCategory = null;
  document.getElementById("cura-search").value = "";
  renderCura();
}

function goToCuraCategories(macro) {
  const macroInfo = CURA_MACRO.find(m => m.key === macro);
  curaSelectedMacro = macro;
  curaSelectedCategory = null;
  document.getElementById("cura-search").value = "";
  if (macroInfo && macroInfo.hasSubcategories) {
    curaView = "categories";
  } else {
    // "Detersivi & Pulizie" non ha sotto-categorie: si salta dritto ai prodotti
    curaView = "products";
  }
  renderCura();
}

function goToCuraProducts(macro, category) {
  curaView = "products";
  curaSelectedMacro = macro;
  curaSelectedCategory = category;
  renderCura();
}

// ============================================================
// VISTA 1 — le 2 macro-card iniziali
// ============================================================
function renderCuraMacroView() {
  const container = document.getElementById("cura-content");

  if (cura.length === 0) {
    container.innerHTML = `<div class="empty-state">Nessun prodotto. Aggiungine uno con il bottone qui sopra.</div>`;
    return;
  }

  let html = `<div class="nav-grid nav-grid-positions">`;
  CURA_MACRO.forEach(macro => {
    const items = cura.filter(i => (i.macrocategoria || "Cura personale") === macro.key);
    const totQty = items.reduce((sum, i) => sum + (parseInt(i.quantita) || 0), 0);
    html += `
      <div class="nav-card" onclick="goToCuraCategories('${macro.key}')">
        <span class="nav-card-icon">${macro.icon}</span>
        <div class="nav-card-title">${macro.key}</div>
        <div class="nav-card-count">${items.length} prodott${items.length === 1 ? 'o' : 'i'} · ${totQty} pz</div>
      </div>`;
  });
  html += `</div>`;

  container.innerHTML = html;
}

// ============================================================
// VISTA 2 — categorie specifiche (solo sotto "Cura personale")
// ============================================================
function renderCuraCategoriesView(macro) {
  const container = document.getElementById("cura-content");
  const itemsInMacro = cura.filter(i => (i.macrocategoria || "Cura personale") === macro);

  let html = `<div class="nav-grid">`;
  CURA_SUBCATEGORIES.forEach(cat => {
    const items = itemsInMacro.filter(i => i.categoria === cat);
    const totQty = items.reduce((sum, i) => sum + (parseInt(i.quantita) || 0), 0);
    html += `
      <div class="nav-card nav-card-category" onclick="goToCuraProducts('${escapeHtml(macro)}', '${cat}')">
        <span class="cat-swatch" style="background:${colorForCuraCategory(cat)}"></span>
        <div>
          <div class="nav-card-title">${cat}</div>
          <div class="nav-card-count">${items.length} prodott${items.length === 1 ? 'o' : 'i'} · ${totQty} pz</div>
        </div>
      </div>`;
  });
  html += `</div>`;

  container.innerHTML = html;
}

// ============================================================
// VISTA 3 — PRODOTTI, anche usata dalla ricerca testuale libera
// ============================================================
function renderCuraProductsView({ isSearch = false } = {}) {
  const search = document.getElementById("cura-search").value.toLowerCase();
  const filterCat = document.getElementById("cura-filter-cat").value;
  const sortBy = document.getElementById("cura-sort").value;

  let filtered = cura.filter(i => {
    const matchSearch = !search || i.nome.toLowerCase().includes(search);
    if (isSearch) {
      const matchCat = !filterCat || i.categoria === filterCat || i.macrocategoria === filterCat;
      return matchSearch && matchCat;
    }
    const matchMacro = (i.macrocategoria || "Cura personale") === curaSelectedMacro;
    const macroInfo = CURA_MACRO.find(m => m.key === curaSelectedMacro);
    if (macroInfo && !macroInfo.hasSubcategories) {
      return matchSearch && matchMacro;
    }
    return matchSearch && matchMacro && i.categoria === curaSelectedCategory;
  });

  filtered.sort((a, b) => {
    if (sortBy === "nome") return a.nome.localeCompare(b.nome);
    if (sortBy === "categoria") return (a.categoria || "").localeCompare(b.categoria || "");
    const da = a.apertura ? new Date(a.apertura) : new Date("9999-12-31");
    const db = b.apertura ? new Date(b.apertura) : new Date("9999-12-31");
    return da - db;
  });

  const container = document.getElementById("cura-content");
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">Nessun prodotto trovato.</div>`;
    return;
  }

  container.innerHTML = `<div class="grid">${filtered.map(renderCuraProductCard).join("")}</div>`;
}

// Card prodotto cura personale, identica per struttura a quella del
// cibo: tag categoria colorato, quantità in blu con × davanti
// (stessa classe .item-qty del cibo, già colorata con var(--accent)).
function renderCuraProductCard(item) {
  const status = curaStatus(item);
  const catLabel = item.categoria || item.macrocategoria || "Altro";
  return `
    <div class="item-card">
      <div class="item-top">
        <div class="item-name">${escapeHtml(item.nome)}</div>
        <div class="item-qty">×${item.quantita ?? 1}</div>
      </div>
      <div class="item-meta">
        ${item.acquisto ? `Acquistato: ${formatDate(item.acquisto)}` : ""}
        ${item.apertura ? ` · Aperto: ${formatDate(item.apertura)}` : ""}
      </div>
      <div class="item-tags">
        <span class="tag" style="background:${colorForCuraCategory(catLabel)};color:#ffffff">${escapeHtml(catLabel)}</span>
        <span class="tag ${status.cls}">${status.label}</span>
        ${item.posizione ? `<span class="tag">${escapeHtml(item.posizione)}</span>` : ""}
      </div>
      ${item.note ? `<div class="item-meta" style="margin-top:6px">📝 ${escapeHtml(item.note)}</div>` : ""}
      <div class="item-actions">
        ${!item.apertura ? `<button onclick="markOpened('${item.id}')">Segna come aperto</button>` : ""}
        <button onclick="openCuraModal('${item.id}')">Modifica</button>
        <button onclick="deleteCura('${item.id}')">🗑</button>
      </div>
    </div>`;
}

// ============================================================
// ORCHESTRATORE CURA PERSONALE
// ============================================================
function renderCura() {
  renderCuraStats();
  renderCuraChart();
  populateCuraCategoryFilter();
  renderCuraBreadcrumb();

  const search = document.getElementById("cura-search").value.trim();
  const toolbar = document.getElementById("cura-toolbar");

  if (search) {
    toolbar.style.display = "flex";
    renderCuraProductsView({ isSearch: true });
    return;
  }

  if (curaView === "macro") {
    toolbar.style.display = "none";
    renderCuraMacroView();
  } else if (curaView === "categories") {
    toolbar.style.display = "none";
    renderCuraCategoriesView(curaSelectedMacro);
  } else {
    toolbar.style.display = "flex";
    renderCuraProductsView({ isSearch: false });
  }
}

async function markOpened(id) {
  const item = cura.find(i => i.id === id);
  if (!item) return;
  const today = new Date().toISOString().slice(0, 10);
  const ok = await updateRemote("cura", id, { apertura: today });
  if (!ok) return;
  item.apertura = today;
  renderCura();
}

async function deleteCura(id) {
  if (!confirm("Eliminare questo prodotto?")) return;
  const ok = await deleteRemote("cura", id);
  if (!ok) return;
  cura = cura.filter(i => i.id !== id);
  renderCura();
}

// ============================================================
// MODAL CURA
// Il campo "Categoria" specifica è visibile solo quando la
// macro-categoria scelta è "Cura personale" — sotto "Detersivi &
// Pulizie" non esistono sotto-categorie, quindi il campo si nasconde.
// ============================================================
function updateCuraCategoryFieldVisibility() {
  const macro = document.getElementById("cura-macrocategoria").value;
  const catField = document.getElementById("cura-categoria-field");
  catField.style.display = (macro === "Cura personale") ? "block" : "none";
}
document.getElementById("cura-macrocategoria").addEventListener("change", updateCuraCategoryFieldVisibility);

function openCuraModal(id = null) {
  const overlay = document.getElementById("overlay-cura");
  document.getElementById("cura-id").value = "";
  document.getElementById("cura-nome").value = "";
  document.getElementById("cura-quantita").value = "1";
  document.getElementById("cura-posizione").value = "";
  document.getElementById("cura-macrocategoria").value = curaSelectedMacro || "Detersivi & Pulizie";
  document.getElementById("cura-categoria").value = curaSelectedCategory || "Skincare";
  document.getElementById("cura-acquisto").value = new Date().toISOString().slice(0,10);
  document.getElementById("cura-apertura").value = "";
  document.getElementById("cura-durata").value = "";
  document.getElementById("cura-note").value = "";

  if (id) {
    const item = cura.find(i => i.id === id);
    if (item) {
      document.getElementById("cura-modal-title").textContent = "Modifica prodotto";
      document.getElementById("cura-id").value = item.id;
      document.getElementById("cura-nome").value = item.nome;
      document.getElementById("cura-quantita").value = item.quantita ?? 1;
      document.getElementById("cura-posizione").value = item.posizione || "";
      document.getElementById("cura-macrocategoria").value = item.macrocategoria || "Cura personale";
      document.getElementById("cura-categoria").value = item.categoria || "Skincare";
      document.getElementById("cura-acquisto").value = item.acquisto || "";
      document.getElementById("cura-apertura").value = item.apertura || "";
      document.getElementById("cura-durata").value = item.durata || "";
      document.getElementById("cura-note").value = item.note || "";
    }
  } else {
    document.getElementById("cura-modal-title").textContent = "Aggiungi prodotto";
  }
  updateCuraCategoryFieldVisibility();
  overlay.classList.add("show");
  document.getElementById("cura-nome").focus();
}

function closeCuraModal() {
  document.getElementById("overlay-cura").classList.remove("show");
}

document.getElementById("add-cura-btn").addEventListener("click", () => openCuraModal());
document.getElementById("cura-cancel").addEventListener("click", closeCuraModal);

document.getElementById("cura-save").addEventListener("click", async () => {
  const nome = document.getElementById("cura-nome").value.trim();
  if (!nome) { alert("Inserisci almeno il nome del prodotto"); return; }

  const macrocategoria = document.getElementById("cura-macrocategoria").value;
  const id = document.getElementById("cura-id").value;
  const payload = {
    nome,
    quantita: parseInt(document.getElementById("cura-quantita").value) || 0,
    posizione: document.getElementById("cura-posizione").value || null,
    macrocategoria,
    // La categoria specifica esiste solo sotto "Cura personale";
    // per "Detersivi & Pulizie" resta null, coerente col fatto che
    // quella macro-categoria non ha sotto-categorie.
    categoria: macrocategoria === "Cura personale" ? document.getElementById("cura-categoria").value : null,
    acquisto: document.getElementById("cura-acquisto").value || null,
    apertura: document.getElementById("cura-apertura").value || null,
    durata: parseInt(document.getElementById("cura-durata").value) || null,
    note: document.getElementById("cura-note").value.trim(),
  };

  const saveBtn = document.getElementById("cura-save");
  saveBtn.disabled = true;
  saveBtn.textContent = "Salvataggio...";

  if (id) {
    const ok = await updateRemote("cura", id, payload);
    if (ok) {
      const item = cura.find(i => i.id === id);
      Object.assign(item, payload);
    }
  } else {
    const newItem = { id: uid(), ...payload };
    const ok = await insertRemote("cura", newItem);
    if (ok) cura.push(newItem);
  }

  saveBtn.disabled = false;
  saveBtn.textContent = "Salva";
  closeCuraModal();
  renderCura();
});

// ============================================================
// EXPORT / IMPORT BACKUP (json) — utile come copia di sicurezza
// indipendente dal database, scaricabile in locale in qualsiasi momento
// ============================================================
document.getElementById("export-btn").addEventListener("click", () => {
  const backup = { cibo, cura, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scorte-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("import-btn").addEventListener("click", () => {
  document.getElementById("import-file").click();
});

// Pulisce un singolo prodotto prima di mandarlo a Supabase: i vecchi
// backup generati da localStorage potevano contenere stringhe vuote ""
// per campi data/numero non compilati, ma Postgres accetta solo null
// in quei casi — "" su una colonna "date" o "int" fa fallire l'insert
// con un errore 400 silenzioso e poco chiaro.
function sanitizeForSupabase(item, dateFields, numberFields) {
  const clean = { ...item };
  dateFields.forEach(f => { if (clean[f] === "" || clean[f] === undefined) clean[f] = null; });
  numberFields.forEach(f => {
    if (clean[f] === "" || clean[f] === undefined) clean[f] = null;
    else if (clean[f] !== null) clean[f] = Number(clean[f]);
  });
  return clean;
}

// L'import ora scrive ogni prodotto sul database condiviso (Supabase),
// non solo nel browser locale: usiamo "upsert" così se un id esiste
// già viene aggiornato invece di duplicato.
document.getElementById("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!confirm("Questo aggiungerà/aggiornerà i dati nel database condiviso con quelli del backup. Continuare?")) return;

      const importedCibo = (data.cibo || []).map(i => sanitizeForSupabase(i, ["scadenza"], ["quantita"]));
      const importedCura = (data.cura || []).map(i => sanitizeForSupabase(i, ["acquisto", "apertura"], ["durata"]));

      if (importedCibo.length) {
        const { error } = await supabaseClient.from("cibo").upsert(importedCibo);
        if (error) { console.error(error); alert("Errore importando i prodotti cibo: " + error.message); return; }
      }
      if (importedCura.length) {
        const { error } = await supabaseClient.from("cura").upsert(importedCura);
        if (error) { console.error(error); alert("Errore importando i prodotti cura personale: " + error.message); return; }
      }

      await initApp();
      alert("Backup importato correttamente.");
    } catch (err) {
      console.error(err);
      alert("File non valido.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

// ============================================================
// EVENTI FILTRI / RICERCA
// ============================================================
["cibo-search", "cibo-filter-loc", "cibo-filter-cat", "cibo-sort"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderCibo);
});
["cura-search", "cura-filter-cat", "cura-sort"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderCura);
});

// Chiudi modal cliccando fuori
document.querySelectorAll(".overlay").forEach(ov => {
  ov.addEventListener("click", (e) => {
    if (e.target === ov) ov.classList.remove("show");
  });
});

// ============================================================
// POST-IT — LISTA DELLA SPESA
// Lista libera per appuntarsi al volo cosa manca (es. "Zucchine"),
// condivisa tra tutti i dispositivi tramite Supabase, stesso pattern
// usato per cibo/cura. Resta sempre visibile, anche vuota — in quel
// caso mostra solo un placeholder discreto invece di sparire.
// Gli elementi spuntati restano visibili (sbarrati) finché non vengono
// eliminati manualmente, così si vede "fatto" prima che scompaia.
// ============================================================
function renderPostit() {
  const listEl = document.getElementById("postit-list");

  if (listaSpesa.length === 0) {
    listEl.innerHTML = `<div class="postit-empty">Niente da comprare per ora...</div>`;
    return;
  }

  // I non fatti prima, i fatti (sbarrati) in fondo — più utile da leggere al volo
  const sorted = [...listaSpesa].sort((a, b) => {
    if (a.fatto === b.fatto) return new Date(a.created_at) - new Date(b.created_at);
    return a.fatto ? 1 : -1;
  });

  listEl.innerHTML = sorted.map(item => `
    <div class="postit-item ${item.fatto ? 'done' : ''}">
      <input type="checkbox" ${item.fatto ? 'checked' : ''} onchange="togglePostitItem('${item.id}')">
      <span class="postit-item-text">${escapeHtml(item.testo)}</span>
      <button class="postit-item-delete" onclick="deletePostitItem('${item.id}')">✕</button>
    </div>
  `).join("");
}

async function addPostitItem() {
  const input = document.getElementById("postit-input");
  const btn = document.getElementById("postit-add-btn");
  const testo = input.value.trim();
  if (!testo) return;

  btn.disabled = true;
  const newItem = { id: uid(), testo, fatto: false, created_at: new Date().toISOString() };
  const ok = await insertRemote("lista_spesa", newItem);
  btn.disabled = false;
  if (!ok) return; // insertRemote mostra già un alert con l'errore esatto se fallisce

  listaSpesa.push(newItem);
  input.value = "";
  renderPostit();
  input.focus();
}

async function togglePostitItem(id) {
  const item = listaSpesa.find(i => i.id === id);
  if (!item) return;
  const newFatto = !item.fatto;
  const ok = await updateRemote("lista_spesa", id, { fatto: newFatto });
  if (!ok) return;
  item.fatto = newFatto;
  renderPostit();
}

async function deletePostitItem(id) {
  const ok = await deleteRemote("lista_spesa", id);
  if (!ok) return;
  listaSpesa = listaSpesa.filter(i => i.id !== id);
  renderPostit();
}

document.getElementById("postit-add-btn").addEventListener("click", addPostitItem);
document.getElementById("postit-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addPostitItem();
});

// ============================================================
// INIT — carica i dati da Supabase all'avvio, poi fa il primo render.
// Mostra un piccolo indicatore di caricamento perché ora, a differenza
// di localStorage, leggere i dati richiede una richiesta di rete e non
// è istantaneo.
// ============================================================
async function initApp() {
  document.getElementById("cibo-content").innerHTML = `<div class="empty-state">Caricamento dati...</div>`;
  document.getElementById("cura-content").innerHTML = `<div class="empty-state">Caricamento dati...</div>`;

  const [ciboData, curaData, listaSpesaData] = await Promise.all([
    loadDataRemote("cibo"),
    loadDataRemote("cura"),
    loadDataRemote("lista_spesa"),
  ]);
  cibo = ciboData;
  cura = curaData;
  listaSpesa = listaSpesaData;

  goToPositions();
  goToCuraMacro();
  renderPostit();
}

initApp();