/* SevaSphere: PDF tools (merge, split, JPG to PDF, watermark, Word to PDF) */
(function () {
  'use strict';
  var CSC = window.CSC, T = CSC.tools, h = CSC.h, esc = CSC.esc;

  var A4 = [595.28, 841.89];
  function base(name) { return name.replace(/\.[^.]+$/, ''); }
  function readBuf(f) { return f.arrayBuffer(); }
  async function loadPdf(file) {
    await CSC.loadScript(CSC.libs.pdflib);
    try { return await PDFLib.PDFDocument.load(await readBuf(file)); }
    catch (e) { throw new Error('Cannot open "' + file.name + '". It may be password protected or damaged.'); }
  }
  function pdfBlob(bytes) { return new Blob([bytes], { type: 'application/pdf' }); }

  /* Re-orderable file list. items: [{file,...}]. render() draws into ul. */
  function fileList(ul, items, onChange, label) {
    ul.innerHTML = '';
    items.forEach(function (it, i) {
      var li = h('li', {}, [
        h('span', { class: 'nm', title: it.file.name }, (i + 1) + '. ' + it.file.name + (label ? label(it) : '')),
        h('span', { class: 'hint' }, CSC.fmtBytes(it.file.size)),
        h('button', { type: 'button', 'aria-label': 'Move up', onclick: function () { if (i > 0) { items.splice(i - 1, 0, items.splice(i, 1)[0]); onChange(); } } }, '↑'),
        h('button', { type: 'button', 'aria-label': 'Move down', onclick: function () { if (i < items.length - 1) { items.splice(i + 1, 0, items.splice(i, 1)[0]); onChange(); } } }, '↓'),
        h('button', { type: 'button', 'aria-label': 'Remove', onclick: function () { items.splice(i, 1); onChange(); } }, '✕')
      ]);
      ul.appendChild(li);
    });
  }

  /* Parse "1-3, 5, 8-" into a sorted list of 0-based page indexes. */
  function parseRanges(str, n) {
    var out = [], seen = {};
    str.split(',').forEach(function (part) {
      part = part.trim(); if (!part) return;
      var m = part.match(/^(\d*)\s*-\s*(\d*)$/), a, b;
      if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; }
      else if (/^\d+$/.test(part)) { a = b = +part; }
      else throw new Error('Cannot understand "' + part + '". Use a format like 1-3, 5, 8-');
      if (a < 1 || b > n || a > b) throw new Error('Pages must be between 1 and ' + n + ' (got "' + part + '")');
      for (var p = a; p <= b; p++) if (!seen[p]) { seen[p] = 1; out.push(p - 1); }
    });
    if (!out.length) throw new Error('Enter at least one page');
    return out;
  }

  /* ================= PDF Merger ================= */
  T.pdf_merger = function (root) {
    root.innerHTML = '<div class="card" style="max-width:760px;margin:0 auto"><div id="dz"></div><ul class="t-list" id="ls"></ul>' +
      '<p class="hint" id="info">Add two or more PDF files. Use the arrows to set the order.</p>' +
      '<div class="t-actions"><button class="btn" id="go" disabled><i class="fa-solid fa-object-group"></i> Merge PDFs</button></div></div>';
    var $ = function (s) { return root.querySelector(s); }, items = [];
    function draw() {
      fileList($('#ls'), items, draw, function (it) { return it.pages ? ' (' + it.pages + ' pages)' : ''; });
      $('#go').disabled = items.length < 2;
      $('#info').textContent = items.length ? items.length + ' file(s), ' + items.reduce(function (a, b) { return a + (b.pages || 0); }, 0) + ' pages in total.' : 'Add two or more PDF files. Use the arrows to set the order.';
    }
    $('#dz').appendChild(CSC.dropzone({
      accept: 'application/pdf,.pdf', multiple: true, icon: 'fa-file-pdf', label: 'Choose PDF files or drop them here',
      onFiles: async function (fs) {
        for (var i = 0; i < fs.length; i++) {
          if (!/\.pdf$/i.test(fs[i].name) && fs[i].type !== 'application/pdf') { CSC.toast(fs[i].name + ' is not a PDF', true); continue; }
          try { var d = await loadPdf(fs[i]); items.push({ file: fs[i], pages: d.getPageCount() }); } catch (e) { CSC.toast(e.message, true); }
        }
        draw();
      }
    }));
    $('#go').onclick = async function () {
      var btn = this; btn.disabled = true;
      try {
        var out = await PDFLib.PDFDocument.create();
        for (var i = 0; i < items.length; i++) {
          var src = await loadPdf(items[i].file), pgs = await out.copyPages(src, src.getPageIndices());
          pgs.forEach(function (p) { out.addPage(p); });
        }
        CSC.download(pdfBlob(await out.save()), 'merged.pdf'); CSC.toast('Merged PDF downloaded');
      } catch (e) { CSC.toast(e.message, true); }
      btn.disabled = items.length < 2;
    };
    draw();
  };

  /* ================= PDF Splitter ================= */
  T.pdf_splitter = function (root) {
    root.innerHTML = '<div class="card" style="max-width:760px;margin:0 auto"><div id="dz"></div><div id="opts" style="display:none;margin-top:14px">' +
      '<p id="info" class="t-stat"></p>' +
      '<div class="field"><label>What do you want?</label><select id="mode"><option value="range">Extract selected pages into one PDF</option><option value="each">Split into single pages (ZIP)</option><option value="chunks">Split into parts of N pages (ZIP)</option></select></div>' +
      '<div class="field" id="rBox"><label>Pages (example: 1-3, 5, 8-)</label><input type="text" id="rng" placeholder="1-3, 5"></div>' +
      '<div class="field" id="nBox" style="display:none"><label>Pages per part</label><input type="number" id="nn" min="1" value="2"></div>' +
      '<div class="t-actions"><button class="btn" id="go"><i class="fa-solid fa-scissors"></i> Split PDF</button></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, doc = null, file = null;
    $('#mode').onchange = function () { $('#rBox').style.display = this.value === 'range' ? '' : 'none'; $('#nBox').style.display = this.value === 'chunks' ? '' : 'none'; };
    $('#dz').appendChild(CSC.dropzone({
      accept: 'application/pdf,.pdf', icon: 'fa-file-pdf', label: 'Choose a PDF file or drop it here',
      onFiles: async function (fs) {
        try { doc = await loadPdf(fs[0]); file = fs[0]; $('#opts').style.display = ''; $('#info').textContent = file.name + ': ' + doc.getPageCount() + ' pages'; $('#rng').value = '1-' + doc.getPageCount(); }
        catch (e) { CSC.toast(e.message, true); }
      }
    }));
    async function make(idx) { var o = await PDFLib.PDFDocument.create(), pg = await o.copyPages(doc, idx); pg.forEach(function (p) { o.addPage(p); }); return o.save(); }
    $('#go').onclick = async function () {
      if (!doc) return; var btn = this; btn.disabled = true;
      try {
        var n = doc.getPageCount(), mode = $('#mode').value, nm = base(file.name);
        if (mode === 'range') { CSC.download(pdfBlob(await make(parseRanges($('#rng').value, n))), nm + '_pages.pdf'); }
        else {
          var size = mode === 'each' ? 1 : Math.max(1, parseInt($('#nn').value, 10) || 1), parts = [];
          for (var s = 0; s < n; s += size) { var idx = []; for (var p = s; p < Math.min(n, s + size); p++) idx.push(p); parts.push(idx); }
          if (parts.length > 300) throw new Error('That would make ' + parts.length + ' files. Use a larger part size.');
          await CSC.loadScript(CSC.libs.jszip); var zip = new JSZip();
          for (var i = 0; i < parts.length; i++) zip.file(nm + '_' + (size === 1 ? 'page' + (parts[i][0] + 1) : 'part' + (i + 1)) + '.pdf', await make(parts[i]));
          CSC.download(await zip.generateAsync({ type: 'blob' }), nm + '_split.zip');
        }
        CSC.toast('Done. Your download has started.');
      } catch (e) { CSC.toast(e.message, true); }
      btn.disabled = false;
    };
  };

  /* ================= JPG to PDF ================= */
  T.jpg_to_pdf = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card"><div id="dz"></div><ul class="t-list" id="ls"></ul>' +
      '<div class="field"><label>Page size</label><select id="ps"><option value="a4">A4 (image fitted on page)</option><option value="fit">Same size as each image</option></select></div>' +
      '<div class="field"><label>Margin (mm, A4 only)</label><input type="number" id="mg" value="10" min="0" max="50"></div>' +
      '<div class="field"><label>Quality</label><select id="q"><option value="0.92">High</option><option value="0.75" selected>Medium (smaller file)</option><option value="0.5">Low (smallest file)</option></select></div>' +
      '<div class="t-actions"><button class="btn" id="go" disabled><i class="fa-solid fa-file-pdf"></i> Create PDF</button></div></div>' +
      '<div class="card"><p class="hint" id="info">Add one or more images. Each image becomes one page, in the order shown.</p></div></div>';
    var $ = function (s) { return root.querySelector(s); }, items = [];
    function draw() { fileList($('#ls'), items, draw); $('#go').disabled = !items.length; $('#info').textContent = items.length ? items.length + ' image(s) will become ' + items.length + ' page(s).' : 'Add one or more images. Each image becomes one page, in the order shown.'; }
    $('#dz').appendChild(CSC.dropzone({
      accept: 'image/*', multiple: true, icon: 'fa-images', label: 'Choose images or drop them here',
      onFiles: function (fs) { fs.forEach(function (f) { if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)) items.push({ file: f }); else CSC.toast(f.name + ' is not an image', true); }); draw(); }
    }));
    $('#go').onclick = async function () {
      var btn = this; btn.disabled = true;
      try {
        await CSC.loadScript(CSC.libs.pdflib);
        var doc = await PDFLib.PDFDocument.create(), q = parseFloat($('#q').value), mg = (parseFloat($('#mg').value) || 0) * 72 / 25.4, fit = $('#ps').value === 'fit';
        for (var i = 0; i < items.length; i++) {
          var img = await CSC.fileToImage(items[i].file), c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0);
          URL.revokeObjectURL(img._url);
          var jpg = await doc.embedJpg(await (await CSC.canvasBlob(c, 'image/jpeg', q)).arrayBuffer()), page;
          if (fit) { page = doc.addPage([c.width * 0.75, c.height * 0.75]); page.drawImage(jpg, { x: 0, y: 0, width: c.width * 0.75, height: c.height * 0.75 }); }
          else {
            var land = c.width > c.height, pw = land ? A4[1] : A4[0], ph = land ? A4[0] : A4[1];
            var s = Math.min((pw - 2 * mg) / c.width, (ph - 2 * mg) / c.height), w = c.width * s, hh = c.height * s;
            page = doc.addPage([pw, ph]); page.drawImage(jpg, { x: (pw - w) / 2, y: (ph - hh) / 2, width: w, height: hh });
          }
        }
        CSC.download(pdfBlob(await doc.save()), items.length === 1 ? base(items[0].file.name) + '.pdf' : 'images.pdf'); CSC.toast('PDF downloaded');
      } catch (e) { CSC.toast(e.message, true); }
      btn.disabled = !items.length;
    };
    draw();
  };

  /* ================= PDF Watermark ================= */
  T.pdf_watermark = function (root) {
    root.innerHTML = '<div class="card" style="max-width:760px;margin:0 auto"><div id="dz"></div><div id="opts" style="display:none;margin-top:14px"><p class="t-stat" id="info"></p>' +
      '<div class="field"><label>Watermark text</label><input type="text" id="tx" value="CONFIDENTIAL" maxlength="60"></div>' +
      '<div class="row2"><div class="field"><label>Font size</label><input type="number" id="sz" value="60" min="8" max="300"></div><div class="field"><label>Rotation (degrees)</label><input type="number" id="rot" value="45" min="-90" max="90"></div></div>' +
      '<div class="row2"><div class="field"><label>Opacity (%)</label><input type="number" id="op" value="25" min="5" max="100"></div><div class="field"><label>Colour</label><input type="color" id="col" value="#888888"></div></div>' +
      '<div class="field"><label>Pages (leave blank for all)</label><input type="text" id="rng" placeholder="1-3, 5"></div>' +
      '<p class="hint">Use English letters and numbers. Hindi text is not supported in PDF watermarks.</p>' +
      '<div class="t-actions"><button class="btn" id="go"><i class="fa-solid fa-droplet"></i> Add Watermark</button></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, file = null, n = 0;
    $('#dz').appendChild(CSC.dropzone({
      accept: 'application/pdf,.pdf', icon: 'fa-file-pdf', label: 'Choose a PDF file or drop it here',
      onFiles: async function (fs) { try { var d = await loadPdf(fs[0]); file = fs[0]; n = d.getPageCount(); $('#opts').style.display = ''; $('#info').textContent = file.name + ': ' + n + ' pages'; } catch (e) { CSC.toast(e.message, true); } }
    }));
    $('#go').onclick = async function () {
      if (!file) return; var btn = this; btn.disabled = true;
      try {
        var text = $('#tx').value.trim(); if (!text) throw new Error('Enter the watermark text');
        if (/[^\x20-\x7e]/.test(text)) throw new Error('Use English letters and numbers only');
        var doc = await loadPdf(file), font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold), pages = doc.getPages();
        var idx = $('#rng').value.trim() ? parseRanges($('#rng').value, n) : pages.map(function (p, i) { return i; });
        var size = +$('#sz').value || 60, ang = (+$('#rot').value || 0) * Math.PI / 180, op = Math.min(1, Math.max(0.05, (+$('#op').value || 25) / 100));
        var rgb = CSC.hexRgb($('#col').value), w = font.widthOfTextAtSize(text, size), s = size * 0.3;
        idx.forEach(function (i) {
          var pg = pages[i], sz = pg.getSize(), cx = sz.width / 2, cy = sz.height / 2;
          pg.drawText(text, { x: cx - (w / 2 * Math.cos(ang) - s * Math.sin(ang)), y: cy - (w / 2 * Math.sin(ang) + s * Math.cos(ang)), size: size, font: font, color: PDFLib.rgb(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255), opacity: op, rotate: PDFLib.degrees(+$('#rot').value || 0) });
        });
        CSC.download(pdfBlob(await doc.save()), base(file.name) + '_watermarked.pdf'); CSC.toast('Watermarked PDF downloaded');
      } catch (e) { CSC.toast(e.message, true); }
      btn.disabled = false;
    };
  };
  CSC.hexRgb = CSC.hexRgb || function (hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

  /* ================= Word to PDF ================= */
  T.word_to_pdf = function (root) {
    root.innerHTML = '<div class="card" style="max-width:900px;margin:0 auto"><div id="dz"></div><div id="opts" style="display:none;margin-top:14px"><p class="t-stat" id="info"></p>' +
      '<p class="hint">Plain text, tables, lists and pictures are kept. Complex layouts (text boxes, columns, headers) can look different from Word.</p>' +
      '<div class="t-actions"><button class="btn" id="go"><i class="fa-solid fa-file-pdf"></i> Download PDF</button></div>' +
      '<h3 style="margin-top:16px">Preview</h3><div id="pv" class="t-paper" style="overflow:auto"></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, file = null;
    $('#dz').appendChild(CSC.dropzone({
      accept: '.docx', icon: 'fa-file-word', label: 'Choose a .docx file or drop it here',
      onFiles: async function (fs) {
        var f = fs[0]; if (!/\.docx$/i.test(f.name)) return CSC.toast('Only .docx files are supported. Save old .doc files as .docx in Word first.', true);
        try { await CSC.loadScript(CSC.libs.mammoth); var r = await mammoth.convertToHtml({ arrayBuffer: await readBuf(f) }); file = f; $('#pv').innerHTML = r.value || '<p>(This document is empty)</p>'; $('#info').textContent = f.name; $('#opts').style.display = ''; }
        catch (e) { CSC.toast('Cannot read this Word file: ' + e.message, true); }
      }
    }));
    $('#go').onclick = async function () {
      if (!file) return; var btn = this; btn.disabled = true;
      try {
        await CSC.loadScript(CSC.libs.html2pdf);
        var el = $('#pv').cloneNode(true); el.style.cssText = 'font-family:"Times New Roman",serif;font-size:12pt;color:#000;background:#fff;width:180mm';
        await html2pdf().set({ margin: [12, 15, 12, 15], filename: base(file.name) + '.pdf', image: { type: 'jpeg', quality: 0.95 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } }).from(el).save();
      } catch (e) { CSC.toast(e.message, true); }
      btn.disabled = false;
    };
  };
})();
