/***************************************************
 * LIMITES HDV + SYNC PILOTES + SYNCS SÉPARÉES
 *
 * Onglets mois :
 *   Janvier, Février, Mars, Avril, Mai, Juin,
 *   Juillet, Août, Septembre, Octobre, Novembre, Décembre
 *
 * Onglet "Socle" :
 *  - Doit être l’onglet ouvert à l’ouverture du fichier
 *  - Ne doit JAMAIS être touché par les synchronisations
 *
 * Zone calendrier intouchable :
 *   B1:AF2 (ligne 1-2, colonnes jours)
 *
 * HDV :
 *  - Écrit dans le tableau "Limites Hdv" via détection par en-têtes :
 *      "3j / 20h max", "7j / 35h max", "30j / 80h max"
 *    (si tu changes "max" en rien, ça marche toujours car on détecte "3j"+"20", etc.)
 *
 * Synchros séparées (fiables) :
 *  - Sync PILOTES (structure)
 *  - Sync FORMAT (bordures/couleurs/polices)
 *  - Sync LARGEURS/HAUTEURS
 *  - Sync TITRES (textes) hors zone calendrier
 *  - Sync TITRES HDV (3j/7j/30j)
 ***************************************************/

const CFG = {
  SOCLE_SHEET: "Socle",
  FIRST_ROW: 3,

  // Grille heures (jours) : B..AF
  GRID_COL_START: 2,        // B
  GRID_COL_COUNT: 31,       // B..AF
  GRID_COL_END: 2 + 31 - 1, // AF = 32

  PILOT_COL: 1, // A

  // Zone calendrier intouchable
  CALENDAR_A1: "B1:AF2",

  TEMPLATE_MAX_ROWS: 250,
  TEMPLATE_MAX_COLS: 0,

  LIMITS: {
    D3:  { max: 20, orangeAt: 12, redAt: 16 },
    D7:  { max: 35, orangeAt: 19, redAt: 27 },
    D30: { max: 80, orangeAt: 64, redAt: 72 }
  },

  STYLE: {
    ORANGE_BG: "#ff9900",
    RED_BG: "#ff0000",
    WHITE_BG: "#ffffff",
    FONT_WHITE: "#ffffff",
    FONT_BLACK: "#000000",
    FONT_FAMILY: "Comfortaa",
    WEIGHT_BOLD: "bold",
    WEIGHT_NORMAL: "normal"
  },

  BTN: {
  EntOPS:     "#ff9900",
  FeuGAAR:    "#ff3333",
  GAAR:       "#f66a6a",     // ✅ rosée (sans alpha)
  MiFrance:   "#00ccff",
  MiEtranger: "#4a86e8",
  EntNAV:     "#ccff00",
  EntVDN:     "#ff33ff",
  VolTech:    "#cccccc"
},


  TEMPLATE_TIME_BUDGET_MS: 5.2 * 60 * 1000
};

/* =========================
   MENUS + OUVERTURE (Socle)
   ========================= */
function onOpen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();


  ui.createMenu("HDV")
  .addItem("Recalculer Limites HDV", "updateHdvLimitsAllSheets")
  .addSeparator()
  .addItem("Synchroniser PILOTES (depuis Janvier)", "syncPilotsFromJanuary")
  .addItem("Synchroniser BORDURES + LARGEURS/HAUTEURS", "syncTemplateBordersAndDimensionsFromJanuaryFast")
  .addItem("Synchroniser COULEURS", "syncTemplateColorsFromJanuaryFast")
  .addItem("Synchroniser TITRES (textes)", "syncTemplateTitlesFromJanuaryFast")
  .addSeparator()
  .addItem("Débloquer HDV (reset lock)", "resetHdvLock")
  .addSeparator()
  .addItem("TEST : Hook", "testHook")
  .addToUi();
}
function onSelectionChange(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    const cell = e.range.getSheet().getActiveCell();
const a1 = cell ? cell.getA1Notation() : e.range.getA1Notation();

    const p = PropertiesService.getDocumentProperties();
    p.setProperty("LAST_SEL_SHEET", sh.getName());
    p.setProperty("LAST_SEL_A1", a1);
    p.setProperty("LAST_SEL_TS", String(Date.now()));
  } catch (err) {
    // silence volontaire
  }
}

function resetHdvLock() {
  const props = PropertiesService.getDocumentProperties();
  props.deleteProperty("HDV_LOCK");
  props.deleteProperty("HDV_LOCK_TS");
  SpreadsheetApp.getActive().toast("HDV_LOCK réinitialisé", "HDV", 3);
}

/* =========================
   BOUTON MANUEL "Recalculer Limites Hdv"
   ========================= */
function btnRecalculerLimitesHdv() {
  updateHdvLimitsAllSheets();
}

/* =========================
   HDV : UPDATE (Menu)
   ========================= */
function updateHdvLimitsAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getActiveSheet();
  if (!sh) return;

  const mi = _getMonthIndexFromSheetName_(sh.getName());
  if (mi === null) return;

  _updateHdvForSheetAndPrev_(sh);
}

/* =========================
   HDV : UPDATE (onglet donné + précédent)
   + PROPAGATION ALERTE TRIGRAMMES SUR TOUS LES MOIS
   ========================= */
