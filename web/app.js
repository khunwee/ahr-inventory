/* AHR Maintenance Inventory — frontend SPA (vanilla JS) */
const S = { token: localStorage.getItem("tok") || "", user: null, cart: [], ws: null, machines: [] };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => (t ?? "").toString().replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (n) => (n == null ? "" : (+n).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const compact = (n) => {
  if (n == null) return "";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return (+n).toLocaleString();
};
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => { const x = new Date(d); return isNaN(x) ? "" : `${pad2(x.getDate())}/${pad2(x.getMonth() + 1)}/${x.getFullYear()}`; };
const fmtDateTime = (d) => { const x = new Date(d); return isNaN(x) ? "" : `${fmtDate(d)} ${pad2(x.getHours())}:${pad2(x.getMinutes())}`; };
const dmyToIso = (s) => { const m = (s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${pad2(m[2])}-${pad2(m[1])}` : ""; };
const todayDmy = () => fmtDate(new Date());
// date field: shows dd/mm/yyyy but opens the native calendar via the 📅 button
function dateFieldHTML(id, value = "") {
  return `<span class="datefield" style="position:relative;display:inline-flex;align-items:center">
    <input type="text" id="${id}-txt" placeholder="dd/mm/yyyy" value="${value}" style="width:128px;padding-right:32px">
    <button type="button" id="${id}-btn" title="เลือกจากปฏิทิน" style="position:absolute;right:2px;border:0;background:transparent;cursor:pointer;font-size:16px;padding:4px">📅</button>
    <input type="date" id="${id}-nat" tabindex="-1" style="position:absolute;right:6px;bottom:2px;width:1px;height:1px;opacity:0;border:0;padding:0">
  </span>`;
}
function wireDate(id) {
  const txt = $(`#${id}-txt`), nat = $(`#${id}-nat`), btn = $(`#${id}-btn`);
  const iso0 = dmyToIso(txt.value); if (iso0) nat.value = iso0;
  btn.onclick = () => { try { nat.showPicker(); } catch { nat.focus(); nat.click(); } };
  nat.onchange = () => { if (nat.value) txt.value = nat.value.split("-").reverse().join("/"); };
  txt.oninput = () => { const iso = dmyToIso(txt.value); if (iso) nat.value = iso; };
}
const dateISO = (id) => dmyToIso($(`#${id}-txt`).value) || $(`#${id}-nat`).value || "";

/* ---------------- i18n (TH <-> EN) ---------------- */
let LANG = localStorage.getItem("lang") || "th";
const DICT = {
  // login
  "ระบบบริหารคลังอะไหล่ · หน่วยงาน Maintenance": "Maintenance spare-parts inventory system",
  "ชื่อผู้ใช้ (Username)": "Username", "รหัสผ่าน (Password)": "Password", "เข้าสู่ระบบ": "Sign in",
  "ครั้งแรก: admin / admin123 — เปลี่ยนรหัสผ่านทันทีหลังเข้าใช้": "First time: admin / admin123 — change the password right after signing in",
  // sidebar / nav
  "แดชบอร์ด": "Dashboard", "เบิกอะไหล่": "Withdraw", "รายการเบิก": "Requisitions", "คลังอะไหล่": "Inventory",
  "รับเข้า": "Receive", "ส่งออก Oracle": "Export Oracle", "บันทึกการใช้งาน": "Audit log",
  "ผู้ใช้งาน": "Users", "ตั้งค่าแจ้งเตือน": "Notifications", "นำเข้าข้อมูล": "Import data",
  "ใบสั่งซื้อ (PO)": "Purchase Orders", "วางแผนสั่งซื้อ (Optimize)": "Optimize", "ต้องสั่งซื้อ": "To reorder",
  "ผูกบัญชี LINE": "Link LINE", "เปลี่ยนรหัสผ่าน": "Change password", "ออกจากระบบ": "Sign out", "⏻ ปิดโปรแกรม": "⏻ Close program",
  // titles
  "รายการที่ต้องสั่งซื้อ": "Items to reorder", "วางแผนสั่งซื้อ (Optimization)": "Purchase Optimization",
  "รับเข้าสต็อก": "Receive stock", "ส่งออกข้อมูลให้ Oracle": "Export for Oracle", "จัดการผู้ใช้งาน": "User management",
  "ตั้งค่าการแจ้งเตือน": "Notification settings",
  // dashboard KPIs / headers
  "รายการอะไหล่ทั้งหมด": "Total parts", "มูลค่าคงคลัง": "Stock value", "ต้องสั่งด่วน": "Order urgently",
  "ใกล้หมด": "Low", "ของหมดสต็อก": "Out of stock",
  "การเคลื่อนไหวสต็อก 14 วัน (เบิก/รับ)": "Stock movement 14 days (out/in)", "มูลค่าตามหมวด": "Value by category",
  "อะไหล่ที่เบิกมากสุด (30 วัน)": "Most withdrawn parts (30 days)", "มูลค่าสต็อกตามอายุ (Stock Aging)": "Stock value by age (Aging)",
  "เบิก": "Out", "รับ": "In",
  // common buttons / labels
  "ค้นหา": "Search", "จำนวน": "Qty", "หน่วย": "Unit", "คงเหลือ": "On hand", "สถานะ": "Status",
  "รหัส": "Code", "รายละเอียด": "Description", "เครื่อง": "Machine", "ที่เก็บ": "Location", "ราคา/หน่วย": "Unit price",
  "รวม": "Total", "วันที่": "Date", "ผู้เบิก": "Requester", "ปัญหา": "Problem", "ช่องทาง": "Channel",
  "เลขที่": "No.", "ดู": "View", "ปิด": "Close", "ยกเลิก": "Cancel", "บันทึก": "Save", "แก้ไข": "Edit",
  "ยืนยันการเบิก & ตัดสต็อก": "Confirm & deduct stock", "ตะกร้าเบิก": "Withdraw cart",
  "เครื่องที่ซ่อม (Machine)": "Machine being repaired", "ปัญหาที่พบ (Problem)": "Problem found",
  "แนบรูป (ไม่บังคับ)": "Attach photo (optional)", "— เลือกเครื่อง —": "— select machine —",
  "เฉพาะที่ต้องสั่งซื้อ": "Only reorder items", "🏷️ พิมพ์ QR (ผลลัพธ์)": "🏷️ Print QR (results)",
  "ปกติ": "OK", "เฝ้าระวัง": "Watch", "ด่วนมาก": "Critical",
  "ตั้งแต่วันที่": "From date", "ถึงวันที่": "To date", "เฉพาะของฉัน": "Only mine",
  "ตั้งแต่": "From", "ถึง": "To", "ดาวน์โหลด CSV": "Download CSV",
  "จำนวนแนะนำ": "Suggested qty", "แนะนำสั่ง": "Suggest order", "สร้างใบสั่งซื้อจากที่เลือก": "Create PO from selection",
  "งบประมาณ (บาท) — เว้นว่าง = สั่งครบทุกชิ้น": "Budget (THB) — blank = order everything",
  "คำนวณแผนสั่งซื้อ": "Compute order plan", "สร้าง PO จากผลลัพธ์": "Create PO from result",
  "ตัวแก้ปัญหาที่ใช้": "Solver used", "มูลค่าที่ต้องสั่งทั้งหมด": "Total required value", "ใช้งบ": "Spent",
  "อะไหล่ที่สั่ง": "Items ordered", "ยังไม่ได้สั่ง": "Not ordered",
  "ความครอบคลุมตามความเร่งด่วน (สั่ง/ต้องการ หน่วย)": "Coverage by urgency (ordered/needed units)", "งบตามหมวด": "Budget by category",
  "สั่ง": "Order", "ต้องการ": "Needed", "ครบ?": "Full?", "ครบ": "Full", "บางส่วน": "Partial",
  "เวลา": "Time", "ผู้ใช้": "User", "สิทธิ์": "Role", "การกระทำ": "Action",
  "เพิ่มผู้ใช้": "Add user", "ชื่อ-สกุล": "Full name", "ใช้งาน": "Active", "ปิดใช้งาน": "Disabled",
  "ผู้ดูแลระบบ": "Admin", "หัวหน้า": "Leader", "ช่าง/วิศวกร": "Engineer", "ดูอย่างเดียว": "Viewer",
  "รับของ": "Receive goods", "พิมพ์ PO": "Print PO", "ส่งออก Excel": "Export Excel",
  "นำเข้าข้อมูล": "Import", "⤓ ดาวน์โหลด Template (.xlsx)": "⤓ Download template (.xlsx)",
  "ทดสอบส่ง": "Test send", "ยิงบาร์โค้ด/QR ที่นี่ (สแกนแล้วเพิ่มเข้าตะกร้าอัตโนมัติ)": "Scan barcode/QR here (auto-adds to cart)",
  "โหมดวิเคราะห์": "Analysis mode", "คำนวณ": "Compute", "กลุ่ม": "Class", "มูลค่าสต็อก": "Stock value",
  "มูลค่าตามกลุ่ม ABC": "Value by ABC class",
  "ครอบคลุมของด่วนสูงสุดในงบ": "Max critical coverage within budget",
  "ป้องกันเครื่องให้ได้มากสุด": "Protect the most machines",
  "กระจายงบให้ทุกเครื่องสมดุล": "Balance budget across machines",
  "งบขั้นต่ำเพื่อความปลอดภัย": "Minimum safe budget", "วิเคราะห์ ABC / Pareto": "ABC / Pareto analysis",
  "งบประมาณ (บาท) — เว้นว่าง = ไม่จำกัด": "Budget (THB) — blank = unlimited",
  "แนะนำค่า Min/Max ที่เหมาะสม": "Recommend optimal Min/Max", "บันทึกค่า Min/Max ที่แนะนำ": "Save recommended Min/Max",
  "หมวด": "Category", "ทั้งหมด": "All", "แสดงสรุป": "Show summary", "สรุปการเบิก": "Withdrawal summary",
  "จำนวนใบเบิก": "Requisitions", "รายการอะไหล่": "Items", "มูลค่ารวม": "Total value", "รวมเบิก": "Total out",
  "มูลค่า": "Value", "เครื่องที่ใช้": "Machines used", "จำนวนที่นับได้จริง": "Actual counted qty",
  "MiniZinc พร้อมใช้": "MiniZinc ready", "MiniZinc ไม่พบ — ใช้ PuLP/CBC แทน": "MiniZinc not found — using PuLP/CBC",
  "ล้างข้อมูลเดิมทั้งหมดก่อนนำเข้า (เริ่มต้นใหม่ด้วยชุดข้อมูลนี้)": "Clear all existing data before import (fresh start)",
  "ภาพรวมสำหรับผู้บริหาร": "Executive overview", "สถานะสต็อก (สัดส่วนที่ต้องสั่ง)": "Stock status (reorder share)",
  "มูลค่าการเบิกรายเดือน (6 เดือน)": "Monthly withdrawal value (6 months)",
  "เครื่องที่เบิกอะไหล่มากสุด (30 วัน)": "Top machines by withdrawals (30 days)",
  "สถานะใบสั่งซื้อ (PO)": "Purchase order status", "เลือกจากปฏิทิน": "Pick from calendar",
  "สั่งแล้ว": "Ordered", "รับแล้ว": "Received", "ยกเลิก": "Cancelled",
  "ช่างผู้เบิก": "Technician", "ทุกคน": "Everyone",
  "แก้ไขข้อมูล": "Edit", "รหัสอะไหล่": "Item code", "ชื่ออะไหล่": "Part name", "เบอร์อะไหล่": "Part number",
  "เครื่อง/กลุ่ม": "Machine/group", "รายละเอียด (Description)": "Description", "กล่อง/ที่เก็บ": "Box/location",
  "ชั้น": "Level", "คงเหลือ (ปรับ = ลง ledger)": "On hand (adjust logs ledger)", "Lead (เดือน)": "Lead (months)",
  "ไม่มีการเปลี่ยนแปลง": "No changes", "บันทึกการแก้ไขแล้ว": "Saved",
};
const REV = Object.fromEntries(Object.entries(DICT).map(([k, v]) => [v, k]));
function translateTree(root, toEN) {
  if (!root || root.nodeType === undefined) return;
  const map = toEN ? DICT : REV;
  const tw = document.createTreeWalker(root.nodeType === 3 ? root.parentNode || root : root, NodeFilter.SHOW_TEXT);
  const nodes = []; let n;
  if (root.nodeType === 3) nodes.push(root); else { while (n = tw.nextNode()) nodes.push(n); }
  nodes.forEach(node => { const t = node.nodeValue.trim(); if (t && map[t] !== undefined) node.nodeValue = node.nodeValue.replace(t, map[t]); });
  const els = root.querySelectorAll ? root.querySelectorAll("[placeholder],[title]") : [];
  els.forEach(el => ["placeholder", "title"].forEach(a => { const v = el.getAttribute(a); if (v && map[v.trim()] !== undefined) el.setAttribute(a, map[v.trim()]); }));
  if (root.getAttribute) ["placeholder", "title"].forEach(a => { const v = root.getAttribute(a); if (v && map[v.trim()] !== undefined) root.setAttribute(a, map[v.trim()]); });
}
function setLang(l) {
  if (l === LANG) return;
  translateTree(document.body, l === "en");   // convert current DOM
  LANG = l; localStorage.setItem("lang", l);
  const btn = document.getElementById("lang-btn"); if (btn) btn.textContent = l === "en" ? "ไทย" : "EN";
}
// auto-translate dynamically rendered content when in EN mode
new MutationObserver(muts => {
  if (LANG !== "en") return;
  muts.forEach(m => m.addedNodes.forEach(nd => { if (nd.nodeType === 1 || nd.nodeType === 3) translateTree(nd, true); }));
}).observe(document.body, { childList: true, subtree: true });

async function api(path, opts = {}) {
  opts.headers = Object.assign({ "Authorization": "Bearer " + S.token }, opts.headers || {});
  if (opts.json !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(opts.json); delete opts.json; }
  if (opts.body != null && !opts.method) opts.method = "POST";
  const r = await fetch("/api" + path, opts);
  if (r.status === 401) { logout(); throw new Error("unauthorized"); }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.statusText); }
  const ct = r.headers.get("content-type") || "";
  return ct.includes("json") ? r.json() : r;
}

