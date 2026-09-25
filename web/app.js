/* AHR Maintenance Inventory — frontend SPA (vanilla JS) */
const S = { token: localStorage.getItem("tok") || "", user: null, cart: [], ws: null, wsWanted: false, machines: [], tz: "Asia/Bangkok" };
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
// Server stores UTC without a zone marker -> treat as UTC, display in the factory time zone.
const _toDate = (d) => {
  if (d instanceof Date) return d;
  const t = String(d ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(t + "T12:00:00Z");
  return new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t) ? t : t + "Z");
};
const _tzParts = (d) => {
  const x = _toDate(d); if (isNaN(x)) return null;
  const p = {};
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: S.tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(x).forEach(o => p[o.type] = o.value);
  } catch { p.day = pad2(x.getDate()); p.month = pad2(x.getMonth() + 1); p.year = x.getFullYear(); p.hour = pad2(x.getHours()); p.minute = pad2(x.getMinutes()); }
  return p;
};
const fmtDate = (d) => { const p = _tzParts(d); return p ? `${p.day}/${p.month}/${p.year}` : ""; };
const fmtDateTime = (d) => { const p = _tzParts(d); return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : ""; };
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
  "คืนอะไหล่": "Returns", "ดูแลระบบ": "System admin", "+ เพิ่มอะไหล่ใหม่": "+ New part", "เพิ่มอะไหล่ใหม่": "New part",
  "สร้างอะไหล่": "Create part", "ลบอะไหล่": "Delete part", "มีการคืน": "Returned", "คืนแล้ว": "Returned", "สุทธิ": "Net",
  "ยืนยันการคืน": "Confirm return", "ลบใบเบิก": "Delete requisition", "ข้อมูลระบบ": "System info",
  "สำรองข้อมูล (Backup)": "Backup", "กู้คืนข้อมูล (Restore)": "Restore", "ตรวจสอบคุณภาพข้อมูล (Data Health Check)": "Data health check",
  "🔍 ตรวจสอบตอนนี้": "🔍 Check now",
  "📷 สแกนด้วยกล้อง": "📷 Scan with camera", "เครื่องที่ซ่อม (Machine) — พิมพ์เพื่อค้นหา": "Machine (type to search)",
  "ตะกร้าเบิก": "Withdraw cart", "ความเคลื่อนไหวล่าสุด": "Recent movements", "📷 ถ่าย / เลือกรูปอะไหล่": "📷 Take / choose part photo",
  "ลบรูป": "Remove photo", "จำนวนรับ": "Qty received", "เลขที่เอกสาร / หมายเหตุ (ไม่บังคับ)": "Document no. / note (optional)",
  "+ เพิ่มลงตะกร้า": "+ Add to cart", "✎ แก้ไข": "✎ Edit", "แก้ไขอัตโนมัติ": "Auto-fix", "ประวัติการคืนล่าสุด": "Recent returns",
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
  fetch("/api/auth/logout", { method: "POST" }).catch(() => { });
  S.token = ""; S.user = null; S.cart = []; localStorage.removeItem("tok");
  S.wsWanted = false; if (S.ws) { try { S.ws.close(); } catch { } S.ws = null; }
  closeModal(); document.body.classList.remove("nav-open");
  $("#content").innerHTML = "";
  history.replaceState(null, "", location.pathname);           // forget the last page
  $$("#nav a").forEach(a => a.classList.remove("active"));
  $("#lg-pass").value = ""; $("#lg-err").textContent = "";
  $("#app").classList.add("hidden"); $("#login").classList.remove("hidden");
}
// show exactly the menus this user's role allows (both hide AND un-hide)
function applyRoleMenus() {
  $$("#nav a[data-role]").forEach(a => a.classList.toggle("hidden", !can(a.dataset.role)));
  $("#shutdown-btn").classList.toggle("hidden", !can("admin"));
}
const RANK = { viewer: 0, engineer: 1, leader: 2, admin: 3 };
const can = (role) => RANK[S.user.role] >= RANK[role];

async function boot() {
  S.user = await api("/me");
  await api("/auth/session", { method: "POST" }).catch(() => { });   // cookie that lets <img> load photos
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#who-name").textContent = S.user.name; $("#who-role").textContent = S.user.role;
  applyRoleMenus();
  S.machines = await api("/machines").catch(() => []);
  connectWS();
  go(location.hash.replace("#", "") || "dashboard");
  refreshReorderBadge();
  if (S.user.must_change_pw) changePasswordModal(true);
}

