(function () {
 'use strict';
 var pages = ['/request-quotation.html', '/project-start.html', '/facade-care.html'];
 if (location.origin !== 'https://www.alphabetfacade.com' || pages.indexOf(location.pathname) < 0 || window.AlphabetTracking) return;
 var script = document.currentScript;
 var cookieWow = !!document.querySelector('script[src*="cookiecdn.com/"]');
 var cmp = cookieWow || (script && script.dataset.consent === 'cmp');
 var endpoint = 'https://hvrclmycmpgmnpwyzznw.supabase.co/functions/v1/website-tracking';
 var deniedByBrowser = navigator.globalPrivacyControl === true;
 var choice = deniedByBrowser ? false : (cmp ? null : true);
 var explicitConsent = false;
 var ticket, busy = false, again = false, sent = false;
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
  if (explicitConsent) window.fbq('consent', 'grant');
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
  try { var r = await post({ action: choice && !explicitConsent ? 'automatic' : 'consent', ticket: ticket, granted: choice }); if (r.dispatch) pixel(r); }
  catch (e) { console.warn('[Alphabet Tracking]', e.message); }
  finally { busy = false; if (again) { again = false; sync(); } }
 }
 function setConsent(granted) {
  explicitConsent = granted === true;
  choice = granted === true && !deniedByBrowser;
  if (!cmp) cookie('alphabet_marketing_v1', choice ? 'yes' : 'no', 15552000);
  if (!choice && window.fbq) window.fbq('consent', 'revoke');
  sync();
 }
 window.AlphabetTracking = { setMarketingConsent: setConsent, optOut: function () { setConsent(false); } };
 if (!cmp && !deniedByBrowser) { var saved = read('alphabet_marketing_v1'); if (saved === 'yes') { choice = true; explicitConsent = true; } if (saved === 'no') choice = false; }
 if (typeof window.alphabetMarketingConsent === 'boolean') { explicitConsent = window.alphabetMarketingConsent; choice = explicitConsent && !deniedByBrowser; }
 if (cookieWow) {
  choice = deniedByBrowser ? false : null;
  explicitConsent = false;
  var previousCookieWowWrapper = window.cwcCookieWrapper;
  var lastCookieWowChoice;
  function readCookieWow() {
   if (typeof window.cwcIsUserAccept !== 'function') return;
   var granted;
   try { granted = window.cwcIsUserAccept('marketing'); } catch (e) { return; }
   if (typeof granted !== 'boolean' || granted === lastCookieWowChoice) return;
   lastCookieWowChoice = granted;
   setConsent(granted);
  }
  window.cwcCookieWrapper = function () {
   try { if (typeof previousCookieWowWrapper === 'function') previousCookieWowWrapper.apply(this, arguments); }
   finally { readCookieWow(); }
  };
  function addPreferenceControl() {
   var button = document.createElement('button');
   button.type = 'button';
   button.textContent = 'ตั้งค่าคุกกี้';
   button.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:9999;padding:8px 12px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#333;font:12px sans-serif;cursor:pointer';
   button.onclick = function () { if (window.cwcCookieBanner && typeof window.cwcCookieBanner.openPreference === 'function') window.cwcCookieBanner.openPreference(); };
   document.body.appendChild(button);
  }
  if (document.body) addPreferenceControl();
  else window.addEventListener('DOMContentLoaded', addPreferenceControl, { once: true });
  readCookieWow();
  setInterval(readCookieWow, 1000);
 }
 window.addEventListener('alphabet:marketing-consent', function (e) { setConsent(e.detail === true); });
 async function record() {
  for (var attempt = 0; attempt < 3; attempt++) {
   try { var r = await post({ action: 'visit', id: visit, visitor: visitor, page: location.origin + location.pathname }); ticket = r.ticket; await sync(); return; }
   catch (e) { if (attempt === 2) console.warn('[Alphabet Tracking]', e.message); else await new Promise(function (resolve) { setTimeout(resolve, 1000 * (attempt + 1)); }); }
  }
 }
 record();
})();