/* ---------------- auth ---------------- */
async function doLogin() {
  const body = new URLSearchParams({ username: $("#lg-user").value.trim(), password: $("#lg-pass").value });
  $("#lg-err").textContent = "";
  try {
    const r = await fetch("/api/auth/login", { method: "POST", body });
    if (!r.ok) throw new Error((await r.json()).detail || "เข้าสู่ระบบไม่สำเร็จ");
    const d = await r.json();
    S.token = d.access_token; localStorage.setItem("tok", S.token);
    await boot();
  } catch (e) { $("#lg-err").textContent = e.message; }
}
function logout() {
  S.token = ""; localStorage.removeItem("tok"); if (S.ws) S.ws.close();
  $("#app").classList.add("hidden"); $("#login").classList.remove("hidden");
}
const RANK = { viewer: 0, engineer: 1, leader: 2, admin: 3 };
const can = (role) => RANK[S.user.role] >= RANK[role];

async function boot() {
  S.user = await api("/me");
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#who-name").textContent = S.user.name; $("#who-role").textContent = S.user.role;
  $$("#nav a[data-role]").forEach(a => { if (!can(a.dataset.role)) a.classList.add("hidden"); });
  if (can("admin")) $("#shutdown-btn").classList.remove("hidden");
  S.machines = await api("/machines").catch(() => []);
  connectWS();
  go(location.hash.replace("#", "") || "dashboard");
  refreshReorderBadge();
  if (S.user.must_change_pw) changePasswordModal(true);
}

/* ---------------- websocket ---------------- */
function connectWS() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  S.ws = new WebSocket(`${proto}://${location.host}/ws`);
  S.ws.onopen = () => { $("#live").classList.add("on"); $("#live-txt").textContent = "real-time"; };
  S.ws.onclose = () => { $("#live").classList.remove("on"); $("#live-txt").textContent = "offline"; setTimeout(connectWS, 3000); };
  S.ws.onmessage = (ev) => {
    const { event, data } = JSON.parse(ev.data);
    if (event === "requisition.confirmed") toast(`เบิกสำเร็จ ${data.ref}`, "ok");
    if (event === "reorder.alert") { toast(`⚠️ ต้องสั่งซื้อ ${data.items.length} รายการ`, "crit"); refreshReorderBadge(); }
    if (event === "stock.received") toast("รับเข้าสต็อกแล้ว", "ok");
    const cur = location.hash.replace("#", "");
    if (["inventory", "dashboard", "reorder"].includes(cur)) go(cur, true);
  };
}
async function refreshReorderBadge() {
  try {
    const r = await api("/reorder");
    const b = $("#nav-reorder");
    if (r.length) { b.textContent = r.length; b.classList.remove("hidden"); }
    else b.classList.add("hidden");
  } catch { }
}

/* ---------------- router ---------------- */
const TITLES = { dashboard: "แดชบอร์ด", withdraw: "เบิกอะไหล่", requisitions: "รายการเบิก", inventory: "คลังอะไหล่", reorder: "รายการที่ต้องสั่งซื้อ", optimize: "วางแผนสั่งซื้อ (Optimization)", receive: "รับเข้าสต็อก", export: "ส่งออกข้อมูลให้ Oracle", users: "จัดการผู้ใช้งาน", po: "ใบสั่งซื้อ (PO)", audit: "บันทึกการใช้งาน", settings: "ตั้งค่าการแจ้งเตือน", importdata: "นำเข้าข้อมูล" };
const VIEWS = {};
function go(view, silent) {
  if (!VIEWS[view]) view = "dashboard";
  location.hash = view;
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.view === view));
  $("#view-title").textContent = TITLES[view];
  if (!silent) $("#content").innerHTML = '<div class="muted">กำลังโหลด…</div>';
  VIEWS[view]();
}
$("#nav").addEventListener("click", e => { const a = e.target.closest("a"); if (a) go(a.dataset.view); });
$("#logout").addEventListener("click", logout);
$("#shutdown-btn").addEventListener("click", () => {
  modal("⏻ ปิดโปรแกรม",
    `<p>ต้องการปิดโปรแกรมใช่หรือไม่? ผู้ใช้ทุกคนจะเข้าใช้งานไม่ได้จนกว่าจะเปิด <b>run.bat</b> อีกครั้ง</p>`,
    `<button class="btn" data-close>ยกเลิก</button><button class="btn" style="background:#c22c2c;color:#fff;border-color:#c22c2c" id="do-shutdown">ปิดโปรแกรม</button>`);
  $("#do-shutdown").onclick = async () => {
    try { await api("/shutdown", { method: "POST" }); } catch { }
    document.body.innerHTML = '<div style="display:grid;place-items:center;height:100dvh;font-family:sans-serif;color:#16202b;text-align:center"><div><h2>โปรแกรมถูกปิดแล้ว</h2><p style="color:#5d6b78">ปิดหน้าต่างนี้ได้เลย — เปิดใหม่ด้วยการดับเบิลคลิก run.bat</p></div></div>';
  };
});
$("#changepw").addEventListener("click", () => changePasswordModal(false));
$("#linkline").addEventListener("click", linkLineModal);
$("#lg-btn").addEventListener("click", doLogin);
$("#lg-pass").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
$("#lang-btn").addEventListener("click", () => setLang(LANG === "en" ? "th" : "en"));
document.getElementById("lang-btn").textContent = LANG === "en" ? "ไทย" : "EN";
if (LANG === "en") translateTree(document.body, true);

/* ---------------- toast / modal ---------------- */
function toast(msg, kind = "") {
  const t = document.createElement("div"); t.className = "toast " + kind; t.textContent = msg;
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), 5000);
}
function modal(title, bodyHTML, footHTML) {
  $("#modal-root").innerHTML = `<div class="modal-bg"><div class="modal">
    <div class="hd"><h3>${title}</h3></div><div class="bd">${bodyHTML}</div>
    <div class="ft">${footHTML || '<button class="btn" data-close>ปิด</button>'}</div></div></div>`;
  $("#modal-root").addEventListener("click", e => {
    if (e.target.classList.contains("modal-bg") || e.target.hasAttribute("data-close")) closeModal();
  });
}
const closeModal = () => $("#modal-root").innerHTML = "";

