"use strict";

const STORAGE_KEY = "sugu-rirekisho-v1";

const $ = (id) => document.getElementById(id);

const fields = {
  era: $("era"),
  docDate: $("doc-date"),
  nameKana: $("name-kana"),
  name: $("name"),
  birthDate: $("birth-date"),
  gender: $("gender"),
  addrKana: $("addr-kana"),
  zip: $("zip"),
  pref: $("pref"),
  city: $("city"),
  building: $("building"),
  tel: $("tel"),
  email: $("email"),
  currentJob: $("current-job"),
  motive: $("motive"),
  wish: $("wish"),
  commute: $("commute"),
  dependents: $("dependents"),
  spouse: $("spouse"),
  spouseSupport: $("spouse-support"),
};

const eduRows = $("edu-rows");
const workRows = $("work-rows");
const licRows = $("lic-rows");
const rowTemplate = $("row-template");

let photoData = null; // 証明写真の dataURL（端末内でのみ保持）

/* ---------- 年月＋内容の行 ---------- */

function addRow(container, entry = {}) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".row-year").value = entry.y ?? "";
  row.querySelector(".row-month").value = entry.m ?? "";
  row.querySelector(".row-text").value = entry.text ?? "";
  row.querySelector(".row-remove").addEventListener("click", () => {
    row.remove();
    if (!container.children.length) addRow(container);
    update();
  });
  container.appendChild(row);
}

function readRows(container) {
  return [...container.querySelectorAll(".h-row")].map((row) => ({
    y: parseInt(row.querySelector(".row-year").value, 10) || 0,
    m: parseInt(row.querySelector(".row-month").value, 10) || 0,
    text: row.querySelector(".row-text").value.trim(),
  }));
}

const activeRows = (entries) => entries.filter((e) => e.y || e.m || e.text);

/* ---------- 和暦変換 ----------
 * 履歴書は年月単位のため、月まで見て改元境界（令和: 2019年5月〜）を判定する。
 * 1989年1月・2019年1〜4月などの境界月は慣用に合わせて新しい方の元号に寄せる。
 */

function toWareki(y, m = 12) {
  if (y > 2019 || (y === 2019 && m >= 5)) return { era: "令和", n: y - 2018 };
  if (y >= 1989) return { era: "平成", n: y - 1988 };
  if (y >= 1926) return { era: "昭和", n: y - 1925 };
  if (y >= 1912) return { era: "大正", n: y - 1911 };
  return null;
}

const eraNum = (n) => (n === 1 ? "元" : String(n));

function formatYearCell(y, m) {
  if (!y) return "";
  if (fields.era.value === "seireki") return String(y);
  const w = toWareki(y, m || 12);
  return w ? `${w.era}${eraNum(w.n)}` : String(y);
}

function formatFullDate(value) {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (fields.era.value === "seireki") return `${y}年${m}月${d}日`;
  const w = toWareki(y, m);
  return w ? `${w.era}${eraNum(w.n)}年${m}月${d}日` : `${y}年${m}月${d}日`;
}

/* ---------- 年齢計算（記入日時点の満年齢） ---------- */

function calcAge(birthValue, asOfValue) {
  if (!birthValue || !asOfValue) return null;
  const [by, bm, bd] = birthValue.split("-").map(Number);
  const [ay, am, ad] = asOfValue.split("-").map(Number);
  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) age--;
  return age >= 0 && age < 130 ? age : null;
}

/* ---------- 学歴の自動入力 ----------
 * 4月2日〜翌4月1日生まれを同学年として、中学卒業〜大学卒業の年月を計算する。
 */

function autoFillEducation() {
  const birth = fields.birthDate.value;
  if (!birth) {
    alert("先に「基本情報」で生年月日を入力してください。");
    return;
  }
  const [by, bm, bd] = birth.split("-").map(Number);
  const early = bm < 4 || (bm === 4 && bd === 1); // 早生まれ
  const jhsGrad = by + (early ? 15 : 16); // 中学卒業の年（3月）

  const entries = [
    { y: jhsGrad, m: 3, text: "○○中学校 卒業" },
    { y: jhsGrad, m: 4, text: "○○高等学校 入学" },
    { y: jhsGrad + 3, m: 3, text: "○○高等学校 卒業" },
    { y: jhsGrad + 3, m: 4, text: "○○大学○○学部 入学" },
    { y: jhsGrad + 7, m: 3, text: "○○大学○○学部 卒業" },
  ];

  const hasInput = activeRows(readRows(eduRows)).length > 0;
  if (hasInput && !confirm("入力済みの学歴を置き換えます。よろしいですか？")) return;

  eduRows.innerHTML = "";
  entries.forEach((e) => addRow(eduRows, e));
  update();
}

/* ---------- プレビュー描画 ---------- */

const HISTORY_MIN_ROWS = 17;
const LIC_MIN_ROWS = 8;