function _updateHdvForSheetAndPrev_(sh) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mi = _getMonthIndexFromSheetName_(sh.getName());
  if (mi === null) return;

  const today = _stripTime_(new Date());

  const sheets = [sh];
  if (mi > 0) {
    const prev = ss.getSheetByName(_monthNameFromIndex_(mi - 1));
    if (prev) sheets.push(prev);
  }

  const index = _buildFlightsIndex_(sheets, today, 30);

  sheets.forEach(s => _writeLimitsForSheet_(s, index, today));

  _applyPilotAlertsAllMonthSheetsGlobal_(ss, today);
}

/* =========================
   DISPATCHER UNIQUE onEdit(e)
   - Socle => _onEditSocle_(e)
   - Mois  => _onEditHdv_(e)
   ========================= */
function onEdit(e) {
  try {
    if (!e || !e.range) return;

    const shName = e.range.getSheet().getName();
    _logOnEdit_("onEdit déclenché", e);

    // Nom SOCLE (via Config si dispo, sinon fallback "Socle")
    const c = (typeof CFG_ === "function") ? CFG_() : {};
    const socleName = (c && c.SOCLE_SHEET) ? c.SOCLE_SHEET : "Socle";

    // 1) SOCLE
    if (shName === socleName) {
      _logOnEdit_("branche SOCLE", e);

      if (typeof _onEditSocle_ === "function") {
        _onEditSocle_(e);
        _logOnEdit_("_onEditSocle_ OK", e);
      } else {
        _logOnEdit_("_onEditSocle_ introuvable", e);
        SpreadsheetApp.getActive().toast("_onEditSocle_ introuvable (Socle.gs ?)", "SOCLE", 6);
      }
      return;
    }

    // 2) HDV
    _logOnEdit_("branche HDV", e);
    _onEditHdv_(e);

  } catch (err) {
    _logOnEdit_("Erreur onEdit global : " + err.message, e);
  }
}

/* =========================
   AUTO À CHAQUE SAISIE
   - heures B..AF => HDV (onglet édité + précédent)
   + FIX : si tu VIDES une cellule, on efface la couleur manuelle
   ========================= */
function _onEditHdv_(e) {
  if (!e || !e.range) return;

  const sh = e.range.getSheet();
  const mi = _getMonthIndexFromSheetName_(sh.getName());
  if (mi === null) return;

  if (e.range.getRow() < CFG.FIRST_ROW) return;

  const c1 = e.range.getColumn();
  const c2 = c1 + e.range.getNumColumns() - 1;
  if (c2 < CFG.GRID_COL_START || c1 > CFG.GRID_COL_END) return;

  // ✅ 0) Si un bouton de coloration vient d’être cliqué,
  // on colore la cellule éditée au moment où la valeur est enfin commit.
  const pendingBg = _consumePendingBtnColor_();
  if (pendingBg) {
    try {
      // on ne fait ça que sur une cellule unique
      if (e.range.getNumRows() === 1 && e.range.getNumColumns() === 1) {
        const v = e.range.getValue();
        if (v !== "" && v !== null) {
          e.range.setBackground(pendingBg);
        }
      }
    } catch (err) {}
  }

  // 1) Si l'utilisateur efface des cellules => on supprime la mise en forme manuelle
  _clearManualColorWhenEmpty_(e.range);

  // 2) Recalcul HDV avec lock
  const props = PropertiesService.getDocumentProperties();
  const now = Date.now();
  const lockVal = props.getProperty("HDV_LOCK");
  const lockTs = Number(props.getProperty("HDV_LOCK_TS") || "0");

  if (lockVal === "1" && lockTs && (now - lockTs) > 90 * 1000) {
    props.deleteProperty("HDV_LOCK");
    props.deleteProperty("HDV_LOCK_TS");
  }
  if (props.getProperty("HDV_LOCK") === "1") return;

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(2000)) return;

  props.setProperty("HDV_LOCK", "1");
  props.setProperty("HDV_LOCK_TS", String(now));

  try {
    _updateHdvForSheetAndPrev_(sh);
  } finally {
    props.deleteProperty("HDV_LOCK");
    props.deleteProperty("HDV_LOCK_TS");
    lock.releaseLock();
  }
}

function _clearManualColorWhenEmpty_(range) {
  const sheet = range.getSheet();

  const r1 = range.getRow();
  const c1 = range.getColumn();
  const nr = range.getNumRows();
  const nc = range.getNumColumns();

  // travaille uniquement sur l'intersection avec B..AF
  const left = Math.max(c1, CFG.GRID_COL_START);
  const right = Math.min(c1 + nc - 1, CFG.GRID_COL_END);
  if (right < left) return;

  const width = right - left + 1;
  const sub = sheet.getRange(r1, left, nr, width);

  const vals = sub.getValues();
  const bgs = sub.getBackgrounds();
  const fcs = sub.getFontColors();
  const fws = sub.getFontWeights();
  const ffs = sub.getFontFamilies();

  let changed = false;

  for (let r = 0; r < nr; r++) {
    for (let c = 0; c < width; c++) {
      const v = vals[r][c];
      const empty = (v === "" || v === null);
      if (empty) {
        if (bgs[r][c] !== CFG.STYLE.WHITE_BG) { bgs[r][c] = CFG.STYLE.WHITE_BG; changed = true; }
        if (fcs[r][c] !== CFG.STYLE.FONT_BLACK) { fcs[r][c] = CFG.STYLE.FONT_BLACK; changed = true; }
        if (fws[r][c] !== CFG.STYLE.WEIGHT_NORMAL) { fws[r][c] = CFG.STYLE.WEIGHT_NORMAL; changed = true; }
        if (ffs[r][c] !== CFG.STYLE.FONT_FAMILY) { ffs[r][c] = CFG.STYLE.FONT_FAMILY; changed = true; }
      }
    }
  }

  if (changed) {
    sub.setBackgrounds(bgs);
    sub.setFontColors(fcs);
    sub.setFontWeights(fws);
    sub.setFontFamilies(ffs);
  }
}

