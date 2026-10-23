/* SevaSphere: document, billing, card and print tools built on one small form + live A4 preview engine */
(function () {
  'use strict';
  var CSC = window.CSC, T = CSC.tools, h = CSC.h, esc = CSC.esc;
  var inr = function (n) { return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var num = function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; };
  var nl2br = function (s) { return esc(s).replace(/\n/g, '<br>'); };
  function dmy(s) { if (!s) return ''; var a = s.split('-'); return a.length === 3 ? a[2] + '/' + a[1] + '/' + a[0] : s; }
  function today() { return new Date().toISOString().slice(0, 10); }

  /* Indian number to words (rupees) */
  function words(n) {
    n = Math.round(num(n)); if (n === 0) return 'Zero';
    var ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function two(x) { return x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : ''); }
    function three(x) { return (x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : ''); }
    var out = [], parts = [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']];
    parts.forEach(function (p) { var q = Math.floor(n / p[0]); if (q) { out.push(three(q) + ' ' + p[1]); n %= p[0]; } });
    if (n) out.push(three(n)); return out.join(' ');
  }
  CSC.words = words;

  /* Photo input -> small JPEG data URL */
  function readPhoto(file, max) {
    return CSC.fileToImage(file).then(function (img) {
      var s = Math.min(1, (max || 500) / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img._url); return c.toDataURL('image/jpeg', 0.9);
    });
  }

  /* ---------- the engine ----------
     cfg: { key, fields:[{id,label,type,def,opts,cols,rows,hint}], render(v)->html, css, print(v)->html (optional), paper:true|false, btn }  */
  function docTool(root, cfg) {
    var store = 'csc_doc_' + cfg.key, saved = CSC.safe.get(store, {}) || {}, files = {};
    var form = cfg.fields.map(function (f) {
      var val = saved[f.id] != null ? saved[f.id] : (f.def == null ? '' : f.def), id = 'f_' + f.id, lab = '<label for="' + id + '">' + esc(f.label) + '</label>';
      if (f.type === 'section') return '<h3 style="margin:14px 0 6px;color:var(--brand)">' + esc(f.label) + '</h3>';
      if (f.type === 'textarea') return '<div class="field">' + lab + '<textarea id="' + id + '" rows="' + (f.rows || 3) + '">' + esc(val) + '</textarea>' + (f.hint ? '<span class="hint">' + esc(f.hint) + '</span>' : '') + '</div>';
      if (f.type === 'select') return '<div class="field">' + lab + '<select id="' + id + '">' + f.opts.map(function (o) { o = [].concat(o); return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[o.length > 1 ? 1 : 0]) + '</option>'; }).join('') + '</select></div>';
      if (f.type === 'photo') return '<div class="field">' + lab + '<input type="file" id="' + id + '" accept="image/*"><span class="hint">' + esc(f.hint || 'Optional. Stays on this device.') + '</span></div>';
      if (f.type === 'items') return '<div class="field"><label>' + esc(f.label) + '</label><div id="' + id + '" data-items="1"></div><div class="t-actions" style="margin-top:4px"><button type="button" class="btn alt" data-add="' + f.id + '"><i class="fa-solid fa-plus"></i> Add row</button></div></div>';
      if (f.type === 'color') return '<div class="field">' + lab + '<input type="color" id="' + id + '" value="' + esc(val) + '"></div>';
      return '<div class="field">' + lab + '<input id="' + id + '" type="' + (f.type || 'text') + '" value="' + esc(val) + '"' + (f.type === 'number' ? ' step="any"' : '') + '></div>';
    }).join('');
    root.innerHTML = '<div class="t-grid"><div class="card no-print"><div id="frm">' + form + '</div><div class="t-actions"><button class="btn" id="pr"><i class="fa-solid fa-print"></i> ' + esc(cfg.btn || 'Print / Save as PDF') + '</button>' +
      '<button class="btn alt" id="rs" type="button">Clear form</button></div><p class="hint" style="margin-top:8px">In the print window choose "Save as PDF" to get a PDF file. Details stay on this device only.</p></div>' +
      '<div><div id="pv" class="' + (cfg.paper === false ? '' : 't-paper') + '" style="overflow:auto"></div></div></div>';
    var $ = function (s) { return root.querySelector(s); };
    var itemsData = {};
    cfg.fields.filter(function (f) { return f.type === 'items'; }).forEach(function (f) {
      itemsData[f.id] = (saved[f.id] && saved[f.id].length ? saved[f.id] : (f.def || [{}]));
      drawItems(f);
    });
    function drawItems(f) {
      var host = $('#f_' + f.id); host.innerHTML = '';
      itemsData[f.id].forEach(function (row, i) {
        var d = h('div', { style: 'display:grid;grid-template-columns:' + f.cols.map(function (c) { return c.w || '1fr'; }).join(' ') + ' 28px;gap:6px;margin-bottom:6px' });
        f.cols.forEach(function (c) {
          var inp = h(c.type === 'textarea' ? 'textarea' : 'input', { type: c.type || 'text', placeholder: c.label, 'aria-label': c.label, step: 'any', rows: '2' }); inp.value = row[c.id] == null ? '' : row[c.id];
          inp.addEventListener('input', function () { row[c.id] = inp.value; update(); }); d.appendChild(inp);
        });
        d.appendChild(h('button', { type: 'button', 'aria-label': 'Remove row', style: 'border:0;background:transparent;cursor:pointer;color:var(--danger)', onclick: function () { itemsData[f.id].splice(i, 1); if (!itemsData[f.id].length) itemsData[f.id].push({}); drawItems(f); update(); } }, '✕'));
        host.appendChild(d);
      });
    }
    [].forEach.call(root.querySelectorAll('[data-add]'), function (b) { b.onclick = function () { var f = cfg.fields.filter(function (x) { return x.id === b.getAttribute('data-add'); })[0]; itemsData[f.id].push({}); drawItems(f); update(); }; });
    function values() {
      var v = {}; cfg.fields.forEach(function (f) {
        if (f.type === 'section') return;
        if (f.type === 'items') v[f.id] = itemsData[f.id]; else if (f.type === 'photo') v[f.id] = files[f.id] || ''; else { var e = $('#f_' + f.id); v[f.id] = e ? e.value : ''; }
      }); return v;
    }
    function update() {
      var v = values(), keep = {}; Object.keys(v).forEach(function (k) { if (typeof v[k] === 'string' && v[k].length > 2000 && v[k].indexOf('data:') === 0) return; keep[k] = v[k]; });
      CSC.safe.set(store, keep);
      try { $('#pv').innerHTML = '<style>' + (cfg.css || '') + '</style>' + cfg.render(v); } catch (e) { $('#pv').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
    }
    cfg.fields.filter(function (f) { return f.type === 'photo'; }).forEach(function (f) {
      $('#f_' + f.id).addEventListener('change', function () { var fl = this.files[0]; if (!fl) { files[f.id] = ''; return update(); } readPhoto(fl, f.max).then(function (u) { files[f.id] = u; update(); }, function (e) { CSC.toast(e.message, true); }); });
    });
    $('#frm').addEventListener('input', update); $('#frm').addEventListener('change', update);
    $('#pr').onclick = function () { var v = values(); CSC.printHTML(cfg.print ? cfg.print(v) : cfg.render(v), (cfg.css || '') + (cfg.printCss || ' .pg{padding:14mm 16mm}')); };
    $('#rs').onclick = function () { if (confirm('Clear all fields?')) { CSC.safe.set(store, {}); location.reload(); } };
    update();
  }

  /* =============== Cover letter =============== */
  T.cover_letter_generator = function (root) {
    docTool(root, {
      key: 'cover', css: '.cl{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.55;color:#000}.cl p{margin:0 0 10px}',
      fields: [
        { id: 'name', label: 'Your name', def: '' }, { id: 'addr', label: 'Your address', type: 'textarea', rows: 2 }, { id: 'ph', label: 'Mobile', type: 'tel' }, { id: 'em', label: 'Email', type: 'email' },
        { id: 'dt', label: 'Date', type: 'date', def: today() }, { id: 'to', label: 'To (person or "The Hiring Manager")', def: 'The Hiring Manager' }, { id: 'co', label: 'Company / Office name' }, { id: 'ca', label: 'Company address', type: 'textarea', rows: 2 },
        { id: 'pos', label: 'Post applied for' }, { id: 'ed', label: 'Qualification', def: '' }, { id: 'ex', label: 'Experience (years or "Fresher")', def: 'Fresher' }, { id: 'sk', label: 'Key skills (comma separated)', type: 'textarea', rows: 2 },
        { id: 'ex2', label: 'Extra line (optional)', type: 'textarea', rows: 2 }],
      render: function (v) {
        var fresher = /fresh/i.test(v.ex), sk = v.sk ? '<p>My key skills include ' + esc(v.sk) + '.</p>' : '';
        return '<div class="cl pg"><p><b>' + esc(v.name) + '</b><br>' + nl2br(v.addr) + (v.ph ? '<br>Mobile: ' + esc(v.ph) : '') + (v.em ? '<br>Email: ' + esc(v.em) : '') + '</p><p>Date: ' + dmy(v.dt) + '</p>' +
          '<p>To,<br>' + esc(v.to) + '<br>' + esc(v.co) + '<br>' + nl2br(v.ca) + '</p><p><b>Subject: Application for the post of ' + esc(v.pos || '________') + '</b></p><p>Respected Sir/Madam,</p>' +
          '<p>I am writing to apply for the post of ' + esc(v.pos || '________') + (v.co ? ' in ' + esc(v.co) : '') + '. I have completed ' + esc(v.ed || 'my education') + (fresher ? ' and I am eager to begin my career with a good organisation.' : ' and I have ' + esc(v.ex) + ' of experience in this field.') + '</p>' + sk +
          (v.ex2 ? '<p>' + nl2br(v.ex2) + '</p>' : '') + '<p>I am hardworking, punctual and willing to learn. I request you to kindly consider my application and give me a chance to prove myself. I will be grateful for an interview at your convenience.</p><p>Thank you for your time.</p><p>Yours faithfully,<br><br><br><b>' + esc(v.name) + '</b></p></div>';
      }
    });
  };

  /* =============== Invoice =============== */
  T.invoice_generator = function (root) {
    docTool(root, {
      key: 'invoice', css: '.iv{font-family:Arial,sans-serif;font-size:10.5pt;color:#000}.iv h2{margin:0;font-size:18pt}.iv table{width:100%;border-collapse:collapse;margin-top:10px}.iv th,.iv td{border:1px solid #444;padding:5px 7px;text-align:left}.iv th{background:#eee}.iv .r{text-align:right}.iv .t{width:100%;border:0}.iv .t td{border:0;padding:2px 0;vertical-align:top}',
      fields: [
        { id: 'sn', label: 'Seller / shop name', def: '' }, { id: 'sa', label: 'Seller address & phone', type: 'textarea', rows: 2 }, { id: 'sg', label: 'Seller GSTIN (optional)' },
        { id: 'bn', label: 'Customer name' }, { id: 'ba', label: 'Customer address', type: 'textarea', rows: 2 }, { id: 'bg', label: 'Customer GSTIN (optional)' },
        { id: 'no', label: 'Invoice number', def: '001' }, { id: 'dt', label: 'Date', type: 'date', def: today() },
        { id: 'gst', label: 'GST % (0 for none)', type: 'number', def: 0 }, { id: 'disc', label: 'Discount (₹)', type: 'number', def: 0 },
        { id: 'items', label: 'Items', type: 'items', cols: [{ id: 'd', label: 'Item', w: '2fr' }, { id: 'q', label: 'Qty', type: 'number' }, { id: 'r', label: 'Rate', type: 'number' }], def: [{ d: '', q: 1, r: '' }] },
        { id: 'nt', label: 'Notes / bank details', type: 'textarea', rows: 2 }],
      render: function (v) {
        var sub = 0, rows = v.items.map(function (it, i) { var a = num(it.q) * num(it.r); sub += a; return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.d) + '</td><td class="r">' + esc(it.q) + '</td><td class="r">' + inr(num(it.r)) + '</td><td class="r">' + inr(a) + '</td></tr>'; }).join('');
        var disc = num(v.disc), tax = Math.max(0, sub - disc), g = tax * num(v.gst) / 100, tot = tax + g;
        return '<div class="iv pg"><table class="t"><tr><td><h2>' + esc(v.sn || 'Shop Name') + '</h2>' + nl2br(v.sa) + (v.sg ? '<br>GSTIN: ' + esc(v.sg) : '') + '</td><td style="text-align:right"><b style="font-size:15pt">' + (num(v.gst) ? 'TAX INVOICE' : 'INVOICE') + '</b><br>No: ' + esc(v.no) + '<br>Date: ' + dmy(v.dt) + '</td></tr></table>' +
          '<p style="margin:12px 0 0"><b>Bill to:</b><br>' + esc(v.bn) + '<br>' + nl2br(v.ba) + (v.bg ? '<br>GSTIN: ' + esc(v.bg) : '') + '</p>' +
          '<table><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate (₹)</th><th class="r">Amount (₹)</th></tr>' + rows + '<tr><td colspan="4" class="r">Sub total</td><td class="r">' + inr(sub) + '</td></tr>' + (disc ? '<tr><td colspan="4" class="r">Discount</td><td class="r">-' + inr(disc) + '</td></tr>' : '') +
          (num(v.gst) ? '<tr><td colspan="4" class="r">CGST ' + num(v.gst) / 2 + '%</td><td class="r">' + inr(g / 2) + '</td></tr><tr><td colspan="4" class="r">SGST ' + num(v.gst) / 2 + '%</td><td class="r">' + inr(g / 2) + '</td></tr>' : '') +
          '<tr><th colspan="4" class="r">Total</th><th class="r">₹ ' + inr(tot) + '</th></tr></table><p><b>Amount in words:</b> Rupees ' + words(tot) + ' Only</p>' + (v.nt ? '<p>' + nl2br(v.nt) + '</p>' : '') + '<p style="margin-top:50px;text-align:right">Authorised signatory</p></div>';
      }
    });
  };

  /* =============== Salary slip =============== */
  T.salary_slip_generator = function (root) {
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    docTool(root, {
      key: 'salary', css: '.sl{font-family:Arial,sans-serif;font-size:10.5pt;color:#000}.sl table{width:100%;border-collapse:collapse;margin-top:8px}.sl th,.sl td{border:1px solid #444;padding:5px 7px;text-align:left}.sl th{background:#eee}.sl .r{text-align:right}',
      fields: [
        { id: 'co', label: 'Company name' }, { id: 'ca', label: 'Company address', type: 'textarea', rows: 2 },
        { id: 'mo', label: 'Month', type: 'select', opts: months.map(function (m, i) { return [m]; }), def: months[new Date().getMonth()] }, { id: 'yr', label: 'Year', type: 'number', def: new Date().getFullYear() },
        { id: 'en', label: 'Employee name' }, { id: 'ei', label: 'Employee ID' }, { id: 'ds', label: 'Designation' }, { id: 'dp', label: 'Department' }, { id: 'jd', label: 'Date of joining', type: 'date' }, { id: 'bk', label: 'Bank name & A/c no. (optional)' },
        { id: 'wd', label: 'Working days', type: 'number', def: 30 }, { id: 'pd', label: 'Days paid', type: 'number', def: 30 },
        { id: 'ea', label: 'Earnings', type: 'items', cols: [{ id: 'n', label: 'Head', w: '2fr' }, { id: 'a', label: 'Amount', type: 'number' }], def: [{ n: 'Basic', a: '' }, { n: 'HRA', a: '' }, { n: 'Other allowance', a: '' }] },
        { id: 'de', label: 'Deductions', type: 'items', cols: [{ id: 'n', label: 'Head', w: '2fr' }, { id: 'a', label: 'Amount', type: 'number' }], def: [{ n: 'PF', a: '' }, { n: 'Professional tax', a: '' }] }],
      render: function (v) {
        var te = 0, td = 0, rows = Math.max(v.ea.length, v.de.length), body = '';
        v.ea.forEach(function (x) { te += num(x.a); }); v.de.forEach(function (x) { td += num(x.a); });
        for (var i = 0; i < rows; i++) { var a = v.ea[i] || {}, d = v.de[i] || {}; body += '<tr><td>' + esc(a.n || '') + '</td><td class="r">' + (a.a === undefined || a.a === '' ? '' : inr(num(a.a))) + '</td><td>' + esc(d.n || '') + '</td><td class="r">' + (d.a === undefined || d.a === '' ? '' : inr(num(d.a))) + '</td></tr>'; }
        return '<div class="sl pg"><div style="text-align:center"><b style="font-size:16pt">' + esc(v.co || 'Company Name') + '</b><br>' + nl2br(v.ca) + '<br><b>Salary Slip for ' + esc(v.mo) + ' ' + esc(v.yr) + '</b></div>' +
          '<table><tr><td>Employee name</td><td>' + esc(v.en) + '</td><td>Employee ID</td><td>' + esc(v.ei) + '</td></tr><tr><td>Designation</td><td>' + esc(v.ds) + '</td><td>Department</td><td>' + esc(v.dp) + '</td></tr><tr><td>Date of joining</td><td>' + dmy(v.jd) + '</td><td>Bank / A/c</td><td>' + esc(v.bk) + '</td></tr><tr><td>Working days</td><td>' + esc(v.wd) + '</td><td>Days paid</td><td>' + esc(v.pd) + '</td></tr></table>' +
          '<table><tr><th>Earnings</th><th class="r">Amount (₹)</th><th>Deductions</th><th class="r">Amount (₹)</th></tr>' + body + '<tr><th>Total earnings</th><th class="r">' + inr(te) + '</th><th>Total deductions</th><th class="r">' + inr(td) + '</th></tr></table>' +
          '<p><b>Net pay: ₹ ' + inr(te - td) + '</b><br>Rupees ' + words(te - td) + ' Only</p><p style="margin-top:50px;display:flex;justify-content:space-between"><span>Employee signature</span><span>Authorised signatory</span></p><p class="hint" style="font-size:8pt">This is a computer generated slip.</p></div>';
      }
    });
  };

  /* =============== Biodata =============== */
  T.biodata_maker = function (root) {
    var F = [['nm', 'Full name'], ['fa', "Father's name"], ['mo', "Mother's name"], ['dob', 'Date of birth', 'date'], ['tob', 'Time of birth'], ['pob', 'Place of birth'], ['ht', 'Height'], ['cx', 'Complexion'], ['rl', 'Religion / Caste'], ['gt', 'Gotra'], ['ed', 'Education'], ['oc', 'Occupation'], ['inc', 'Annual income'], ['br', 'Brothers / Sisters'], ['ad', 'Address', 'textarea'], ['ph', 'Contact number'], ['ex', 'Other details', 'textarea']];
    docTool(root, {
      key: 'biodata', css: '.bd{font-family:"Times New Roman",serif;font-size:13pt;color:#000;border:3px double #8a1c1c;padding:12mm;min-height:250mm}.bd h2{text-align:center;color:#8a1c1c;margin:0 0 8px;font-size:20pt}.bd table{width:100%;border-collapse:collapse}.bd td{padding:6px 4px;vertical-align:top}.bd td:first-child{width:38%;font-weight:bold}.bd img{width:34mm;height:42mm;object-fit:cover;border:1px solid #000}',
      fields: [{ id: 'hd', label: 'Heading', def: 'Bio-Data' }, { id: 'ph0', label: 'Photo', type: 'photo' }].concat(F.map(function (f) { return { id: f[0], label: f[1], type: f[2] }; })),
      render: function (v) {
        var rows = F.filter(function (f) { return v[f[0]]; }).map(function (f) { return '<tr><td>' + esc(f[1]) + '</td><td>: ' + (f[0] === 'dob' ? dmy(v.dob) : nl2br(v[f[0]])) + '</td></tr>'; }).join('');
        return '<div class="bd pg"><h2>' + esc(v.hd) + '</h2><div style="display:flex;gap:12px;justify-content:space-between"><table>' + rows + '</table>' + (v.ph0 ? '<img alt="Photo" src="' + v.ph0 + '">' : '') + '</div></div>';
      }
    });
  };

  /* =============== Service rate list =============== */
  T.service_rate_list = function (root) {
    docTool(root, {
      key: 'rates', css: '.rl{font-family:Arial,sans-serif;font-size:12pt;color:#000}.rl h2{text-align:center;margin:0;font-size:22pt;color:#0b5c3b}.rl table{width:100%;border-collapse:collapse;margin-top:12px}.rl th,.rl td{border:1px solid #444;padding:6px 9px;text-align:left}.rl th{background:#0b5c3b;color:#fff}.rl .r{text-align:right}',
      fields: [{ id: 'sn', label: 'Shop / centre name', def: 'CSC Centre' }, { id: 'sa', label: 'Address & phone', type: 'textarea', rows: 2 }, { id: 'tt', label: 'Heading', def: 'Service Rate List' },
        { id: 'it', label: 'Services and rates', type: 'items', cols: [{ id: 's', label: 'Service', w: '2fr' }, { id: 'r', label: 'Rate (₹)' }], def: [{ s: 'Aadhaar update', r: '' }, { s: 'PAN card application', r: '' }, { s: 'Photocopy (per page)', r: '2' }, { s: 'Colour print (per page)', r: '10' }] },
        { id: 'nt', label: 'Note at bottom', def: 'Rates may change without notice.' }],
      render: function (v) {
        return '<div class="rl pg"><h2>' + esc(v.sn) + '</h2><p style="text-align:center;margin:2px 0">' + nl2br(v.sa) + '</p><h3 style="text-align:center;margin:14px 0 0">' + esc(v.tt) + '</h3><table><tr><th>#</th><th>Service</th><th class="r">Rate</th></tr>' +
          v.it.filter(function (x) { return x.s || x.r; }).map(function (x, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(x.s) + '</td><td class="r">' + (/^[\d.]+$/.test(String(x.r).trim()) ? '₹ ' : '') + esc(x.r) + '</td></tr>'; }).join('') + '</table><p class="hint" style="font-size:10pt">' + esc(v.nt) + '</p></div>';
      }
    });
  };

  /* =============== Question paper =============== */
  T.question_paper_maker = function (root) {
    docTool(root, {
      key: 'qpaper', css: '.qp{font-family:"Times New Roman",serif;font-size:12.5pt;color:#000;line-height:1.5}.qp h2{text-align:center;margin:0;font-size:18pt}.qp .c{text-align:center}.qp .row{display:flex;justify-content:space-between;border-top:1px solid #000;border-bottom:1px solid #000;padding:4px 0;margin:8px 0}.qp h3{margin:14px 0 4px;font-size:13pt}.qp ol{margin:0;padding-left:24px}.qp li{margin-bottom:4px}',
      fields: [{ id: 'sc', label: 'School name' }, { id: 'ex', label: 'Exam name', def: 'Annual Examination' }, { id: 'cl', label: 'Class' }, { id: 'sb', label: 'Subject' }, { id: 'tm', label: 'Time', def: '3 Hours' }, { id: 'mm', label: 'Maximum marks (leave blank to add up)', type: 'number' },
        { id: 'in', label: 'General instructions', type: 'textarea', rows: 2, def: 'All questions are compulsory.' },
        { id: 'sec', label: 'Sections', type: 'items', cols: [{ id: 't', label: 'Section title (e.g. Section A: Very short, 1 mark each)', w: '1fr' }, { id: 'm', label: 'Marks each', type: 'number' }, { id: 'q', label: 'One question per line', type: 'textarea' }], def: [{ t: 'Section A', m: 1, q: '' }] }],
      render: function (v) {
        var total = 0, qn = 0, body = v.sec.map(function (s) {
          var qs = String(s.q || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); total += qs.length * num(s.m); var start = qn; qn += qs.length;
          return '<h3>' + esc(s.t) + (num(s.m) ? ' &nbsp;<span style="font-weight:normal">[' + num(s.m) + ' mark' + (num(s.m) > 1 ? 's' : '') + ' each]</span>' : '') + '</h3><ol start="' + (start + 1) + '">' + qs.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>';
        }).join('');
        return '<div class="qp pg"><h2>' + esc(v.sc || 'School Name') + '</h2><div class="c"><b>' + esc(v.ex) + '</b></div><div class="row"><span>Class: ' + esc(v.cl) + '</span><span>Subject: ' + esc(v.sb) + '</span><span>Time: ' + esc(v.tm) + '</span><span>Max. marks: ' + esc(v.mm || total) + '</span></div>' + (v.in ? '<p><b>Instructions:</b> ' + nl2br(v.in) + '</p>' : '') + body + '</div>';
      }
    });
  };

  /* =============== Notebook sticker (8 labels per A4) =============== */
  T.notebook_sticker = function (root) {
    var one = function (v) { return '<div class="nb"><div class="sc">' + esc(v.sc) + '</div><table><tr><td>Name</td><td>' + esc(v.nm) + '</td></tr><tr><td>Class</td><td>' + esc(v.cl) + (v.sec ? ' / ' + esc(v.sec) : '') + '</td></tr><tr><td>Roll No.</td><td>' + esc(v.rn) + '</td></tr><tr><td>Subject</td><td>' + esc(v.sb) + '</td></tr></table></div>'; };
    var css = '.nb{border:1.5px solid ' + '#0b5c3b' + ';border-radius:6px;padding:4mm;font-family:Arial,sans-serif;font-size:11pt;color:#000}.nb .sc{text-align:center;font-weight:bold;font-size:12pt;border-bottom:1.5px solid #0b5c3b;padding-bottom:2mm;margin-bottom:2mm}.nb table{width:100%;border-collapse:collapse}.nb td{padding:2mm 1mm;border-bottom:1px dotted #777}.nb td:first-child{width:28%;font-weight:bold}.sheet{display:grid;grid-template-columns:1fr 1fr;gap:6mm;padding:10mm}';
    docTool(root, {
      key: 'sticker', css: css, paper: false,
      fields: [{ id: 'sc', label: 'School name' }, { id: 'nm', label: 'Student name' }, { id: 'cl', label: 'Class' }, { id: 'sec', label: 'Section' }, { id: 'rn', label: 'Roll no.' }, { id: 'sb', label: 'Subject (blank = leave empty to write by hand)' }],
      render: function (v) { var s = ''; for (var i = 0; i < 8; i++) s += one(v); return '<div class="sheet" style="background:#fff;border:1px solid var(--line)">' + s + '</div>'; }
    });
  };

  /* =============== Visiting card (10 per A4) =============== */
  T.visiting_card_maker = function (root) {
    var css = '.vc{width:90mm;height:50mm;box-sizing:border-box;padding:5mm 6mm;font-family:Arial,sans-serif;color:#000;position:relative;overflow:hidden;border:1px solid #ccc;background:#fff}.vc .bar{position:absolute;left:0;top:0;bottom:0;width:4mm}.vc h4{margin:0 0 1mm 3mm;font-size:14pt}.vc .d{margin-left:3mm;font-size:9pt;color:#444;margin-bottom:3mm}.vc .co{margin-left:3mm;font-weight:bold;font-size:10pt}.vc .l{margin-left:3mm;font-size:8.5pt;line-height:1.5}.vc img{position:absolute;right:5mm;top:5mm;width:20mm;height:24mm;object-fit:cover;border:1px solid #999}.vsheet{display:grid;grid-template-columns:repeat(2,90mm);gap:0;justify-content:center;padding:8mm 0}';
    function card(v) { return '<div class="vc"><div class="bar" style="background:' + esc(v.col) + '"></div>' + (v.ph ? '<img alt="" src="' + v.ph + '">' : '') + '<h4 style="color:' + esc(v.col) + '">' + esc(v.nm || 'Your Name') + '</h4><div class="d">' + esc(v.ds) + '</div><div class="co">' + esc(v.co) + '</div><div class="l">' + (v.ph1 ? '☎ ' + esc(v.ph1) + '<br>' : '') + (v.em ? '✉ ' + esc(v.em) + '<br>' : '') + (v.web ? esc(v.web) + '<br>' : '') + nl2br(v.ad) + '</div></div>'; }
    docTool(root, {
      key: 'vcard', css: css, paper: false, btn: 'Print 10 cards on A4',
      fields: [{ id: 'nm', label: 'Name' }, { id: 'ds', label: 'Designation' }, { id: 'co', label: 'Business name' }, { id: 'ph1', label: 'Phone' }, { id: 'em', label: 'Email', type: 'email' }, { id: 'web', label: 'Website' }, { id: 'ad', label: 'Address', type: 'textarea', rows: 2 }, { id: 'col', label: 'Colour', type: 'color', def: '#0b5c3b' }, { id: 'ph', label: 'Photo / logo (optional)', type: 'photo' }],
      render: function (v) { return '<div style="background:#fff;border:1px solid var(--line);padding:10px;overflow:auto">' + card(v) + '<p class="hint">Preview of one card. Printing gives 10 cards (2 × 5) on A4.</p></div>'; },
      print: function (v) { var s = ''; for (var i = 0; i < 10; i++) s += card(v); return '<div class="vsheet">' + s + '</div>'; }
    });
  };

  /* =============== MPPEB / free text A4 editor =============== */
  T.mppeb_template = function (root) {
    root.innerHTML = '<div class="card no-print"><div class="row2"><div class="field"><label for="fs">Font size (pt)</label><input type="number" id="fs" value="12" min="8" max="30"></div><div class="field"><label for="ff">Font</label><select id="ff"><option>Times New Roman</option><option>Arial</option><option>Verdana</option><option>Courier New</option></select></div></div>' +
      '<div class="row2"><div class="field"><label for="lh">Line spacing</label><select id="lh"><option>1</option><option selected>1.3</option><option>1.5</option><option>2</option></select></div><div class="field"><label for="mg">Page margin (mm)</label><input type="number" id="mg" value="20" min="5" max="40"></div></div>' +
      '<div class="t-actions"><button class="btn alt" data-c="bold"><b>B</b></button><button class="btn alt" data-c="italic"><i>I</i></button><button class="btn alt" data-c="underline"><u>U</u></button><button class="btn alt" data-c="justifyLeft">Left</button><button class="btn alt" data-c="justifyCenter">Centre</button><button class="btn alt" data-c="justifyFull">Justify</button><button class="btn alt" data-c="insertUnorderedList">• List</button><button class="btn" id="pr"><i class="fa-solid fa-print"></i> Print / Save as PDF</button></div>' +
      '<p class="hint">Type or paste your text on the sheet below. Click the sheet and edit it directly. Text is saved on this device.</p></div>' +
      '<div class="t-paper" id="ed" contenteditable="true" style="min-height:260mm;max-width:210mm;outline:none" aria-label="Document text"></div>';
    var $ = function (s) { return root.querySelector(s); }, ed = $('#ed');
    ed.innerHTML = CSC.safe.get('csc_mppeb', '<p>Click here and start typing...</p>');
    function style() { ed.style.fontFamily = $('#ff').value; ed.style.fontSize = $('#fs').value + 'pt'; ed.style.lineHeight = $('#lh').value; ed.style.padding = $('#mg').value + 'mm'; }
    ['fs', 'ff', 'lh', 'mg'].forEach(function (i) { $('#' + i).oninput = style; $('#' + i).onchange = style; }); style();
    [].forEach.call(root.querySelectorAll('[data-c]'), function (b) { b.onmousedown = function (e) { e.preventDefault(); document.execCommand(b.getAttribute('data-c')); }; });
    ed.addEventListener('input', function () { CSC.safe.set('csc_mppeb', ed.innerHTML); });
    ed.addEventListener('paste', function (e) { e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
    $('#pr').onclick = function () { CSC.printHTML('<div style="font-family:' + $('#ff').value + ';font-size:' + $('#fs').value + 'pt;line-height:' + $('#lh').value + ';padding:' + $('#mg').value + 'mm">' + ed.innerHTML + '</div>'); };
  };

  /* =============== CSC stamp maker =============== */
  T.csc_stamp_maker = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card no-print">' +
      '<div class="field"><label for="shape">Shape</label><select id="shape"><option value="rect">Rectangle</option><option value="round">Round</option></select></div>' +
      '<div class="field"><label for="l1">Line 1 (large)</label><input id="l1" value="CSC CENTRE"></div><div class="field"><label for="l2">Line 2</label><input id="l2" placeholder="VLE name"></div><div class="field"><label for="l3">Line 3</label><input id="l3" placeholder="Village / Block / District"></div><div class="field"><label for="l4">Line 4</label><input id="l4" placeholder="Mobile / VLE ID"></div>' +
      '<div class="row2"><div class="field"><label for="col">Ink colour</label><select id="col"><option value="#1a3fb5">Blue</option><option value="#b3261e">Red</option><option value="#111111">Black</option><option value="#0b5c3b">Green</option></select></div><div class="field"><label for="sz">Size (mm wide)</label><input id="sz" type="number" value="60" min="25" max="120"></div></div>' +
      '<div class="t-actions"><button class="btn" id="dl"><i class="fa-solid fa-download"></i> Download PNG</button><button class="btn alt" id="pr">Print</button></div><p class="hint">PNG has a clear background so you can place it on documents.</p></div><div class="card"><div class="t-preview" id="pv"></div></div></div>';
    var $ = function (s) { return root.querySelector(s); };
    function build() {
      var round = $('#shape').value === 'round', col = $('#col').value, W = 900, Hh = round ? 900 : 560, c = document.createElement('canvas'); c.width = W; c.height = Hh;
      var x = c.getContext('2d'); x.strokeStyle = x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle';
      var L = ['l1', 'l2', 'l3', 'l4'].map(function (i) { return $('#' + i).value.trim(); }).filter(Boolean);
      if (round) { x.lineWidth = 14; x.beginPath(); x.arc(450, 450, 430, 0, 7); x.stroke(); x.lineWidth = 5; x.beginPath(); x.arc(450, 450, 400, 0, 7); x.stroke(); } else { x.lineWidth = 14; x.strokeRect(12, 12, W - 24, Hh - 24); x.lineWidth = 5; x.strokeRect(36, 36, W - 72, Hh - 72); }
      var inner = round ? 560 : 740, gap = (round ? 560 : 400) / Math.max(L.length, 1), y0 = Hh / 2 - gap * (L.length - 1) / 2;
      L.forEach(function (t, i) { var size = i === 0 ? 96 : 60; x.font = 'bold ' + size + 'px Arial'; while (x.measureText(t).width > inner && size > 18) { size -= 2; x.font = 'bold ' + size + 'px Arial'; } x.fillText(t, W / 2, y0 + gap * i, inner); });
      return c;
    }
    var cur; function show() { cur = build(); cur.style.maxWidth = '100%'; $('#pv').innerHTML = ''; $('#pv').appendChild(cur); }
    root.addEventListener('input', show); show();
    $('#dl').onclick = async function () { CSC.download(await CSC.canvasBlob(cur, 'image/png'), 'stamp.png'); };
    $('#pr').onclick = function () { var mm = +$('#sz').value || 60; CSC.printHTML('<div style="padding:15mm"><img src="' + cur.toDataURL('image/png') + '" style="width:' + mm + 'mm"></div>'); };
  };

  /* =============== ID cards (shared) =============== */
  var CARD_CSS = '.idc{width:85.6mm;height:54mm;box-sizing:border-box;border:.3mm solid #999;border-radius:3mm;overflow:hidden;position:relative;font-family:Arial,sans-serif;background:#fff;color:#000;page-break-inside:avoid}' +
    '.idc .hd{padding:2mm 3mm;color:#fff;text-align:center;font-weight:bold;font-size:9.5pt;line-height:1.15}.idc .hd small{display:block;font-weight:normal;font-size:6.5pt}.idc .bd{display:flex;gap:3mm;padding:2.5mm 3mm}' +
    '.idc .ph{width:20mm;height:25mm;border:.3mm solid #666;object-fit:cover;flex:none;background:#eee}.idc table{font-size:7.5pt;border-collapse:collapse;width:100%}.idc td{padding:.5mm .8mm;vertical-align:top}.idc td:first-child{font-weight:bold;white-space:nowrap;width:1%}' +
    '.idc .ft{position:absolute;bottom:0;left:0;right:0;height:5mm;color:#fff;font-size:6.5pt;text-align:center;line-height:5mm}.idc .sg{position:absolute;right:3mm;bottom:6mm;font-size:6pt;text-align:center}.idc .sg img{height:6mm;display:block;margin:0 auto}' +
    '.idc.bk{padding:3mm 4mm;font-size:7.5pt;line-height:1.35}.idc.bk b{font-size:8pt}.csheet{display:grid;grid-template-columns:repeat(2,85.6mm);gap:5mm 6mm;justify-content:center;padding:10mm 0}.cpair{display:contents}';
  function idCard(v, cfg) {
    var rows = cfg.rows.filter(function (r) { return v[r[0]]; }).map(function (r) { return '<tr><td>' + esc(r[1]) + '</td><td>: ' + (r[2] === 'date' ? dmy(v[r[0]]) : esc(v[r[0]])) + '</td></tr>'; }).join('');
    var front = '<div class="idc"><div class="hd" style="background:' + esc(v.col) + '">' + esc(v.org || cfg.orgDef) + (v.sub ? '<small>' + esc(v.sub) + '</small>' : '') + '</div><div class="bd">' + (v.ph ? '<img class="ph" alt="" src="' + v.ph + '">' : '<div class="ph"></div>') + '<table>' + rows + '</table></div>' +
      (v.sg ? '<div class="sg"><img alt="" src="' + v.sg + '">Signature</div>' : '') + '<div class="ft" style="background:' + esc(v.col) + '">' + esc(cfg.title) + '</div></div>';
    var back = '<div class="idc bk"><b>' + esc(v.org || cfg.orgDef) + '</b><br>' + (v.ad ? '<b>Address:</b> ' + nl2br(v.ad) + '<br>' : '') + (v.ph1 ? '<b>Phone:</b> ' + esc(v.ph1) + '<br>' : '') + (v.val ? '<b>Valid up to:</b> ' + dmy(v.val) + '<br>' : '') + '<br>' + esc(v.tc || 'If found, please return to the address above.') + '</div>';
    return [front, back];
  }
  function cardFields(cfg) {
    return [{ id: 'org', label: cfg.orgLabel || 'Organisation name', def: cfg.orgDef }, { id: 'sub', label: 'Sub line (affiliation / address)' }, { id: 'col', label: 'Header colour', type: 'color', def: cfg.col || '#0b5c3b' },
      { id: 'ph', label: 'Photo', type: 'photo', max: 400 }, { id: 'sg', label: 'Signature (optional)', type: 'photo', max: 300 }]
      .concat(cfg.rows.map(function (r) { return { id: r[0], label: r[1], type: r[2] }; }))
      .concat([{ id: 'ad', label: 'Address (back of card)', type: 'textarea', rows: 2 }, { id: 'ph1', label: 'Contact phone (back)' }, { id: 'val', label: 'Valid up to (optional)', type: 'date' }, { id: 'tc', label: 'Back note', def: 'If found, please return to the address above.' },
        { id: 'cp', label: 'Number of cards to print (1 to 10)', type: 'number', def: 2 }]);
  }
  function idTool(key, cfg) {
    return function (root) {
      docTool(root, {
        key: key, css: CARD_CSS, paper: false, btn: 'Print cards (front + back)', fields: cardFields(cfg),
        render: function (v) { var c = idCard(v, cfg); return '<div style="display:flex;gap:14px;flex-wrap:wrap;padding:6px;background:#fff;border:1px solid var(--line)">' + c[0] + c[1] + '</div><p class="hint">Card size 85.6 × 54 mm (standard PVC / ID size). Each row prints front and back side by side.</p>'; },
        print: function (v) { var c = idCard(v, cfg), n = Math.max(1, Math.min(10, Math.round(num(v.cp)) || 1)), s = ''; for (var i = 0; i < n; i++) s += c[0] + c[1]; return '<div class="csheet">' + s + '</div>'; }
      });
    };
  }
  var BASE = [['nm', 'Name'], ['fa', "Father's / Guardian name"], ['dob', 'Date of birth', 'date'], ['bg', 'Blood group'], ['mb', 'Mobile']];
  T.student_id_creator = idTool('student1', { title: 'STUDENT IDENTITY CARD', orgDef: 'School Name', rows: [['nm', 'Name'], ['fa', "Father's name"], ['cl', 'Class / Section'], ['rn', 'Roll / Adm. no.'], ['dob', 'D.O.B.', 'date'], ['bg', 'Blood group'], ['mb', 'Mobile'], ['ss', 'Session']] });
  T.student_id_card = idTool('student2', { title: 'STUDENT IDENTITY CARD', orgDef: 'School / College Name', col: '#1a3fb5', rows: [['nm', 'Name'], ['fa', "Father's name"], ['cl', 'Class / Course'], ['rn', 'Roll no.'], ['dob', 'D.O.B.', 'date'], ['mb', 'Mobile']] });
  T.farmer_id_maker = idTool('farmer', { title: 'FARMER IDENTITY CARD', orgDef: 'Farmer Registry / Kisan Card', orgLabel: 'Heading', col: '#2e7d32', rows: [['nm', 'Name'], ['fa', "Father's name"], ['vl', 'Village'], ['ds', 'District'], ['ln', 'Land area'], ['kid', 'Farmer ID'], ['ad2', 'Aadhaar (last 4 digits)'], ['mb', 'Mobile']] });
  T.pvc_id_print = idTool('pvc', { title: 'IDENTITY CARD', orgDef: 'Organisation Name', rows: BASE.concat([['dg', 'Designation / ID no.']]) });
  T.id_card_print = idTool('idcard', { title: 'IDENTITY CARD', orgDef: 'Organisation Name', col: '#7b1fa2', rows: BASE.concat([['dg', 'Designation / ID no.']]) });

  /* Multiple ID cards: paste a list, add photos in the same order */
  T.multiple_id_card_print = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card no-print"><div class="field"><label for="org">Organisation name</label><input id="org" value="School / Organisation Name"></div><div class="field"><label for="col">Header colour</label><input type="color" id="col" value="#0b5c3b"></div>' +
      '<div class="field"><label for="ti">Footer text</label><input id="ti" value="IDENTITY CARD"></div><div class="field"><label for="ls">One person per line: Name | Father name | Class or ID | Mobile</label><textarea id="ls" rows="7" placeholder="Rahul Kumar | Ramesh Kumar | 10-A | 9876543210"></textarea></div>' +
      '<div class="field"><label for="ph">Photos (select all, same order as the list; sorted by file name)</label><input type="file" id="ph" accept="image/*" multiple></div><div class="t-actions"><button class="btn" id="pr"><i class="fa-solid fa-print"></i> Print cards</button></div><p class="hint">10 cards per A4 page (front side). Missing photos leave an empty box.</p></div><div><div id="pv" style="background:#fff;border:1px solid var(--line);overflow:auto"></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, photos = [];
    function cards() {
      return $('#ls').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l, i) {
        var p = l.split('|').map(function (x) { return x.trim(); });
        return idCard({ org: $('#org').value, col: $('#col').value, ph: photos[i] || '', nm: p[0], fa: p[1], dg: p[2], mb: p[3] }, { title: $('#ti').value, orgDef: '', rows: [['nm', 'Name'], ['fa', "Father's name"], ['dg', 'Class / ID'], ['mb', 'Mobile']] })[0];
      });
    }
    function show() { var c = cards(); $('#pv').innerHTML = '<style>' + CARD_CSS + '</style><div class="csheet" style="padding:8px">' + (c.join('') || '<p class="hint">Add names to see cards.</p>') + '</div>'; }
    root.addEventListener('input', show);
    $('#ph').onchange = async function () {
      var fl = [].slice.call(this.files).sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); }); photos = [];
      for (var i = 0; i < fl.length; i++) { try { photos.push(await readPhoto(fl[i], 400)); } catch (e) { photos.push(''); CSC.toast(e.message, true); } } show();
    };
    $('#pr').onclick = function () { var c = cards(); if (!c.length) return CSC.toast('Add at least one name', true); var out = ''; for (var i = 0; i < c.length; i += 10) out += '<div class="csheet" style="page-break-after:always">' + c.slice(i, i + 10).join('') + '</div>'; CSC.printHTML(out, CARD_CSS); };
    show();
  };

  /* =============== PAN / Aadhaar actual-size print =============== */
  T.pan_aadhaar_print = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card no-print"><div class="field"><label>Front side image</label><div id="d1"></div></div><div class="field"><label>Back side image (optional)</label><div id="d2"></div></div>' +
      '<div class="field"><label for="sz">Card size</label><select id="sz"><option value="85.6x54">Standard card 85.6 × 54 mm (PAN, ATM, PVC)</option><option value="90x58">Aadhaar print 90 × 58 mm</option><option value="100x65">Large 100 × 65 mm</option></select></div>' +
      '<div class="field"><label for="lay">Layout</label><select id="lay"><option value="side">Front and back side by side</option><option value="stack">Front above back</option></select></div><div class="field"><label for="bd">Border</label><select id="bd"><option value="1">Thin cut line</option><option value="0">No border</option></select></div>' +
      '<div class="t-actions"><button class="btn" id="pr"><i class="fa-solid fa-print"></i> Print on A4</button><button class="btn alt" id="pdf">Download PDF</button></div><p class="hint">Cards print at exact size. Set the printer scale to 100% (Actual size).</p></div><div class="card"><div class="t-preview" id="pv"></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, imgs = [null, null];
    [1, 2].forEach(function (n) { $('#d' + n).appendChild(CSC.dropzone({ accept: 'image/*', icon: 'fa-id-card', label: n === 1 ? 'Choose front image' : 'Choose back image', onFiles: async function (f) { try { imgs[n - 1] = await CSC.fileToImage(f[0]); build(); } catch (e) { CSC.toast(e.message, true); } } })); });
    var page = null;
    function build() {
      if (!imgs[0] && !imgs[1]) return; var d = 300, W = Math.round(210 / 25.4 * d), H = Math.round(297 / 25.4 * d), s = $('#sz').value.split('x'), cw = Math.round(+s[0] / 25.4 * d), ch = Math.round(+s[1] / 25.4 * d);
      var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
      var side = $('#lay').value === 'side', list = imgs.filter(Boolean), g = Math.round(8 / 25.4 * d), tw = side ? list.length * cw + (list.length - 1) * g : cw, th = side ? ch : list.length * ch + (list.length - 1) * g, ox = Math.round((W - tw) / 2), oy = Math.round(20 / 25.4 * d);
      list.forEach(function (im, i) { var px = side ? ox + i * (cw + g) : ox, py = side ? oy : oy + i * (ch + g); x.drawImage(im, px, py, cw, ch); if ($('#bd').value === '1') { x.strokeStyle = '#999'; x.lineWidth = 2; x.setLineDash([10, 8]); x.strokeRect(px, py, cw, ch); x.setLineDash([]); } });
      page = c; c.style.maxWidth = '100%'; $('#pv').innerHTML = ''; $('#pv').appendChild(c);
    }
    ['sz', 'lay', 'bd'].forEach(function (i) { $('#' + i).onchange = build; });
    $('#pr').onclick = function () { if (!page) return CSC.toast('Choose an image first', true); CSC.printHTML('<img src="' + page.toDataURL('image/jpeg', 0.95) + '" style="width:210mm;height:297mm;display:block">'); };
    $('#pdf').onclick = async function () {
      if (!page) return CSC.toast('Choose an image first', true); await CSC.loadScript(CSC.libs.pdflib); var doc = await PDFLib.PDFDocument.create(), im = await doc.embedJpg(await (await CSC.canvasBlob(page, 'image/jpeg', 0.95)).arrayBuffer()), pg = doc.addPage([595.28, 841.89]);
      pg.drawImage(im, { x: 0, y: 0, width: 595.28, height: 841.89 }); CSC.download(new Blob([await doc.save()], { type: 'application/pdf' }), 'card-print.pdf');
    };
  };

  /* =============== Aliases: duplicate file names from the original 58-template set =============== */
  ['pdf_merge:pdf_merger', 'pdf_split:pdf_splitter', 'photo_signature_joiner:photo_sign_joiner', 'photo_name_joiner:name_date_photo', 'passport_photo_sheet:ai_passport_studio'].forEach(function (p) {
    var a = p.split(':'); T[a[0]] = function (root) { return T[a[1]](root); };
  });
  T.resume_builder = function (root) { root.innerHTML = '<div class="card"><p>The resume maker has several templates.</p><p><a class="btn" href="haryana-resume-generator.html"><i class="fa-solid fa-id-badge"></i> Open Resume Builder</a></p></div>'; };
})();
