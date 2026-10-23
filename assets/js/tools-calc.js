/* SevaSphere: calculators and quick utilities */
(function () {
  'use strict';
  var CSC = window.CSC, T = CSC.tools, h = CSC.h, esc = CSC.esc;
  var inr = function (n) { return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 }); };
  var num = function (v) { var n = parseFloat(v); return isNaN(n) ? NaN : n; };
  function res(items) { return '<div class="t-res">' + items.map(function (i) { return '<div><b>' + i[1] + '</b><span>' + esc(i[0]) + '</span></div>'; }).join('') + '</div>'; }
  function wrap(root, left, right) { root.innerHTML = '<div class="t-grid"><div class="card">' + left + '</div><div class="card" id="out"><p class="hint">Fill in the details and the result appears here.</p></div></div>'; return function (s) { return root.querySelector(s); }; }
  function bind(root, ids, fn) { ids.forEach(function (i) { var e = root.querySelector('#' + i); if (e) { e.addEventListener('input', fn); e.addEventListener('change', fn); } }); fn(); }
  function field(id, label, attrs) { return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" ' + (attrs || '') + '></div>'; }
  function sel(id, label, opts, val) { return '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>'; }

  /* ================= Loan EMI ================= */
  T.loan_emi_calculator = function (root) {
    var $ = wrap(root, field('amt', 'Loan amount (₹)', 'type="number" min="0" value="500000"') + field('rate', 'Interest rate (% per year)', 'type="number" min="0" step="0.01" value="10"') +
      '<div class="row2">' + field('ten', 'Tenure', 'type="number" min="1" value="5"') + sel('tu', 'Unit', [['y', 'Years'], ['m', 'Months']], 'y') + '</div>');
    bind(root, ['amt', 'rate', 'ten', 'tu'], function () {
      var P = num($('#amt').value), R = num($('#rate').value), t = num($('#ten').value), n = $('#tu').value === 'y' ? t * 12 : t;
      if (!(P > 0) || !(R >= 0) || !(n >= 1)) { $('#out').innerHTML = '<p class="hint">Enter amount, rate and tenure.</p>'; return; }
      n = Math.round(n); var r = R / 1200, emi = r === 0 ? P / n : P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1), total = emi * n;
      var rows = '', bal = P, yr = 0, yi = 0, yp = 0;
      for (var m = 1; m <= n; m++) { var i = bal * r, p = emi - i; bal = Math.max(0, bal - p); yi += i; yp += p; if (m % 12 === 0 || m === n) { yr++; rows += '<tr><td>' + yr + '</td><td>' + inr(Math.round(yp)) + '</td><td>' + inr(Math.round(yi)) + '</td><td>' + inr(Math.round(bal)) + '</td></tr>'; yi = 0; yp = 0; } }
      $('#out').innerHTML = res([['Monthly EMI', inr(Math.round(emi))], ['Total interest', inr(Math.round(total - P))], ['Total payment', inr(Math.round(total))]]) +
        '<h3 style="margin-top:16px">Year-wise breakup</h3><div style="overflow:auto"><table class="t-tbl"><tr><th>Year</th><th>Principal paid</th><th>Interest paid</th><th>Balance</th></tr>' + rows + '</table></div>';
    });
  };

  /* ================= Percentage ================= */
  T.percentage_calculator = function (root) {
    var $ = wrap(root, sel('mode', 'What do you want to find?', [['of', 'X% of Y'], ['what', 'X is what % of Y'], ['chg', '% change from A to B'], ['add', 'Add X% to Y'], ['sub', 'Subtract X% from Y']], 'of') +
      '<div class="field"><label for="a" id="la">X</label><input id="a" type="number" step="any" value="20"></div><div class="field"><label for="b" id="lb">Y</label><input id="b" type="number" step="any" value="500"></div>');
    var lab = { of: ['Percentage (X)', 'Number (Y)'], what: ['Number (X)', 'Total (Y)'], chg: ['Old value (A)', 'New value (B)'], add: ['Percentage (X)', 'Number (Y)'], sub: ['Percentage (X)', 'Number (Y)'] };
    bind(root, ['mode', 'a', 'b'], function () {
      var m = $('#mode').value, a = num($('#a').value), b = num($('#b').value); $('#la').textContent = lab[m][0]; $('#lb').textContent = lab[m][1];
      if (isNaN(a) || isNaN(b)) { $('#out').innerHTML = '<p class="hint">Enter both numbers.</p>'; return; }
      var f = function (v) { return (Math.round(v * 10000) / 10000).toLocaleString('en-IN'); }, r;
      if (m === 'of') r = [[a + '% of ' + b, f(a * b / 100)]];
      else if (m === 'what') { if (b === 0) { $('#out').innerHTML = '<p class="err">Total cannot be zero.</p>'; return; } r = [[a + ' is what % of ' + b, f(a / b * 100) + '%']]; }
      else if (m === 'chg') { if (a === 0) { $('#out').innerHTML = '<p class="err">Old value cannot be zero.</p>'; return; } var c = (b - a) / Math.abs(a) * 100; r = [[c >= 0 ? 'Increase' : 'Decrease', f(Math.abs(c)) + '%'], ['Difference', f(b - a)]]; }
      else if (m === 'add') r = [['Amount added', f(b * a / 100)], ['Final value', f(b * (1 + a / 100))]];
      else r = [['Amount removed', f(b * a / 100)], ['Final value', f(b * (1 - a / 100))]];
      $('#out').innerHTML = res(r);
    });
  };

  /* ================= Date calculator ================= */
  T.date_calculator = function (root) {
    var td = new Date().toISOString().slice(0, 10);
    var $ = wrap(root, '<h3>Difference between two dates</h3>' + field('d1', 'From', 'type="date" value="' + td + '"') + field('d2', 'To', 'type="date" value="' + td + '"') +
      '<h3 style="margin-top:16px">Add or subtract from a date</h3>' + field('d3', 'Start date', 'type="date" value="' + td + '"') +
      '<div class="row3">' + sel('op', 'Action', [['+', 'Add'], ['-', 'Subtract']], '+') + field('amt', 'Amount', 'type="number" min="0" value="30"') + sel('un', 'Unit', [['d', 'Days'], ['m', 'Months'], ['y', 'Years']], 'd') + '</div>');
    function p(s) { var a = s.split('-'); return a.length === 3 ? new Date(+a[0], +a[1] - 1, +a[2]) : null; }
    var fmt = function (d) { return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }); };
    bind(root, ['d1', 'd2', 'd3', 'op', 'amt', 'un'], function () {
      var html = '', a = p($('#d1').value), b = p($('#d2').value);
      if (a && b) {
        var neg = b < a; if (neg) { var t = a; a = b; b = t; }
        var y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
        if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); } if (m < 0) { y--; m += 12; }
        var days = Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);
        html += '<h3>Difference' + (neg ? ' (To is earlier than From)' : '') + '</h3>' + res([['Years', y], ['Months', m], ['Days', d], ['Total days', days.toLocaleString('en-IN')], ['Total weeks', Math.floor(days / 7)]]);
      }
      var s = p($('#d3').value), n = num($('#amt').value);
      if (s && !isNaN(n)) {
        var sg = $('#op').value === '-' ? -1 : 1, u = $('#un').value, r = new Date(s);
        if (u === 'd') r.setDate(r.getDate() + sg * n);
        else { var day = r.getDate(); r.setDate(1); r.setMonth(r.getMonth() + sg * (u === 'y' ? n * 12 : n)); r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate())); }
        html += '<h3 style="margin-top:16px">Result date</h3>' + res([['Date', fmt(r)]]);
      }
      $('#out').innerHTML = html || '<p class="hint">Choose dates.</p>';
    });
  };

  /* ================= CGPA ================= */
  T.cgpa_calculator = function (root) {
    var $ = wrap(root, '<div class="field"><label>Subjects</label><div id="rows"></div><div class="t-actions"><button class="btn alt" id="add" type="button"><i class="fa-solid fa-plus"></i> Add subject</button></div></div>' +
      field('mul', 'Percentage multiplier (CBSE uses 9.5)', 'type="number" step="0.01" value="9.5"') + '<p class="hint">Enter credits (or leave 1 if all subjects are equal) and the grade point of each subject. For CGPA across semesters, add each semester as one row with its SGPA and total credits.</p>');
    var rows = root.querySelector('#rows');
    function add(c, g) {
      var d = h('div', { class: 'row2', style: 'margin-bottom:6px;align-items:center' }, [h('input', { type: 'number', class: 'cr', min: '0', step: 'any', placeholder: 'Credits', 'aria-label': 'Credits', value: c == null ? '1' : c }), h('input', { type: 'number', class: 'gp', min: '0', max: '10', step: 'any', placeholder: 'Grade point', 'aria-label': 'Grade point', value: g == null ? '' : g })]);
      d.addEventListener('input', calc); rows.appendChild(d);
    }
    function calc() {
      var tc = 0, tp = 0, cnt = 0;
      [].forEach.call(rows.children, function (r) { var c = num(r.querySelector('.cr').value), g = num(r.querySelector('.gp').value); if (c > 0 && g >= 0 && g <= 10) { tc += c; tp += c * g; cnt++; } });
      if (!cnt) { $('#out').innerHTML = '<p class="hint">Enter at least one subject with a grade point from 0 to 10.</p>'; return; }
      var g = tp / tc, m = num($('#mul').value) || 9.5;
      $('#out').innerHTML = res([['CGPA / SGPA', g.toFixed(2)], ['Percentage', (g * m).toFixed(2) + '%'], ['Total credits', tc], ['Subjects', cnt]]);
    }
    [8, 8, 8, 8, 8].forEach(function () { add(1, ''); }); root.querySelector('#add').onclick = function () { add(1, ''); };
    root.querySelector('#mul').addEventListener('input', calc); calc();
  };

  /* ================= Gold & Silver value ================= */
  T.gold_silver_rate = function (root) {
    var $ = wrap(root, sel('metal', 'Metal', [['gold', 'Gold'], ['silver', 'Silver']], 'gold') + field('wt', 'Weight (grams)', 'type="number" min="0" step="any" value="10"') +
      field('rt', 'Today\'s rate per gram of 24K gold / fine silver (₹)', 'type="number" min="0" step="any" placeholder="Enter today\'s rate"') +
      sel('pu', 'Purity', [['100', '24K / 99.9% (100%)'], ['91.6', '22K (91.6%)'], ['75', '18K (75%)'], ['58.5', '14K (58.5%)'], ['92.5', 'Sterling silver (92.5%)']], '91.6') +
      field('mk', 'Making charges (%)', 'type="number" min="0" step="any" value="10"') + field('gst', 'GST (%)', 'type="number" min="0" step="any" value="3"') +
      '<p class="hint">This tool does not fetch live prices. Type today\'s rate from your jeweller or a rate website.</p>');
    bind(root, ['metal', 'wt', 'rt', 'pu', 'mk', 'gst'], function () {
      var w = num($('#wt').value), r = num($('#rt').value), p = num($('#pu').value) / 100, mk = num($('#mk').value) || 0, g = num($('#gst').value) || 0;
      if (!(w > 0) || !(r > 0)) { $('#out').innerHTML = '<p class="hint">Enter weight and today\'s rate.</p>'; return; }
      var metal = w * r * p, make = metal * mk / 100, gst = (metal + make) * g / 100;
      $('#out').innerHTML = res([['Metal value', inr(Math.round(metal))], ['Making charges', inr(Math.round(make))], ['GST', inr(Math.round(gst))], ['Total', inr(Math.round(metal + make + gst))]]);
    });
  };

  /* ================= QR Code ================= */
  T.qr_code_generator = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card">' + sel('ty', 'Type', [['text', 'Text or link'], ['upi', 'UPI payment'], ['wa', 'WhatsApp chat']], 'text') +
      '<div id="f"></div>' + sel('sz', 'Size', [['200', 'Small (200 px)'], ['300', 'Medium (300 px)'], ['500', 'Large (500 px)'], ['1000', 'Print (1000 px)']], '300') +
      '<div class="t-actions"><button class="btn" id="go"><i class="fa-solid fa-qrcode"></i> Create QR</button></div></div>' +
      '<div class="card"><div class="t-preview" id="pv" style="min-height:120px"><span class="hint">Your QR code will show here</span></div><div class="t-actions"><button class="btn" id="dl" disabled><i class="fa-solid fa-download"></i> Download PNG</button></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, png = null;
    var forms = {
      text: field('v', 'Text or web link', 'type="text" placeholder="https://example.com"'),
      upi: field('pa', 'UPI ID', 'type="text" placeholder="name@bank"') + field('pn', 'Payee name', 'type="text"') + field('am', 'Amount (optional)', 'type="number" min="0" step="0.01"') + field('tn', 'Note (optional)', 'type="text"'),
      wa: field('ph', 'Mobile number with country code', 'type="tel" placeholder="919876543210"') + field('ms', 'Message (optional)', 'type="text"')
    };
    function form() { $('#f').innerHTML = forms[$('#ty').value]; } $('#ty').onchange = form; form();
    $('#go').onclick = async function () {
      var t = $('#ty').value, g = function (i) { var e = $('#' + i); return e ? e.value.trim() : ''; }, data;
      if (t === 'text') { data = g('v'); if (!data) return CSC.toast('Enter some text or a link', true); }
      else if (t === 'upi') {
        if (!/^[\w.\-]{2,}@[A-Za-z]{2,}$/.test(g('pa'))) return CSC.toast('Enter a valid UPI ID like name@bank', true);
        data = 'upi://pay?pa=' + encodeURIComponent(g('pa')) + (g('pn') ? '&pn=' + encodeURIComponent(g('pn')) : '') + (g('am') ? '&am=' + encodeURIComponent(g('am')) : '') + '&cu=INR' + (g('tn') ? '&tn=' + encodeURIComponent(g('tn')) : '');
      } else {
        var ph = g('ph').replace(/\D/g, ''); if (ph.length === 10) ph = '91' + ph; if (ph.length < 11) return CSC.toast('Enter the number with country code', true);
        data = 'https://wa.me/' + ph + (g('ms') ? '?text=' + encodeURIComponent(g('ms')) : '');
      }
      try {
        await CSC.loadScript(CSC.libs.qrcode); var size = +$('#sz').value, box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(box); new QRCode(box, { text: data, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
        await new Promise(function (r) { setTimeout(r, 60); });
        var cv = box.querySelector('canvas'), out = document.createElement('canvas'), pad = Math.round(size * 0.06); out.width = out.height = size + pad * 2;
        var x = out.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, out.width, out.height); x.drawImage(cv, pad, pad); box.remove();
        png = await CSC.canvasBlob(out, 'image/png'); out.style.maxWidth = '100%'; $('#pv').innerHTML = ''; $('#pv').appendChild(out); $('#dl').disabled = false;
      } catch (e) { CSC.toast(e.message, true); }
    };
    $('#dl').onclick = function () { if (png) CSC.download(png, 'qr-code.png'); };
  };

  /* ================= WhatsApp direct message ================= */
  T.whatsapp_ultimate = function (root) {
    var $ = wrap(root, field('ph', 'Mobile number', 'type="tel" placeholder="9876543210"') + field('cc', 'Country code', 'type="text" value="91" maxlength="4"') +
      '<div class="field"><label for="ms">Message (optional)</label><textarea id="ms" placeholder="Hello, ..."></textarea></div>' +
      '<div class="t-actions"><button class="btn" id="op"><i class="fa-solid fa-comment-dots"></i> Open chat</button><button class="btn alt" id="cp">Copy link</button></div><p class="hint">You do not need to save the number first. WhatsApp opens in a new tab.</p>');
    function url() {
      var ph = $('#ph').value.replace(/\D/g, '').replace(/^0+/, ''), cc = $('#cc').value.replace(/\D/g, '');
      if (ph.length < 7) { CSC.toast('Enter a valid mobile number', true); return null; }
      if (ph.length > 10 && ph.indexOf(cc) === 0) ph = ph.slice(cc.length);
      return 'https://wa.me/' + cc + ph + ($('#ms').value.trim() ? '?text=' + encodeURIComponent($('#ms').value.trim()) : '');
    }
    $('#op').onclick = function () { var u = url(); if (u) window.open(u, '_blank', 'noopener'); };
    $('#cp').onclick = function () { var u = url(); if (!u) return; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { CSC.toast('Link copied'); }, function () { prompt('Copy this link', u); }); };
    $('#out').innerHTML = '<p class="hint">Enter a number and press Open chat.</p>';
  };

  /* ================= Typing test ================= */
  T.typing_test = function (root) {
    var TEXTS = {
      en: ['The quick brown fox jumps over the lazy dog. Digital services have made it easy for people in villages and towns to apply for certificates, pay bills and open bank accounts without travelling far. A good operator types fast, checks every detail and keeps the records neat.',
        'Every application must be filled with care. Check the name, date of birth and address against the original documents before you submit. A small spelling mistake can cause delay, so take a moment to read it again before you press the final button.',
        'Common service centres help citizens reach government schemes in their own area. From pension forms to scholarship applications, the operator is the bridge between the person and the office. Patience, accuracy and speed are the three skills that matter most.']
    };
    var $ = function (s) { return root.querySelector(s); }, tm = null, left = 0, started = false, txt = '', dur = 60, idx = 0;
    root.innerHTML = '<div class="card" style="max-width:860px;margin:0 auto"><div class="row"><div class="field"><label for="du">Time</label><select id="du"><option value="60">1 minute</option><option value="120">2 minutes</option><option value="300">5 minutes</option></select></div>' +
      '<div class="field"><label>&nbsp;</label><button class="btn alt" id="nw" type="button">New text</button></div></div>' +
      '<div id="tx" class="t-paper" style="font-family:Consolas,monospace;font-size:1.05rem;line-height:1.8;max-width:none;padding:14px;user-select:none" aria-label="Text to type"></div>' +
      '<div class="field" style="margin-top:12px"><label for="in">Start typing here. The timer starts with your first key.</label><textarea id="in" rows="4" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea></div>' +
      '<div id="live" class="t-res"></div></div>';
    function setText() { txt = TEXTS.en[idx % TEXTS.en.length]; idx++; reset(); }
    function paint(v) {
      var html = '';
      for (var i = 0; i < txt.length; i++) {
        var c = esc(txt[i]), cls = i < v.length ? (v[i] === txt[i] ? 'color:#0b5c3b' : 'color:#fff;background:#b3261e') : (i === v.length ? 'background:#fde68a' : '');
        html += '<span style="' + cls + '">' + c + '</span>';
      }
      $('#tx').innerHTML = html;
    }
    function stats(v, final) {
      var ok = 0; for (var i = 0; i < v.length; i++) if (v[i] === txt[i]) ok++;
      var el = dur - left, mins = Math.max(el, 1) / 60, wpm = Math.round(ok / 5 / mins), acc = v.length ? Math.round(ok / v.length * 100) : 100;
      $('#live').innerHTML = '<div><b>' + left + 's</b><span>Time left</span></div><div><b>' + wpm + '</b><span>Words per minute</span></div><div><b>' + acc + '%</b><span>Accuracy</span></div><div><b>' + (v.length - ok) + '</b><span>Mistakes</span></div>' + (final ? '<div style="grid-column:1/-1"><b>Finished</b><span>Press New text to try again</span></div>' : '');
    }
    function reset() { clearInterval(tm); started = false; dur = +$('#du').value; left = dur; $('#in').value = ''; $('#in').disabled = false; paint(''); stats('', false); }
    function finish() { clearInterval(tm); $('#in').disabled = true; stats($('#in').value, true); }
    $('#in').addEventListener('input', function () {
      var v = this.value; if (!started) { started = true; tm = setInterval(function () { left--; stats($('#in').value, false); if (left <= 0) finish(); }, 1000); }
      if (v.length >= txt.length) { this.value = v = v.slice(0, txt.length); paint(v); return finish(); }
      paint(v); stats(v, false);
    });
    $('#in').addEventListener('paste', function (e) { e.preventDefault(); });
    $('#nw').onclick = setText; $('#du').onchange = reset; setText();
  };
})();
