/* Alphabet Sparklab v2 — self-host this file; no secret/API key required. */
(function () {
 'use strict';
 var pages = ['/request-quotation.html', '/project-start.html', '/facade-care.html'];
 if (location.origin !== 'https://www.alphabetfacade.com' || pages.indexOf(location.pathname) < 0 || window.AlphabetTracking) return;
 var script = document.currentScript;
 var cmp = script && script.dataset.consent === 'cmp';
 var endpoint = 'https://hvrclmycmpgmnpwyzznw.supabase.co/functions/v1/website-tracking';
 var deniedByBrowser = navigator.globalPrivacyControl === true;
 var choice = deniedByBrowser ? false : null;
 var ticket, busy = false, again = false, sent = false, banner;
 function read(name) { var part = document.cookie.split('; ').find(function (x) { return x.indexOf(name + '=') === 0; }); return part ? part.slice(name.length + 1) : ''; }
 function cookie(name, value, age) { document.cookie = name + '=' + value + '; Path=/; Max-Age=' + age + '; Secure; SameSite=Lax'; }
 var visitor = read('alphabet_visitor_v2');
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitor)) visitor = crypto.randomUUID();
 cookie('alphabet_visitor_v2', visitor, 34560000);
 var visit = crypto.randomUUID();
 function post(body) { return fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', keepalive: true }).then(function (r) { if (!r.ok) throw Error('Tracking request failed: ' + r.status); return r.json(); }); }
 function pixel(c) {
  if (choice !== true || deniedByBrowser || sent) return;
  sent = true;
  if (!window.fbq) {
   var q = window.fbq = function () { q.callMethod ? q.callMethod.apply(q, arguments) : q.queue.push(arguments); };
   if (!window._fbq) window._fbq = q;
   q.push = q; q.loaded = true; q.version = '2.0'; q.queue = [];
   var s = document.createElement('script'); s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.appendChild(s);
  }
  window.fbq('consent', 'grant');
  // Dev must remove any duplicate init for this same Pixel from the existing page/GTM.
  window.fbq('init', c.pixel_id);
  window.fbq('trackSingleCustom', c.pixel_id, c.event_name, {}, { eventID: c.event_id });
  var count = 0, timer = setInterval(function () {
   if (choice !== true || ++count > 100) { clearInterval(timer); return; }
   if (typeof window.fbq.callMethod === 'function') { clearInterval(timer); post({ action: 'browser-dispatched', ticket: ticket }).catch(function () {}); }
  }, 100);
 }
 async function sync() {
  if (!ticket || choice === null) return;
  if (busy) { again = true; return; }
  busy = true;
  try { var r = await post({ action: 'consent', ticket: ticket, granted: choice }); if (r.dispatch) pixel(r); }
  catch (e) { console.warn('[Alphabet Tracking]', e.message); }
  finally { busy = false; if (again) { again = false; sync(); } }
 }
 function setConsent(granted) {
  choice = granted === true && !deniedByBrowser;
  if (!cmp) cookie('alphabet_marketing_v1', choice ? 'yes' : 'no', 15552000);
  if (!choice && window.fbq) window.fbq('consent', 'revoke');
  if (banner) { banner.remove(); banner = null; }
  sync();
 }
 function showConsent() {
  if (cmp || deniedByBrowser || banner) return;
  banner = document.createElement('section'); banner.setAttribute('aria-label', 'ความยินยอมการตลาด'); banner.setAttribute('role', 'region');
  banner.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:2147483647;max-width:620px;margin:auto;padding:20px;background:white;color:#172f29;border:1px solid #cad8d2;border-radius:12px;box-shadow:0 6px 32px #0003;font:15px/1.7 system-ui';
  var p = document.createElement('p'); p.textContent = 'เว็บไซต์บันทึกการเข้าชมด้วยรหัสเบราว์เซอร์เพื่อคัดซ้ำ คุณยินยอมให้ส่งเหตุการณ์และรหัสเบราว์เซอร์ให้ Meta ผ่าน Pixel และ CAPI เพื่อวัดผลโฆษณาหรือไม่? ปฏิเสธได้โดยยังใช้งานเว็บไซต์ตามปกติ'; banner.appendChild(p);
  [['ยินยอม', true], ['ไม่ยินยอม', false]].forEach(function (item) { var b = document.createElement('button'); b.type = 'button'; b.textContent = item[0]; b.style.cssText = 'padding:10px 20px;margin:4px;border:1px solid #145c50;border-radius:8px;background:white;color:#145c50;font:inherit;cursor:pointer'; b.onclick = function () { setConsent(item[1]); }; banner.appendChild(b); });
  document.body.appendChild(banner);
 }
 window.AlphabetTracking = { setMarketingConsent: setConsent, openConsent: showConsent };
 if (!cmp && !deniedByBrowser) { var saved = read('alphabet_marketing_v1'); if (saved === 'yes') choice = true; if (saved === 'no') choice = false; }
 // CMP integration can set a known initial state before this deferred script runs.
 if (cmp && typeof window.alphabetMarketingConsent === 'boolean') choice = window.alphabetMarketingConsent && !deniedByBrowser;
 window.addEventListener('alphabet:marketing-consent', function (e) { setConsent(e.detail === true); });
 if (choice === null && !cmp) { if (document.body) showConsent(); else document.addEventListener('DOMContentLoaded', showConsent, { once: true }); }
 async function record() {
  for (var attempt = 0; attempt < 3; attempt++) {
   try { var r = await post({ action: 'visit', id: visit, visitor: visitor, page: location.origin + location.pathname }); ticket = r.ticket; await sync(); return; }
   catch (e) { if (attempt === 2) console.warn('[Alphabet Tracking]', e.message); else await new Promise(function (resolve) { setTimeout(resolve, 1000 * (attempt + 1)); }); }
  }
 }
 record();
})();
