/* Bun Bun Manager - shared cloud sync (Supabase REST + polling).
   Demo-grade: every device that opens the site sees the same data and the same audit log.
   Settings live in sync-config.js. Leave url/key empty there to switch sync off. */
(function () {
  "use strict";
  var C = window.BB_SYNC || {};
  var BASE = String(C.url || "").replace(/\/+$/, ""), KEY = String(C.key || "");
  if (!BASE || !KEY) { window.BBSync = null; return; }

  var ROW = "main", POLL = 4000, LS_META = "bb_sync_meta", LS_DIRTY = "bb_sync_dirty";
  var ver = null, base = null, dirty = false, busy = false, timer = null, started = false, pending = false;
  var q = [], inflight = [], evBusy = false, evT = null, lastLogId = null;
  var status = "connecting", statusMsg = "", lastOk = "";

  var same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
  var hhmm = function () { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };

  /* ---------- tiny REST helper (publishable key goes in the apikey header only) ---------- */
  function api(path, o) {
    o = o || {};
    var h = Object.assign({ apikey: KEY, "Content-Type": "application/json" }, o.headers || {});
    return fetch(BASE + "/rest/v1/" + path, { method: o.method || "GET", headers: h, body: o.body, keepalive: !!o.keepalive, cache: "no-store" });
  }
  async function ok(r) {
    if (r.ok) return r;
    var t = ""; try { t = await r.text(); } catch (e) {}
    var e = new Error(r.status + " " + t.slice(0, 160)); e.status = r.status; throw e;
  }

  /* ---------- status badge ---------- */
  function pill() {
    var el = document.getElementById("bbsync");
    if (!el) {
      el = document.createElement("div"); el.id = "bbsync";
      el.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:60;padding:6px 12px;border-radius:999px;font:600 12px system-ui,sans-serif;background:rgba(29,26,24,.9);color:#fff;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25);opacity:.92";
      el.onclick = function () { syncNow(); };
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }
  function label(s) {
    return { connecting: "☁ Connecting…", saving: "☁ Saving…", ok: "☁ Synced" + (lastOk ? " " + lastOk : ""), offline: "⚠ Offline – will retry", error: "⚠ Sync problem" }[s] || s;
  }
  function setStatus(s, m) {
    status = s; statusMsg = m || "";
    var el = pill(); el.textContent = label(s);
    el.style.background = (s === "offline" || s === "error") ? "#b3261e" : "rgba(29,26,24,.9)";
    el.title = m || "Click to sync now";
  }
  function fail(e) {
    var st = e && e.status;
    if (!st) return setStatus("offline", "No connection to Supabase. Changes are kept on this device and will upload when it is back.");
    if (st === 404) return setStatus("error", "Supabase tables not found. Run supabase-setup.sql in the Supabase SQL Editor.");
    if (st === 401 || st === 403) return setStatus("error", "Supabase refused access. Check the key in sync-config.js and run supabase-setup.sql.");
    setStatus("error", String(e.message || e));
  }

  /* ---------- local bookkeeping ---------- */
  function saveMeta() { try { localStorage.setItem(LS_META, JSON.stringify({ ver: ver, base: base })); } catch (e) {} }
  function setDirty(v) { dirty = v; try { if (v) localStorage.setItem(LS_DIRTY, "1"); else localStorage.removeItem(LS_DIRTY); } catch (e) {} }
  function strip() { var o = {}; Object.keys(S).forEach(function (k) { if (k !== "log") o[k] = S[k]; }); return JSON.parse(JSON.stringify(o)); }

  function redraw() {
    var a = document.activeElement, typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    var busyUI = document.querySelector(".modal") || typing || (U && pg === "pos" && cart && cart.length);
    if (busyUI) { pending = true; return; }
    pending = false;
    try { draw(); } catch (e) { console.error(e); }
  }
  function applyState(data) {
    var lg = S.log || [], uid = U && U.id;
    S = Object.assign({}, data, { log: lg });
    try { mig(); } catch (e) {}
    if (U) U = (S.users || []).find(function (x) { return x.id == uid; }) || null;
    try { localStorage.setItem("bb2", JSON.stringify(S)); } catch (e) {}
    redraw();
  }
  function adopt(row) {
    applyState(row.data); ver = row.updated_at; base = JSON.stringify(row.data); saveMeta(); setDirty(false);
  }

  /* ---------- three-way merge: what changed on this device vs what changed in the cloud ---------- */
  function idOf(x) {
    if (x && typeof x === "object") { if (x.id != null) return "i:" + x.id; if (x.d != null && x.at != null) return "d:" + x.d; }
    return null;
  }
  function mergeArr(b, l, r) {
    var allId = function (a) { return a.every(function (x) { return idOf(x) !== null; }); };
    if (!allId(l) || !allId(r)) return same(l, b) ? r : l;
    var bm = new Map(b.map(function (x) { return [idOf(x), x]; })),
        lm = new Map(l.map(function (x) { return [idOf(x), x]; })),
        rm = new Map(r.map(function (x) { return [idOf(x), x]; })),
        keys = [], seen = {}, out = [];
    r.concat(l).forEach(function (x) { var k = idOf(x); if (!seen[k]) { seen[k] = 1; keys.push(k); } });
    keys.forEach(function (k) {
      var bi = bm.get(k), li = lm.get(k), ri = rm.get(k);
      if (li && ri) out.push(same(li, bi) ? ri : li);              // both exist: a local edit wins, else take cloud
      else if (li) { if (!bi || !same(li, bi)) out.push(li); }     // added locally, or edited locally but deleted in cloud
      else if (ri) { if (!bi || !same(ri, bi)) out.push(ri); }     // added in cloud, or edited in cloud but deleted locally
    });
    return out;
  }
  function merge3(b, l, r) {
    b = b || {}; var out = {}, keys = {};
    Object.keys(l).concat(Object.keys(r)).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var bv = b[k], lv = l[k], rv = r[k], v;
      if (k === "seq") v = Math.max(+lv || 0, +rv || 0);
      else if (Array.isArray(lv) && Array.isArray(rv)) v = mergeArr(Array.isArray(bv) ? bv : [], lv, rv);
      else if (lv && rv && typeof lv === "object" && typeof rv === "object" && !Array.isArray(lv) && !Array.isArray(rv)) {
        v = {}; var kk = {};
        Object.keys(lv).concat(Object.keys(rv)).forEach(function (x) { kk[x] = 1; });
        Object.keys(kk).forEach(function (x) {
          var bb = (bv && typeof bv === "object") ? bv[x] : undefined, p = same(lv[x], bb) ? rv[x] : lv[x];
          if (p !== undefined) v[x] = p;
        });
      } else v = same(lv, bv) ? rv : lv;
      if (v !== undefined) out[k] = v;
    });
    /* two devices may have issued the same order number: renumber the one created on this device */
    if (Array.isArray(out.orders) && Array.isArray(r.orders)) {
      var rid = {}, rno = {};
      r.orders.forEach(function (o) { rid[o.id] = 1; rno[o.no] = 1; });
      out.seq = Math.max(+out.seq || 1, 1 + Math.max.apply(null, [0].concat(out.orders.map(function (o) { return +o.no || 0; }))));
      out.orders.forEach(function (o) { if (!rid[o.id] && rno[o.no]) { o.no = out.seq++; } });
    }
    return out;
  }
  function mergeRemote(row) {
    if (!base) return adopt(row);                       // never synced before: just take the cloud copy
    var m = merge3(JSON.parse(base), strip(), row.data);
    applyState(m); ver = row.updated_at; base = JSON.stringify(row.data); saveMeta();
  }

  /* ---------- saving to the cloud ---------- */
  async function fetchRow() {
    var r = await ok(await api("app_state?id=eq." + ROW + "&select=data,updated_at")), a = await r.json();
    return a[0] || null;
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(function () { timer = null; flush(); }, ms); }
  async function flush() {
    if (busy) return;
    busy = true;
    try {
      for (var tries = 0; tries < 6; tries++) {
        setDirty(false);
        var data = strip(), snap = JSON.stringify(data), now = new Date().toISOString(), res, r;
        var body = JSON.stringify({ data: data, updated_at: now, updated_by: DEV });
        if (ver === null) {
          r = await api("app_state", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ id: ROW, data: data, updated_at: now, updated_by: DEV }) });
          if (r.status === 409) { var row = await fetchRow(); if (row) { mergeRemote(row); setDirty(true); continue; } }
          await ok(r); res = await r.json();
        } else {
          r = await api("app_state?id=eq." + ROW + "&updated_at=eq." + encodeURIComponent(ver), { method: "PATCH", headers: { Prefer: "return=representation" }, body: body });
          await ok(r); res = await r.json();
          if (!res.length) {                                   // someone else saved first: merge and try again
            var row2 = await fetchRow();
            if (!row2) { ver = null; setDirty(true); continue; }
            mergeRemote(row2); setDirty(true); continue;
          }
        }
        ver = res[0].updated_at; base = snap; saveMeta(); lastOk = hhmm();
        if (!dirty) break;                                     // more edits arrived while saving: loop once more
      }
      if (!dirty) setStatus("ok"); else schedule(300);
    } catch (e) {
      setDirty(true); fail(e); schedule(8000);
    } finally { busy = false; }
  }
  function push() {
    setDirty(true);
    if (busy) return;
    schedule(700);
    if (status !== "offline" && status !== "error") setStatus("saving");
  }

  /* ---------- shared audit log ---------- */
  function event(type, text, data) {
    q.push({
      device: DEV, username: (typeof U !== "undefined" && U) ? U.name : "", role: (typeof U !== "undefined" && U) ? U.role : "",
      type: type, what: String(text || "").slice(0, 300), details: data ? JSON.stringify(data).slice(0, 1800) : "",
      page: typeof pg === "string" ? pg : "", _t: Date.now()
    });
    if (q.length > 300) q.shift();
    clearTimeout(evT); evT = setTimeout(sendEvents, 800);
  }
  async function sendEvents() {
    if (evBusy || !q.length) return;
    evBusy = true; inflight = q.splice(0, 50);
    try {
      var rows = inflight.map(function (e) { var c = Object.assign({}, e); delete c._t; return c; });
      await ok(await api("audit_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows), keepalive: true }));
      inflight = []; lastLogId = -1;
    } catch (e) { q = inflight.concat(q); inflight = []; clearTimeout(evT); evT = setTimeout(sendEvents, 8000); }
    finally { evBusy = false; if (q.length && !evT) evT = setTimeout(sendEvents, 800); }
  }
  async function loadLog(id) {
    var r = await ok(await api("audit_log?type=eq.action&select=id,created_at,username,what&order=id.desc&limit=1500"));
    var rows = (await r.json()).reverse().map(function (x) { return { t: new Date(x.created_at).getTime(), u: x.username || "-", a: x.what }; });
    var pend = inflight.concat(q).filter(function (e) { return e.type === "action"; }).map(function (e) { return { t: e._t, u: e.username || "-", a: e.what }; });
    S.log = rows.concat(pend); lastLogId = id;
    if (pg === "aud" || pg === "rpt") redraw();
  }
  async function pollLog() {
    var r = await ok(await api("audit_log?select=id&order=id.desc&limit=1")), a = await r.json();
    var id = a.length ? a[0].id : 0;
    if (id !== lastLogId) await loadLog(id);
  }

  /* ---------- polling: pick up changes made on other devices ---------- */
  async function poll(force) {
    if (!started || busy || (document.hidden && !force)) return;
    try {
      var r = await ok(await api("app_state?id=eq." + ROW + "&select=updated_at")), a = await r.json();
      if (!a.length) { ver = null; setDirty(true); schedule(0); }
      else if (a[0].updated_at !== ver) {
        var row = await fetchRow();
        if (busy) return;
        if (row) {
          if (dirty || timer) { mergeRemote(row); setDirty(true); schedule(300); }
          else adopt(row);
        }
      } else if (dirty && !timer) schedule(0);
      await pollLog();
      if (!dirty && !busy) { lastOk = hhmm(); setStatus("ok"); }
      if (pending) redraw();
    } catch (e) { fail(e); }
  }
  async function syncNow() {
    if (!started) return;
    if (dirty || timer) { clearTimeout(timer); timer = null; await flush(); }
    await poll(true);
    if (typeof toast === "function") toast(status === "ok" ? "Synced ☁" : "Sync problem – see the cloud badge");
  }

  /* ---------- manual overrides ---------- */
  async function forceUp() {
    if (!confirm("Replace the shared cloud data with THIS browser's data? Every other device will switch to it.")) return;
    try {
      var data = strip(), now = new Date().toISOString(), row = await fetchRow(), r;
      var body = JSON.stringify(row ? { data: data, updated_at: now, updated_by: DEV } : { id: ROW, data: data, updated_at: now, updated_by: DEV });
      r = await api(row ? "app_state?id=eq." + ROW : "app_state", { method: row ? "PATCH" : "POST", headers: { Prefer: "return=representation" }, body: body });
      await ok(r); var res = await r.json();
      ver = res[0].updated_at; base = JSON.stringify(data); saveMeta(); setDirty(false); lastOk = hhmm(); setStatus("ok");
      if (typeof toast === "function") toast("Cloud now uses this browser's data ✅");
    } catch (e) { fail(e); }
  }
  async function forceDown() {
    if (!confirm("Replace this browser's data with the shared cloud copy?")) return;
    try {
      var row = await fetchRow();
      if (!row) return typeof toast === "function" && toast("The cloud is empty");
      adopt(row); lastOk = hhmm(); setStatus("ok");
      if (typeof toast === "function") toast("This browser now matches the cloud ✅");
    } catch (e) { fail(e); }
  }

  /* ---------- start ---------- */
  async function init() {
    setStatus("connecting");
    try {
      var meta = JSON.parse(localStorage.getItem(LS_META) || "null");
      if (meta) { ver = meta.ver || null; base = meta.base || null; }
      dirty = localStorage.getItem(LS_DIRTY) === "1";
    } catch (e) {}
    try {
      var row = await fetchRow();
      if (!row) { ver = null; base = null; setDirty(true); await flush(); }                 // cloud empty: this browser seeds it
      else if (base && dirty) { mergeRemote(row); setDirty(true); await flush(); }            // had unsent edits: merge, then upload
      else adopt(row);                                                                       // normal case: take the cloud copy
      await pollLog();
      if (status !== "error" && status !== "offline") { lastOk = hhmm(); setStatus("ok"); }
    } catch (e) { fail(e); }
    started = true;
    setInterval(poll, POLL);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
    addEventListener("online", function () { poll(true); });
    document.addEventListener("focusout", function () { if (pending) setTimeout(redraw, 300); });
    addEventListener("pagehide", function () { if (q.length) sendEvents(); });
  }

  /* ---------- settings card ---------- */
  function card() {
    return '<div class="card" data-sec="cloud"><h3>☁ Cloud sync</h3><p class="hint">Orders, menu, stock, customers and the audit log are shared by every device that opens this site. Status: <b>'
      + esc(label(status)) + '</b>' + (lastOk ? ' · last sync ' + esc(lastOk) : '') + '. This device: ' + esc(DEV) + '.</p>'
      + (statusMsg ? '<p class="hint tiny">' + esc(statusMsg) + '</p>' : '')
      + '<div class="row"><button class="p" onclick="BBSync.syncNow()">Sync now</button>'
      + '<button onclick="BBSync.forceUp()">Use this browser\'s data for everyone</button>'
      + '<button onclick="BBSync.forceDown()">Replace this browser with cloud data</button></div></div>';
  }
  if (typeof P === "object" && P.set) { var _ps = P.set; P.set = function () { return _ps.apply(this, arguments) + card(); }; }

  window.BBSync = { push: push, event: event, syncNow: syncNow, forceUp: forceUp, forceDown: forceDown };
  init();
})();