/* ---------------- websocket ---------------- */
function connectWS() {
  S.wsWanted = true;
  if (S.ws && (S.ws.readyState === 0 || S.ws.readyState === 1)) return;   // already connected
  const proto = location.protocol === "https:" ? "wss" : "ws";
  S.ws = new WebSocket(`${proto}://${location.host}/ws`);
  S.ws.onopen = () => { $("#live").classList.add("on"); $("#live-txt").textContent = "real-time"; };
  S.ws.onclose = () => { $("#live").classList.remove("on"); $("#live-txt").textContent = "offline"; S.ws = null; if (S.wsWanted && S.token) setTimeout(() => { if (S.wsWanted && S.token) connectWS(); }, 3000); };
  S.ws.onmessage = (ev) => {
    const { event, data } = JSON.parse(ev.data);
    if (event === "requisition.confirmed") toast(`เบิกสำเร็จ ${data.ref}`, "ok");
    if (event === "reorder.alert") { toast(`⚠️ ต้องสั่งซื้อ ${data.items.length} รายการ`, "crit"); refreshReorderBadge(); }
    if (event === "stock.received") toast("รับเข้าสต็อกแล้ว", "ok");
    const cur = location.hash.replace("#", "");
    if (["inventory", "dashboard", "reorder"].includes(cur)) go(cur, true);
    else if (cur === "withdraw" && S.refreshWithdraw) S.refreshWithdraw();
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
const TITLES = { dashboard: "แดชบอร์ด", withdraw: "เบิกอะไหล่", requisitions: "รายการเบิก", inventory: "คลังอะไหล่", reorder: "รายการที่ต้องสั่งซื้อ", optimize: "วางแผนสั่งซื้อ (Optimization)", receive: "รับเข้าสต็อก", export: "ส่งออกข้อมูลให้ Oracle", users: "จัดการผู้ใช้งาน", po: "ใบสั่งซื้อ (PO)", audit: "บันทึกการใช้งาน", settings: "ตั้งค่าการแจ้งเตือน", importdata: "นำเข้าข้อมูล", returns: "คืนอะไหล่", admintools: "ดูแลระบบ" };
const VIEWS = {};
// true when the user has moved to another page while data was loading
const stale = (view) => location.hash.replace("#", "") !== view;
const VIEW_ROLE = { optimize: "leader", receive: "leader", returns: "leader", po: "leader", export: "leader", audit: "leader",
  users: "admin", settings: "admin", importdata: "admin", admintools: "admin" };
function go(view, silent) {
  if (!VIEWS[view]) view = "dashboard";
  if (VIEW_ROLE[view] && !(S.user && can(VIEW_ROLE[view]))) view = "dashboard";   // no access -> home
  document.body.classList.remove("nav-open");
  location.hash = view;
  if (!silent) closeModal();                                    // leaving the page closes its dialog
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.view === view));
  $("#view-title").textContent = TITLES[view];
  if (!silent) $("#content").innerHTML = '<div class="muted">กำลังโหลด…</div>';
  VIEWS[view]();
}
$("#nav").addEventListener("click", e => { const a = e.target.closest("a"); if (a) go(a.dataset.view); });
$("#menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
$("#rail-backdrop").addEventListener("click", () => document.body.classList.remove("nav-open"));
document.addEventListener("keydown", e => { if (e.key === "Escape") document.body.classList.remove("nav-open"); });
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
const closeModal = () => {
  if (S.onModalClose) { const f = S.onModalClose; S.onModalClose = null; try { f(); } catch { } }
  $("#modal-root").innerHTML = "";
};

/* ================= DASHBOARD ================= */
let charts = {};
VIEWS.dashboard = async () => {
  const d = await api("/dashboard");
  if (stale("dashboard")) return;
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
    if (!$("#dead-box")) return;
    const bl = Object.keys(ds.buckets), bv = bl.map(k => ds.buckets[k]);
    charts.aging = new Chart($("#c-aging"), { type: "bar", data: { labels: bl, datasets: [{ label: "มูลค่า (฿)", data: bv, backgroundColor: ["#1f8a4c", "#b47a00", "#c96a1e", "#c22c2c", "#5d6b78"] }] }, options: chartOpts() });
    $("#dead-box").innerHTML = `<div style="margin-bottom:8px">พบ <b>${num(ds.dead_count)}</b> รายการ มูลค่ารวม <b>฿${num(ds.dead_value)}</b></div>
      <div style="max-height:200px;overflow:auto"><table><thead><tr><th>รหัส</th><th class="num">อายุ(วัน)</th><th class="num">คงเหลือ</th><th class="num">มูลค่า</th></tr></thead>
      <tbody>${ds.items.slice(0, 30).map(x => `<tr><td class="code">${esc(x.item_code)}</td><td class="num">${num(x.age_days)}</td><td class="num">${num(x.on_hand)}</td><td class="num">฿${num(x.stock_value)}</td></tr>`).join("") || '<tr><td colspan="4" class="muted" style="text-align:center;padding:16px">✅ ไม่มีของตาย</td></tr>'}</tbody></table></div>`;
  } catch (e) { if ($("#dead-box")) $("#dead-box").innerHTML = '<div class="muted">โหลดข้อมูลของตายไม่สำเร็จ</div>'; }
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
      ${can("admin") ? `<button class="btn primary" id="inv-new" style="align-self:flex-end">+ เพิ่มอะไหล่ใหม่</button>` : ""}
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
    if (!$("#inv-tbl")) return;
    if (cat) rows = rows.filter(r => r.category === cat);
    lastRows = rows;
    // populate category options once
    const catSel = $("#inv-cat");
    if (catSel.options.length <= 1) { [...new Set(rows.map(r => r.category).filter(Boolean))].sort().forEach(ct => catSel.add(new Option(ct, ct))); }
    $("#inv-tbl").innerHTML = `<thead><tr><th></th><th>รหัส</th><th>รายละเอียด</th><th>เครื่อง</th><th>ที่เก็บ</th><th class="num">คงเหลือ</th><th>หน่วย</th><th class="num">ROP</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.map(it => `
      <tr><td class="thumb-cell">${thumbHTML(it)}</td><td class="code"><a href="#" data-view-item="${it.id}">${esc(it.item_code)}</a></td>
      <td><div>${esc(it.part_name || it.description.slice(0, 50))}</div><div class="muted" style="font-size:12px">${esc(it.part_number)} ${it.brand ? "· " + esc(it.brand) : ""}</div></td>
      <td class="muted">${esc(it.machine_group)}</td><td class="muted">${esc(it.box)} ${esc(it.level)}</td>
      <td class="num">${num(it.on_hand)}</td><td class="muted">${esc(it.uom)}</td><td class="num">${num(it.reorder_point)}</td>
      <td>${statusTag(it.urgency)}</td><td style="white-space:nowrap">${can("admin") ? `<button class="btn sm" data-edit='${it.id}' title="แก้ไขข้อมูล">✎</button> ` : ""}<button class="btn sm" data-qr='${it.id}' data-code='${esc(it.item_code)}' data-name='${esc((it.part_name || "").slice(0, 30))}' title="พิมพ์ QR">🏷️</button></td></tr>`).join("") || `<tr><td colspan="10" class="muted" style="padding:24px;text-align:center">ไม่พบรายการ — ลองพิมพ์คำอื่น</td></tr>`}</tbody>`;
    $$("#inv-tbl [data-qr]").forEach(b => b.onclick = () => printLabels([{ id: +b.dataset.qr, code: b.dataset.code, name: b.dataset.name }]));
    $$("#inv-tbl [data-edit]").forEach(b => b.onclick = () => itemEditModal(lastRows.find(x => x.id == b.dataset.edit), run));
  };
  $("#inv-qr").onclick = () => { if (lastRows.length) printLabels(lastRows.slice(0, 60).map(it => ({ id: it.id, code: it.item_code, name: (it.part_name || "").slice(0, 30) }))); };
  if ($("#inv-new")) $("#inv-new").onclick = () => itemEditModal(null, run);
  $("#inv-xlsx").onclick = () => downloadAuthed(`/api/export/stock.xlsx?q=${encodeURIComponent(qstr())}&low_only=${$("#inv-low").checked}`, "stock_database.xlsx");
  $("#inv-print").onclick = () => {
    const w = printSink();
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
  const w = printSink();
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
function itemEditModal(it, onSaved, preset = {}) {
  const isNew = !it;
  if (isNew) it = { item_code: "", category: "", part_name: "", part_number: "", brand: "", machine_group: "", description: "", uom: "Pcs", box: "", level: "", unit_price: 0, on_hand: 0, min_level: 0, reorder_point: 0, max_level: 0, lead_time_months: 2, image_ver: 0, ...preset };
  let pendingPhoto = null;                        // new part: photo is uploaded right after it is created
  const F = (id, label, val, type = "text", w = "100%") => `<div class="field"><label>${label}</label><input id="ie-${id}" type="${type}" value="${esc(val ?? "")}" style="width:${w}"${type === "text" && id === "machine_group" ? ' list="ie-machines"' : ""}></div>`;
  const mlist = `<datalist id="ie-machines">${(S.machines || []).map(m => `<option value="${esc(m.name)}">`).join("")}</datalist>`;
  modal(isNew ? "เพิ่มอะไหล่ใหม่" : `แก้ไขอะไหล่ · ${esc(it.item_code)}`,
    (isNew ? `<p class="section-note">กรอกข้อมูลอะไหล่ที่ยังไม่เคยมีในระบบ — ช่องที่จำเป็น: <b>รหัสอะไหล่</b> (ห้ามซ้ำ) · แนะนำให้กรอกชื่อ หน่วย ที่เก็บ ราคา และ ROP${preset.receiving ? " · <b>จำนวนรับเข้าให้ใส่ในขั้นตอนถัดไป</b>" : ""}</p>` : "") + mlist +
    `<div class="photo-edit"><div class="photo-box" id="ie-photo">${it.image_ver ? `<img src="${imgURL(it.id, it.image_ver)}" alt="">` : '<div class="noimg">📦<div>ยังไม่มีรูป</div></div>'}</div>
      <div class="photo-actions"><label class="btn">📷 ถ่าย / เลือกรูปอะไหล่<input type="file" id="ie-file" accept="image/*" hidden></label>
      <button type="button" class="btn" id="ie-photo-del" ${it.image_ver ? "" : "hidden"}>ลบรูป</button>
      <div class="muted" style="font-size:12px">ระบบย่อรูปให้อัตโนมัติ · ช่างจะเห็นรูปนี้ตอนค้นหาและเบิก</div></div></div>` +
    `<div class="row" style="margin-top:12px">${F("item_code", "รหัสอะไหล่", it.item_code)}${F("category", "หมวด", it.category)}</div>
     <div class="row" style="margin-top:10px">${F("part_name", "ชื่ออะไหล่", it.part_name)}${F("part_number", "เบอร์อะไหล่", it.part_number)}</div>
     <div class="row" style="margin-top:10px">${F("brand", "ยี่ห้อ", it.brand)}${F("machine_group", "เครื่อง/กลุ่ม", it.machine_group)}</div>
     <div class="field" style="margin-top:10px"><label>รายละเอียด (Description)</label><textarea id="ie-description" rows="2">${esc(it.description ?? "")}</textarea></div>
     <div class="row" style="margin-top:10px">${F("uom", "หน่วย", it.uom)}${F("box", "กล่อง/ที่เก็บ", it.box)}${F("level", "ชั้น", it.level)}</div>
     <div class="row" style="margin-top:10px">${F("unit_price", "ราคา/หน่วย", it.unit_price, "number")}${F("on_hand", isNew ? "จำนวนคงเหลือเริ่มต้น" : "คงเหลือ (ปรับ = ลง ledger)", it.on_hand, "number")}</div>
     <div class="row" style="margin-top:10px">${F("min_level", "Min", it.min_level, "number")}${F("reorder_point", "ROP", it.reorder_point, "number")}${F("max_level", "Max", it.max_level, "number")}${F("lead_time_months", "Lead (เดือน)", it.lead_time_months, "number")}</div>`,
    `${isNew ? "" : '<button class="btn danger" id="ie-del" style="margin-right:auto">ลบอะไหล่</button>'}<button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="ie-save">${isNew ? "สร้างอะไหล่" : "บันทึก"}</button>`);
  $("#ie-file").onchange = async () => {
    const f = $("#ie-file").files[0]; if (!f) return;
    const box = $("#ie-photo");
    if (isNew) {
      pendingPhoto = f; box.innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`; return;
    }
    box.innerHTML = '<div class="noimg">⏳<div>กำลังอัปโหลด…</div></div>';
    try {
      it.image_ver = await uploadItemPhoto(it.id, f);
      box.innerHTML = `<img src="${imgURL(it.id, it.image_ver)}" alt="">`; $("#ie-photo-del").hidden = false;
      toast("บันทึกรูปอะไหล่แล้ว", "ok"); if (onSaved) onSaved(it);
    } catch (e) { toast(e.message, "crit"); box.innerHTML = it.image_ver ? `<img src="${imgURL(it.id, it.image_ver)}" alt="">` : '<div class="noimg">📦<div>ยังไม่มีรูป</div></div>'; }
  };
  $("#ie-photo-del").onclick = async () => {
    if (isNew) { pendingPhoto = null; $("#ie-photo").innerHTML = '<div class="noimg">📦<div>ยังไม่มีรูป</div></div>'; return; }
    if (!confirm("ลบรูปของอะไหล่นี้?")) return;
    try { await api(`/items/${it.id}/image`, { method: "DELETE" }); it.image_ver = 0; $("#ie-photo").innerHTML = '<div class="noimg">📦<div>ยังไม่มีรูป</div></div>'; $("#ie-photo-del").hidden = true; toast("ลบรูปแล้ว", "ok"); if (onSaved) onSaved(it); }
    catch (e) { toast(e.message, "crit"); }
  };
  if (!isNew) $("#ie-del").onclick = () => {
    const target = it;
    confirmTyped(`ลบอะไหล่ ${esc(target.item_code)}`,
      `<p>ลบ <b>${esc(target.item_code)}</b> ${esc(target.part_name || "")} ออกจากระบบถาวร</p><p class="muted">ลบได้เฉพาะอะไหล่ที่ยังไม่เคยถูกเบิก/สั่งซื้อ (เช่น สร้างผิด หรือข้อมูลซ้ำ)</p>`,
      async () => { await api(`/admin/items/${target.id}`, { method: "DELETE" }); closeModal(); toast(`ลบ ${target.item_code} แล้ว`, "ok"); onSaved && onSaved(); }, "ลบถาวร");
  };
  $("#ie-save").onclick = async () => {
    if (isNew) {
      const body = {};
      ["item_code", "category", "part_name", "part_number", "brand", "description", "machine_group", "uom", "box", "level"].forEach(k => body[k] = $(`#ie-${k}`).value.trim());
      ["unit_price", "on_hand", "min_level", "reorder_point", "max_level", "lead_time_months"].forEach(k => body[k] = +($(`#ie-${k}`).value || 0));
      if (!body.item_code) return toast("กรุณากรอกรหัสอะไหล่", "crit");
      try {
        const r = await api("/items", { json: body });
        if (pendingPhoto) { try { r.item.image_ver = await uploadItemPhoto(r.item.id, pendingPhoto); } catch (e) { toast("สร้างอะไหล่แล้ว แต่อัปโหลดรูปไม่สำเร็จ: " + e.message, "crit"); } }
        closeModal(); toast(`สร้างอะไหล่ ${r.item.item_code} แล้ว`, "ok"); onSaved && onSaved(r.item);
      }
      catch (e) { toast(e.message, "crit"); }
      return;
    }
    const body = {};
    const strF = ["item_code", "category", "part_name", "part_number", "brand", "description", "machine_group", "uom", "box", "level"];
    const numF = ["unit_price", "on_hand", "min_level", "reorder_point", "max_level", "lead_time_months"];
    strF.forEach(k => { const v = $(`#ie-${k}`).value; if (v !== (it[k] ?? "")) body[k] = v; });
    numF.forEach(k => { const v = $(`#ie-${k}`).value; if (v !== "" && +v !== (it[k] ?? "")) body[k] = +v; });
    if (!Object.keys(body).length) { closeModal(); return toast("ไม่มีการเปลี่ยนแปลง", ""); }
    try { const r = await api(`/items/${it.id}`, { method: "PATCH", json: body }); closeModal(); toast("บันทึกการแก้ไขแล้ว", "ok"); onSaved && onSaved(r.item); }
    catch (e) { toast(e.message, "crit"); }
  };
}


/* ================= PART PHOTOS ================= */
// shrink a phone photo in the browser before upload (5 MB -> ~100 KB)
async function resizeImage(file, maxSide, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("อ่านไฟล์รูปไม่ได้ (รองรับ JPG/PNG/WEBP)")); i.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, "image/jpeg", quality));
  } finally { URL.revokeObjectURL(url); }
}
async function uploadItemPhoto(itemId, file) {
  const fd = new FormData();
  fd.append("full", await resizeImage(file, 1000, 0.82), "photo.jpg");
  fd.append("thumb", await resizeImage(file, 240, 0.75), "thumb.jpg");
  const r = await fetch(`/api/items/${itemId}/image`, { method: "PUT", headers: { Authorization: "Bearer " + S.token }, body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || "อัปโหลดรูปไม่สำเร็จ");
  return d.image_ver;
}
async function uploadReqPhoto(reqId, file) {
  const fd = new FormData(); fd.append("file", await resizeImage(file, 1400, 0.8), "photo.jpg");
  const r = await fetch(`/api/requisitions/${reqId}/photo`, { method: "POST", headers: { Authorization: "Bearer " + S.token }, body: fd });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || "แนบรูปไม่สำเร็จ"); }
}
const imgURL = (id, ver, thumb) => `/api/items/${id}/image?${thumb ? "thumb=1&" : ""}v=${ver}`;
const thumbHTML = (it, big) => it && it.image_ver
  ? `<img class="thumb${big ? " lg" : ""}" src="${imgURL(it.id, it.image_ver, true)}" loading="lazy" alt="" data-view-item="${it.id}" title="ดูรูป/รายละเอียด">`
  : `<span class="thumb ph${big ? " lg" : ""}" data-view-item="${it ? it.id : ""}" title="ดูรายละเอียด">📦</span>`;