/* =========================
   LIMITES HDV : détection colonnes par en-têtes
   ========================= */
function findLimitesHdvColumns_(sheet) {
  const lastCol = sheet.getLastColumn();
  const maxRows = Math.min(50, sheet.getMaxRows());

  for (let r = 1; r <= maxRows; r++) {
    const row = sheet.getRange(r, 1, 1, lastCol).getDisplayValues()[0];
    let c3 = null, c7 = null, c30 = null;

    for (let i = 0; i < row.length; i++) {
      const t = _normHeaderText_(row[i]);
      if (!c3  && t.includes("3j")  && t.includes("20")) c3  = i + 1;
      if (!c7  && t.includes("7j")  && t.includes("35")) c7  = i + 1;
      if (!c30 && t.includes("30j") && t.includes("80")) c30 = i + 1;
    }
    if (c3 && c7 && c30) return { headerRow: r, col3: c3, col7: c7, col30: c30 };
  }

  // fallback (à ajuster si besoin)
  return { headerRow: 2, col3: 41, col7: 42, col30: 43 };
}

/* =========================
   LIMITES HDV : écriture + styles
   ========================= */
function _writeLimitsForSheet_(sh, index, today) {
  const cols = findLimitesHdvColumns_(sh);
  const FIRST_ROW = Math.max(CFG.FIRST_ROW, cols.headerRow + 1);

  const lastRow = sh.getLastRow();
  if (lastRow < FIRST_ROW) return;
  const rows = lastRow - FIRST_ROW + 1;

  const miSheet = _getMonthIndexFromSheetName_(sh.getName());
  const miToday = today.getMonth();
  const isCurrentMonthSheet = (miSheet === miToday);

  const pilots = sh.getRange(FIRST_ROW, CFG.PILOT_COL, rows, 1).getValues();

  const out3 = [], out7 = [], out30 = [];
  const bg3 = [], fc3 = [], fw3 = [];
  const bg7 = [], fc7 = [], fw7 = [];
  const bg30 = [], fc30 = [], fw30 = [];

  for (let i = 0; i < rows; i++) {
    const code = (pilots[i][0] || "").toString().trim().toUpperCase();

    if (!_isTrigram_(code)) {
      out3.push([""]); out7.push([""]); out30.push([""]);
      const n = _styleNormal_();
      bg3.push([n.bg]);  fc3.push([n.fc]);  fw3.push([n.fw]);
      bg7.push([n.bg]);  fc7.push([n.fc]);  fw7.push([n.fw]);
      bg30.push([n.bg]); fc30.push([n.fc]); fw30.push([n.fw]);
      continue;
    }

    const entries = index[code] || [];
    const v3  = _round1_(_sumLastNDays_(entries, today, 3));
    const v7  = _round1_(_sumLastNDays_(entries, today, 7));
    const v30 = _round1_(_sumLastNDays_(entries, today, 30));

    const s3  = _styleForLimit_(v3,  CFG.LIMITS.D3);
    const s7  = _styleForLimit_(v7,  CFG.LIMITS.D7);
    const s30 = _styleForLimit_(v30, CFG.LIMITS.D30);

    if (isCurrentMonthSheet) {
      out3.push([v3]); out7.push([v7]); out30.push([v30]);
      bg3.push([s3.bg]);   fc3.push([s3.fc]);   fw3.push([s3.fw]);
      bg7.push([s7.bg]);   fc7.push([s7.fc]);   fw7.push([s7.fw]);
      bg30.push([s30.bg]); fc30.push([s30.fc]); fw30.push([s30.fw]);
    } else {
      out3.push([""]); out7.push([""]); out30.push([""]);
      const n = _styleNormal_();
      bg3.push([n.bg]);  fc3.push([n.fc]);  fw3.push([n.fw]);
      bg7.push([n.bg]);  fc7.push([n.fc]);  fw7.push([n.fw]);
      bg30.push([n.bg]); fc30.push([n.fc]); fw30.push([n.fw]);
    }
  }

  sh.getRange(FIRST_ROW, cols.col3,  rows, 1).setValues(out3);
  sh.getRange(FIRST_ROW, cols.col7,  rows, 1).setValues(out7);
  sh.getRange(FIRST_ROW, cols.col30, rows, 1).setValues(out30);

  _applyStyleColumn_(sh, FIRST_ROW, cols.col3,  rows, bg3,  fc3,  fw3);
  _applyStyleColumn_(sh, FIRST_ROW, cols.col7,  rows, bg7,  fc7,  fw7);
  _applyStyleColumn_(sh, FIRST_ROW, cols.col30, rows, bg30, fc30, fw30);
}

/* =========================
   PROPAGATION ALERTE TRIGRAMMES SUR TOUS LES MOIS
   ========================= */