function historyCells(entry) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td class="cell-year"></td><td class="cell-month"></td><td class="cell-text"></td>`;
  tr.children[0].textContent = formatYearCell(entry.y, entry.m);
  tr.children[1].textContent = entry.m || "";
  tr.children[2].textContent = entry.text;
  return tr;
}

function specialRow(text, className) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td class="cell-year"></td><td class="cell-month"></td><td></td>`;
  tr.children[2].textContent = text;
  tr.children[2].className = className;
  return tr;
}

function padRows(tbody, min) {
  for (let i = tbody.children.length; i < min; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>&nbsp;</td><td></td><td></td>`;
    tbody.appendChild(tr);
  }
}

function renderHistory() {
  const tbody = $("p-history");
  tbody.innerHTML = "";

  const edu = activeRows(readRows(eduRows));
  const work = activeRows(readRows(workRows));

  if (edu.length) {
    tbody.appendChild(specialRow("学歴", "cell-head"));
    edu.forEach((e) => tbody.appendChild(historyCells(e)));
  }
  if (work.length || (fields.currentJob.checked && edu.length)) {
    tbody.appendChild(specialRow("職歴", "cell-head"));
    work.forEach((e) => tbody.appendChild(historyCells(e)));
    if (fields.currentJob.checked) tbody.appendChild(specialRow("現在に至る", "cell-text"));
  }
  if (tbody.children.length) tbody.appendChild(specialRow("以上", "cell-end"));

  padRows(tbody, HISTORY_MIN_ROWS);
}

function renderLicenses() {
  const tbody = $("p-lic");
  tbody.innerHTML = "";
  activeRows(readRows(licRows)).forEach((e) => tbody.appendChild(historyCells(e)));
  padRows(tbody, LIC_MIN_ROWS);
}

function render() {
  $("p-doc-date").textContent = formatFullDate(fields.docDate.value) || "　　年　　月　　日";

  $("p-name-kana").textContent = fields.nameKana.value;
  $("p-name").textContent = fields.name.value;

  const age = calcAge(fields.birthDate.value, fields.docDate.value);
  const birthText = formatFullDate(fields.birthDate.value);
  $("p-birth").textContent = birthText
    ? `${birthText}生${age !== null ? `（満${age}歳）` : ""}`
    : "";
  $("p-gender").textContent = fields.gender.value;

  $("p-addr-kana").textContent = fields.addrKana.value;
  const zip = fields.zip.value.trim();
  $("p-addr").textContent = [
    zip ? `〒${formatZip(zip)}` : "",
    fields.pref.value.trim(),
    fields.city.value.trim(),
    fields.building.value.trim(),
  ]
    .filter(Boolean)
    .join(" ");
  $("p-tel").textContent = fields.tel.value;
  $("p-email").textContent = fields.email.value;

  renderHistory();
  renderLicenses();

  $("p-motive").textContent = fields.motive.value;
  $("p-wish").textContent = fields.wish.value;
  $("p-commute").textContent = fields.commute.value;
  $("p-dependents").textContent = fields.dependents.value !== "" ? `${fields.dependents.value}人` : "";
  $("p-spouse").textContent = fields.spouse.value;
  $("p-spouse-support").textContent = fields.spouseSupport.value;

  renderPhoto();
}

function renderPhoto() {
  const box = $("p-photo");
  const existing = box.querySelector("img");
  if (photoData) {
    box.classList.add("has-photo");
    if (existing) existing.src = photoData;
    else {
      const img = document.createElement("img");
      img.alt = "証明写真";
      img.src = photoData;
      box.appendChild(img);
    }
  } else {
    box.classList.remove("has-photo");
    if (existing) existing.remove();
  }
  $("btn-photo-remove").hidden = !photoData;
}

/* ---------- 証明写真 ----------
 * 端末内で縦4:横3にトリミング・縮小してから dataURL 化する（サーバー送信なし）。
 * localStorage の容量を圧迫しないようJPEGに圧縮する。
 */

function loadPhoto(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const W = 360;
    const H = 480;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const scale = Math.max(W / img.width, H / img.height);
    const sw = W / scale;
    const sh = H / scale;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
    photoData = canvas.toDataURL("image/jpeg", 0.85);
    update();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert("画像を読み込めませんでした。別のファイルをお試しください。");
  };
  img.src = url;
}

/* ---------- 保存・復元 ---------- */

function collectState() {
  const state = {
    edu: readRows(eduRows),
    work: readRows(workRows),
    lic: readRows(licRows),
    photo: photoData,
  };
  for (const [key, el] of Object.entries(fields)) {
    state[key] = el.type === "checkbox" ? el.checked : el.value;
  }
  return state;
}

function applyState(state) {
  for (const [key, el] of Object.entries(fields)) {
    if (!(key in state)) continue;
    if (el.type === "checkbox") el.checked = !!state[key];
    else el.value = state[key];
  }
  photoData = typeof state.photo === "string" ? state.photo : null;
  for (const [container, entries] of [
    [eduRows, state.edu],
    [workRows, state.work],
    [licRows, state.lic],
  ]) {
    container.innerHTML = "";
    const rows = Array.isArray(entries) && entries.length ? entries : [{}];
    rows.forEach((e) => addRow(container, e));
  }
}

let saveTimer;
function update() {
  render();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectState()));
    } catch { /* プライベートモードや容量超過時は保存しない */ }
  }, 300);
}

/* ---------- 初期値 ---------- */

const pad = (n) => String(n).padStart(2, "0");

function setDateDefaults() {
  if (!fields.docDate.value) {
    const today = new Date();
    fields.docDate.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  }
}

function resetAll() {
  for (const el of Object.values(fields)) {
    if (el.type === "checkbox") el.checked = el.id === "current-job";
    else el.value = "";
  }
  photoData = null;
  $("photo-input").value = "";
  for (const container of [eduRows, workRows, licRows]) {
    container.innerHTML = "";
    addRow(container);
  }
  setDateDefaults();
  update();
}

/* ---------- 郵便番号 → 住所自動入力 ---------- */

// ハイフンを NNN-NNNN 形式に整える（表示用）
function formatZip(raw) {
  const d = String(raw).replace(/[^0-9]/g, "").slice(0, 7);
  return d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
}

let lastLookedUpZip = "";

async function lookupAddress() {
  const digits = fields.zip.value.replace(/[^0-9]/g, "");
  const hint = $("zip-hint");
  if (digits.length !== 7) {
    lastLookedUpZip = "";
    return;
  }
  if (digits === lastLookedUpZip) return; // 二重取得を防ぐ
  lastLookedUpZip = digits;

  hint.textContent = "住所を検索中…";
  try {
    // zipcloud（無料・登録不要・CORS対応の郵便番号API）
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`);
    const json = await res.json();
    const r = json.results && json.results[0];
    if (!r) {
      hint.textContent = "該当する住所が見つかりませんでした";
      return;
    }
    fields.pref.value = r.address1; // 都道府県
    fields.city.value = r.address2 + r.address3; // 市区町村 + 町域
    hint.textContent = "住所を自動入力しました。番地・建物名を追記してください";
    fields.city.focus();
    update();
  } catch {
    hint.textContent = "住所の自動取得に失敗しました（手入力してください）";
  }
}