// any element with data-view-item opens the part card
document.addEventListener("click", e => {
  const el = e.target.closest("[data-view-item]");
  if (el && el.dataset.viewItem && !e.target.closest("#modal-root .modal")) { e.preventDefault(); itemDetail(+el.dataset.viewItem); }
});
const TXN_TH = { issue: "เบิก", receive: "รับเข้า", return: "คืน", adjust: "ปรับยอด" };
async function itemDetail(id) {
  let it; try { it = await api(`/items/${id}`); } catch (e) { return toast(e.message, "crit"); }
  const onWithdraw = location.hash === "#withdraw";
  modal(`${esc(it.item_code)}`, `
    <div class="item-card">
      <div class="item-photo">${it.image_ver ? `<img src="${imgURL(it.id, it.image_ver)}" alt="${esc(it.part_name)}">` : `<div class="noimg">📦<div>ยังไม่มีรูป${can("admin") ? " — เพิ่มได้ที่ปุ่ม แก้ไข" : ""}</div></div>`}</div>
      <div class="kv" style="margin-top:12px">
        <div>ชื่อ</div><div><b>${esc(it.part_name || "-")}</b></div>
        <div>เบอร์ / ยี่ห้อ</div><div>${esc(it.part_number || "-")} · ${esc(it.brand || "-")}</div>
        <div>รายละเอียด</div><div>${esc(it.description || "-")}</div>
        <div>เครื่อง/กลุ่ม</div><div>${esc(it.machine_group || "-")}</div>
        <div>ที่เก็บ</div><div>${esc(it.box || "-")} ${esc(it.level || "")}</div>
        <div>คงเหลือ</div><div><b style="font-size:17px">${num(it.on_hand)}</b> ${esc(it.uom)} ${statusTag(it.urgency)}</div>
        <div>ROP / Max</div><div>${num(it.reorder_point)} / ${num(it.max_level)}</div>
      </div>
      <h3 style="margin:16px 0 6px;font-size:15px">ความเคลื่อนไหวล่าสุด</h3>
      <div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ประเภท</th><th class="num">จำนวน</th><th class="num">คงเหลือหลังทำรายการ</th><th>อ้างอิง</th></tr></thead><tbody>
      ${(it.history || []).map(h => `<tr><td class="muted">${fmtDateTime(h.when)}</td><td>${{ OPENING: "ยอดยกมา", IMPORT: "นำเข้า (ตั้งยอด)", CREATE: "สร้างอะไหล่", EDIT: "ปรับยอด (แอดมิน)", CLEANUP: "ปรับยอดติดลบ" }[h.ref] || TXN_TH[h.type] || esc(h.type)}</td>
        <td class="num">${h.type === "issue" ? "−" : (h.type === "adjust" && h.qty < 0 ? "" : "+")}${num(Math.abs(h.qty) === h.qty || h.type !== "adjust" ? Math.abs(h.qty) : h.qty)}</td>
        <td class="num">${num(h.balance_after)}</td><td class="code">${esc(h.ref || "")}</td></tr>`).join("") || '<tr><td colspan="5" class="muted" style="text-align:center">ไม่มีประวัติ</td></tr>'}
      </tbody></table></div>
    </div>`,
    `${can("admin") ? '<button class="btn" id="idt-edit" style="margin-right:auto">✎ แก้ไข</button>' : ""}<button class="btn" data-close>ปิด</button>${onWithdraw ? '<button class="btn primary" id="idt-add">+ เพิ่มลงตะกร้า</button>' : ""}`);
  if ($("#idt-edit")) $("#idt-edit").onclick = () => itemEditModal(it, () => go(location.hash.replace("#", "") || "inventory", true));
  if ($("#idt-add")) $("#idt-add").onclick = () => { addToCart(cartItem(it)); closeModal(); };
}

/* ================= CAMERA SCANNER (QR + barcode) ================= */
let _qrLib = null;
function loadQrLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (!_qrLib) _qrLib = new Promise((res, rej) => {
    const sc = document.createElement("script"); sc.src = "/vendor/html5-qrcode.min.js?v=2.3.8";
    sc.onload = res; sc.onerror = () => { _qrLib = null; rej(new Error("โหลดตัวสแกนไม่สำเร็จ")); }; document.head.appendChild(sc);
  });
  return _qrLib;
}
function qrFormats() {
  const F = window.Html5QrcodeSupportedFormats || {};
  return ["QR_CODE", "CODE_128", "CODE_39", "CODE_93", "EAN_13", "EAN_8", "UPC_A", "UPC_E", "ITF", "CODABAR", "DATA_MATRIX"].map(k => F[k]).filter(x => x !== undefined);
}
async function openScanner(onCode) {
  modal("📷 สแกน QR Code / บาร์โค้ด", `
    <div id="qr-reader" class="qr-reader"></div>
    <div id="qr-msg" class="section-note" style="margin-top:8px">กำลังเปิดกล้อง…</div>
    <label class="btn" style="width:100%;margin-top:6px;text-align:center;display:block">📸 ถ่ายรูป / เลือกรูปบาร์โค้ด
      <input type="file" id="qr-file" accept="image/*" capture="environment" hidden></label>`,
    `<button class="btn" data-close>ปิด</button>`);
  try { await loadQrLib(); } catch (e) { $("#qr-msg").textContent = e.message; return; }
  if (!$("#qr-reader")) return;
  const qr = new Html5Qrcode("qr-reader", { formatsToSupport: qrFormats(), verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
  let done = false;
  const stop = () => { try { if (qr.isScanning) qr.stop().catch(() => { }); } catch { } };
  S.onModalClose = stop;                         // closing the dialog always turns the camera off
  const finish = (text) => { if (done) return; done = true; stop(); S.onModalClose = null; closeModal(); if (navigator.vibrate) navigator.vibrate(80); onCode(String(text || "").trim()); };
  $("#qr-file").onchange = async () => {
    const f = $("#qr-file").files[0]; if (!f) return;
    $("#qr-msg").textContent = "กำลังอ่านบาร์โค้ดจากรูป…";
    try { if (qr.isScanning) await qr.stop(); finish(await qr.scanFile(f, false)); }
    catch { $("#qr-msg").textContent = "อ่านบาร์โค้ดจากรูปไม่ได้ — ถ่ายใหม่ให้ใกล้ ชัด และมีแสงพอ"; }
  };
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $("#qr-reader").style.display = "none";
    $("#qr-msg").innerHTML = "กล้องแบบสดใช้ได้เมื่อเปิดเว็บผ่าน <b>https://</b> (เช่น บน Render) — ตอนนี้ใช้ปุ่ม <b>ถ่ายรูป</b> ด้านล่างแทนได้ทันที";
    return;
  }
  try {
    await qr.start({ facingMode: "environment" },
      { fps: 12, qrbox: (w, h) => { const m = Math.min(w, h); return { width: Math.floor(Math.min(w * 0.9, m * 1.3)), height: Math.floor(m * 0.6) }; } },
      finish, () => { });
    if ($("#qr-msg")) $("#qr-msg").textContent = "เล็งกล้องไปที่ QR Code หรือบาร์โค้ด — ระบบอ่านให้อัตโนมัติ";
  } catch (e) {
    if (!$("#qr-msg")) return;
    $("#qr-reader").style.display = "none";
    $("#qr-msg").innerHTML = `เปิดกล้องไม่ได้ — กรุณา <b>อนุญาตการใช้กล้อง</b> ในเบราว์เซอร์ หรือใช้ปุ่ม <b>ถ่ายรูป</b> ด้านล่าง<br><span class="muted">(${esc(e && e.message ? e.message : e)})</span>`;
  }
}

/* ================= MACHINE PICKER (type to search) ================= */
const recentMachines = () => { try { return JSON.parse(localStorage.getItem("recentMachines") || "[]"); } catch { return []; } };
function machinePickerHTML(id) {
  return `<div class="combo" id="${id}"><input type="text" id="${id}-in" autocomplete="off" spellcheck="false"
    placeholder="พิมพ์บางส่วนของชื่อเครื่อง เช่น komatsu 800, gun a-01"><button type="button" class="combo-clear" id="${id}-x" title="ล้าง">✕</button>
    <div class="combo-list hidden" id="${id}-list" role="listbox"></div></div><div class="combo-hint" id="${id}-hint"></div>`;
}
function wireMachinePicker(id) {
  const inp = $(`#${id}-in`), list = $(`#${id}-list`), hint = $(`#${id}-hint`);
  const st = { sel: null, active: -1, shown: [] };
  const norm = t => (t || "").toLowerCase().replace(/\s+/g, " ").trim();
  const hl = (name, terms) => { let h = esc(name); terms.forEach(t => { if (t) h = h.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); }); return h; };
  const render = () => {
    const q = norm(inp.value), terms = q.split(" ").filter(Boolean);
    let rows;
    if (!terms.length) {
      const rec = recentMachines().map(n => S.machines.find(m => m.name === n)).filter(Boolean);
      rows = [...rec.map(m => ({ ...m, recent: true })), ...S.machines.filter(m => !rec.includes(m))];
    } else rows = S.machines.filter(m => terms.every(t => norm(m.name).includes(t)));
    st.shown = rows.slice(0, 60); st.active = st.shown.length ? 0 : -1;
    list.innerHTML = st.shown.length ? st.shown.map((m, i) => `<div class="combo-opt${i === 0 ? " active" : ""}" data-i="${i}" role="option">${m.recent ? '<span class="muted">⟲ </span>' : ""}${hl(m.name, terms)}</div>`).join("")
      + (rows.length > 60 ? `<div class="combo-more muted">…อีก ${rows.length - 60} เครื่อง — พิมพ์เพิ่มเพื่อกรอง</div>` : "")
      : `<div class="combo-more muted">ไม่พบเครื่องที่ตรงกับ “${esc(inp.value)}” — จะบันทึกตามที่พิมพ์</div>`;
    list.classList.remove("hidden");
  };
  const choose = (m) => {
    st.sel = m; inp.value = m.name; list.classList.add("hidden"); hint.textContent = "";
    const rec = [m.name, ...recentMachines().filter(n => n !== m.name)].slice(0, 6);
    localStorage.setItem("recentMachines", JSON.stringify(rec));
  };
  const setActive = (i) => { const opts = $$(".combo-opt", list); if (!opts.length) return; st.active = (i + opts.length) % opts.length; opts.forEach((o, k) => o.classList.toggle("active", k === st.active)); opts[st.active].scrollIntoView({ block: "nearest" }); };
  inp.onfocus = render;
  inp.oninput = () => { st.sel = null; render(); };
  inp.onkeydown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (list.classList.contains("hidden")) render(); else setActive(st.active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(st.active - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (st.shown[st.active]) choose(st.shown[st.active]); }
    else if (e.key === "Escape") list.classList.add("hidden");
  };
  list.onmousedown = (e) => { const o = e.target.closest(".combo-opt"); if (o) { e.preventDefault(); choose(st.shown[+o.dataset.i]); } };
  inp.onblur = () => setTimeout(() => {
    list.classList.add("hidden");
    if (!st.sel && inp.value.trim()) {
      const exact = S.machines.find(m => norm(m.name) === norm(inp.value));
      if (exact) choose(exact); else hint.textContent = "⚠ ไม่พบในรายการเครื่อง — ระบบจะบันทึกชื่อตามที่พิมพ์";
    } else if (!inp.value.trim()) hint.textContent = "";
  }, 150);
  $(`#${id}-x`).onclick = () => { st.sel = null; inp.value = ""; hint.textContent = ""; inp.focus(); };
  return { get: () => st.sel ? { id: st.sel.id, name: st.sel.name } : { id: null, name: inp.value.trim() }, clear: () => { st.sel = null; inp.value = ""; hint.textContent = ""; } };
}