function _applyPilotAlertsAllMonthSheetsGlobal_(ss, today) {
  const monthSheets = _getMonthSheets_(ss);
  const indexAll = _buildFlightsIndex_(monthSheets, today, 30);
  const styleMap = _computePilotAlertStyleMap_(indexAll, today);
  monthSheets.forEach(sh => _applyPilotAlertStyleToOneSheet_(sh, styleMap));
}

function _computePilotAlertStyleMap_(index, today) {
  const map = {};
  for (const code in index) {
    if (!Object.prototype.hasOwnProperty.call(index, code)) continue;
    if (!_isTrigram_(code)) continue;

    const entries = index[code] || [];
    const v3  = _round1_(_sumLastNDays_(entries, today, 3));
    const v7  = _round1_(_sumLastNDays_(entries, today, 7));
    const v30 = _round1_(_sumLastNDays_(entries, today, 30));

    const s3  = _styleForLimit_(v3,  CFG.LIMITS.D3);
    const s7  = _styleForLimit_(v7,  CFG.LIMITS.D7);
    const s30 = _styleForLimit_(v30, CFG.LIMITS.D30);
    const sp  = _mergeWorstStyle_(s3, s7, s30);

    map[code] = { bg: sp.bg, fc: sp.fc };
  }
  return map;
}

function _applyPilotAlertStyleToOneSheet_(sh, styleMap) {
  const lastTriRow = _findLastTrigramRow_(sh);
  if (lastTriRow < CFG.FIRST_ROW) return;

  const rows = lastTriRow - CFG.FIRST_ROW + 1;

  const trigCols = _findTrigramColumns_(sh, CFG.FIRST_ROW, rows, 45);
  if (!trigCols.length) return;

  trigCols.forEach(col => {
    const rng = sh.getRange(CFG.FIRST_ROW, col, rows, 1);
    const vals = rng.getValues();

    const bgs = [];
    const fcs = [];

    for (let i = 0; i < rows; i++) {
      const code = (vals[i][0] || "").toString().trim().toUpperCase();
      if (_isTrigram_(code) && styleMap[code]) {
        bgs.push([styleMap[code].bg]);
        fcs.push([styleMap[code].fc]);
      } else {
        bgs.push([CFG.STYLE.WHITE_BG]);
        fcs.push([CFG.STYLE.FONT_BLACK]);
      }
    }

    rng.setBackgrounds(bgs);
    rng.setFontColors(fcs);
  });

  // sécurité : si une autre colonne “cible” ne fait pas partie des trigCols, on la remet neutre
  if (sh.getMaxColumns() >= 45 && trigCols.indexOf(45) === -1) {
    sh.getRange(CFG.FIRST_ROW, 45, rows, 1)
      .setBackground(CFG.STYLE.WHITE_BG)
      .setFontColor(CFG.STYLE.FONT_BLACK);
  }
}

/* =========================
   INDEX DES VOLS (jours ligne 2)
   ========================= */
function _buildFlightsIndex_(sheets, today, daysWindow) {
  const start = _stripTime_(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (daysWindow - 1)));
  const idx = {};
  const year = today.getFullYear();

  sheets.forEach(sh => {
    const mi = _getMonthIndexFromSheetName_(sh.getName());
    if (mi === null) return;

    const dayNums = sh.getRange(2, CFG.GRID_COL_START, 1, CFG.GRID_COL_COUNT).getValues()[0];

    const last = sh.getLastRow();
    if (last < CFG.FIRST_ROW) return;

    const rows = last - CFG.FIRST_ROW + 1;

    const pilots = sh.getRange(CFG.FIRST_ROW, CFG.PILOT_COL, rows, 1).getValues();
    const grid = sh.getRange(CFG.FIRST_ROW, CFG.GRID_COL_START, rows, CFG.GRID_COL_COUNT).getValues();

    for (let r = 0; r < rows; r++) {
      const code = (pilots[r][0] || "").toString().trim().toUpperCase();
      if (!_isTrigram_(code)) continue;

      for (let c = 0; c < CFG.GRID_COL_COUNT; c++) {
        const day = parseInt(dayNums[c], 10);
        if (!day || day < 1 || day > 31) continue;

        const dt = _stripTime_(new Date(year, mi, day));
        if (dt < start || dt > today) continue;

        const h = _toNumberHours_(grid[r][c]);
        if (!h || h <= 0) continue;

        if (!idx[code]) idx[code] = [];
        idx[code].push({ d: dt, h: h });
      }
    }
  });

  return idx;
}

/* =========================
   STYLES (cumuls)
   ========================= */
function _styleForLimit_(v, lim) {
  const n = Number(v) || 0;
  if (n >= lim.redAt) {
    return { level: 2, bg: CFG.STYLE.RED_BG, fc: CFG.STYLE.FONT_WHITE, fw: CFG.STYLE.WEIGHT_BOLD };
  }
  if (n >= lim.orangeAt) {
    return { level: 1, bg: CFG.STYLE.ORANGE_BG, fc: CFG.STYLE.FONT_WHITE, fw: CFG.STYLE.WEIGHT_BOLD };
  }
  return _styleNormal_();
}
function _styleNormal_() {
  return { level: 0, bg: CFG.STYLE.WHITE_BG, fc: CFG.STYLE.FONT_BLACK, fw: CFG.STYLE.WEIGHT_NORMAL };
}
function _mergeWorstStyle_(a, b, c) {
  let m = a;
  if (b.level > m.level) m = b;
  if (c.level > m.level) m = c;
  return m;
}
function _applyStyleColumn_(sh, startRow, col, rows, bgs, fcs, fws) {
  const g = sh.getRange(startRow, col, rows, 1);
  g.setBackgrounds(bgs);
  g.setFontColors(fcs);
  g.setFontWeights(fws);
}