/* ================= DASHBOARD ================= */
let charts = {};
VIEWS.dashboard = async () => {
  const d = await api("/dashboard");
  $("#content").innerHTML = `
    <div class="kpis">
      <div class="kpi panel"><div class="l">รายการอะไหล่ทั้งหมด</div><div class="n">${num(d.total_items)}</div><div class="foot">SKU</div></div>
      <div class="kpi panel"><div class="l">มูลค่าคงคลัง</div><div class="n" title="฿${num(d.total_value)}">฿${compact(d.total_value)}</div><div class="foot">THB</div></div>
      <div class="kpi panel"><div class="l">ต้องสั่งด่วน</div><div class="n crit">${d.critical}</div><div class="foot">CRITICAL</div></div>
      <div class="kpi panel"><div class="l">ใกล้หมด</div><div class="n high">${d.high}</div><div class="foot">HIGH</div></div>
      <div class="kpi panel"><div class="l">ของหมดสต็อก</div><div class="n">${d.out_of_stock}</div><div class="foot">OUT OF STOCK</div></div>
    </div>
    <div class="charts">
      <div class="chart-box panel"><h3>การเคลื่อนไหวสต็อก 14 วัน (เบิก/รับ)</h3><canvas id="c-trend"></canvas></div>
      <div class="chart-box panel"><h3>มูลค่าตามหมวด</h3><canvas id="c-cat"></canvas></div>
    </div>
    <div class="charts" style="margin-top:14px">
      <div class="chart-box panel" style="grid-column:1/-1"><h3>อะไหล่ที่เบิกมากสุด (30 วัน)</h3><canvas id="c-top"></canvas></div>
    </div>
    <div class="charts" style="margin-top:14px">
      <div class="chart-box panel"><h3>มูลค่าสต็อกตามอายุ (Stock Aging)</h3><canvas id="c-aging"></canvas></div>
      <div class="chart-box panel"><h3>ของตาย (Dead Stock &gt; ${365} วัน)</h3><div id="dead-box"><div class="muted">กำลังโหลด…</div></div></div>
    </div>
    <h3 style="margin:22px 0 4px;font-family:'Chakra Petch',sans-serif">ภาพรวมสำหรับผู้บริหาร</h3>
    <div class="charts" style="margin-top:8px">
      <div class="chart-box panel"><h3>สถานะสต็อก (สัดส่วนที่ต้องสั่ง)</h3><canvas id="c-reorder"></canvas></div>
      <div class="chart-box panel"><h3>มูลค่าการเบิกรายเดือน (6 เดือน)</h3><canvas id="c-monthly"></canvas></div>
    </div>
    <div class="charts" style="margin-top:14px">
      <div class="chart-box panel"><h3>เครื่องที่เบิกอะไหล่มากสุด (30 วัน)</h3><canvas id="c-machine"></canvas></div>
      <div class="chart-box panel"><h3>สถานะใบสั่งซื้อ (PO)</h3><canvas id="c-po"></canvas></div>
    </div>`;
  if (typeof Chart === "undefined") return;   // graceful offline degrade
  Object.values(charts).forEach(c => c.destroy && c.destroy()); charts = {};
  const teal = "#0d9aa7", amber = "#b47a00", grid = "#e6ecf0";
  charts.trend = new Chart($("#c-trend"), { type: "line", data: { labels: d.trend.days, datasets: [{ label: "เบิก", data: d.trend.issue, borderColor: "#c96a1e", backgroundColor: "rgba(201,106,30,.08)", tension: .3, fill: true }, { label: "รับ", data: d.trend.receive, borderColor: teal, backgroundColor: "rgba(13,154,167,.08)", tension: .3, fill: true }] }, options: chartOpts() });
  charts.cat = new Chart($("#c-cat"), { type: "doughnut", data: { labels: d.by_category.labels, datasets: [{ data: d.by_category.values, backgroundColor: ["#0d9aa7", "#b47a00", "#c96a1e", "#1f8a4c", "#6a5acd", "#c22c2c", "#5d6b78"] }] }, options: { plugins: { legend: { position: "bottom" } } } });
  charts.top = new Chart($("#c-top"), { type: "bar", data: { labels: d.top_consumed.labels, datasets: [{ label: "จำนวนเบิก", data: d.top_consumed.values, backgroundColor: teal }] }, options: chartOpts() });
  const PAL = ["#0d9aa7", "#b47a00", "#c96a1e", "#1f8a4c", "#6a5acd", "#c22c2c", "#5d6b78", "#2e86ab"];
  if (d.reorder_breakdown) charts.reorder = new Chart($("#c-reorder"), { type: "doughnut", data: { labels: d.reorder_breakdown.labels, datasets: [{ data: d.reorder_breakdown.values, backgroundColor: ["#1f8a4c", "#b47a00", "#c96a1e", "#c22c2c"] }] }, options: { plugins: { legend: { position: "bottom" } } } });
  if (d.monthly_value) charts.monthly = new Chart($("#c-monthly"), { type: "line", data: { labels: d.monthly_value.labels, datasets: [{ label: "มูลค่าเบิก (฿)", data: d.monthly_value.values, borderColor: teal, backgroundColor: "rgba(13,154,167,.1)", tension: .3, fill: true }] }, options: chartOpts() });
  if (d.by_machine) charts.machine = new Chart($("#c-machine"), { type: "bar", data: { labels: d.by_machine.labels, datasets: [{ label: "จำนวนเบิก", data: d.by_machine.values, backgroundColor: amber }] }, options: { ...chartOpts(), indexAxis: "y" } });
  if (d.po_status) charts.po = new Chart($("#c-po"), { type: "doughnut", data: { labels: ["สั่งแล้ว", "รับแล้ว", "ยกเลิก"], datasets: [{ data: [d.po_status.ordered, d.po_status.received, d.po_status.cancelled], backgroundColor: ["#b47a00", "#1f8a4c", "#c22c2c"] }] }, options: { plugins: { legend: { position: "bottom" } } } });
  // dead stock / aging
  try {
    const ds = await api("/deadstock");
    const bl = Object.keys(ds.buckets), bv = bl.map(k => ds.buckets[k]);
    charts.aging = new Chart($("#c-aging"), { type: "bar", data: { labels: bl, datasets: [{ label: "มูลค่า (฿)", data: bv, backgroundColor: ["#1f8a4c", "#b47a00", "#c96a1e", "#c22c2c", "#5d6b78"] }] }, options: chartOpts() });
    $("#dead-box").innerHTML = `<div style="margin-bottom:8px">พบ <b>${num(ds.dead_count)}</b> รายการ มูลค่ารวม <b>฿${num(ds.dead_value)}</b></div>
      <div style="max-height:200px;overflow:auto"><table><thead><tr><th>รหัส</th><th class="num">อายุ(วัน)</th><th class="num">คงเหลือ</th><th class="num">มูลค่า</th></tr></thead>
      <tbody>${ds.items.slice(0, 30).map(x => `<tr><td class="code">${esc(x.item_code)}</td><td class="num">${num(x.age_days)}</td><td class="num">${num(x.on_hand)}</td><td class="num">฿${num(x.stock_value)}</td></tr>`).join("") || '<tr><td colspan="4" class="muted" style="text-align:center;padding:16px">✅ ไม่มีของตาย</td></tr>'}</tbody></table></div>`;
  } catch (e) { $("#dead-box").innerHTML = '<div class="muted">โหลดข้อมูลของตายไม่สำเร็จ</div>'; }
};
const chartOpts = () => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { x: { grid: { display: false } }, y: { grid: { color: "#e6ecf0" }, beginAtZero: true } } });