/* ================= WITHDRAW ================= */
const cartItem = (it) => ({ id: it.id, code: it.item_code, d: it.part_name || (it.description || "").slice(0, 40), oh: it.on_hand, uom: it.uom, image_ver: it.image_ver || 0 });
VIEWS.withdraw = async () => {
  $("#content").innerHTML = `
    <p class="section-note">ค้นหาหรือสแกนอะไหล่ เพิ่มลงตะกร้า ระบุเครื่องและปัญหา แล้วยืนยัน — ระบบตัดสต็อกให้อัตโนมัติ</p>
    <div class="withdraw">
      <div>
        <div class="scanrow">
          <div class="searchbar" style="flex:1"><span class="ic">▦</span>
            <input id="w-scan" type="text" placeholder="ยิงบาร์โค้ด/QR ด้วยเครื่องสแกน" style="border-color:var(--brand)"></div>
          <button class="btn primary" id="w-cam" title="สแกนด้วยกล้องมือถือ">📷 สแกนด้วยกล้อง</button>
        </div>
        <div class="searchbar" style="margin:8px 0 12px"><span class="ic">⌕</span>
          <input id="w-q" type="search" placeholder="หรือพิมพ์บางส่วน เช่น 'valve', 'komatsu bearing', 'MSP0005'..."></div>
        <div class="panel results"><div class="table-wrap"><table id="w-tbl"></table></div></div>
      </div>
      <div class="cart panel">
        <h3>ตะกร้าเบิก <span id="cart-n" class="muted"></span></h3>
        <div id="cart-lines"></div>
        <div class="field" style="margin-top:14px"><label>เครื่องที่ซ่อม (Machine) — พิมพ์เพื่อค้นหา</label>${machinePickerHTML("w-mc")}</div>
        <div class="field" style="margin-top:10px"><label>ปัญหาที่พบ (Problem)</label><textarea id="w-problem" rows="2" placeholder="อาการ/สาเหตุที่ต้องเบิก"></textarea></div>
        <div class="field" style="margin-top:10px"><label>แนบรูป (ไม่บังคับ)</label><input id="w-photo" type="file" accept="image/*"></div>
        <button class="btn primary" id="w-confirm" style="width:100%;margin-top:16px" disabled>ยืนยันการเบิก & ตัดสต็อก</button>
      </div>
    </div>`;
  S.mpick = wireMachinePicker("w-mc");
  renderCart();
  const run = async () => {
    const q = encodeURIComponent($("#w-q").value.trim());
    const rows = q ? await api(`/items?q=${q}&limit=80`) : [];
    if (!$("#w-tbl")) return [];
    // keep cart stock figures current
    rows.forEach(r => { const c = S.cart.find(x => x.id === r.id); if (c) { c.oh = r.on_hand; c.image_ver = r.image_ver; } });
    renderCart();
    $("#w-tbl").innerHTML = rows.length ? `<thead><tr><th></th><th>รหัส</th><th>รายละเอียด</th><th class="num">คงเหลือ</th><th></th></tr></thead><tbody>${rows.map(it => `
      <tr><td class="thumb-cell">${thumbHTML(it)}</td><td class="code"><a href="#" data-view-item="${it.id}">${esc(it.item_code)}</a></td>
      <td><div>${esc(it.part_name || it.description.slice(0, 46))}</div><div class="muted" style="font-size:12px">${esc(it.machine_group)} ${it.brand ? "· " + esc(it.brand) : ""}${it.box ? " · 📍" + esc(it.box) + " " + esc(it.level || "") : ""}</div></td>
      <td class="num">${num(it.on_hand)} <span class="muted">${esc(it.uom)}</span></td>
      <td><button class="add-btn" data-add="${it.id}">+ เพิ่ม</button></td></tr>`).join("")}</tbody>`
      : `<tbody><tr><td class="muted" style="padding:24px;text-align:center">${$("#w-q").value ? "ไม่พบรายการ" : "พิมพ์หรือสแกนเพื่อค้นหาอะไหล่"}</td></tr></tbody>`;
    $$("#w-tbl [data-add]").forEach(b => b.onclick = () => addToCart(cartItem(rows.find(x => x.id == b.dataset.add))));
    return rows;
  };
  S.refreshWithdraw = run;
  let t; $("#w-q").oninput = () => { clearTimeout(t); t = setTimeout(run, 250); }; run();
  const handleCode = async (code) => {
    if (!code) return;
    try {
      const it = await api(`/items/by-code/${encodeURIComponent(code)}`);
      addToCart(cartItem(it)); toast(`เพิ่ม ${it.item_code} จากการสแกน`, "ok");
    } catch {
      // not our QR label (e.g. manufacturer barcode) -> search part number / description
      $("#w-q").value = code; const rows = await run();
      if (rows.length === 1) { addToCart(cartItem(rows[0])); toast(`เพิ่ม ${rows[0].item_code} (ตรงกับบาร์โค้ด ${code})`, "ok"); }
      else toast(rows.length ? `พบ ${rows.length} รายการที่ตรงกับ ${code} — เลือกจากรายการ` : `ไม่พบอะไหล่สำหรับ ${code}`, rows.length ? "" : "crit");
    }
  };
  const scan = $("#w-scan");
  if (!matchMedia("(pointer: coarse)").matches) scan.focus();      // don't pop the phone keyboard
  scan.onkeydown = (e) => { if (e.key !== "Enter") return; const code = scan.value.trim(); scan.value = ""; handleCode(code); };
  $("#w-cam").onclick = () => openScanner(handleCode);
  $("#w-confirm").onclick = submitReq;
};
function addToCart(it) {
  if (!it) return;
  const ex = S.cart.find(x => x.id === it.id);
  if (ex) { ex.qty = +(ex.qty + 1).toFixed(3); toast(`${it.code} ในตะกร้า: ${num(ex.qty)}`, ""); }
  else S.cart.push({ ...it, qty: 1 });
  renderCart();
}
function renderCart() {
  const box = $("#cart-lines"); if (!box) return;
  $("#cart-n").textContent = S.cart.length ? `(${S.cart.length})` : "";
  $("#w-confirm") && ($("#w-confirm").disabled = !S.cart.length);
  box.innerHTML = S.cart.length ? S.cart.map((l, i) => {
    const over = l.qty > l.oh;
    return `<div class="line">${thumbHTML({ id: l.id, image_ver: l.image_ver })}<div class="info"><div class="code">${esc(l.code)}</div>
      <div class="d muted" title="${esc(l.d)}">${esc(l.d)}</div>
      <div style="font-size:11.5px;font-family:var(--mono);${over ? "color:var(--crit)" : "color:var(--faint)"}">คงเหลือ ${num(l.oh)} ${esc(l.uom || "")}${over ? " · เกินสต็อก!" : ""}</div></div>
      <input type="number" min="0" step="any" inputmode="decimal" value="${l.qty}" data-i="${i}" style="${over ? "border-color:var(--crit)" : ""}"><button class="x" data-rm="${i}" title="ลบ">✕</button></div>`;
  }).join("")
    : `<div class="empty">ยังไม่มีรายการ<br>ค้นหา/สแกนแล้วกด “+ เพิ่ม”</div>`;
  $$("#cart-lines input").forEach(inp => inp.onchange = () => {
    const v = +inp.value;
    if (!(v > 0)) { toast("จำนวนต้องมากกว่า 0", "crit"); inp.value = S.cart[inp.dataset.i].qty; return; }
    S.cart[inp.dataset.i].qty = +v.toFixed(3); renderCart();
  });
  $$("#cart-lines [data-rm]").forEach(b => b.onclick = () => { S.cart.splice(+b.dataset.rm, 1); renderCart(); });
}
async function submitReq() {
  // apply a quantity that is still being typed (phone keyboards may not fire "change")
  $$("#cart-lines input").forEach(inp => { const v = +inp.value; if (v > 0) S.cart[inp.dataset.i].qty = +v.toFixed(3); });
  if (S.cart.some(l => !(l.qty > 0))) return toast("จำนวนต้องมากกว่า 0 ทุกรายการ", "crit");
  const mc = S.mpick ? S.mpick.get() : { id: null, name: "" };
  if (!mc.name && !confirm("ยังไม่ได้ระบุเครื่องที่ซ่อม — ยืนยันการเบิกต่อหรือไม่?")) return;
  const payload = { machine_id: mc.id, machine_name: mc.name, problem: $("#w-problem").value, lines: S.cart.map(l => ({ item_id: l.id, qty: l.qty })) };
  const btn = $("#w-confirm"); btn.disabled = true; const label = btn.textContent; btn.textContent = "กำลังบันทึก…";
  try {
    const r = await api("/requisitions", { json: payload });
    const file = $("#w-photo").files[0];
    if (file) { try { await uploadReqPhoto(r.id, file); } catch (e) { toast("แนบรูปไม่สำเร็จ: " + e.message, "crit"); } }
    const res = await api(`/requisitions/${r.id}/confirm`, { method: "POST" });
    S.cart = []; renderCart();
    if (S.mpick) S.mpick.clear(); $("#w-problem").value = ""; $("#w-photo").value = "";
    toast(`เบิกสำเร็จ ${res.ref_no} — ตัดสต็อกแล้ว`, "ok");
    if (S.refreshWithdraw) S.refreshWithdraw();                     // show the NEW on-hand right away
    countModal(r.id, res.ref_no);
  } catch (e) { toast("ผิดพลาด: " + e.message, "crit"); }
  finally { btn.textContent = label; btn.disabled = !S.cart.length; }
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
  if (stale("requisitions")) return;
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
    if (!$("#rq-tbl")) return;
    const totalLines = rows.reduce((a, r) => a + r.lines.length, 0);
    const techName = $("#rq-tech").selectedOptions[0]?.text?.replace(/\s*\(\d+\)$/, "") || "";
    $("#rq-sum").textContent = $("#rq-tech").value ? `▸ ช่าง ${techName}: ${rows.length} ใบเบิก · ${totalLines} รายการ` : (rows.length ? `▸ รวม ${rows.length} ใบเบิก · ${totalLines} รายการ` : "");
    $("#rq-tbl").innerHTML = `<thead><tr><th>เลขที่</th><th>วันที่</th><th>ผู้เบิก</th><th>เครื่อง</th><th>รายการ</th><th>ช่องทาง</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.map(r => `
      <tr><td class="code">${esc(r.ref_no)}</td><td class="muted">${fmtDateTime(r.created_at)}</td>
      <td>${esc(r.requester)}</td><td class="muted">${esc(r.machine)}</td><td class="num">${r.lines.length}</td>
      <td class="muted">${r.source === "line" ? "LINE" : "เว็บ"}</td><td><span class="tag ${r.status}">${r.status}</span>${r.has_return ? ' <span class="tag returned">มีการคืน</span>' : ""}${r.remark ? `<span class="return-note">${esc(r.remark)}</span>` : ""}</td>
      <td><button class="btn sm" data-req='${r.id}'>ดู</button></td></tr>`).join("") || `<tr><td colspan="8" class="muted" style="padding:24px;text-align:center">ไม่มีรายการในช่วงนี้</td></tr>`}</tbody>`;
    $$("#rq-tbl [data-req]").forEach(b => b.onclick = () => reqDetail(rows.find(x => x.id == b.dataset.req)));
  };
  $("#rq-go").onclick = run; $("#rq-mine").onchange = run; $("#rq-tech").onchange = run; wireDate("rq-from"); wireDate("rq-to"); run();
};
function reqDetail(r) {
  const canRecon = can("leader"), isAdmin = can("admin");
  const confirmed = ["confirmed", "reconciled"].includes(r.status);
  modal(`ใบเบิก ${esc(r.ref_no)}`,
    `<div class="row" style="margin-bottom:6px"><div><b>ผู้เบิก:</b> ${esc(r.requester)}</div><div><b>เครื่อง:</b> ${esc(r.machine) || "-"}</div></div>
     <div style="margin-bottom:6px"><b>วันที่:</b> ${fmtDateTime(r.created_at)}</div>
     <div style="margin-bottom:12px"><b>ปัญหา:</b> ${esc(r.problem) || "-"}</div>
     ${r.photo ? `<img src="/api/requisitions/${r.id}/photo" style="max-width:100%;border-radius:8px;margin-bottom:12px" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'muted',textContent:'(ไม่พบไฟล์รูปแนบ — รูปจากเวอร์ชันเก่าบนเว็บอาจถูกลบไปแล้ว)'}))">` : ""}
     <div class="table-wrap"><table><thead><tr><th>รหัส</th><th class="num">เบิก</th><th class="num">คืนแล้ว</th><th class="num">ระบบเหลือ</th><th class="num">นับจริง</th><th class="num">ส่วนต่าง</th>${canRecon && confirmed ? "<th></th>" : ""}</tr></thead><tbody>
     ${r.lines.map(l => `<tr><td class="code"><span style="display:inline-flex;gap:8px;align-items:center">${thumbHTML({ id: l.item_id, image_ver: l.image_ver })}${esc(l.item_code)}</span></td><td class="num">${num(l.qty)}</td>
       <td class="num">${l.returned_qty ? `<b style="color:var(--high)">${num(l.returned_qty)}</b>` : "-"}</td><td class="num">${num(l.system_after)}</td>
       <td class="num">${l.counted_qty == null ? (canRecon ? `<input type="number" data-cl="${l.line_id}" style="width:80px">` : "-") : num(l.counted_qty)}</td>
       <td class="num">${l.variance == null ? "" : `<span class="${l.variance === 0 ? "var-ok" : "var-bad"}">${l.variance > 0 ? "+" : ""}${num(l.variance)}</span>`}</td>
       ${canRecon && confirmed ? `<td>${(l.qty - (l.returned_qty || 0)) > 0 ? `<button class="btn sm" data-ret="${l.line_id}">↩ คืน</button>` : '<span class="muted">คืนครบ</span>'}</td>` : ""}</tr>`).join("")}
     </tbody></table></div>
     ${r.returns && r.returns.length ? `<div class="panel" style="padding:10px 12px;margin-top:12px;background:var(--high-soft);border-color:#f0d2b8">
        <b>หมายเหตุการคืน</b>${r.returns.map(x => `<div style="font-size:13px;margin-top:4px">↩ ${esc(x.item_code)} ×${num(x.qty)} — ${esc(x.reason)} <span class="muted">(${esc(x.by)} · ${fmtDateTime(x.at)})</span></div>`).join("")}</div>` : ""}`,
    `${isAdmin ? '<button class="btn danger" id="req-del" style="margin-right:auto">ลบใบเบิก</button>' : ""}<button class="btn" data-close>ปิด</button>${canRecon ? '<button class="btn primary" id="save-recon">บันทึกการตรวจนับ</button>' : ""}`);
  if (canRecon) $("#save-recon").onclick = async () => {
    for (const inp of $$("#modal-root input[data-cl]")) if (inp.value !== "") await api("/requisitions/count", { json: { line_id: +inp.dataset.cl, counted_qty: +inp.value } });
    closeModal(); toast("บันทึกการตรวจนับแล้ว", "ok"); go("requisitions", true);
  };
  $$("#modal-root [data-ret]").forEach(b => b.onclick = () => returnModal(r, r.lines.find(l => l.line_id == b.dataset.ret), () => go(location.hash.replace("#", "") || "requisitions", true)));
  if (isAdmin) $("#req-del").onclick = () => confirmTyped(`ลบใบเบิก ${esc(r.ref_no)}`,
    `<p>ใช้สำหรับลบใบเบิกที่ <b>ทดสอบระบบ</b> หรือบันทึกผิด</p>
     <ul style="margin:6px 0 0 18px"><li>ระบบจะ <b>คืนยอดสต็อก</b> ที่ใบนี้ตัดไป (หักส่วนที่คืนแล้ว) ให้อัตโนมัติ</li>
     <li>ลบประวัติการเคลื่อนไหวและหมายเหตุการคืนของใบนี้</li><li>ย้อนกลับไม่ได้</li></ul>`,
    async () => { const res = await api(`/requisitions/${r.id}`, { method: "DELETE" }); closeModal(); toast(`ลบ ${res.ref_no} แล้ว · คืนสต็อก: ${res.restored.join(", ") || "-"}`, "ok"); go("requisitions", true); }, "ลบใบเบิก");
}

function returnModal(req, line, onDone) {
  if (!line) return;
  const max = +(line.qty - (line.returned_qty || 0)).toFixed(3);
  modal(`คืนอะไหล่ · ${esc(req.ref_no)}`,
    `<div class="kv" style="margin-bottom:12px"><div>อะไหล่</div><div><b>${esc(line.item_code)}</b> ${esc((line.description || "").slice(0, 50))}</div>
       <div>ผู้เบิก</div><div>${esc(req.requester)}</div><div>เบิกไป</div><div>${num(line.qty)} (คืนแล้ว ${num(line.returned_qty || 0)})</div></div>
     <div class="row"><div class="field"><label>จำนวนที่คืน (สูงสุด ${num(max)})</label><input type="number" id="rt-qty" min="0" max="${max}" step="any" value="${max}"></div></div>
     <div class="field" style="margin-top:10px"><label>เหตุผลการคืน (จำเป็น)</label>
       <select id="rt-preset"><option value="">— เลือกเหตุผล หรือพิมพ์เอง —</option><option>เบิกผิดรุ่น/ผิดเบอร์</option><option>เบิกเกินจำนวนที่ใช้จริง</option><option>ไม่ได้ใช้งาน (งานซ่อมยกเลิก)</option><option>อะไหล่ชำรุด/ไม่ตรงสเปก</option></select>
       <textarea id="rt-reason" rows="2" style="margin-top:6px" placeholder="รายละเอียดเพิ่มเติม"></textarea></div>
     <p class="section-note" style="margin-top:10px">ระบบจะเพิ่มยอดคงเหลือกลับเข้าคลัง และแสดงหมายเหตุการคืนในใบเบิกนี้</p>`,
    `<button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="rt-save">ยืนยันการคืน</button>`);
  $("#rt-preset").onchange = () => { if ($("#rt-preset").value && !$("#rt-reason").value.trim()) $("#rt-reason").value = $("#rt-preset").value; };
  $("#rt-save").onclick = async () => {
    const qty = +$("#rt-qty").value, reason = $("#rt-reason").value.trim() || $("#rt-preset").value;
    if (!(qty > 0) || qty > max + 1e-9) return toast(`จำนวนคืนต้องอยู่ระหว่าง 0 – ${num(max)}`, "crit");
    if (!reason) return toast("กรุณาระบุเหตุผลการคืน", "crit");
    try { const r = await api("/returns", { json: { line_id: line.line_id, qty, reason } }); closeModal(); toast(`คืน ${line.item_code} ×${num(qty)} แล้ว · คงเหลือ ${num(r.on_hand)}`, "ok"); onDone && onDone(); }
    catch (e) { toast(e.message, "crit"); }
  };
}

/* ================= REORDER ================= */
/* ================= RECEIVE ================= */
VIEWS.receive = async () => {
  $("#content").innerHTML = `
    <p class="section-note">ค้นหาอะไหล่ที่รับเข้า ใส่จำนวนแล้วกด รับเข้า — ${can("admin") ? "ถ้าเป็นอะไหล่ใหม่ที่ยังไม่มีในระบบ กด <b>+ เพิ่มอะไหล่ใหม่</b> ก่อน" : "ถ้าเป็นอะไหล่ใหม่ที่ยังไม่มีในระบบ แจ้งแอดมินให้เพิ่มก่อน"}</p>
    <div class="toolbar">
      <div class="field" style="flex:1;min-width:220px"><label>ค้นหาอะไหล่ (บางส่วนก็ได้)</label>
        <div class="searchbar"><span class="ic">⌕</span><input id="rc-q" type="search" placeholder="รหัส / ชื่อ / เบอร์อะไหล่ / ยี่ห้อ"></div></div>
      <div class="field" style="min-width:200px"><label>เลขที่เอกสาร / หมายเหตุ (ไม่บังคับ)</label><input type="text" id="rc-ref" placeholder="เช่น เลข Invoice / ผู้ขาย"></div>
      ${can("admin") ? '<button class="btn primary" id="rc-new" style="align-self:flex-end">+ เพิ่มอะไหล่ใหม่</button>' : ""}
    </div>
    <div class="panel"><div class="table-wrap"><table id="rc-tbl"></table></div></div>`;
  const run = async (focusId) => {
    const q = encodeURIComponent($("#rc-q").value.trim());
    if (!q) { $("#rc-tbl").innerHTML = '<tbody><tr><td class="muted" style="padding:22px;text-align:center">พิมพ์เพื่อค้นหาอะไหล่ที่จะรับเข้า</td></tr></tbody>'; return; }
    const rows = await api(`/items?q=${q}&limit=40`);
    if (!$("#rc-tbl")) return;
    $("#rc-tbl").innerHTML = rows.length ? `<thead><tr><th></th><th>รหัส</th><th>รายละเอียด</th><th class="num">คงเหลือ</th><th>จำนวนรับ</th><th></th></tr></thead><tbody>${rows.map(it => `<tr>
      <td class="thumb-cell">${thumbHTML(it)}</td><td class="code"><a href="#" data-view-item="${it.id}">${esc(it.item_code)}</a></td><td>${esc(it.part_name || it.description.slice(0, 40))}<div class="muted" style="font-size:12px">${esc(it.brand || "")}</div></td>
      <td class="num">${num(it.on_hand)} <span class="muted">${esc(it.uom)}</span></td>
      <td><input type="number" min="0" step="any" inputmode="decimal" placeholder="จำนวน" id="rcq-${it.id}" style="width:100px"></td>
      <td><button class="btn sm primary" data-rc="${it.id}">รับเข้า</button></td></tr>`).join("")}</tbody>`
      : `<tbody><tr><td class="muted" style="padding:22px;text-align:center">ไม่พบ “${esc($("#rc-q").value)}” ในระบบ${can("admin") ? ` — <a href="#" id="rc-create">+ สร้างเป็นอะไหล่ใหม่</a>` : " — แจ้งแอดมินให้เพิ่มอะไหล่ใหม่"}</td></tr></tbody>`;
    if ($("#rc-create")) $("#rc-create").onclick = (e) => { e.preventDefault(); newPart($("#rc-q").value.trim()); };
    $$("#rc-tbl [data-rc]").forEach(b => {
      const inp = $(`#rcq-${b.dataset.rc}`);
      const doIt = async () => {
        const qty = +inp.value;
        if (!(qty > 0)) { toast("ใส่จำนวนที่รับเข้า (มากกว่า 0)", "crit"); inp.focus(); return; }
        b.disabled = true;
        try {
          const r = await api("/receive", { json: { item_id: +b.dataset.rc, qty, ref: $("#rc-ref").value.trim(), note: $("#rc-ref").value.trim() } });
          toast(`รับเข้าแล้ว · คงเหลือ ${num(r.on_hand)}`, "ok"); run();
        } catch (e) { toast(e.message, "crit"); b.disabled = false; }
      };
      b.onclick = doIt; inp.onkeydown = (e) => { if (e.key === "Enter") doIt(); };
    });
    if (focusId && $(`#rcq-${focusId}`)) $(`#rcq-${focusId}`).focus();
  };
  const newPart = (code) => itemEditModal(null, (created) => {
    if (!created) return;
    $("#rc-q").value = created.item_code; run(created.id);
    toast(`สร้าง ${created.item_code} แล้ว — ใส่จำนวนที่รับเข้าได้เลย`, "ok");
  }, { item_code: code || "", receiving: true });
  if ($("#rc-new")) $("#rc-new").onclick = () => newPart($("#rc-q").value.trim());
  let t; $("#rc-q").oninput = () => { clearTimeout(t); t = setTimeout(() => run(), 250); }; run();
};