/* ============================================================
   SYNC PILOTES (depuis Janvier)
   ============================================================ */
function syncPilotsFromJanuary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jan = ss.getSheetByName("Janvier");
  if (!jan) throw new Error("Onglet 'Janvier' introuvable.");

  const monthSheets = _getMonthSheets_(ss);
  const ref = _getPilotStructureFromSheet_(jan);
  const desiredRows = ref.pattern.length;

  monthSheets.forEach(sh => {
    if (sh.getName() === "Janvier") return;
    _syncPilotsOneSheet_(sh, ref, desiredRows);
  });

  updateHdvLimitsAllSheets();
}

function _syncPilotsOneSheet_(sh, ref, desiredRows) {
  const startRow = CFG.FIRST_ROW;
  const numCols = CFG.GRID_COL_END;

  const currentLastTriRow = _findLastTrigramRow_(sh);
  const currentEndRow = (currentLastTriRow >= startRow) ? currentLastTriRow : (startRow + desiredRows - 1);
  const currentRows = Math.max(0, currentEndRow - startRow + 1);

  let snap = { values: [], bgs: [], notes: [] };
  if (currentRows > 0) {
    const rng = sh.getRange(startRow, 1, currentRows, numCols);
    snap = { values: rng.getValues(), bgs: rng.getBackgrounds(), notes: rng.getNotes() };
  }

  const delta = desiredRows - currentRows;
  if (delta > 0) {
    sh.insertRowsAfter(Math.max(currentEndRow, startRow - 1), delta);
  } else if (delta < 0) {
    const deleteStart = startRow + desiredRows;
    const deleteCount = -delta;
    if (deleteStart >= startRow) sh.deleteRows(deleteStart, deleteCount);
  }

  const map = {};
  for (let i = 0; i < snap.values.length; i++) {
    const tri = (snap.values[i][0] || "").toString().trim().toUpperCase();
    if (_isTrigram_(tri)) map[tri] = { v: snap.values[i].slice(), bg: snap.bgs[i].slice(), n: snap.notes[i].slice() };
  }

  const outV = [], outBG = [], outN = [];
  for (let i = 0; i < ref.pattern.length; i++) {
    const tri = (ref.pattern[i].tri || "").toString().trim().toUpperCase();
    if (_isTrigram_(tri) && map[tri]) {
      outV.push(map[tri].v);
      outBG.push(map[tri].bg);
      outN.push(map[tri].n);
    } else if (_isTrigram_(tri)) {
      const rowV = new Array(numCols).fill("");
      rowV[0] = tri;
      outV.push(rowV);
      outBG.push(new Array(numCols).fill(CFG.STYLE.WHITE_BG));
      outN.push(new Array(numCols).fill(""));
    } else {
      outV.push(new Array(numCols).fill(""));
      outBG.push(new Array(numCols).fill(CFG.STYLE.WHITE_BG));
      outN.push(new Array(numCols).fill(""));
    }
  }

  const dst = sh.getRange(startRow, 1, outV.length, numCols);
  dst.setValues(outV);
  dst.setBackgrounds(outBG);
  dst.setNotes(outN);
}

function _getPilotStructureFromSheet_(sh) {
  const lastRow = sh.getLastRow();
  if (lastRow < CFG.FIRST_ROW) return { pattern: [] };

  const colA = sh.getRange(CFG.FIRST_ROW, 1, lastRow - CFG.FIRST_ROW + 1, 1).getValues();
  let lastTriOffset = -1;

  for (let i = 0; i < colA.length; i++) {
    const s = (colA[i][0] || "").toString().trim().toUpperCase();
    if (_isTrigram_(s)) lastTriOffset = i;
  }
  if (lastTriOffset < 0) return { pattern: [] };

  const endRow = CFG.FIRST_ROW + lastTriOffset;
  const pattern = [];
  for (let r = CFG.FIRST_ROW; r <= endRow; r++) {
    const v = (sh.getRange(r, 1).getValue() || "").toString().trim().toUpperCase();
    pattern.push({ tri: _isTrigram_(v) ? v : "" });
  }
  return { pattern };
}

function _findLastTrigramRow_(sh) {
  const lastRow = sh.getLastRow();
  if (lastRow < CFG.FIRST_ROW) return CFG.FIRST_ROW - 1;

  const colA = sh.getRange(CFG.FIRST_ROW, 1, lastRow - CFG.FIRST_ROW + 1, 1).getValues();
  let last = CFG.FIRST_ROW - 1;

  for (let i = 0; i < colA.length; i++) {
    const s = (colA[i][0] || "").toString().trim().toUpperCase();
    if (_isTrigram_(s)) last = CFG.FIRST_ROW + i;
  }
  return last;
}

/* ============================================================
   SYNC TEMPLATE : désactivé (volontairement)
   ============================================================ */