/* ================= INVENTORY ================= */
VIEWS.inventory = async () => {
  const c = $("#content");
  const machines = S.machines || [];
  if (!$("#inv-q")) c.innerHTML = `
    <div class="toolbar">
      <div class="field" style="flex:1;min-width:240px"><label>ค้นหา (บางส่วนก็ได้ — รหัส / ชื่อ / เบอร์อะไหล่ / ยี่ห้อ / เครื่อง / ที่เก็บ)</label>
        <div class="searchbar"><span class="ic">⌕</span><input id="inv-q" type="search" placeholder="เช่น valve komatsu, MSP0005, hong ching..."></div></div>
      <div class="field"><label>หมวด</label><select id="inv-cat"><option value="">ทั้งหมด</option></select></div>
      <div class="field"><label>เครื่อง</label><select id="inv-mac"><option value="">ทั้งหมด</option>${machines.map(m => `<option>${esc(m.name)}</option>`).join("")}</select></div>
      <label class="field" style="flex:0"><span style="font-size:13px;color:var(--muted)">เฉพาะที่ต้องสั่งซื้อ</span>
        <input type="checkbox" id="inv-low" style="width:18px;height:18px"></label>
      <button class="btn" id="inv-xlsx" style="align-self:flex-end">⤓ Excel</button>
      <button class="btn" id="inv-print" style="align-self:flex-end">🖶 พิมพ์/PDF</button>
      <button class="btn" id="inv-qr" style="align-self:flex-end">🏷️ QR</button>
    </div>
    <div class="panel"><div style="max-height:68vh;overflow:auto"><table id="inv-tbl"></table></div></div>`;
  let lastRows = [];
  const qstr = () => { let q = $("#inv-q").value.trim(); const m = $("#inv-mac").value; if (m) q += " " + m; return q; };
  const run = async () => {
    const q = encodeURIComponent(qstr()), low = $("#inv-low").checked, cat = $("#inv-cat").value;
    let rows = await api(`/items?q=${q}&low_only=${low}&limit=300`);
    if (cat) rows = rows.filter(r => r.category === cat);
    lastRows = rows;
    // populate category options once
    const catSel = $("#inv-cat");
    if (catSel.options.length <= 1) { [...new Set(rows.map(r => r.category).filter(Boolean))].sort().forEach(ct => catSel.add(new Option(ct, ct))); }
    $("#inv-tbl").innerHTML = `<thead><tr><th>รหัส</th><th>รายละเอียด</th><th>เครื่อง</th><th>ที่เก็บ</th><th class="num">คงเหลือ</th><th>หน่วย</th><th class="num">ROP</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.map(it => `
      <tr><td class="code">${esc(it.item_code)}</td>
      <td><div>${esc(it.part_name || it.description.slice(0, 50))}</div><div class="muted" style="font-size:12px">${esc(it.part_number)} ${it.brand ? "· " + esc(it.brand) : ""}</div></td>
      <td class="muted">${esc(it.machine_group)}</td><td class="muted">${esc(it.box)} ${esc(it.level)}</td>
      <td class="num">${num(it.on_hand)}</td><td class="muted">${esc(it.uom)}</td><td class="num">${num(it.reorder_point)}</td>
      <td>${statusTag(it.urgency)}</td><td style="white-space:nowrap">${can("admin") ? `<button class="btn sm" data-edit='${it.id}' title="แก้ไขข้อมูล">✎</button> ` : ""}<button class="btn sm" data-qr='${it.id}' data-code='${esc(it.item_code)}' data-name='${esc((it.part_name || "").slice(0, 30))}' title="พิมพ์ QR">🏷️</button></td></tr>`).join("") || `<tr><td colspan="9" class="muted" style="padding:24px;text-align:center">ไม่พบรายการ — ลองพิมพ์คำอื่น</td></tr>`}</tbody>`;
    $$("#inv-tbl [data-qr]").forEach(b => b.onclick = () => printLabels([{ id: +b.dataset.qr, code: b.dataset.code, name: b.dataset.name }]));
    $$("#inv-tbl [data-edit]").forEach(b => b.onclick = () => itemEditModal(lastRows.find(x => x.id == b.dataset.edit), run));
  };
  $("#inv-qr").onclick = () => { if (lastRows.length) printLabels(lastRows.slice(0, 60).map(it => ({ id: it.id, code: it.item_code, name: (it.part_name || "").slice(0, 30) }))); };
  $("#inv-xlsx").onclick = () => downloadAuthed(`/api/export/stock.xlsx?q=${encodeURIComponent(qstr())}&low_only=${$("#inv-low").checked}`, "stock_database.xlsx");
  $("#inv-print").onclick = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>ฐานข้อมูลสต็อก</title><style>body{font-family:sans-serif;padding:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px 6px;font-size:12px;text-align:left}th{background:#eee}.num{text-align:right}</style></head><body>
      <h2>ฐานข้อมูลสต็อก (${lastRows.length} รายการ)</h2>
      <table><thead><tr><th>รหัส</th><th>รายละเอียด</th><th>เครื่อง</th><th>ที่เก็บ</th><th class="num">คงเหลือ</th><th>หน่วย</th><th class="num">ROP</th><th class="num">ราคา/หน่วย</th></tr></thead>
      <tbody>${lastRows.map(it => `<tr><td>${esc(it.item_code)}</td><td>${esc(it.part_name || it.description.slice(0, 40))}</td><td>${esc(it.machine_group)}</td><td>${esc(it.box)} ${esc(it.level)}</td><td class="num">${num(it.on_hand)}</td><td>${esc(it.uom)}</td><td class="num">${num(it.reorder_point)}</td><td class="num">${num(it.unit_price)}</td></tr>`).join("")}</tbody></table></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };
  let t; $("#inv-q").oninput = () => { clearTimeout(t); t = setTimeout(run, 250); };
  $("#inv-low").onchange = run; $("#inv-cat").onchange = run; $("#inv-mac").onchange = run; run();
};
async function printLabels(items) {
  toast("กำลังเตรียม QR...", "");
  const svgs = await Promise.all(items.map(async it => {
    try { const r = await fetch(`/api/labels/${it.id}.svg`, { headers: { Authorization: "Bearer " + S.token } }); return { ...it, svg: await r.text() }; }
    catch { return { ...it, svg: "" }; }
  }));
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>QR Labels</title><style>
    body{font-family:sans-serif;margin:0;padding:8px;display:flex;flex-wrap:wrap;gap:6px}
    .lbl{border:1px solid #999;width:150px;padding:6px;text-align:center;page-break-inside:avoid}
    .lbl svg{width:110px;height:110px}
    .lbl .c{font-family:monospace;font-weight:bold;font-size:12px;margin-top:2px}
    .lbl .n{font-size:10px;color:#444;height:24px;overflow:hidden}
    @media print{.lbl{border:1px solid #000}}
    </style></head><body>${svgs.map(s => `<div class="lbl">${s.svg}<div class="c">${esc(s.code)}</div><div class="n">${esc(s.name || "")}</div></div>`).join("")}</body></html>`);
  w.document.close(); setTimeout(() => w.print(), 300);
}
const statusTag = (u) => u ? `<span class="tag ${u}">${{ critical: "ต้องสั่งด่วน", high: "ใกล้หมด", watch: "เฝ้าระวัง" }[u]}</span>` : `<span class="tag ok">ปกติ</span>`;
function itemEditModal(it, onSaved) {
  if (!it) return;
  const F = (id, label, val, type = "text", w = "100%") => `<div class="field"><label>${label}</label><input id="ie-${id}" type="${type}" value="${esc(val ?? "")}" style="width:${w}"></div>`;
  modal(`แก้ไขอะไหล่ · ${esc(it.item_code)}`,
    `<div class="row">${F("item_code", "รหัสอะไหล่", it.item_code)}${F("category", "หมวด", it.category)}</div>
     <div class="row" style="margin-top:10px">${F("part_name", "ชื่ออะไหล่", it.part_name)}${F("part_number", "เบอร์อะไหล่", it.part_number)}</div>
     <div class="row" style="margin-top:10px">${F("brand", "ยี่ห้อ", it.brand)}${F("machine_group", "เครื่อง/กลุ่ม", it.machine_group)}</div>
     <div class="field" style="margin-top:10px"><label>รายละเอียด (Description)</label><textarea id="ie-description" rows="2">${esc(it.description ?? "")}</textarea></div>
     <div class="row" style="margin-top:10px">${F("uom", "หน่วย", it.uom)}${F("box", "กล่อง/ที่เก็บ", it.box)}${F("level", "ชั้น", it.level)}</div>
     <div class="row" style="margin-top:10px">${F("unit_price", "ราคา/หน่วย", it.unit_price, "number")}${F("on_hand", "คงเหลือ (ปรับ = ลง ledger)", it.on_hand, "number")}</div>
     <div class="row" style="margin-top:10px">${F("min_level", "Min", it.min_level, "number")}${F("reorder_point", "ROP", it.reorder_point, "number")}${F("max_level", "Max", it.max_level, "number")}${F("lead_time_months", "Lead (เดือน)", it.lead_time_months, "number")}</div>`,
    `<button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="ie-save">บันทึก</button>`);
  $("#ie-save").onclick = async () => {
    const body = {};
    const strF = ["item_code", "category", "part_name", "part_number", "brand", "description", "machine_group", "uom", "box", "level"];
    const numF = ["unit_price", "on_hand", "min_level", "reorder_point", "max_level", "lead_time_months"];
    strF.forEach(k => { const v = $(`#ie-${k}`).value; if (v !== (it[k] ?? "")) body[k] = v; });
    numF.forEach(k => { const v = $(`#ie-${k}`).value; if (v !== "" && +v !== (it[k] ?? "")) body[k] = +v; });
    if (!Object.keys(body).length) { closeModal(); return toast("ไม่มีการเปลี่ยนแปลง", ""); }
    try { await api(`/items/${it.id}`, { method: "PATCH", json: body }); closeModal(); toast("บันทึกการแก้ไขแล้ว", "ok"); onSaved && onSaved(); }
    catch (e) { toast(e.message, "crit"); }
  };
}

/* ================= WITHDRAW ================= */
VIEWS.withdraw = async () => {
  $("#content").innerHTML = `
    <p class="section-note">ค้นหาอะไหล่ที่จะเบิก เพิ่มลงตะกร้าทางขวา ระบุเครื่องและปัญหา แล้วยืนยัน — ระบบตัดสต็อกให้อัตโนมัติ</p>
    <div class="withdraw">
      <div>
        <div class="searchbar" style="margin-bottom:8px"><span class="ic">▦</span>
          <input id="w-scan" type="text" placeholder="🔫 ยิงบาร์โค้ด/QR ที่นี่ (สแกนแล้วเพิ่มเข้าตะกร้าอัตโนมัติ)" style="border-color:var(--brand)"></div>
        <div class="searchbar" style="margin-bottom:12px"><span class="ic">⌕</span>
          <input id="w-q" type="search" placeholder="หรือพิมพ์บางส่วน เช่น 'valve', 'komatsu bearing', 'MSP0005'..."></div>
        <div class="panel results"><table id="w-tbl"></table></div>
      </div>
      <div class="cart panel">
        <h3>ตะกร้าเบิก <span id="cart-n" class="muted"></span></h3>
        <div id="cart-lines"></div>
        <div class="field" style="margin-top:14px"><label>เครื่องที่ซ่อม (Machine)</label>
          <select id="w-machine"><option value="">— เลือกเครื่อง —</option>${S.machines.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></div>
        <div class="field" style="margin-top:10px"><label>ปัญหาที่พบ (Problem)</label><textarea id="w-problem" rows="2" placeholder="อาการ/สาเหตุที่ต้องเบิก"></textarea></div>
        <div class="field" style="margin-top:10px"><label>แนบรูป (ไม่บังคับ)</label><input id="w-photo" type="file" accept="image/*"></div>
        <button class="btn primary" id="w-confirm" style="width:100%;margin-top:16px" disabled>ยืนยันการเบิก & ตัดสต็อก</button>
      </div>
    </div>`;
  renderCart();
  const run = async () => {
    const q = encodeURIComponent($("#w-q").value);
    const rows = q ? await api(`/items?q=${q}&limit=80`) : [];
    $("#w-tbl").innerHTML = rows.length ? `<thead><tr><th>รหัส</th><th>รายละเอียด</th><th class="num">คงเหลือ</th><th></th></tr></thead><tbody>${rows.map(it => `
      <tr><td class="code">${esc(it.item_code)}</td>
      <td><div>${esc(it.part_name || it.description.slice(0, 46))}</div><div class="muted" style="font-size:12px">${esc(it.machine_group)} ${it.brand ? "· " + esc(it.brand) : ""}</div></td>
      <td class="num">${num(it.on_hand)} <span class="muted">${esc(it.uom)}</span></td>
      <td><button class="add-btn" data-add='${JSON.stringify({ id: it.id, code: it.item_code, d: it.part_name || it.description.slice(0, 40), oh: it.on_hand }).replace(/'/g, "&#39;")}'>+ เพิ่ม</button></td></tr>`).join("")}</tbody>`
      : `<tbody><tr><td class="muted" style="padding:24px;text-align:center">${$("#w-q").value ? "ไม่พบรายการ" : "พิมพ์เพื่อค้นหาอะไหล่"}</td></tr></tbody>`;
    $$("#w-tbl [data-add]").forEach(b => b.onclick = () => addToCart(JSON.parse(b.dataset.add)));
  };
  let t; $("#w-q").oninput = () => { clearTimeout(t); t = setTimeout(run, 250); }; run();
  // barcode/QR scanner (USB scanners type the code then Enter)
  const scan = $("#w-scan"); scan.focus();
  scan.onkeydown = async (e) => {
    if (e.key !== "Enter") return;
    const code = scan.value.trim(); scan.value = "";
    if (!code) return;
    try {
      const it = await api(`/items/by-code/${encodeURIComponent(code)}`);
      addToCart({ id: it.id, code: it.item_code, d: it.part_name || it.description.slice(0, 40), oh: it.on_hand });
      toast(`เพิ่ม ${it.item_code} จากการสแกน`, "ok");
    } catch { toast(`ไม่พบรหัส ${code}`, "crit"); }
  };
  $("#w-confirm").onclick = submitReq;
};
function addToCart(it) { if (!S.cart.find(x => x.id === it.id)) { S.cart.push({ ...it, qty: 1 }); renderCart(); } }
function renderCart() {
  const box = $("#cart-lines"); if (!box) return;
  $("#cart-n").textContent = S.cart.length ? `(${S.cart.length})` : "";
  $("#w-confirm") && ($("#w-confirm").disabled = !S.cart.length);
  box.innerHTML = S.cart.length ? S.cart.map((l, i) => {
    const over = l.qty > l.oh;
    return `<div class="line"><div class="info"><div class="code">${esc(l.code)}</div>
      <div class="d muted" title="${esc(l.d)}">${esc(l.d)}</div>
      <div style="font-size:11.5px;font-family:var(--mono);${over ? "color:var(--crit)" : "color:var(--faint)"}">คงเหลือ ${num(l.oh)}${over ? " · เกินสต็อก!" : ""}</div></div>
      <input type="number" min="1" value="${l.qty}" data-i="${i}" style="${over ? "border-color:var(--crit)" : ""}"><button class="x" data-rm="${i}">✕</button></div>`;
  }).join("")
    : `<div class="empty">ยังไม่มีรายการ<br>ค้นหาแล้วกด “+ เพิ่ม”</div>`;
  $$("#cart-lines input").forEach(inp => inp.onchange = () => { S.cart[inp.dataset.i].qty = Math.max(1, +inp.value || 1); renderCart(); });
  $$("#cart-lines [data-rm]").forEach(b => b.onclick = () => { S.cart.splice(+b.dataset.rm, 1); renderCart(); });
}
async function submitReq() {
  const mSel = $("#w-machine");
  const payload = { machine_id: mSel.value ? +mSel.value : null, machine_name: mSel.selectedOptions[0]?.text || "", problem: $("#w-problem").value, lines: S.cart.map(l => ({ item_id: l.id, qty: l.qty })) };
  $("#w-confirm").disabled = true;
  try {
    const r = await api("/requisitions", { json: payload });
    const file = $("#w-photo").files[0];
    if (file) { const fd = new FormData(); fd.append("file", file); await fetch(`/api/requisitions/${r.id}/photo`, { method: "POST", headers: { Authorization: "Bearer " + S.token }, body: fd }); }
    const res = await api(`/requisitions/${r.id}/confirm`, { method: "POST" });
    S.cart = []; renderCart();
    toast(`เบิกสำเร็จ ${res.ref_no} — ตัดสต็อกแล้ว`, "ok");
    countModal(r.id, res.ref_no);
  } catch (e) { toast("ผิดพลาด: " + e.message, "crit"); $("#w-confirm").disabled = false; }
}
async function countModal(reqId, ref) {
  const list = await api(`/requisitions?mine=true`);
  const req = list.find(x => x.id === reqId); if (!req) return;
  modal(`นับของจริงหลังเบิก · ${esc(ref)}`,
    `<p class="section-note">กรอก “จำนวนคงเหลือจริง” ที่นับได้หลังหยิบของ เพื่อให้หัวหน้าตรวจสอบกับระบบ</p>
     ${req.lines.map(l => `<div class="row" style="align-items:center;margin-bottom:10px">
       <div><div class="code">${esc(l.item_code)}</div><div class="muted" style="font-size:12px">ระบบเหลือ ${num(l.system_after)}</div></div>
       <input type="number" min="0" placeholder="นับจริง" data-line="${l.line_id}" style="max-width:120px"></div>`).join("")}`,
    `<button class="btn" data-close>ข้ามไว้ก่อน</button><button class="btn primary" id="save-count">บันทึกการนับ</button>`);
  $("#save-count").onclick = async () => {
    for (const inp of $$("#modal-root input[data-line]")) if (inp.value !== "") await api("/requisitions/count", { json: { line_id: +inp.dataset.line, counted_qty: +inp.value } });
    closeModal(); toast("บันทึกการนับแล้ว", "ok");
  };
}

/* ================= REQUISITIONS ================= */
VIEWS.requisitions = async () => {
  const techs = await api("/requesters").catch(() => []);
  $("#content").innerHTML = `
    <div class="toolbar">
      <div class="field"><label>ช่างผู้เบิก</label><select id="rq-tech"><option value="">ทุกคน</option>${techs.map(t => `<option value="${t.id}">${esc(t.name)}${t.count ? ` (${t.count})` : ""}</option>`).join("")}</select></div>
      <div class="field"><label>ตั้งแต่วันที่</label>${dateFieldHTML("rq-from")}</div>
      <div class="field"><label>ถึงวันที่</label>${dateFieldHTML("rq-to")}</div>
      <label class="field" style="flex:0"><span style="font-size:13px;color:var(--muted)">เฉพาะของฉัน</span><input type="checkbox" id="rq-mine" style="width:18px;height:18px"></label>
      <button class="btn" id="rq-go">ค้นหา</button>
    </div>
    <div id="rq-sum" class="section-note" style="margin-top:-6px"></div>
    <div class="panel"><div style="max-height:66vh;overflow:auto"><table id="rq-tbl"></table></div></div>`;
  const run = async () => {
    const p = new URLSearchParams();
    if (dateISO("rq-from")) p.set("date_from", dateISO("rq-from"));
    if (dateISO("rq-to")) p.set("date_to", dateISO("rq-to"));
    if ($("#rq-mine").checked) p.set("mine", "true");
    if ($("#rq-tech").value) p.set("requester_id", $("#rq-tech").value);
    const rows = await api("/requisitions?" + p.toString());
    const totalLines = rows.reduce((a, r) => a + r.lines.length, 0);
    const techName = $("#rq-tech").selectedOptions[0]?.text?.replace(/\s*\(\d+\)$/, "") || "";
    $("#rq-sum").textContent = $("#rq-tech").value ? `▸ ช่าง ${techName}: ${rows.length} ใบเบิก · ${totalLines} รายการ` : (rows.length ? `▸ รวม ${rows.length} ใบเบิก · ${totalLines} รายการ` : "");
    $("#rq-tbl").innerHTML = `<thead><tr><th>เลขที่</th><th>วันที่</th><th>ผู้เบิก</th><th>เครื่อง</th><th>รายการ</th><th>ช่องทาง</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.map(r => `
      <tr><td class="code">${esc(r.ref_no)}</td><td class="muted">${fmtDateTime(r.created_at)}</td>
      <td>${esc(r.requester)}</td><td class="muted">${esc(r.machine)}</td><td class="num">${r.lines.length}</td>
      <td class="muted">${r.source === "line" ? "LINE" : "เว็บ"}</td><td><span class="tag ${r.status}">${r.status}</span></td>
      <td><button class="btn sm" data-req='${r.id}'>ดู</button></td></tr>`).join("") || `<tr><td colspan="8" class="muted" style="padding:24px;text-align:center">ไม่มีรายการในช่วงนี้</td></tr>`}</tbody>`;
    $$("#rq-tbl [data-req]").forEach(b => b.onclick = () => reqDetail(rows.find(x => x.id == b.dataset.req)));
  };
  $("#rq-go").onclick = run; $("#rq-mine").onchange = run; $("#rq-tech").onchange = run; wireDate("rq-from"); wireDate("rq-to"); run();
};
function reqDetail(r) {
  const canRecon = can("leader");
  modal(`ใบเบิก ${esc(r.ref_no)}`,
    `<div class="row" style="margin-bottom:6px"><div><b>ผู้เบิก:</b> ${esc(r.requester)}</div><div><b>เครื่อง:</b> ${esc(r.machine) || "-"}</div></div>
     <div style="margin-bottom:12px"><b>ปัญหา:</b> ${esc(r.problem) || "-"}</div>
     ${r.photo ? `<img src="/api/uploads/${esc(r.photo)}" style="max-width:100%;border-radius:8px;margin-bottom:12px">` : ""}
     <table><thead><tr><th>รหัส</th><th class="num">เบิก</th><th class="num">ระบบเหลือ</th><th class="num">นับจริง</th><th class="num">ส่วนต่าง</th></tr></thead><tbody>
     ${r.lines.map(l => `<tr><td class="code">${esc(l.item_code)}</td><td class="num">${num(l.qty)}</td><td class="num">${num(l.system_after)}</td>
       <td class="num">${l.counted_qty == null ? (canRecon ? `<input type="number" data-cl="${l.line_id}" style="width:80px">` : "-") : num(l.counted_qty)}</td>
       <td class="num">${l.variance == null ? "" : `<span class="${l.variance === 0 ? "var-ok" : "var-bad"}">${l.variance > 0 ? "+" : ""}${num(l.variance)}</span>`}</td></tr>`).join("")}
     </tbody></table>`,
    canRecon ? `<button class="btn" data-close>ปิด</button><button class="btn primary" id="save-recon">บันทึกการตรวจนับ</button>` : `<button class="btn" data-close>ปิด</button>`);
  if (canRecon) $("#save-recon").onclick = async () => {
    for (const inp of $$("#modal-root input[data-cl]")) if (inp.value !== "") await api("/requisitions/count", { json: { line_id: +inp.dataset.cl, counted_qty: +inp.value } });
    closeModal(); toast("บันทึกการตรวจนับแล้ว", "ok"); go("requisitions", true);
  };
}

/* ================= REORDER ================= */
/* ================= RECEIVE ================= */
VIEWS.receive = async () => {
  $("#content").innerHTML = `
    <div class="panel" style="padding:20px;max-width:640px">
      <div class="searchbar" style="margin-bottom:12px"><span class="ic">⌕</span><input id="rc-q" type="search" placeholder="ค้นหาอะไหล่ที่รับเข้า..."></div>
      <table id="rc-tbl"></table>
    </div>`;
  const run = async () => {
    const q = encodeURIComponent($("#rc-q").value); if (!q) { $("#rc-tbl").innerHTML = ""; return; }
    const rows = await api(`/items?q=${q}&limit=40`);
    $("#rc-tbl").innerHTML = `<tbody>${rows.map(it => `<tr>
      <td class="code">${esc(it.item_code)}</td><td>${esc(it.part_name)}</td><td class="num">คงเหลือ ${num(it.on_hand)}</td>
      <td><input type="number" min="1" placeholder="จำนวน" id="rcq-${it.id}" style="width:90px"></td>
      <td><button class="btn sm primary" data-rc="${it.id}">รับเข้า</button></td></tr>`).join("")}</tbody>`;
    $$("#rc-tbl [data-rc]").forEach(b => b.onclick = async () => {
      const qty = +$(`#rcq-${b.dataset.rc}`).value; if (!qty) return;
      await api("/receive", { json: { item_id: +b.dataset.rc, qty } });
      toast("รับเข้าแล้ว", "ok"); run();
    });
  };
  let t; $("#rc-q").oninput = () => { clearTimeout(t); t = setTimeout(run, 250); };
};

/* ================= EXPORT ================= */
VIEWS.export = async () => {
  const techs = await api("/requesters").catch(() => []);
  $("#content").innerHTML = `
    <p class="section-note">สรุปการเบิกในช่วงเวลา สำหรับใช้อ้างอิงตัดสต็อกในระบบ Oracle — ดูบนหน้าจอ หรือดาวน์โหลด/พิมพ์</p>
    <div class="toolbar">
      <div class="field"><label>ช่างผู้เบิก</label><select id="ex-tech"><option value="">ทุกคน</option>${techs.map(t => `<option value="${t.id}">${esc(t.name)}${t.count ? ` (${t.count})` : ""}</option>`).join("")}</select></div>
      <div class="field"><label>ตั้งแต่</label>${dateFieldHTML("ex-from", todayDmy())}</div>
      <div class="field"><label>ถึง</label>${dateFieldHTML("ex-to", todayDmy())}</div>
      <button class="btn primary" id="ex-show" style="align-self:flex-end">แสดงสรุป</button>
      <button class="btn" id="ex-csv" style="align-self:flex-end">⤓ CSV (Oracle)</button>
      <button class="btn" id="ex-xlsx" style="align-self:flex-end">⤓ Excel</button>
      <button class="btn" id="ex-print" style="align-self:flex-end">🖶 พิมพ์/PDF</button>
    </div>
    <div id="ex-out"><div class="muted">เลือกช่วงวันที่แล้วกด “แสดงสรุป”</div></div>`;
  let last = null;
  const techQ = () => $("#ex-tech").value ? `&requester_id=${$("#ex-tech").value}` : "";
  const range = () => ({ f: dateISO("ex-from"), t: dateISO("ex-to") });
  const show = async () => {
    const { f, t } = range();
    if (!f || !t) return toast("กรอกวันที่รูปแบบ dd/mm/yyyy", "crit");
    $("#ex-out").innerHTML = '<div class="muted">กำลังโหลด…</div>';
    const d = await api(`/requisitions/summary?date_from=${f}&date_to=${t}${techQ()}`);
    last = d;
    $("#ex-out").innerHTML = `
      <div class="kpis">
        <div class="kpi panel"><div class="l">จำนวนใบเบิก</div><div class="n">${num(d.requisitions)}</div><div class="foot">REQUISITIONS</div></div>
        <div class="kpi panel"><div class="l">รายการอะไหล่</div><div class="n">${num(d.items)}</div><div class="foot">ITEMS</div></div>
        <div class="kpi panel"><div class="l">มูลค่ารวม</div><div class="n" title="฿${num(d.total_value)}">฿${compact(d.total_value)}</div><div class="foot">TOTAL</div></div>
      </div>
      <div class="panel" id="ex-table"><div style="max-height:56vh;overflow:auto"><table>
        <thead><tr><th>รหัส</th><th>รายละเอียด</th><th class="num">รวมเบิก</th><th>หน่วย</th><th class="num">ราคา/หน่วย</th><th class="num">มูลค่า</th><th>เครื่องที่ใช้</th></tr></thead>
        <tbody>${d.rows.map(x => `<tr><td class="code">${esc(x.item_code)}</td><td>${esc(x.description)}</td>
          <td class="num"><b>${num(x.qty)}</b></td><td class="muted">${esc(x.uom)}</td><td class="num">฿${num(x.unit_price)}</td>
          <td class="num">฿${num(x.amount)}</td><td class="muted">${esc(x.machines)}</td></tr>`).join("") || '<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">ไม่มีการเบิกในช่วงนี้</td></tr>'}</tbody>
      </table></div></div>`;
  };
  $("#ex-show").onclick = show; $("#ex-tech").onchange = () => { if (last) show(); };
  wireDate("ex-from"); wireDate("ex-to");
  $("#ex-csv").onclick = () => { const { f, t } = range(); if (f && t) downloadAuthed(`/api/export/oracle?date_from=${f}&date_to=${t}${techQ()}`, `oracle_${f}.csv`); };
  $("#ex-xlsx").onclick = () => { const { f, t } = range(); if (f && t) downloadAuthed(`/api/export/oracle.xlsx?date_from=${f}&date_to=${t}${techQ()}`, `oracle_${f}.xlsx`); };
  $("#ex-print").onclick = () => {
    if (!last) return toast("กด “แสดงสรุป” ก่อน", "crit");
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>สรุปการเบิก</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:6px;font-size:13px;text-align:left}th{background:#eee}.num{text-align:right}</style></head><body>
      <h2>สรุปการเบิก ${$("#ex-from").value} - ${$("#ex-to").value}</h2>
      <p>ใบเบิก ${last.requisitions} · รายการ ${last.items} · มูลค่ารวม ฿${num(last.total_value)}</p>
      <table><thead><tr><th>รหัส</th><th>รายละเอียด</th><th class="num">รวมเบิก</th><th>หน่วย</th><th class="num">ราคา/หน่วย</th><th class="num">มูลค่า</th><th>เครื่อง</th></tr></thead>
      <tbody>${last.rows.map(x => `<tr><td>${esc(x.item_code)}</td><td>${esc(x.description)}</td><td class="num">${num(x.qty)}</td><td>${esc(x.uom)}</td><td class="num">${num(x.unit_price)}</td><td class="num">${num(x.amount)}</td><td>${esc(x.machines)}</td></tr>`).join("")}</tbody></table></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };
  show();
};

/* ================= USERS (admin) ================= */
const ROLE_TH = { admin: "ผู้ดูแลระบบ", leader: "หัวหน้า", engineer: "ช่าง/วิศวกร", viewer: "ดูอย่างเดียว" };
VIEWS.users = async () => {
  const rows = await api("/users");
  $("#content").innerHTML = `
    <div class="toolbar"><button class="btn primary" id="u-add">+ เพิ่มผู้ใช้</button></div>
    <div class="panel"><div style="max-height:70vh;overflow:auto"><table>
      <thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ-สกุล</th><th>สิทธิ์</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>${rows.map(x => `<tr>
        <td class="code">${esc(x.username)}</td><td>${esc(x.full_name) || "-"}</td>
        <td><span class="tag ${x.role === "admin" ? "critical" : x.role === "leader" ? "confirmed" : "ok"}">${ROLE_TH[x.role] || x.role}</span></td>
        <td>${x.active ? '<span class="tag ok">ใช้งาน</span>' : '<span class="tag draft">ปิดใช้งาน</span>'}</td>
        <td><button class="btn sm" data-edit='${x.id}'>แก้ไข</button></td></tr>`).join("")}</tbody>
    </table></div></div>`;
  $("#u-add").onclick = () => userModal(null);
  $$("#content [data-edit]").forEach(b => b.onclick = () => userModal(rows.find(r => r.id == b.dataset.edit)));
};
function userModal(user) {
  const isEdit = !!user;
  modal(isEdit ? `แก้ไขผู้ใช้ · ${esc(user.username)}` : "เพิ่มผู้ใช้ใหม่",
    `<div class="field" style="margin-bottom:10px"><label>ชื่อผู้ใช้ (Username)</label>
       <input id="u-username" type="text" value="${isEdit ? esc(user.username) : ""}" ${isEdit ? "disabled" : ""}></div>
     <div class="field" style="margin-bottom:10px"><label>ชื่อ-สกุล</label>
       <input id="u-fullname" type="text" value="${isEdit ? esc(user.full_name) : ""}"></div>
     <div class="row"><div class="field"><label>สิทธิ์</label><select id="u-role">
       ${["viewer", "engineer", "leader", "admin"].map(r => `<option value="${r}" ${isEdit && user.role === r ? "selected" : ""}>${ROLE_TH[r]}</option>`).join("")}</select></div>
       ${isEdit ? `<div class="field"><label>สถานะ</label><select id="u-active"><option value="1" ${user.active ? "selected" : ""}>ใช้งาน</option><option value="0" ${!user.active ? "selected" : ""}>ปิดใช้งาน</option></select></div>` : ""}</div>
     <div class="field" style="margin-top:10px"><label>${isEdit ? "ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)" : "รหัสผ่าน"}</label>
       <input id="u-pass" type="password" placeholder="${isEdit ? "••••" : "อย่างน้อย 4 ตัวอักษร"}"></div>`,
    `<button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="u-save">${isEdit ? "บันทึก" : "สร้างผู้ใช้"}</button>`);
  $("#u-save").onclick = async () => {
    try {
      if (isEdit) {
        const body = { full_name: $("#u-fullname").value, role: $("#u-role").value, active: $("#u-active").value === "1" };
        if ($("#u-pass").value) body.password = $("#u-pass").value;
        await api(`/users/${user.id}`, { method: "PATCH", json: body });
      } else {
        await api("/users", { json: { username: $("#u-username").value.trim(), full_name: $("#u-fullname").value, role: $("#u-role").value, password: $("#u-pass").value } });
      }
      closeModal(); toast("บันทึกผู้ใช้แล้ว", "ok"); go("users", true);
    } catch (e) { toast(e.message, "crit"); }
  };
}
function changePasswordModal(forced) {
  modal(forced ? "⚠️ กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน" : "เปลี่ยนรหัสผ่าน",
    `${forced ? '<p class="section-note">เพื่อความปลอดภัย ระบบบังคับให้เปลี่ยนรหัสผ่านเริ่มต้นก่อนใช้งานครั้งแรก</p>' : ""}
     <div class="field" style="margin-bottom:10px"><label>รหัสผ่านปัจจุบัน</label><input id="pw-old" type="password"></div>
     <div class="field"><label>รหัสผ่านใหม่</label><input id="pw-new" type="password" placeholder="อย่างน้อย 4 ตัวอักษร"></div>`,
    `${forced ? "" : '<button class="btn" data-close>ยกเลิก</button>'}<button class="btn primary" id="pw-save">เปลี่ยนรหัสผ่าน</button>`);
  $("#pw-save").onclick = async () => {
    try {
      await api("/me/password", { json: { old_password: $("#pw-old").value, new_password: $("#pw-new").value } });
      closeModal(); toast("เปลี่ยนรหัสผ่านแล้ว", "ok"); S.user.must_change_pw = false;
    } catch (e) { toast(e.message, "crit"); }
  };
}
function linkLineModal() {
  modal("ผูกบัญชี LINE",
    `<p class="section-note">ใช้เพื่อเบิกอะไหล่ผ่าน LINE ได้ด้วยบัญชีของคุณ</p>
     <ol style="padding-left:18px;line-height:1.9">
       <li>เพิ่มเพื่อน LINE Official Account ของแผนก (สแกน QR ที่แอดมินให้)</li>
       <li>กดปุ่มด้านล่างเพื่อรับรหัส 6 หลัก</li>
       <li>พิมพ์ในแชท LINE ว่า <b>ผูก &lt;รหัส&gt;</b></li>
     </ol>
     <div id="line-code" style="text-align:center;font-family:var(--mono);font-size:28px;letter-spacing:4px;margin-top:10px"></div>`,
    `<button class="btn" data-close>ปิด</button><button class="btn primary" id="gen-code">ขอรหัสผูกบัญชี</button>`);
  $("#gen-code").onclick = async () => {
    try {
      const r = await api("/me/line-code", { method: "POST" });
      $("#line-code").textContent = r.code;
      toast(`รหัส ${r.code} ใช้ได้ ${r.expires_min} นาที`, "ok");
    } catch (e) { toast(e.message, "crit"); }
  };
}

/* ================= REORDER ================= */
VIEWS.reorder = async () => {
  const rows = await api("/reorder");
  const isLeader = can("leader");
  $("#content").innerHTML = `
    <div class="toolbar">
      <span class="section-note" style="flex:1">เรียงตามความเร่งด่วน · “จำนวนแนะนำ” = ระดับสูงสุด − คงเหลือ</span>
      ${isLeader ? '<button class="btn primary" id="mk-po" disabled>สร้างใบสั่งซื้อจากที่เลือก</button>' : ""}
    </div>
    <div class="panel"><div style="max-height:70vh;overflow:auto"><table>
      <thead><tr>${isLeader ? '<th><input type="checkbox" id="chk-all"></th>' : ""}<th>ความเร่งด่วน</th><th>รหัส</th><th>รายละเอียด</th><th>เครื่อง</th><th class="num">คงเหลือ</th><th class="num">ROP</th><th class="num">แนะนำสั่ง</th><th class="num">ราคา/หน่วย</th></tr></thead>
      <tbody>${rows.map(it => `<tr>
        ${isLeader ? `<td><input type="checkbox" class="po-chk" data-id="${it.id}" data-qty="${it.suggest_qty || 1}"></td>` : ""}
        <td>${statusTag(it.urgency)}</td><td class="code">${esc(it.item_code)}</td>
        <td>${esc(it.part_name || it.description.slice(0, 46))}<div class="muted" style="font-size:12px">${esc(it.brand)}</div></td>
        <td class="muted">${esc(it.machine_group)}</td><td class="num">${num(it.on_hand)}</td><td class="num">${num(it.reorder_point)}</td>
        <td class="num"><b>${num(it.suggest_qty)}</b></td><td class="num">฿${num(it.unit_price)}</td></tr>`).join("") || `<tr><td colspan="9" class="muted" style="padding:24px;text-align:center">✅ ไม่มีรายการที่ต้องสั่งซื้อ</td></tr>`}</tbody>
    </table></div></div>`;
  if (!isLeader) return;
  const upd = () => $("#mk-po").disabled = !$$(".po-chk:checked").length;
  $("#chk-all") && ($("#chk-all").onchange = e => { $$(".po-chk").forEach(c => c.checked = e.target.checked); upd(); });
  $$(".po-chk").forEach(c => c.onchange = upd);
  $("#mk-po").onclick = async () => {
    const lines = $$(".po-chk:checked").map(c => ({ item_id: +c.dataset.id, qty: +c.dataset.qty }));
    if (!lines.length) return;
    try {
      const r = await api("/po", { json: { note: "จากรายการต้องสั่งซื้อ", lines } });
      toast(`สร้างใบสั่งซื้อ ${r.po_no} แล้ว`, "ok"); go("po");
    } catch (e) { toast(e.message, "crit"); }
  };
};

/* ================= PURCHASE ORDERS ================= */
VIEWS.po = async () => {
  const rows = await api("/po");
  $("#content").innerHTML = `
    <p class="section-note">ติดตามการสั่งซื้อ · กด “รับของ” เพื่อรับเข้าสต็อกอัตโนมัติทุกบรรทัด · ส่งออก Excel หรือพิมพ์ใบ PO</p>
    <div class="panel"><div style="max-height:72vh;overflow:auto"><table>
      <thead><tr><th>เลขที่ PO</th><th>วันที่</th><th>โดย</th><th class="num">รายการ</th><th class="num">มูลค่า</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>${rows.map(po => { const val = po.lines.reduce((a, l) => a + l.qty * l.unit_price, 0); return `<tr>
        <td class="code">${esc(po.po_no)}</td><td class="muted">${fmtDate(po.created_at)}</td>
        <td>${esc(po.created_by)}</td><td class="num">${po.lines.length}</td><td class="num">฿${num(val)}</td>
        <td><span class="tag ${po.status === "received" ? "reconciled" : po.status === "cancelled" ? "draft" : "confirmed"}">${{ ordered: "สั่งแล้ว", received: "รับแล้ว", cancelled: "ยกเลิก" }[po.status]}</span></td>
        <td><button class="btn sm" data-po='${po.id}'>ดู</button></td></tr>`; }).join("") || `<tr><td colspan="7" class="muted" style="padding:24px;text-align:center">ยังไม่มีใบสั่งซื้อ — สร้างจากหน้า “ต้องสั่งซื้อ”</td></tr>`}</tbody>
    </table></div></div>`;
  $$("#content [data-po]").forEach(b => b.onclick = () => poDetail(rows.find(r => r.id == b.dataset.po)));
};
function poDetail(po) {
  const val = po.lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
  modal(`ใบสั่งซื้อ ${esc(po.po_no)}`,
    `<div class="row" style="margin-bottom:10px"><div><b>สถานะ:</b> ${{ ordered: "สั่งแล้ว", received: "รับแล้ว", cancelled: "ยกเลิก" }[po.status]}</div><div><b>โดย:</b> ${esc(po.created_by)}</div></div>
     <table><thead><tr><th>รหัส</th><th>รายละเอียด</th><th class="num">จำนวน</th><th class="num">ราคา</th><th class="num">รวม</th></tr></thead><tbody>
     ${po.lines.map(l => `<tr><td class="code">${esc(l.item_code)}</td><td>${esc(l.description.slice(0, 40))}</td><td class="num">${num(l.qty)}</td><td class="num">฿${num(l.unit_price)}</td><td class="num">฿${num(l.qty * l.unit_price)}</td></tr>`).join("")}
     <tr><td colspan="4" class="num"><b>รวมทั้งสิ้น</b></td><td class="num"><b>฿${num(val)}</b></td></tr></tbody></table>`,
    `<button class="btn" data-close>ปิด</button>
     <a class="btn" href="/api/po/${po.id}/export.xlsx?_t=${S.token}" id="po-xlsx">Excel</a>
     <button class="btn" id="po-print">พิมพ์ PO</button>
     ${po.status === "ordered" ? '<button class="btn" id="po-cancel">ยกเลิก</button><button class="btn primary" id="po-recv">รับของเข้าสต็อก</button>' : ""}`);
  // xlsx needs auth header -> handle via fetch
  $("#po-xlsx").onclick = async (e) => { e.preventDefault(); await downloadAuthed(`/api/po/${po.id}/export.xlsx`, `${po.po_no}.xlsx`); };
  $("#po-print").onclick = () => printPO(po, val);
  if (po.status === "ordered") {
    $("#po-recv").onclick = async () => { try { await api(`/po/${po.id}/receive`, { method: "POST" }); closeModal(); toast("รับของเข้าสต็อกแล้ว", "ok"); go("po", true); } catch (e) { toast(e.message, "crit"); } };
    $("#po-cancel").onclick = async () => { try { await api(`/po/${po.id}/cancel`, { method: "POST" }); closeModal(); toast("ยกเลิกใบสั่งซื้อแล้ว"); go("po", true); } catch (e) { toast(e.message, "crit"); } };
  }
}
function printPO(po, val) {
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>${po.po_no}</title><style>body{font-family:sans-serif;padding:30px}h2{margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left}td.n,th.n{text-align:right}</style></head><body>
    <h2>ใบสั่งซื้อ (Purchase Order)</h2><p>เลขที่: <b>${po.po_no}</b> · วันที่: ${fmtDate(po.created_at)} · โดย: ${esc(po.created_by)}</p>
    <table><thead><tr><th>No.</th><th>Item Code</th><th>Description</th><th class="n">Qty</th><th class="n">Unit Price</th><th class="n">Amount</th></tr></thead><tbody>
    ${po.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.item_code)}</td><td>${esc(l.description)}</td><td class="n">${num(l.qty)}</td><td class="n">${num(l.unit_price)}</td><td class="n">${num(l.qty * l.unit_price)}</td></tr>`).join("")}
    <tr><td colspan="5" class="n"><b>Total</b></td><td class="n"><b>฿${num(val)}</b></td></tr></tbody></table>
    <p style="margin-top:40px">ผู้สั่งซื้อ ..................................... &nbsp;&nbsp; ผู้อนุมัติ .....................................</p>
    </body></html>`);
  w.document.close(); w.print();
}
async function downloadAuthed(url, filename) {
  const r = await fetch(url, { headers: { Authorization: "Bearer " + S.token } });
  if (!r.ok) return toast("ดาวน์โหลดไม่สำเร็จ", "crit");
  const blob = await r.blob(); const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

/* ================= AUDIT ================= */
VIEWS.audit = async () => {
  const rows = await api("/audit?limit=300");
  const AC = { login: "เข้าระบบ", issue: "เบิก", receive: "รับเข้า", user: "ผู้ใช้", setting: "ตั้งค่า", po: "สั่งซื้อ" };
  $("#content").innerHTML = `<div class="panel"><div style="max-height:74vh;overflow:auto"><table>
    <thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>สิทธิ์</th><th>การกระทำ</th><th>รายละเอียด</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td class="muted">${fmtDateTime(r.ts)}</td>
      <td>${esc(r.username)}</td><td class="muted">${esc(r.role)}</td><td>${AC[r.action] || r.action}</td><td class="muted">${esc(r.detail)}</td></tr>`).join("") || '<tr><td colspan="5" class="muted" style="padding:24px;text-align:center">ยังไม่มีบันทึก</td></tr>'}</tbody>
  </table></div></div>`;
};

/* ================= SETTINGS (notifications) ================= */
VIEWS.settings = async () => {
  const cfg = await api("/settings");
  const secretRow = (key, label) => `<div class="field" style="margin-bottom:12px"><label>${label} ${cfg[key].set ? '<span class="tag ok">ตั้งค่าแล้ว</span>' : '<span class="tag draft">ยังไม่ตั้ง</span>'}</label>
    <input id="s-${key}" type="password" placeholder="${cfg[key].set ? "•••• (เว้นว่างถ้าไม่เปลี่ยน)" : "วางค่าที่นี่"}"></div>`;
  const textRow = (key, label) => `<div class="field" style="margin-bottom:12px"><label>${label}</label><input id="s-${key}" type="text" value="${esc(cfg[key].value || "")}"></div>`;
  $("#content").innerHTML = `
    <p class="section-note">ตั้งค่าช่องทางแจ้งเตือนได้ที่นี่โดยไม่ต้องแก้ไฟล์ · กด “ทดสอบส่ง” เพื่อเช็คว่าใช้งานได้</p>
    <div class="charts">
      <div class="chart-box panel"><h3>Discord</h3>${secretRow("DISCORD_WEBHOOK", "Webhook URL")}<button class="btn sm" data-test="discord">ทดสอบส่ง</button></div>
      <div class="chart-box panel"><h3>Telegram</h3>${secretRow("TELEGRAM_BOT_TOKEN", "Bot Token")}${textRow("TELEGRAM_CHAT_ID", "Chat ID")}<button class="btn sm" data-test="telegram">ทดสอบส่ง</button></div>
    </div>
    <div class="chart-box panel" style="margin-top:14px"><h3>LINE Messaging API</h3>
      ${secretRow("LINE_CHANNEL_ACCESS_TOKEN", "Channel Access Token")}${secretRow("LINE_CHANNEL_SECRET", "Channel Secret")}${textRow("LINE_NOTIFY_TARGET", "ปลายทางสรุป (group/user id)")}
      <button class="btn sm" data-test="line">ทดสอบส่ง</button></div>
    <button class="btn primary" id="s-save" style="margin-top:16px">บันทึกการตั้งค่า</button>`;
  $("#s-save").onclick = async () => {
    const keys = ["DISCORD_WEBHOOK", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET", "LINE_NOTIFY_TARGET"];
    const values = {}; keys.forEach(k => { const el = $(`#s-${k}`); if (el) values[k] = el.value; });
    try { await api("/settings", { method: "PUT", json: { values } }); toast("บันทึกการตั้งค่าแล้ว", "ok"); go("settings", true); } catch (e) { toast(e.message, "crit"); }
  };
  $$("#content [data-test]").forEach(b => b.onclick = async () => {
    b.disabled = true; b.textContent = "กำลังส่ง...";
    try { const r = await api(`/settings/test/${b.dataset.test}`, { method: "POST" }); toast(r.ok ? "ส่งทดสอบสำเร็จ ✓" : "ส่งไม่สำเร็จ: " + (r.error || ""), r.ok ? "ok" : "crit"); }
    catch (e) { toast(e.message, "crit"); }
    b.disabled = false; b.textContent = "ทดสอบส่ง";
  });
};