/* ---------- 電話番号の自動整形 ---------- */

// 日本の電話番号に自動でハイフンを入れる。
// 携帯・IP・フリーダイヤル・主要な市外局番の桁数に対応し、
// 判定できない場合は 3-4-4 で無難に区切る。
function formatPhone(raw) {
  const d = String(raw).replace(/[^0-9]/g, "");
  if (!d.startsWith("0") || d.length < 6) return raw.trim();

  // 携帯・PHS・IP電話・050 → 3-4-4（11桁）
  if (/^(070|080|090|050)/.test(d) && d.length === 11) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  // フリーダイヤル・ナビダイヤル系 0120 / 0570 / 0800 → 4-3-3
  if (/^(0120|0800)/.test(d) && d.length === 10) {
    return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (/^0570/.test(d) && d.length === 10) {
    return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  }
  // 固定電話（10桁）: 市外局番の桁数で区切る
  if (d.length === 10) {
    // 2桁市外局番（東京03・大阪06）→ 2-4-4
    if (/^0(3|6)/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
    // それ以外は 3-3-4 が最も一般的
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return raw.trim();
}

/* ---------- 画面幅に合わせてA4シートを縮小表示 ---------- */

const SHEET_WIDTH_PX = 794; // 210mm @ 96dpi

function fitSheet() {
  const pane = document.querySelector(".preview-pane");
  const scale = Math.min(1, pane.clientWidth / SHEET_WIDTH_PX);
  $("sheets").style.zoom = scale;
}

/* ---------- 起動 ---------- */

function init() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch { /* 破損データは無視 */ }

  if (saved) {
    applyState(saved);
  } else {
    for (const container of [eduRows, workRows, licRows]) addRow(container);
  }

  setDateDefaults();

  document.querySelector(".form-pane").addEventListener("input", update);
  $("btn-add-edu").addEventListener("click", () => { addRow(eduRows); update(); });
  $("btn-add-work").addEventListener("click", () => { addRow(workRows); update(); });
  $("btn-add-lic").addEventListener("click", () => { addRow(licRows); update(); });
  $("btn-auto-edu").addEventListener("click", autoFillEducation);
  $("photo-input").addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) loadPhoto(e.target.files[0]);
  });
  $("btn-photo-remove").addEventListener("click", () => {
    photoData = null;
    $("photo-input").value = "";
    update();
  });
  $("btn-print").addEventListener("click", () => window.print());
  $("btn-clear").addEventListener("click", () => {
    if (confirm("すべての入力内容と写真をクリアして新規作成しますか？")) resetAll();
  });

  // 郵便番号: 7桁入力またはフォーカスを外したタイミングで住所を自動取得
  fields.zip.addEventListener("input", lookupAddress);
  fields.zip.addEventListener("blur", () => {
    fields.zip.value = formatZip(fields.zip.value);
    update();
  });

  // 電話番号: 入力を終えたタイミング（フォーカスアウト）でハイフンを自動挿入
  fields.tel.addEventListener("blur", () => {
    fields.tel.value = formatPhone(fields.tel.value);
    update();
  });

  window.addEventListener("resize", fitSheet);
  fitSheet();
  render();
}

init();