function syncTemplateFromJanuary() {
  SpreadsheetApp.getActive().toast(
    "Synchroniser TEMPLATE est désactivé. Utilise : PILOTES / FORMAT / LARGEURS-HAUTEURS / TITRES.",
    "HDV",
    6
  );
}

/* ============================================================
   SYNC LARGEURS/HAUTEURS (rapide)
   ============================================================ */
function syncTemplateBordersAndDimensionsFromJanuaryFast() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jan = ss.getSheetByName("Janvier");
  if (!jan) throw new Error("Onglet 'Janvier' introuvable.");

  const monthSheets = _getMonthSheets_(ss).filter(s => s.getName() !== "Janvier");
  const lastColRef = 45;

  const refEndRow = Math.max(_findLastTrigramRow_(jan), jan.getLastRow());
  const lastRowRef = (CFG.TEMPLATE_MAX_ROWS && CFG.TEMPLATE_MAX_ROWS > 0)
    ? Math.min(refEndRow, CFG.TEMPLATE_MAX_ROWS)
    : refEndRow;

  const widths = [];
  for (let c = 1; c <= lastColRef; c++) widths.push(jan.getColumnWidth(c));

  const heights = [];
  for (let r = 1; r <= lastRowRef; r++) heights.push(jan.getRowHeight(r));

  const t0 = Date.now();

  monthSheets.forEach(sh => {
    _ensureMinColumns_(sh, lastColRef);

    // 1) Largeurs / hauteurs
    for (let c = 1; c <= lastColRef; c++) sh.setColumnWidth(c, widths[c - 1]);
    for (let r = 1; r <= lastRowRef; r++) sh.setRowHeight(r, heights[r - 1]);

    // 2) Bordures + alignements + formats SANS écraser les couleurs
    // A1:A2
    _copyBordersAndStructureOnly_(jan.getRange(1, 1, 2, 1), sh.getRange(1, 1, 2, 1));

    // AG..AS lignes 1-2
    const rightStart = CFG.GRID_COL_END + 1; // AG
    if (lastColRef >= rightStart) {
      const w = lastColRef - rightStart + 1;
      _copyBordersAndStructureOnly_(
        jan.getRange(1, rightStart, 2, w),
        sh.getRange(1, rightStart, 2, w)
      );
    }

    // A3..fin
    if (lastRowRef >= 3) {
      _copyBordersAndStructureOnly_(
        jan.getRange(3, 1, lastRowRef - 2, lastColRef),
        sh.getRange(3, 1, lastRowRef - 2, lastColRef)
      );
    }

    if ((Date.now() - t0) > CFG.TEMPLATE_TIME_BUDGET_MS) {
      SpreadsheetApp.getActive().toast("Synchroniser BORDURES + LARGEURS/HAUTEURS : interrompu (anti-timeout). Relance.", "HDV", 5);
      throw new Error("Timeout (anti-timeout) pendant syncTemplateBordersAndDimensionsFromJanuaryFast()");
    }
  });

  SpreadsheetApp.getActive().toast("Bordures + largeurs/hauteurs synchronisées ✅", "HDV", 4);
}
function _copyBordersAndStructureOnly_(src, dst) {
  // Sauvegarde des couleurs déjà présentes sur la destination
  const dstBackgrounds = dst.getBackgrounds();
  const dstFontColors = dst.getFontColors();

  // Copie tout le format depuis la source
  // (bordures, alignements, formats, wrap, police, gras, etc.)
  src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

  // Restaure uniquement les couleurs de la destination
  // => on garde les bordures/structure de Janvier
  // => sans écraser les couleurs déjà présentes
  dst.setBackgrounds(dstBackgrounds);
  dst.setFontColors(dstFontColors);
}
/* ============================================================
   SYNC FORMAT (bordures/couleurs/polices)
   ============================================================ */
function syncTemplateColorsFromJanuaryFast() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jan = ss.getSheetByName("Janvier");
  if (!jan) throw new Error("Onglet 'Janvier' introuvable.");

  const monthSheets = _getMonthSheets_(ss).filter(s => s.getName() !== "Janvier");
  const lastColRef = 45;

  const refEndRow = Math.max(_findLastTrigramRow_(jan), jan.getLastRow());
  const lastRowRef = (CFG.TEMPLATE_MAX_ROWS && CFG.TEMPLATE_MAX_ROWS > 0)
    ? Math.min(refEndRow, CFG.TEMPLATE_MAX_ROWS)
    : refEndRow;

  const t0 = Date.now();

  monthSheets.forEach(sh => {
    _ensureMinColumns_(sh, lastColRef);

    // A1:A2 : couleurs uniquement
    _copyColorsOnly_(jan.getRange(1, 1, 2, 1), sh.getRange(1, 1, 2, 1));

    // AG..AS lignes 1-2 : couleurs uniquement
    const rightStart = CFG.GRID_COL_END + 1; // AG
    if (lastColRef >= rightStart) {
      const w = lastColRef - rightStart + 1;
      _copyColorsOnly_(
        jan.getRange(1, rightStart, 2, w),
        sh.getRange(1, rightStart, 2, w)
      );
    }

    // A3..fin : couleurs uniquement
    if (lastRowRef >= 3) {
      _copyColorsOnly_(
        jan.getRange(3, 1, lastRowRef - 2, lastColRef),
        sh.getRange(3, 1, lastRowRef - 2, lastColRef)
      );
    }

    if ((Date.now() - t0) > CFG.TEMPLATE_TIME_BUDGET_MS) {
      SpreadsheetApp.getActive().toast("Synchroniser COULEURS : interrompu (anti-timeout). Relance.", "HDV", 5);
      throw new Error("Timeout (anti-timeout) pendant syncTemplateColorsFromJanuaryFast()");
    }
  });

  SpreadsheetApp.getActive().toast("Couleurs synchronisées ✅", "HDV", 4);
}
function _copyColorsOnly_(src, dst) {
  dst.setBackgrounds(src.getBackgrounds());
  dst.setFontColors(src.getFontColors());
}
/* ============================================================
   SYNC TITRES (textes) — hors B1:AF2
   ============================================================ */