/* ================= OPTIMIZE (leader) ================= */
let optCharts = {};
const OPT_MODES = [
  ["max_coverage", "ครอบคลุมของด่วนสูงสุดในงบ", "เลือกจำนวนสั่งให้ครอบคลุมของด่วน (critical) มากที่สุดภายใต้งบ — knapsack", true],
  ["machine_protect", "ป้องกันเครื่องให้ได้มากสุด", "เลือกอะไหล่ให้เครื่องจักรมีของครบพร้อมซ่อมได้มากที่สุดในงบ — max-coverage", true],
  ["fair", "กระจายงบให้ทุกเครื่องสมดุล", "จัดสรรงบให้เครื่องที่ครอบคลุมน้อยสุดได้รับการป้องกันดีที่สุด — max-min fairness", true],
  ["min_cost_safe", "งบขั้นต่ำเพื่อความปลอดภัย", "งบน้อยที่สุด + รายการที่ต้องสั่งเพื่อเติมของด่วนทุกตัวให้ปลอดภัย", false],
  ["minmax", "แนะนำค่า Min/Max ที่เหมาะสม", "คำนวณจุดสั่งซื้อ (ROP) และระดับสูงสุด (Max) ที่เหมาะสมจากอัตราการใช้ + lead time + safety stock", false],
  ["abc", "วิเคราะห์ ABC / Pareto", "จัดกลุ่มอะไหล่ตามมูลค่าสต็อก (A=80% แรก, B, C) เพื่อโฟกัสการควบคุม", false],
];
VIEWS.optimize = async () => {
  let status = { minizinc: false, pulp: true, greedy: true };
  try { status = await api("/optimize/status"); } catch { }
  const sbadge = status.minizinc
    ? '<span class="tag ok">MiniZinc พร้อมใช้</span>'
    : '<span class="tag watch">MiniZinc ไม่พบ — ใช้ PuLP/CBC แทน</span>';
  $("#content").innerHTML = `
    <p class="section-note">วิเคราะห์/หาคำตอบที่ดีที่สุดจากข้อมูลคลัง — ตัวแก้ปัญหา: MiniZinc → PuLP/CBC → Greedy &nbsp; ${sbadge}</p>
    <div class="toolbar">
      <div class="field" style="min-width:280px"><label>โหมดวิเคราะห์</label>
        <select id="opt-mode">${OPT_MODES.map(m => `<option value="${m[0]}">${m[1]}</option>`).join("")}</select></div>
      <div class="field" id="opt-budget-wrap"><label>งบประมาณ (บาท) — เว้นว่าง = ไม่จำกัด</label><input type="number" id="opt-budget" placeholder="เช่น 200000" style="min-width:180px"></div>
      <button class="btn primary" id="opt-run" style="align-self:flex-end">คำนวณ</button>
      <button class="btn" id="opt-apply" style="align-self:flex-end;display:none">บันทึกค่า Min/Max ที่แนะนำ</button>
      <button class="btn" id="opt-po" style="align-self:flex-end" disabled>สร้าง PO จากผลลัพธ์</button>
    </div>
    <div id="opt-desc" class="section-note" style="margin-top:-6px"></div>
    <div id="opt-out"><div class="muted">เลือกโหมดแล้วกด “คำนวณ”</div></div>`;
  let lastRows = [];
  const isBudget = (m) => OPT_MODES.find(x => x[0] === m)[3];
  const modeDesc = () => { const m = OPT_MODES.find(x => x[0] === $("#opt-mode").value); $("#opt-desc").textContent = m ? "▸ " + m[2] : ""; $("#opt-budget-wrap").style.display = isBudget($("#opt-mode").value) ? "" : "none"; $("#opt-apply").style.display = $("#opt-mode").value === "minmax" ? "" : "none"; };
  $("#opt-mode").onchange = modeDesc; modeDesc();
  $("#opt-run").onclick = async () => {
    const mode = $("#opt-mode").value;
    const b = (isBudget(mode) && $("#opt-budget").value) ? +$("#opt-budget").value : null;
    $("#opt-out").innerHTML = '<div class="muted">กำลังคำนวณ…</div>';
    try {
      const r = await api("/optimize/reorder", { json: { mode, budget: b } });
      const special = r.is_abc || r.is_minmax;
      lastRows = special ? r.rows : r.rows.filter(x => x.order_qty > 0);
      $("#opt-po").disabled = special || !lastRows.length;
      const kpiHtml = r.kpis.map(k => `<div class="kpi panel"><div class="l">${esc(k.label)}</div><div class="n" title="${esc(String(k.value))}" style="font-size:${String(k.value).length > 8 ? '18px' : '30px'}">${esc(String(k.value))}</div><div class="foot">${esc(k.foot || "")}</div></div>`).join("");
      const cov = r.coverage_chart;
      let thead, tbody;
      if (r.is_minmax) {
        thead = `<tr><th>รหัส</th><th>รายละเอียด</th><th>เครื่อง</th><th class="num">คงเหลือ</th><th class="num">ใช้/เดือน</th><th class="num">ROP เดิม→แนะนำ</th><th class="num">Max เดิม→แนะนำ</th></tr>`;
        tbody = lastRows.map(x => `<tr><td class="code">${esc(x.item_code)}</td><td>${esc(x.description)}</td><td class="muted">${esc(x.machine)}</td>
          <td class="num">${num(x.on_hand)}</td><td class="num">${num(x.monthly_use)}</td>
          <td class="num">${num(x.cur_rop)} → <b>${num(x.rec_rop)}</b></td><td class="num">${num(x.cur_max)} → <b>${num(x.rec_max)}</b></td></tr>`).join("");
      } else if (r.is_abc) {
        thead = `<tr><th>กลุ่ม</th><th>รหัส</th><th>รายละเอียด</th><th>เครื่อง</th><th class="num">คงเหลือ</th><th class="num">ราคา/หน่วย</th><th class="num">มูลค่าสต็อก</th></tr>`;
        tbody = lastRows.map(x => `<tr><td><span class="tag ${x.urgency === "A" ? "critical" : x.urgency === "B" ? "watch" : "ok"}">${x.urgency}</span></td>
          <td class="code">${esc(x.item_code)}</td><td>${esc(x.description)}</td><td class="muted">${esc(x.machine)}</td>
          <td class="num">${num(x.on_hand)}</td><td class="num">฿${num(x.unit_price)}</td><td class="num">฿${num(x.cost)}</td></tr>`).join("");
      } else {
        thead = `<tr><th>ด่วน</th><th>รหัส</th><th>รายละเอียด</th><th>เครื่อง</th><th class="num">สั่ง</th><th class="num">ต้องการ</th><th class="num">ราคา/หน่วย</th><th class="num">รวม</th></tr>`;
        tbody = lastRows.map(x => `<tr><td>${statusTag(x.urgency)}</td><td class="code">${esc(x.item_code)}</td><td>${esc(x.description)}</td><td class="muted">${esc(x.machine)}</td>
          <td class="num"><b>${num(x.order_qty)}</b></td><td class="num">${num(x.need)}</td><td class="num">฿${num(x.unit_price)}</td><td class="num">฿${num(x.cost)}</td></tr>`).join("");
      }
      $("#opt-out").innerHTML = `
        <div class="kpis">${kpiHtml}</div>
        ${cov || Object.keys(r.by_category).length ? `<div class="charts">
          ${cov ? `<div class="chart-box panel"><h3>${esc(cov.title)}</h3><canvas id="opt-cov"></canvas></div>` : ""}
          ${Object.keys(r.by_category).length ? `<div class="chart-box panel"><h3>${r.is_abc ? "มูลค่าตามกลุ่ม ABC" : "งบตามหมวด"}</h3><canvas id="opt-cat"></canvas></div>` : ""}
        </div>` : ""}
        <div class="panel" style="margin-top:14px"><div style="max-height:50vh;overflow:auto"><table><thead>${thead}</thead><tbody>${tbody || '<tr><td colspan="8" class="muted" style="text-align:center;padding:20px">ไม่มีข้อมูล</td></tr>'}</tbody></table></div></div>`;
      if (typeof Chart !== "undefined") {
        Object.values(optCharts).forEach(c => c.destroy && c.destroy()); optCharts = {};
        if (cov) optCharts.cov = new Chart($("#opt-cov"), { type: "bar", data: { labels: cov.labels, datasets: [
          { label: "สั่ง/มี", data: cov.ordered, backgroundColor: "#0d9aa7" },
          { label: "ทั้งหมด", data: cov.needed, backgroundColor: "#d6dee5" }] }, options: chartOpts() });
        const cl = Object.keys(r.by_category);
        if (cl.length) optCharts.cat = new Chart($("#opt-cat"), { type: "doughnut", data: { labels: cl, datasets: [{ data: cl.map(k => r.by_category[k]), backgroundColor: ["#0d9aa7", "#b47a00", "#c96a1e", "#1f8a4c", "#6a5acd", "#c22c2c", "#5d6b78"] }] }, options: { plugins: { legend: { position: "bottom" } } } });
      }
    } catch (e) { $("#opt-out").innerHTML = `<div class="panel" style="padding:20px;color:var(--crit)">คำนวณไม่สำเร็จ: ${esc(e.message)}</div>`; }
  };
  $("#opt-apply").onclick = async () => {
    modal("บันทึกค่า Min/Max", `<p>ต้องการบันทึกค่า ROP และ Max ที่แนะนำทับค่าเดิมของอะไหล่ทั้งหมดหรือไม่?</p>`,
      `<button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="do-apply">บันทึก</button>`);
    $("#do-apply").onclick = async () => {
      try { const r = await api("/optimize/apply-minmax", { method: "POST" }); closeModal(); toast(`อัปเดต ${r.updated} รายการแล้ว`, "ok"); refreshReorderBadge(); }
      catch (e) { toast(e.message, "crit"); }
    };
  };
  $("#opt-po").onclick = async () => {
    if (!lastRows.length) return;
    try {
      const r = await api("/po", { json: { note: "จากการวิเคราะห์ Optimization", lines: lastRows.map(x => ({ item_id: x.id, qty: x.order_qty })) } });
      toast(`สร้าง PO ${r.po_no} แล้ว`, "ok"); go("po");
    } catch (e) { toast(e.message, "crit"); }
  };
};