/* ================= EXPORT ================= */
VIEWS.export = async () => {
  const techs = await api("/requesters").catch(() => []);
  if (stale("export")) return;
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
    if (!$("#ex-out")) return;
    last = d;
    $("#ex-out").innerHTML = `
      <div class="kpis">
        <div class="kpi panel"><div class="l">จำนวนใบเบิก</div><div class="n">${num(d.requisitions)}</div><div class="foot">REQUISITIONS</div></div>
        <div class="kpi panel"><div class="l">รายการอะไหล่</div><div class="n">${num(d.items)}</div><div class="foot">ITEMS</div></div>
        <div class="kpi panel"><div class="l">มูลค่ารวม</div><div class="n" title="฿${num(d.total_value)}">฿${compact(d.total_value)}</div><div class="foot">TOTAL</div></div>
      </div>
      <div class="panel" id="ex-table"><div style="max-height:56vh;overflow:auto"><table>
        <thead><tr><th>รหัส</th><th>รายละเอียด</th><th class="num">เบิก</th><th class="num">คืน</th><th class="num">สุทธิ</th><th>หน่วย</th><th class="num">ราคา/หน่วย</th><th class="num">มูลค่า</th><th>เครื่องที่ใช้</th></tr></thead>
        <tbody>${d.rows.map(x => `<tr><td class="code">${esc(x.item_code)}</td><td>${esc(x.description)}</td>
          <td class="num">${num(x.gross ?? x.qty)}</td><td class="num">${x.returned ? `<span style="color:var(--high)">${num(x.returned)}</span>` : "-"}</td><td class="num"><b>${num(x.qty)}</b></td><td class="muted">${esc(x.uom)}</td><td class="num">฿${num(x.unit_price)}</td>
          <td class="num">฿${num(x.amount)}</td><td class="muted">${esc(x.machines)}</td></tr>`).join("") || '<tr><td colspan="9" class="muted" style="text-align:center;padding:20px">ไม่มีการเบิกในช่วงนี้</td></tr>'}</tbody>
      </table></div></div>`;
  };
  $("#ex-show").onclick = show; $("#ex-tech").onchange = () => { if (last) show(); };
  wireDate("ex-from"); wireDate("ex-to");
  $("#ex-csv").onclick = () => { const { f, t } = range(); if (f && t) downloadAuthed(`/api/export/oracle?date_from=${f}&date_to=${t}${techQ()}`, `oracle_${f}.csv`); };
  $("#ex-xlsx").onclick = () => { const { f, t } = range(); if (f && t) downloadAuthed(`/api/export/oracle.xlsx?date_from=${f}&date_to=${t}${techQ()}`, `oracle_${f}.xlsx`); };
  $("#ex-print").onclick = () => {
    if (!last) return toast("กด “แสดงสรุป” ก่อน", "crit");
    const w = printSink();
    w.document.write(`<html><head><title>สรุปการเบิก</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:6px;font-size:13px;text-align:left}th{background:#eee}.num{text-align:right}</style></head><body>
      <h2>สรุปการเบิก ${esc($("#ex-from-txt").value)} - ${esc($("#ex-to-txt").value)}</h2>
      <p>ใบเบิก ${last.requisitions} · รายการ ${last.items} · มูลค่ารวม ฿${num(last.total_value)}</p>
      <table><thead><tr><th>รหัส</th><th>รายละเอียด</th><th class="num">เบิก</th><th class="num">คืน</th><th class="num">สุทธิ</th><th>หน่วย</th><th class="num">ราคา/หน่วย</th><th class="num">มูลค่า</th><th>เครื่อง</th></tr></thead>
      <tbody>${last.rows.map(x => `<tr><td>${esc(x.item_code)}</td><td>${esc(x.description)}</td><td class="num">${num(x.gross ?? x.qty)}</td><td class="num">${num(x.returned || 0)}</td><td class="num">${num(x.qty)}</td><td>${esc(x.uom)}</td><td class="num">${num(x.unit_price)}</td><td class="num">${num(x.amount)}</td><td>${esc(x.machines)}</td></tr>`).join("")}</tbody></table></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };
  show();
};

/* ================= USERS (admin) ================= */
const ROLE_TH = { admin: "ผู้ดูแลระบบ", leader: "หัวหน้า", engineer: "ช่าง/วิศวกร", viewer: "ดูอย่างเดียว" };
VIEWS.users = async () => {
  const rows = await api("/users");
  if (stale("users")) return;
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
  if (stale("reorder")) return;
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
  if (stale("po")) return;
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
  const w = printSink();
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
  try {
    const r = await fetch(url, { headers: { Authorization: "Bearer " + S.token } });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return toast("ดาวน์โหลดไม่สำเร็จ: " + (e.detail || r.status), "crit"); }
    const blob = await r.blob(); const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("ดาวน์โหลด " + filename, "ok");
  } catch (e) { toast("ดาวน์โหลดไม่สำเร็จ: " + e.message, "crit"); }
}

/* ---------- printing: hidden in-page frame (no pop-up, never blank) ---------- */
function printHTML(html) {
  const old = document.getElementById("print-frame"); if (old) old.remove();
  const f = document.createElement("iframe");
  f.id = "print-frame"; f.className = "print-frame"; f.setAttribute("aria-hidden", "true");
  document.body.appendChild(f);
  const doc = f.contentWindow.document;
  const head = `<base href="${location.origin}/"><link rel="stylesheet" href="/vendor/fonts.css">
    <style>*{font-family:"IBM Plex Sans Thai","Chakra Petch",sans-serif}body{padding:14px;color:#111}
    h2{margin:0 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px 6px;font-size:12px;text-align:left}
    th{background:#eee}.num{text-align:right}.printed{font-size:11px;color:#555;margin-bottom:8px}@page{size:A4;margin:12mm}</style>`;
  let body = html;
  if (/<head>/i.test(body)) body = body.replace(/<head>/i, "<head>" + head);
  else body = `<html><head>${head}</head><body>${body}</body></html>`;
  body = body.replace(/<body>/i, `<body><div class="printed">พิมพ์เมื่อ ${fmtDateTime(new Date())} · ${esc(S.user?.name || "")}</div>`);
  doc.open(); doc.write(body); doc.close();
  const go = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast("พิมพ์ไม่สำเร็จ: " + e.message, "crit"); } setTimeout(() => f.remove(), 60000); };
  const ready = f.contentWindow.document.fonts ? f.contentWindow.document.fonts.ready : Promise.resolve();
  Promise.race([ready, new Promise(r => setTimeout(r, 1500))]).then(() => setTimeout(go, 150));
}
// drop-in replacement for window.open("") + document.write(...) + print()
function printSink() {
  let html = "";
  return { document: { write: (t) => { html += t; }, close: () => printHTML(html) }, print() { }, focus() { } };
}

/* ---------- confirm dialog that requires typing a phrase (destructive actions) ---------- */
const CONFIRM_PHRASE = "ยืนยันล้างข้อมูล";
function confirmTyped(title, messageHTML, onConfirm, btnLabel = "ยืนยัน") {
  modal(`⚠️ ${title}`, `${messageHTML}
    <div class="field" style="margin-top:14px"><label>พิมพ์คำว่า <b>${CONFIRM_PHRASE}</b> เพื่อยืนยัน</label>
    <input type="text" id="ct-input" autocomplete="off" placeholder="${CONFIRM_PHRASE}"></div>`,
    `<button class="btn" data-close>ยกเลิก</button><button class="btn danger" id="ct-ok" disabled>${btnLabel}</button>`);
  const inp = $("#ct-input"), ok = $("#ct-ok");
  inp.oninput = () => ok.disabled = inp.value.trim() !== CONFIRM_PHRASE;
  inp.focus();
  ok.onclick = async () => { ok.disabled = true; ok.textContent = "กำลังดำเนินการ…"; try { await onConfirm(inp.value.trim()); } catch (e) { toast(e.message, "crit"); ok.disabled = false; ok.textContent = btnLabel; } };
}

/* ================= AUDIT ================= */
VIEWS.audit = async () => {
  const rows = await api("/audit?limit=300");
  if (stale("audit")) return;
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
  if (stale("optimize")) return;
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


/* ================= RETURNS (leader/admin) ================= */
VIEWS.returns = async () => {
  const techs = await api("/requesters").catch(() => []);
  if (stale("returns")) return;
  const from = new Date(Date.now() - 30 * 864e5);
  $("#content").innerHTML = `
    <p class="section-note">คืนอะไหล่ที่ช่างเบิกผิด/เบิกเกิน กลับเข้าคลัง พร้อมบันทึกเหตุผล — ใบเบิกนั้นจะมีหมายเหตุการคืนกำกับไว้</p>
    <div class="toolbar">
      <div class="field" style="flex:1;min-width:200px"><label>ค้นหาเลขที่ใบเบิก / รหัสอะไหล่</label><input type="search" id="rt-q" placeholder="เช่น REQ2026..., MSP0005..."></div>
      <div class="field"><label>ช่างผู้เบิก</label><select id="rt-tech"><option value="">ทุกคน</option>${techs.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div>
      <div class="field"><label>ตั้งแต่วันที่</label>${dateFieldHTML("rt-from", fmtDate(from))}</div>
      <div class="field"><label>ถึงวันที่</label>${dateFieldHTML("rt-to", todayDmy())}</div>
      <button class="btn primary" id="rt-go" style="align-self:flex-end">ค้นหา</button>
    </div>
    <div class="panel"><div class="table-wrap" style="max-height:48vh;overflow:auto"><table id="rt-tbl"></table></div></div>
    <h3 style="margin:22px 0 8px">ประวัติการคืนล่าสุด</h3>
    <div class="panel"><div class="table-wrap" style="max-height:36vh;overflow:auto"><table id="rt-hist"></table></div></div>`;
  wireDate("rt-from"); wireDate("rt-to");
  const hist = async () => {
    const h = await api("/returns?limit=100");
    if (!$("#rt-hist")) return;
    $("#rt-hist").innerHTML = `<thead><tr><th>วันที่คืน</th><th>ใบเบิก</th><th>รหัส</th><th class="num">จำนวน</th><th>เหตุผล</th><th>ผู้เบิก</th><th>ผู้ทำรายการคืน</th></tr></thead><tbody>${h.map(x => `<tr>
      <td class="muted">${fmtDateTime(x.at)}</td><td class="code">${esc(x.ref_no)}</td><td class="code">${esc(x.item_code)}</td><td class="num">${num(x.qty)}</td>
      <td>${esc(x.reason)}</td><td>${esc(x.requester)}</td><td class="muted">${esc(x.by)}</td></tr>`).join("") || '<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">ยังไม่มีการคืน</td></tr>'}</tbody>`;
  };
  const run = async () => {
    const p = new URLSearchParams();
    if (dateISO("rt-from")) p.set("date_from", dateISO("rt-from"));
    if (dateISO("rt-to")) p.set("date_to", dateISO("rt-to"));
    if ($("#rt-tech").value) p.set("requester_id", $("#rt-tech").value);
    let rows = await api("/requisitions?" + p.toString());
    if (!$("#rt-tbl")) return;
    const q = $("#rt-q").value.trim().toLowerCase();
    rows = rows.filter(r => ["confirmed", "reconciled"].includes(r.status));
    if (q) rows = rows.filter(r => r.ref_no.toLowerCase().includes(q) || r.lines.some(l => (l.item_code + " " + l.description).toLowerCase().includes(q)));
    const flat = rows.flatMap(r => r.lines.map(l => ({ r, l })));
    $("#rt-tbl").innerHTML = `<thead><tr><th>ใบเบิก</th><th>วันที่</th><th>ผู้เบิก</th><th>รหัส</th><th>รายละเอียด</th><th class="num">เบิก</th><th class="num">คืนแล้ว</th><th></th></tr></thead><tbody>${flat.map(({ r, l }) => `<tr>
      <td class="code">${esc(r.ref_no)}</td><td class="muted">${fmtDateTime(r.created_at)}</td><td>${esc(r.requester)}</td>
      <td class="code">${esc(l.item_code)}</td><td>${esc((l.description || "").slice(0, 40))}</td><td class="num">${num(l.qty)}</td>
      <td class="num">${l.returned_qty ? `<b style="color:var(--high)">${num(l.returned_qty)}</b>` : "-"}</td>
      <td>${(l.qty - (l.returned_qty || 0)) > 0 ? `<button class="btn sm primary" data-rr="${r.id}" data-rl="${l.line_id}">↩ คืน</button>` : '<span class="muted">คืนครบ</span>'}</td></tr>`).join("") || '<tr><td colspan="8" class="muted" style="text-align:center;padding:18px">ไม่พบรายการเบิกในช่วงนี้</td></tr>'}</tbody>`;
    $$("#rt-tbl [data-rr]").forEach(b => b.onclick = () => {
      const r = rows.find(x => x.id == b.dataset.rr);
      returnModal(r, r.lines.find(l => l.line_id == b.dataset.rl), () => { run(); hist(); });
    });
  };
  $("#rt-go").onclick = run; $("#rt-tech").onchange = run;
  let t; $("#rt-q").oninput = () => { clearTimeout(t); t = setTimeout(run, 300); };
  run(); hist();
};

/* ================= ADMIN TOOLS ================= */
const fmtBytes = (b) => b == null ? "-" : b > 1e9 ? (b / 1e9).toFixed(2) + " GB" : b > 1e6 ? (b / 1e6).toFixed(2) + " MB" : (b / 1e3).toFixed(0) + " KB";
VIEWS.admintools = async () => {
  const sys = await api("/admin/system");
  if (stale("admintools")) return;
  const TN = { item: "อะไหล่", machine: "เครื่องจักร", requisition: "ใบเบิก", reqline: "รายการเบิก", return_log: "รายการคืน", stocktxn: "ความเคลื่อนไหวสต็อก", purchase_order: "ใบสั่งซื้อ", user: "ผู้ใช้", audit_log: "บันทึกการใช้งาน" };
  $("#content").innerHTML = `
    ${sys.weak_password_users.length ? `<div class="panel danger-zone" style="padding:12px 16px;margin-bottom:14px">🔒 <b>ความปลอดภัย:</b> บัญชีต่อไปนี้ยังใช้รหัสผ่านเริ่มต้น — <b>${sys.weak_password_users.map(esc).join(", ")}</b> · เปลี่ยนรหัสหรือปิดใช้งานได้ที่เมนู <a href="#users" onclick="go('users');return false">ผู้ใช้งาน</a></div>` : ""}
    <div class="admin-grid">
      <div class="panel"><h3>ข้อมูลระบบ</h3><div class="kv">
        <div>ฐานข้อมูล</div><div>${esc(sys.db_type)}</div>
        <div>ขนาดฐานข้อมูล</div><div>${fmtBytes(sys.db_size)}</div>
        <div>เวลาเซิร์ฟเวอร์</div><div>${esc(sys.server_time)} (${esc(sys.timezone)})</div>
        <div>ทำงานต่อเนื่อง</div><div>${num(sys.uptime_min)} นาที</div>
        <div>Python</div><div>${esc(sys.python)}</div>
        <div>Optimization</div><div>${sys.solvers.minizinc ? "MiniZinc ✓" : "MiniZinc ✗"} · ${sys.solvers.pulp ? "PuLP ✓" : "PuLP ✗"}</div>
        ${sys.disk ? `<div>พื้นที่ดิสก์ว่าง</div><div>${sys.disk.free_gb} / ${sys.disk.total_gb} GB</div>` : ""}
      </div>
      <h3 style="margin-top:16px">จำนวนข้อมูล</h3><div class="kv">${Object.entries(sys.counts).map(([k, v]) => `<div>${TN[k] || k}</div><div>${num(v)}</div>`).join("")}</div></div>

      <div class="panel"><h3>สำรองข้อมูล (Backup)</h3>
        <p class="section-note">ดาวน์โหลดเก็บไว้เป็นประจำ (แนะนำทุกสัปดาห์) — ไฟล์ Excel เก็บข้อมูล<b>ทุกตาราง</b> และใช้กู้คืนได้</p>
        <button class="btn primary" id="ad-bk-xlsx" style="width:100%">⤓ ดาวน์โหลดสำรองทั้งหมด (Excel)</button>
        ${sys.is_sqlite ? '<button class="btn" id="ad-bk-db" style="width:100%;margin-top:8px">⤓ ดาวน์โหลดไฟล์ฐานข้อมูล (.db)</button>' : '<p class="section-note" style="margin-top:8px">ฐานข้อมูลออนไลน์ (PostgreSQL) ใช้ไฟล์สำรองแบบ Excel</p>'}
        <h3 style="margin-top:18px">กู้คืนข้อมูล (Restore)</h3>
        <p class="section-note">อัปโหลดไฟล์สำรอง Excel ที่ดาวน์โหลดจากหน้านี้ — ข้อมูลปัจจุบัน<b>ทั้งหมด</b>จะถูกแทนที่</p>
        <input type="file" id="ad-rs-file" accept=".xlsx"><button class="btn" id="ad-rs-go" style="width:100%;margin-top:8px">กู้คืนจากไฟล์สำรอง</button>
        ${sys.server_backups.length ? `<h3 style="margin-top:18px">สำรองอัตโนมัติบนเซิร์ฟเวอร์</h3><div style="font-size:13px">${sys.server_backups.map(b => `<div>${esc(b.name)} <span class="muted">· ${fmtBytes(b.size)} · ${esc(b.at)}</span></div>`).join("")}</div>` : ""}
      </div>
    </div>

    <div class="panel" style="padding:18px;margin-top:14px"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <h3 style="margin:0">ตรวจสอบคุณภาพข้อมูล (Data Health Check)</h3><div style="flex:1"></div>
      <button class="btn primary" id="ad-health">🔍 ตรวจสอบตอนนี้</button></div>
      <p class="section-note" style="margin-top:6px">ตรวจหาข้อมูลซ้ำ ช่องว่างเกิน หน่วยนับไม่สม่ำเสมอ ยอดติดลบ ข้อมูลไม่ครบ และบัญชีที่ไม่ปลอดภัย พร้อมปุ่มแก้ไขอัตโนมัติ</p>
      <div id="ad-health-out"></div></div>

    <div class="panel danger-zone" style="padding:18px;margin-top:14px">
      <h3 style="margin:0 0 6px;color:var(--crit)">⚠️ พื้นที่อันตราย — ล้าง/รีเซ็ตข้อมูล</h3>
      <p class="section-note">ทุกปุ่มจะถามยืนยัน 2 ครั้ง และระบบบันทึกสำเนาสำรองก่อนดำเนินการ · <b>แนะนำให้ดาวน์โหลดสำรองก่อนทุกครั้ง</b> · บัญชีผู้ใช้และการตั้งค่าจะไม่ถูกลบ</p>
      <div class="admin-grid">
        <div class="panel"><h3>1) ลบข้อมูลทดสอบ (ธุรกรรม)</h3><p class="section-note">ลบใบเบิก การคืน ใบสั่งซื้อ และความเคลื่อนไหวสต็อกทั้งหมด แล้ว<b>คืนยอดคงเหลือกลับเป็นยอดเริ่มต้น</b> (ตอนนำเข้า/สร้าง) — ข้อมูลอะไหล่และการแก้ไขอะไหล่ยังอยู่</p><button class="btn danger" data-reset="transactions">ลบข้อมูลทดสอบ</button></div>
        <div class="panel"><h3>2) รีเซ็ตกลับเป็นข้อมูลตั้งต้น</h3><p class="section-note">ล้างอะไหล่/เครื่อง/ธุรกรรมทั้งหมด แล้ว<b>นำเข้าข้อมูลตัวอย่าง AHR ใหม่</b>จากโฟลเดอร์ source — ทุกค่ากลับเหมือนวันแรก</p><button class="btn danger" data-reset="factory">รีเซ็ตเป็นข้อมูลตั้งต้น</button></div>
        <div class="panel"><h3>3) ล้างข้อมูลทั้งหมด</h3><p class="section-note">ลบอะไหล่ เครื่อง และธุรกรรมทั้งหมด เหลือระบบว่าง — ใช้ก่อนนำเข้าข้อมูลจริงชุดใหม่ผ่านเมนูนำเข้าข้อมูล</p><button class="btn danger" data-reset="empty">ล้างข้อมูลทั้งหมด</button></div>
        <div class="panel"><h3>4) ล้างบันทึกการใช้งาน</h3><p class="section-note">ลบประวัติใน Audit log ทั้งหมด (ระบบจะบันทึกว่ามีการล้าง)</p><button class="btn danger" data-reset="audit">ล้างบันทึกการใช้งาน</button></div>
      </div></div>`;

  $("#ad-bk-xlsx").onclick = () => downloadAuthed("/api/admin/backup.xlsx", `AHR_backup_${todayDmy().split("/").reverse().join("")}.xlsx`);
  if ($("#ad-bk-db")) $("#ad-bk-db").onclick = () => downloadAuthed("/api/admin/backup.db", `AHR_inventory_${todayDmy().split("/").reverse().join("")}.db`);
  $("#ad-rs-go").onclick = () => {
    const f = $("#ad-rs-file").files[0];
    if (!f) return toast("เลือกไฟล์สำรอง (.xlsx) ก่อน", "crit");
    stepOneConfirm("กู้คืนข้อมูลจากไฟล์สำรอง", `<p>ไฟล์: <b>${esc(f.name)}</b></p><p>ข้อมูลปัจจุบัน<b>ทั้งหมด</b> (รวมบัญชีผู้ใช้) จะถูกแทนที่ด้วยข้อมูลในไฟล์สำรอง</p>`, () =>
      confirmTyped("ยืนยันการกู้คืนข้อมูล", "<p>ขั้นตอนนี้ย้อนกลับไม่ได้ (ระบบเก็บสำเนาก่อนกู้คืนไว้บนเซิร์ฟเวอร์)</p>", async (phrase) => {
        const fd = new FormData(); fd.append("file", f); fd.append("confirm_text", phrase);
        const r = await fetch("/api/admin/restore", { method: "POST", headers: { Authorization: "Bearer " + S.token }, body: fd });
        const d = await r.json(); if (!r.ok) throw new Error(d.detail || "กู้คืนไม่สำเร็จ");
        closeModal(); toast(`กู้คืนสำเร็จ: อะไหล่ ${num(d.restored.item || 0)} รายการ`, "ok");
        setTimeout(() => location.reload(), 1200);
      }, "กู้คืนข้อมูล"));
  };
  const RESET = {
    transactions: ["ลบข้อมูลทดสอบ (ธุรกรรม)", "<p>ลบใบเบิก/การคืน/ใบสั่งซื้อ/ความเคลื่อนไหวทั้งหมด และคืนยอดคงเหลือทุกรายการกลับเป็นยอดเริ่มต้น</p>"],
    factory: ["รีเซ็ตกลับเป็นข้อมูลตั้งต้น", "<p>ข้อมูลอะไหล่ เครื่อง และธุรกรรมทั้งหมดจะถูกลบ แล้วโหลดข้อมูลตัวอย่างชุดเดิมใหม่</p>"],
    empty: ["ล้างข้อมูลทั้งหมด", "<p>ข้อมูลอะไหล่ เครื่อง และธุรกรรมทั้งหมดจะถูกลบ ระบบจะว่างเปล่า</p>"],
    audit: ["ล้างบันทึกการใช้งาน", "<p>ประวัติการใช้งานทั้งหมดใน Audit log จะถูกลบ</p>"],
  };
  $$("#content [data-reset]").forEach(b => b.onclick = () => {
    const mode = b.dataset.reset, [title, msg] = RESET[mode];
    stepOneConfirm(title, msg + `<p class="muted">บัญชีผู้ใช้และการตั้งค่าแจ้งเตือนจะยังอยู่</p>`, () =>
      confirmTyped(title, "<p><b>ยืนยันอีกครั้ง</b> — การลบนี้ย้อนกลับไม่ได้</p>", async (phrase) => {
        const r = mode === "audit" ? await api("/admin/clear-audit", { json: { mode: "audit", confirm_text: phrase } })
          : await api("/admin/reset", { json: { mode, confirm_text: phrase } });
        closeModal(); toast(`${title} — เสร็จเรียบร้อย`, "ok");
        refreshReorderBadge(); S.machines = await api("/machines").catch(() => []); go("admintools", true);
      }, title));
  });
  $("#ad-health").onclick = async () => {
    $("#ad-health-out").innerHTML = '<div class="muted">กำลังตรวจสอบ…</div>';
    const h = await api("/admin/health");
    if (!$("#ad-health-out")) return;
    const SEV = { error: ["critical", "ต้องแก้ไข"], warn: ["watch", "ควรตรวจสอบ"], info: ["confirmed", "ข้อมูล"] };
    const found = h.checks.filter(c => c.count), clean = h.checks.filter(c => !c.count);
    $("#ad-health-out").innerHTML = `<div style="margin:10px 0">ตรวจ ${num(h.checked_items)} รายการ · <span class="tag critical">ต้องแก้ไข ${h.summary.error}</span> <span class="tag watch">ควรตรวจสอบ ${h.summary.warn}</span> <span class="tag confirmed">ข้อมูล ${h.summary.info}</span></div>
      ${found.map(c => `<div class="health-row"><div class="sev"><span class="tag ${SEV[c.severity][0]}">${SEV[c.severity][1]}</span></div>
        <div class="body"><b>${esc(c.title)}</b> — ${num(c.count)} รายการ${c.hint ? `<div class="muted" style="font-size:12px">${esc(c.hint)}</div>` : ""}
        <div class="samples">${c.samples.map(x => esc(x.text)).join(" · ")}${c.count > c.samples.length ? " …" : ""}</div></div>
        ${c.fix ? `<button class="btn sm primary" data-fix="${c.fix}">แก้ไขอัตโนมัติ</button>` : ""}</div>`).join("")}
      <div class="muted" style="font-size:13px;margin-top:10px">✓ ผ่าน: ${clean.map(c => esc(c.title)).join(" · ") || "-"}</div>`;
    $$("#ad-health-out [data-fix]").forEach(b => b.onclick = () => {
      const labels = { trim_whitespace: "ตัดช่องว่างเกินในข้อความ", normalize_uom: "ปรับหน่วยนับให้เป็นมาตรฐานเดียว", fill_uom: "ใส่หน่วยนับ Pcs ให้รายการที่ว่าง", fix_negative_stock: "ปรับยอดติดลบเป็น 0 (บันทึกลง ledger)", merge_machines: "รวมชื่อเครื่องที่ซ้ำเป็นชื่อเดียว" };
      modal("แก้ไขข้อมูลอัตโนมัติ", `<p>${esc(labels[b.dataset.fix] || b.dataset.fix)} ?</p><p class="muted">แนะนำให้ดาวน์โหลดสำรองข้อมูลก่อน</p>`,
        `<button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="fx-ok">ดำเนินการ</button>`);
      $("#fx-ok").onclick = async () => { try { const r = await api("/admin/cleanup", { json: { action: b.dataset.fix } }); closeModal(); toast(`แก้ไขแล้ว ${num(r.fixed)} รายการ`, "ok"); $("#ad-health").click(); } catch (e) { toast(e.message, "crit"); } };
    });
  };
};
// first of the two confirmations: explain + offer a backup download
function stepOneConfirm(title, messageHTML, next) {
  modal(`⚠️ ${title}`, messageHTML + `<div class="panel" style="padding:10px 12px;margin-top:12px;background:var(--watch-soft)">💾 แนะนำ: ดาวน์โหลดสำรองข้อมูลก่อนดำเนินการ<br><button class="btn sm" id="s1-bk" style="margin-top:8px">⤓ ดาวน์โหลดสำรอง (Excel)</button></div>`,
    `<button class="btn" data-close>ยกเลิก</button><button class="btn danger" id="s1-next">ดำเนินการต่อ →</button>`);
  $("#s1-bk").onclick = () => downloadAuthed("/api/admin/backup.xlsx", `AHR_backup_${todayDmy().split("/").reverse().join("")}.xlsx`);
  $("#s1-next").onclick = () => next();
}

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
fetch("/api/config").then(r => r.json()).then(c => { if (c.timezone) S.tz = c.timezone; }).catch(() => { })
  .finally(() => { if (S.token) boot().catch(() => logout()); });