function syncTemplateTitlesFromJanuaryFast() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jan = ss.getSheetByName("Janvier");
  if (!jan) throw new Error("Onglet 'Janvier' introuvable.");

  const monthSheets = _getMonthSheets_(ss).filter(s => s.getName() !== "Janvier");
  const lastColRef = 45;

  const headerRows = [1, 2];

  monthSheets.forEach(sh => _ensureMinColumns_(sh, lastColRef));

  monthSheets.forEach(sh => {
    headerRows.forEach(r => {
      // A en valeurs
      jan.getRange(r, 1, 1, 1)
        .copyTo(sh.getRange(r, 1, 1, 1), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);

      // AG..AS en valeurs
      const rightStart = CFG.GRID_COL_END + 1; // AG
      if (lastColRef >= rightStart) {
        const w = lastColRef - rightStart + 1;
        jan.getRange(r, rightStart, 1, w)
          .copyTo(sh.getRange(r, rightStart, 1, w), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
      }
    });
  });

  SpreadsheetApp.getActive().toast("TITRES synchronisés ✅ (textes)", "HDV", 4);
}

/* ============================================================
   SYNC TITRES HDV (3j/7j/30j)
   ============================================================ */
function syncHdvHeaderTitlesFromJanuary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jan = ss.getSheetByName("Janvier");
  if (!jan) throw new Error("Onglet 'Janvier' introuvable.");

  const refCols = findLimitesHdvColumns_(jan);

  const title3  = jan.getRange(refCols.headerRow, refCols.col3).getDisplayValue();
  const title7  = jan.getRange(refCols.headerRow, refCols.col7).getDisplayValue();
  const title30 = jan.getRange(refCols.headerRow, refCols.col30).getDisplayValue();

  const monthSheets = _getMonthSheets_(ss).filter(sh => sh.getName() !== "Janvier");

  monthSheets.forEach(sh => {
    const cols = findLimitesHdvColumns_(sh);
    sh.getRange(cols.headerRow, cols.col3).setValue(title3);
    sh.getRange(cols.headerRow, cols.col7).setValue(title7);
    sh.getRange(cols.headerRow, cols.col30).setValue(title30);
  });

  SpreadsheetApp.getActive().toast("Titres HDV synchronisés ✅ (3j/7j/30j)", "HDV", 4);
}

/***************************************************
 * BOUTONS DE COLORATION MANUELLE (via Dessins)
 * - Ne touche JAMAIS aux lignes 1–2
 * - IMPORTANT : ne recalcule PAS HDV
 * - ✅ Ne colore QUE si la cellule n'est pas vide
 * - ✅ Clic sur dessin OK (dernière sélection via onSelectionChange)
 * - ✅ Anti double-clic / anti exécutions concurrentes (Lock)
 ***************************************************/
function _setPendingBtnColor_(bg) {
  // ✅ par utilisateur (si plusieurs personnes utilisent le fichier)
  PropertiesService.getUserProperties().setProperty("PENDING_BTN_BG", String(bg || ""));
}

function _consumePendingBtnColor_() {
  const up = PropertiesService.getUserProperties();
  const bg = up.getProperty("PENDING_BTN_BG");
  if (bg) up.deleteProperty("PENDING_BTN_BG");
  return bg || "";
}

function btnColorEntOPS()     { _applyBtnColor_(CFG.BTN.EntOPS); }
function btnColorFeuGAAR()    { _applyBtnColor_(CFG.BTN.FeuGAAR); }
function btnColorGAAR()       { _applyBtnColor_(CFG.BTN.GAAR); }
function btnColorMission()    { _applyBtnColor_(CFG.BTN.MiFrance); }
function btnColorMiEtranger() { _applyBtnColor_(CFG.BTN.MiEtranger); }
function btnColorEntNAV()     { _applyBtnColor_(CFG.BTN.EntNAV); }
function btnColorEntVDN()     { _applyBtnColor_(CFG.BTN.EntVDN); }
function btnColorVolTech()    { _applyBtnColor_(CFG.BTN.VolTech); }
function _tryColorOnce_(bg) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ✅ lock par utilisateur (pas de conflit avec HDV)
  const lock = LockService.getUserLock();
  if (!lock.tryLock(200)) return 0; // 0 = pas prêt (lock)

  try {
    // feuille + cellule active
    const sh = ss.getActiveSheet();
    let cell = sh ? sh.getActiveCell() : null;

    // fallback dernière cellule mémorisée (clic sur dessin)
    if (!cell) {
      const p = PropertiesService.getDocumentProperties();
      const lastSheetName = p.getProperty("LAST_SEL_SHEET");
      const lastA1 = p.getProperty("LAST_SEL_A1");
      const sh2 = lastSheetName ? ss.getSheetByName(lastSheetName) : null;
      if (sh2 && lastA1) cell = sh2.getRange(lastA1);
    }

    if (!cell) return -1; // -1 = aucune cellule => vrai problème utilisateur
    if (cell.getRow() < 3) return 1; // 1 = OK (rien à faire)

    // ne colorer que si non vide
    const v = cell.getValue();
    if (v === "" || v === null) return 0; // 0 = pas prêt (valeur pas commit)

    cell.setBackground(bg);
    SpreadsheetApp.flush();
    return 1; // 1 = coloré
  } finally {
    lock.releaseLock();
  }
}