/* ================= IMPORT DATA (admin) ================= */
VIEWS.importdata = async () => {
  $("#content").innerHTML = `
    <div class="panel" style="padding:22px;max-width:680px">
      <p class="section-note">นำเข้าอะไหล่และรายชื่อเครื่องด้วยไฟล์ Template (Excel) — เหมาะกับการเริ่มใช้งานครั้งแรกด้วยข้อมูลของคุณเอง</p>
      <ol style="line-height:2;padding-left:18px">
        <li><b>ดาวน์โหลด Template</b> แล้วกรอกข้อมูลในชีต <span class="code">Items</span> และ <span class="code">Machines</span>
          <div style="margin:8px 0"><button class="btn" id="dl-tpl">⤓ ดาวน์โหลด Template (.xlsx)</button></div></li>
        <li><b>อัปโหลดไฟล์ที่กรอกแล้ว</b> — ระบบจะเพิ่ม/อัปเดตตาม <span class="code">item_code</span> (ไม่ลบของเดิม)
          <div style="margin:8px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <input type="file" id="imp-file" accept=".xlsx">
            <button class="btn primary" id="imp-go">นำเข้าข้อมูล</button></div>
          <label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-size:13px;color:var(--crit)"><input type="checkbox" id="imp-clear" style="width:16px;height:16px"> ล้างข้อมูลเดิมทั้งหมดก่อนนำเข้า (เริ่มต้นใหม่ด้วยชุดข้อมูลนี้)</label></li>
      </ol>
      <div id="imp-result" class="muted" style="margin-top:8px"></div>
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)">
        คอลัมน์ในชีต Items: <span class="code">item_code, category, description, part_name, part_number, brand, machine_group, uom, box, level, unit_price, on_hand, min_level, reorder_point, lead_time_months</span></div>
    </div>`;
  $("#dl-tpl").onclick = () => downloadAuthed("/api/import/template.xlsx", "import_template.xlsx");
  $("#imp-go").onclick = async () => {
    const f = $("#imp-file").files[0];
    if (!f) return toast("เลือกไฟล์ก่อน", "crit");
    const clear = $("#imp-clear").checked;
    if (clear && !confirm("ยืนยันล้างข้อมูลเดิมทั้งหมด (อะไหล่/เครื่อง/การเบิก/PO) แล้วนำเข้าใหม่?")) return;
    const fd = new FormData(); fd.append("file", f);
    $("#imp-result").textContent = "กำลังนำเข้า...";
    try {
      const r = await fetch(`/api/import/upload?replace=${clear}`, { method: "POST", headers: { Authorization: "Bearer " + S.token }, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "นำเข้าไม่สำเร็จ");
      $("#imp-result").innerHTML = `<span class="var-ok">✓ นำเข้าสำเร็จ: อะไหล่ ${num(d.items)} รายการ, เครื่อง ${num(d.machines)} รายการ</span>`;
      toast("นำเข้าข้อมูลสำเร็จ", "ok"); refreshReorderBadge();
    } catch (e) { $("#imp-result").innerHTML = `<span class="var-bad">✗ ${esc(e.message)}</span>`; }
  };
};

/* ---------------- start ---------------- */
if (S.token) boot().catch(() => logout());
