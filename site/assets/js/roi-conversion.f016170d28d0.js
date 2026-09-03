(function () {
  'use strict';
  var KEY = 'tllsh_roi_attribution_v1';
  function getState() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function setState(v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function cleanReferrer(v) { if (!v) return ''; try { var u = new URL(v); return u.origin + u.pathname; } catch (e) { return ''; } }
  function classify(ref, us, um) {
    if (us) return us + (um ? ' / ' + um : '');
    if (!ref) return '(direct) / (none)';
    try {
      var h = new URL(ref).hostname.toLowerCase();
      if (/(^|\.)google\./.test(h)) return 'google / organic';
      if (/(^|\.)bing\.com$/.test(h)) return 'bing / organic';
      if (/(^|\.)duckduckgo\.com$/.test(h)) return 'duckduckgo / organic';
      if (/(^|\.)search\.yahoo\.com$/.test(h)) return 'yahoo / organic';
      if (/(^|\.)facebook\.com$/.test(h) || h === 'fb.com') return 'facebook / referral';
      if (/(^|\.)instagram\.com$/.test(h)) return 'instagram / referral';
      if (/(^|\.)youtube\.com$/.test(h)) return 'youtube / referral';
      return h + ' / referral';
    } catch (e) { return 'referral'; }
  }
  var first = getState();
  if (!first || !first.first_page) {
    var q = new URLSearchParams(location.search);
    first = {
      first_page: location.pathname || '/', referrer: cleanReferrer(document.referrer),
      utm_source: q.get('utm_source') || '', utm_medium: q.get('utm_medium') || '',
      utm_campaign: q.get('utm_campaign') || '', utm_content: q.get('utm_content') || '',
      utm_term: q.get('utm_term') || ''
    };
    first.source = classify(first.referrer, first.utm_source, first.utm_medium);
    setState(first);
  }
  function hidden(form, name, value) {
    var el = form.querySelector('input[name="' + name + '"]');
    if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.name = name; form.appendChild(el); }
    el.value = value || '';
  }
  function context(form) {
    var groups = {};
    form.querySelectorAll('[data-context-label]').forEach(function (el) {
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      var value = (el.value || '').trim(); if (!value) return;
      var label = el.getAttribute('data-context-label') || el.name || 'Context';
      if (!groups[label]) groups[label] = [];
      if (groups[label].indexOf(value) === -1) groups[label].push(value);
    });
    return Object.keys(groups).map(function (k) { return k + ': ' + groups[k].join(', '); }).join('\n');
  }
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches('form.lead-form')) return;
    hidden(form, 'attribution_first_page', first.first_page || '');
    hidden(form, 'attribution_form_page', location.pathname || '');
    hidden(form, 'attribution_source', first.source || '');
    hidden(form, 'attribution_referrer', first.referrer || '');
    hidden(form, 'utm_source', first.utm_source || ''); hidden(form, 'utm_medium', first.utm_medium || '');
    hidden(form, 'utm_campaign', first.utm_campaign || ''); hidden(form, 'utm_content', first.utm_content || '');
    hidden(form, 'utm_term', first.utm_term || ''); hidden(form, 'roi_context', context(form));
  }, true);
  document.addEventListener('click', function (event) {
    var el = event.target && event.target.closest ? event.target.closest('[data-roi-cta]') : null;
    if (!el) return;
    if (typeof window.gtag === 'function') window.gtag('event', 'roi_cta_click', {cta_id: el.getAttribute('data-roi-cta') || 'unknown', page_path: location.pathname || '/'});
  });
})();