function _applyBtnColor_(bg) {
  _setPendingBtnColor_(bg); // ✅ la couleur sera appliquée au commit via onEdit si besoin

  // ✅ 3 tentatives rapides
  let lastCode = 0;
  for (let i = 0; i < 3; i++) {
    lastCode = _tryColorOnce_(bg);
    if (lastCode === 1) return;      // OK (coloré ou rien à faire)
    if (lastCode === -1) break;      // aucune cellule => on sort pour toaster
    Utilities.sleep(200);
  }

  // ✅ On ne toaster QUE si on n'a vraiment aucune cellule sélectionnée/mémorisée
  if (lastCode === -1) {
    try {
      SpreadsheetApp.getActive().toast("Clique dans une cellule puis réessaie.", "Coloration", 2);
    } catch (e) {}
  }

  // Sinon: silence. Le pending fera le job au prochain onEdit (valeur commit).
}




function _getMonthSheets_(ss) {
  return ss.getSheets().filter(sh => _getMonthIndexFromSheetName_(sh.getName()) !== null);
}

function _getMonthIndexFromSheetName_(name) {
  const n = (name || "").toLowerCase();
  if (n === "janvier") return 0;
  if (n === "février" || n === "fevrier") return 1;
  if (n === "mars") return 2;
  if (n === "avril") return 3;
  if (n === "mai") return 4;
  if (n === "juin") return 5;
  if (n === "juillet") return 6;
  if (n === "août" || n === "aout") return 7;
  if (n === "septembre") return 8;
  if (n === "octobre") return 9;
  if (n === "novembre") return 10;
  if (n === "décembre" || n === "decembre") return 11;
  return null;
}

function _monthNameFromIndex_(i) {
  const names = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  return names[i] || "";
}

function _isTrigram_(s) {
  return /^[A-Z]{3}$/.test((s || "").toString().trim().toUpperCase());
}

function _toNumberHours_(v) {
  if (typeof v === "number") return v;
  const n = parseFloat((v || "").toString().replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function _stripTime_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function _round1_(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function _sumLastNDays_(entries, today, n) {
  const start = _stripTime_(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1)));
  let sum = 0;
  for (let i = 0; i < entries.length; i++) {
    const d = entries[i].d;
    if (d >= start && d <= today) sum += entries[i].h;
  }
  return sum;
}

function _normHeaderText_(v) {
  let s = (v || "").toString().toLowerCase();
  s = s.replace(/[\r\n\t]+/g, " ");
  try { s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
  s = s.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/\b3 j\b/g, "3j").replace(/\b7 j\b/g, "7j").replace(/\b30 j\b/g, "30j");
  return s;
}

function _ensureMinColumns_(sh, minCols) {
  const cur = sh.getMaxColumns();
  if (cur >= minCols) return;
  sh.insertColumnsAfter(cur, minCols - cur);
}

function _findTrigramColumns_(sh, startRow, numRows, maxScanCol) {
  const maxCol = Math.min(sh.getMaxColumns(), maxScanCol || sh.getMaxColumns());
  if (maxCol < 1 || numRows <= 0) return [];

  const data = sh.getRange(startRow, 1, numRows, maxCol).getValues();
  const cols = [];

  for (let c = 0; c < maxCol; c++) {
    let nonEmpty = 0;
    let trig = 0;

    for (let r = 0; r < numRows; r++) {
      const v = (data[r][c] || "").toString().trim().toUpperCase();
      if (v === "") continue;
      nonEmpty++;
      if (_isTrigram_(v)) trig++;
    }

    if (trig >= 1 && (trig / Math.max(1, nonEmpty)) >= 0.2) cols.push(c + 1);
  }

  return cols;
}

/* =========================
   LOGS (onglet "LOG")
   ========================= */
function _logOnEdit_(msg, e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName("LOG");
    if (!sh) return;

    const r = sh.getLastRow() + 1;
    const sheetName = (e && e.range) ? e.range.getSheet().getName() : "";
    const a1 = (e && e.range) ? e.range.getA1Notation() : "";
    const user = (Session.getActiveUser && Session.getActiveUser().getEmail)
      ? (Session.getActiveUser().getEmail() || "")
      : "";

    sh.getRange(r, 1, 1, 5).setValues([[
      new Date(),
      msg,
      sheetName,
      a1,
      user
    ]]);
  } catch (err) {
    // silence volontaire
  }
}

/* =========================
   TEST
   ========================= */
function testHook() {
  SpreadsheetApp.getActive().toast("TEST HOOK OK ✅", "TEST", 3);
  _logOnEdit_("testHook() appelé", null);
}
