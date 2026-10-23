/* SevaSphere: photo and image tools */
(function () {
  'use strict';
  var CSC = window.CSC, T = CSC.tools, h = CSC.h, esc = CSC.esc;
  CSC.libs = CSC.libs || {
    pdflib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    tesseract: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js',
    qrcode: 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
    html2pdf: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
  };

  var MM = function (mm, dpi) { return Math.round(mm * dpi / 25.4); };
  var today = function () { var d = new Date(); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); };

  /* Fill-and-fit helper: draw image into box keeping ratio (cover) */
  function drawCover(ctx, img, x, y, w, hh) {
    var s = Math.max(w / img.width, hh / img.height), sw = w / s, sh = hh / s;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, hh);
  }
  function drawContain(ctx, img, x, y, w, hh) {
    var s = Math.min(w / img.width, hh / img.height), dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (hh - dh) / 2, dw, dh);
  }
  function toCanvas(img, maxSide) {
    var s = Math.min(1, (maxSide || 1600) / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    var c = document.createElement('canvas'); c.width = Math.round((img.naturalWidth || img.width) * s); c.height = Math.round((img.naturalHeight || img.height) * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
  }
  function hexToRgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

  /* Remove a plain background by flood fill from the borders. Returns a new canvas with transparency. */
  CSC.removeBg = function (src, key, tol, smooth, refine) {
    var w = src.width, hh = src.height, c = document.createElement('canvas'); c.width = w; c.height = hh;
    var x = c.getContext('2d'); x.drawImage(src, 0, 0);
    var id = x.getImageData(0, 0, w, hh), d = id.data, seen = new Uint8Array(w * hh), stack = [];
    var lim = tol * tol * 3;
    function match(i) { var dr = d[i] - key[0], dg = d[i + 1] - key[1], db = d[i + 2] - key[2]; return dr * dr + dg * dg + db * db <= lim; }
    function push(px, py) { var k = py * w + px; if (!seen[k] && match(k * 4)) { seen[k] = 1; stack.push(k); } }
    for (var i = 0; i < w; i++) { push(i, 0); push(i, hh - 1); }
    for (var j = 0; j < hh; j++) { push(0, j); push(w - 1, j); }
    while (stack.length) {
      var k = stack.pop(), px = k % w, py = (k / w) | 0;
      if (px > 0) push(px - 1, py); if (px < w - 1) push(px + 1, py); if (py > 0) push(px, py - 1); if (py < hh - 1) push(px, py + 1);
    }
    for (var m = 0; m < seen.length; m++) if (seen[m]) d[m * 4 + 3] = 0;
    if (refine > 0) { // partial transparency for hair strands: pixels near the removed area fade by how close they are to the key colour, and key colour is un-mixed from them
      var R = Math.max(1, Math.round(refine / 25)), band = new Uint8Array(w * hh), cur = [], nb, q;
      function nbrs(k, fn) { var px = k % w, py = (k / w) | 0; if (px > 0) fn(k - 1); if (px < w - 1) fn(k + 1); if (py > 0) fn(k - w); if (py < hh - 1) fn(k + w); }
      for (var k0 = 0; k0 < seen.length; k0++) if (seen[k0]) nbrs(k0, function (n) { if (!seen[n] && !band[n]) { band[n] = 1; cur.push(n); } });
      for (var st = 1; st < R; st++) { nb = []; cur.forEach(function (k) { nbrs(k, function (n) { if (!seen[n] && !band[n]) { band[n] = 1; nb.push(n); } }); }); cur = cur.concat(nb); }
      for (var bi = 0; bi < band.length; bi++) {
        if (!band[bi]) continue; q = bi * 4;
        var dr = d[q] - key[0], dg = d[q + 1] - key[1], db = d[q + 2] - key[2], D = Math.sqrt(dr * dr + dg * dg + db * db), al = Math.max(0, Math.min(1, (D - tol * 0.8) / (tol * 0.9)));
        if (al < 0.03) { d[q + 3] = 0; continue; }
        for (var ch = 0; ch < 3; ch++) d[q + ch] = Math.max(0, Math.min(255, Math.round((d[q + ch] - (1 - al) * key[ch]) / al)));
        d[q + 3] = Math.round(al * 255);
      }
    }
    if (smooth) { // soften the cut edge: blur only the alpha channel
      var a = new Uint8Array(w * hh); for (var q = 0; q < a.length; q++) a[q] = d[q * 4 + 3];
      for (var yy = 1; yy < hh - 1; yy++) for (var xx = 1; xx < w - 1; xx++) {
        var p = yy * w + xx; if (a[p] === 0 || a[p] === 255 && !(a[p - 1] === 0 || a[p + 1] === 0 || a[p - w] === 0 || a[p + w] === 0)) continue;
        var s = 0; for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) s += a[p + oy * w + ox];
        d[p * 4 + 3] = Math.round(s / 9);
      }
      // edge pixels next to removed area
      for (var yy2 = 1; yy2 < hh - 1; yy2++) for (var xx2 = 1; xx2 < w - 1; xx2++) {
        var p2 = yy2 * w + xx2; if (a[p2] === 255 && (a[p2 - 1] === 0 || a[p2 + 1] === 0 || a[p2 - w] === 0 || a[p2 + w] === 0)) {
          var s2 = 0; for (var oy2 = -1; oy2 <= 1; oy2++) for (var ox2 = -1; ox2 <= 1; ox2++) s2 += a[p2 + oy2 * w + ox2]; d[p2 * 4 + 3] = Math.round(s2 / 9);
        }
      }
    }
    x.putImageData(id, 0, 0); return c;
  };
  function cornerColor(c) {
    var x = c.getContext('2d'), n = Math.max(2, Math.min(10, c.width >> 4)), r = 0, g = 0, b = 0, t = 0;
    [[0, 0], [c.width - n, 0]].forEach(function (p) { var d = x.getImageData(p[0], p[1], n, n).data; for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; t++; } });
    return [Math.round(r / t), Math.round(g / t), Math.round(b / t)];
  }
  function rgbHex(c) { return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); }

  /* Signature clean-up: remove paper background and/or change ink colour. Returns a canvas. */
  function signFx(c, o) {
    var x = c.getContext('2d'), id = x.getImageData(0, 0, c.width, c.height), d = id.data, n = d.length, hist = new Uint32Array(256), i, l;
    for (i = 0; i < n; i += 4) hist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++;
    var tot = n / 4, acc = 0, bgL = 255;
    for (l = 255; l >= 0; l--) { acc += hist[l]; if (acc > tot * 0.25) { bgL = l; break; } } // paper = the brightest quarter
    var lo = o.tol * 0.6, hi = lo + Math.max(25, bgL * 0.35), col = o.recolor ? hexToRgb(o.color) : null;
    for (i = 0; i < n; i += 4) {
      l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      var diff = bgL - l, a = o.rm ? (diff <= lo ? 0 : diff >= hi ? 1 : (diff - lo) / (hi - lo)) : Math.max(0, Math.min(1, diff / Math.max(40, bgL * 0.6)));
      var rgb = col || [0, 1, 2].map(function (k) { return a > 0.02 ? Math.max(0, Math.min(255, (d[i + k] - (1 - a) * bgL) / a)) : 0; });
      if (o.transparent) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = Math.round(a * 255); }
      else { for (var k = 0; k < 3; k++) d[i + k] = Math.round(rgb[k] * a + 255 * (1 - a)); d[i + 3] = 255; }
    }
    x.putImageData(id, 0, 0); return c;
  }

  /* ================= Resizer family ================= */
  function resizer(cfg) {
    return function (root) {
      var frameHtml = cfg.frame ? '<div class="field"><label><input type="checkbox" id="fr"> Add a frame (border)</label></div><div class="row2" id="frBox" style="display:none"><div class="field"><label>Frame width: <span id="fwv">2</span> px</label><input type="range" id="fw" min="1" max="5" value="2"></div><div class="field"><label>Frame colour</label><input type="color" id="fc" value="#000000"></div></div>' : '';
      var signHtml = cfg.sign ? '<div class="field"><label><input type="checkbox" id="sbr"> Remove paper background</label></div><div id="sbBox" style="display:none"><div class="row2"><div class="field"><label>Removal strength: <span id="sbv">35</span></label><input type="range" id="sbt" min="5" max="90" value="35"></div><div class="field"><label>After removing</label><select id="sbg"><option value="white">White background (JPG)</option><option value="transparent">Transparent (PNG)</option></select></div></div></div>' +
        '<div class="field"><label><input type="checkbox" id="sic"> Change signature colour</label></div><div id="siBox" style="display:none"><div class="field"><label>Signature colour</label><input type="color" id="sc" value="#0b2a8a"></div></div>' : '';
      root.innerHTML =
        '<div class="t-grid3"><div class="card no-print opt"><div id="dz"></div><div id="opts" style="display:none;margin-top:14px">' +
        '<div class="field"><label>Preset size</label><select id="pre">' + cfg.presets.map(function (p, i) { return '<option value="' + i + '">' + esc(p.n) + '</option>'; }).join('') + '<option value="custom">Custom</option></select></div>' +
        '<div class="row2"><div class="field"><label>Width</label><input type="number" id="w" min="1" step="any"></div><div class="field"><label>Height</label><input type="number" id="hh" min="1" step="any"></div></div>' +
        '<div class="row2"><div class="field"><label>Unit</label><select id="u"><option value="px">pixels</option><option value="mm">mm</option><option value="cm">cm</option><option value="in">inch</option></select></div>' +
        '<div class="field" id="dpiBox" style="display:none"><label>DPI</label><input type="number" id="dpi" value="300" min="72"></div></div>' +
        '<div class="row2"><div class="field"><label>Maximum size (KB)</label><input type="number" id="kb" min="2"></div><div class="field"><label>Format</label><select id="fmt"><option value="jpg">JPG (smaller)</option><option value="png">PNG</option></select></div></div>' +
        frameHtml + signHtml +
        '<p class="hint">Drag the corner or side handles to size the crop box, or drag inside it to move it. The box keeps the shape of the size you choose. Always check the size rules on your own form.</p>' +
        '<div class="t-actions"><button class="btn" id="go"><i class="fa-solid fa-gear"></i> Crop &amp; Resize</button></div></div></div>' +
        '<div class="card" id="cropCard"><h3 class="pane-t">1. Crop</h3><div id="cropHost" style="text-align:center"><p class="hint">Choose a photo to start.</p></div></div>' +
        '<div class="card" id="outCard"><h3 class="pane-t">2. Result</h3><div id="stats"></div><div class="t-preview" id="pv" style="margin-top:10px"><p class="hint">Your resized picture will show here, next to the crop.</p></div><div class="t-actions"><button class="btn" id="dl" disabled><i class="fa-solid fa-download"></i> Download</button></div></div></div>';
      var $ = function (s) { return root.querySelector(s); }, cr = null, out = null, srcName = 'image', cur = null;
      function dims() {
        var w = parseFloat($('#w').value), hh = parseFloat($('#hh').value), u = $('#u').value, dpi = parseFloat($('#dpi').value) || 300;
        var f = u === 'px' ? 1 : u === 'mm' ? dpi / 25.4 : u === 'cm' ? dpi / 2.54 : dpi;
        return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(hh * f)) };
      }
      function applyPreset() {
        var v = $('#pre').value; if (v === 'custom') return;
        var p = cfg.presets[+v]; $('#u').value = p.u || 'px'; $('#dpiBox').style.display = $('#u').value === 'px' ? 'none' : '';
        $('#w').value = p.w; $('#hh').value = p.h; $('#kb').value = p.kb || '';
        aspect();
      }
      function aspect() { if (cr) { var w = parseFloat($('#w').value), hh = parseFloat($('#hh').value); if (w > 0 && hh > 0) cr.setAspect(w / hh); } }
      function tog(chk, box) { var c = $(chk), b = $(box); if (c && b) c.onchange = function () { b.style.display = c.checked ? '' : 'none'; }; }
      tog('#fr', '#frBox'); tog('#sbr', '#sbBox'); tog('#sic', '#siBox');
      if ($('#fw')) $('#fw').oninput = function () { $('#fwv').textContent = this.value; };
      if ($('#sbt')) $('#sbt').oninput = function () { $('#sbv').textContent = this.value; };
      $('#pre').onchange = applyPreset;
      ['w', 'hh'].forEach(function (id) { $('#' + id).oninput = function () { $('#pre').value = 'custom'; aspect(); }; });
      $('#u').onchange = function () { $('#dpiBox').style.display = $('#u').value === 'px' ? 'none' : ''; $('#pre').value = 'custom'; };
      $('#dz').appendChild(CSC.dropzone({
        accept: 'image/*', label: cfg.label || 'Choose a photo or drop it here', icon: 'fa-image', onFiles: async function (f) {
          try {
            var img = await CSC.fileToImage(f[0]); srcName = f[0].name.replace(/\.[^.]+$/, '');
            $('#opts').style.display = ''; out = null; $('#dl').disabled = true; $('#stats').innerHTML = '';
            $('#pv').innerHTML = '<p class="hint">Press Crop &amp; Resize. The result will show here, next to the crop.</p>';
            var host = $('#cropHost'); host.innerHTML = '';
            var w = parseFloat($('#w').value), hh = parseFloat($('#hh').value);
            cr = CSC.cropper(img, { aspect: w > 0 && hh > 0 ? w / hh : 0, maxWidth: 420 }); host.appendChild(cr.el);
          } catch (e) { CSC.toast(e.message, true); }
        }
      }));
      $('#go').onclick = async function () {
        if (!cr) return; var d = dims(), kb = parseFloat($('#kb').value), png = $('#fmt').value === 'png';
        if (!(d.w > 0 && d.h > 0)) return CSC.toast('Enter width and height', true);
        if (d.w * d.h > 36e6) return CSC.toast('That size is too large', true);
        var c = cr.getCanvas(d.w, d.h), blob, transparent = false, note = '';
        if (cfg.sign) {
          var rm = $('#sbr').checked, rc = $('#sic').checked; transparent = rm && $('#sbg').value === 'transparent';
          if (rm || rc) c = signFx(c, { rm: rm, tol: +$('#sbt').value, recolor: rc, color: $('#sc').value, transparent: transparent });
        }
        if (cfg.frame && $('#fr').checked) CSC.addFrame(c, +$('#fw').value, $('#fc').value);
        if (transparent) png = true;
        if (kb > 0) blob = png ? await CSC.canvasBlob(c, 'image/png') : await CSC.fitToKB(c, kb, 0, { keepDims: true });
        else blob = await CSC.canvasBlob(c, png ? 'image/png' : 'image/jpeg', 0.92);
        if (png && kb > 0 && blob.size > kb * 1024) { blob = await CSC.fitToKB(c, kb, 0, { keepDims: true }); note = transparent ? 'Transparent PNG is bigger than your KB limit, so a JPG with white background was made. Raise the KB limit to keep transparency.' : 'PNG is too big for that limit, so a JPG was made instead.'; CSC.toast(note); }
        out = { blob: blob, ext: blob.type === 'image/png' ? 'png' : 'jpg' };
        if (cur) URL.revokeObjectURL(cur); cur = URL.createObjectURL(blob);
        $('#pv').innerHTML = '<img alt="Result" src="' + cur + '">';
        var ok = !(kb > 0) || blob.size <= kb * 1024;
        $('#stats').innerHTML = '<span class="t-stat">' + c.width + ' × ' + c.height + ' px</span><span class="t-stat">' + CSC.fmtBytes(blob.size) + '</span>' + (ok ? '' : '<span class="err"> Still above ' + kb + ' KB</span>');
        $('#dl').disabled = false;
      };
      $('#dl').onclick = function () { if (out) CSC.download(out.blob, srcName + '_' + (cfg.suffix || 'resized') + '.' + out.ext); };
      $('#pre').value = '0'; applyPreset();
    };
  }
  T.photo_resizer = resizer({
    suffix: 'photo', frame: true, presets: [
      { n: 'Passport photo 35 × 45 mm, max 100 KB', w: 35, h: 45, u: 'mm', kb: 100 },
      { n: 'Photo 100 × 120 px, max 50 KB', w: 100, h: 120, kb: 50 },
      { n: 'Photo 200 × 230 px, max 100 KB', w: 200, h: 230, kb: 100 },
      { n: 'Photo 3.5 × 4.5 cm, max 200 KB', w: 3.5, h: 4.5, u: 'cm', kb: 200 },
      { n: 'Square 350 × 350 px, max 200 KB', w: 350, h: 350, kb: 200 }]
  });
  T.sign_resizer = resizer({
    suffix: 'sign', sign: true, label: 'Choose the signature image', presets: [
      { n: 'Signature 140 × 60 px, max 20 KB', w: 140, h: 60, kb: 20 },
      { n: 'Signature 140 × 60 px, max 10 KB', w: 140, h: 60, kb: 10 },
      { n: 'Signature 200 × 80 px, max 30 KB', w: 200, h: 80, kb: 30 },
      { n: 'Signature 4 × 2 cm, max 50 KB', w: 4, h: 2, u: 'cm', kb: 50 }]
  });
  T.thumb_resizer = resizer({
    suffix: 'thumb', label: 'Choose the thumb impression image', presets: [
      { n: 'Thumb 240 × 240 px, max 50 KB', w: 240, h: 240, kb: 50 },
      { n: 'Thumb 200 × 230 px, max 50 KB', w: 200, h: 230, kb: 50 },
      { n: 'Thumb 3 × 2.5 cm, max 50 KB', w: 3, h: 2.5, u: 'cm', kb: 50 }]
  });

  /* ================= Image Crop ================= */
  T.image_crop = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card no-print"><div id="dz"></div><div id="o" style="display:none;margin-top:14px">' +
      '<div class="field"><label>Shape of crop box</label><select id="ar"><option value="0">Free</option><option value="1">Square 1:1</option><option value="1.3333">4:3</option><option value="1.7778">16:9</option><option value="0.7778">35:45 (passport)</option><option value="0.75">3:4</option><option value="1.5">3:2</option></select></div>' +
      '<div class="field"><label>Output format</label><select id="f"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div>' +
      '<div class="field"><label>Scale output to width (px, optional)</label><input type="number" id="ow" min="1" placeholder="Original crop size"></div>' +
      '<div class="t-actions"><button class="btn" id="go"><i class="fa-solid fa-crop"></i> Crop &amp; Download</button></div></div></div>' +
      '<div class="card"><div id="host" style="text-align:center"><p class="hint">Choose an image to start.</p></div><div id="stats" style="margin-top:8px"></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, cr, name = 'image';
    $('#dz').appendChild(CSC.dropzone({
      accept: 'image/*', icon: 'fa-image', label: 'Choose an image', onFiles: async function (f) {
        try { var img = await CSC.fileToImage(f[0]); name = f[0].name.replace(/\.[^.]+$/, ''); $('#o').style.display = ''; var hst = $('#host'); hst.innerHTML = ''; cr = CSC.cropper(img, { aspect: parseFloat($('#ar').value) || 0, maxWidth: 640 }); hst.appendChild(cr.el); } catch (e) { CSC.toast(e.message, true); }
      }
    }));
    $('#ar').onchange = function () { if (cr) cr.setAspect(parseFloat($('#ar').value) || 0); };
    $('#go').onclick = async function () {
      if (!cr) return; var r = cr.rect(), ow = parseInt($('#ow').value, 10), w = ow > 0 ? ow : Math.round(r.w), hh = Math.round(w * r.h / r.w);
      var type = $('#f').value, c = cr.getCanvas(w, hh);
      if (type === 'image/jpeg') { var f = document.createElement('canvas'); f.width = c.width; f.height = c.height; var x = f.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, f.width, f.height); x.drawImage(c, 0, 0); c = f; }
      var b = await CSC.canvasBlob(c, type, 0.92); $('#stats').innerHTML = '<span class="t-stat">' + w + ' × ' + hh + ' px</span><span class="t-stat">' + CSC.fmtBytes(b.size) + '</span>';
      CSC.download(b, name + '_crop.' + (type === 'image/jpeg' ? 'jpg' : type.split('/')[1]));
    };
  };

  /* ================= Image Compressor ================= */
  T.image_compressor = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card no-print"><div id="dz"></div><div style="margin-top:14px"><div class="row2"><div class="field"><label>Target size (KB)</label><input type="number" id="kb" value="100" min="2"></div>' +
      '<div class="field"><label>Shrink width to (px, optional)</label><input type="number" id="mw" min="1" placeholder="Keep size"></div></div>' +
      '<div class="field"><label>Compression style</label><select id="md"><option value="clear">Best clarity (recommended)</option><option value="keep">Keep exact pixel size</option></select></div>' +
      '<p class="hint"><b>Best clarity</b> keeps the picture sharp: it lowers JPG quality only a little and, if the target is still not reached, shrinks the pixels slightly. <b>Keep exact pixel size</b> never changes width and height but can look soft at very small targets. Changing a setting re-compresses your pictures.</p></div></div>' +
      '<div class="card"><ul class="t-list" id="ls"><li class="hint">No images yet.</li></ul><div class="t-actions"><button class="btn" id="all" disabled><i class="fa-solid fa-file-zipper"></i> Download all (ZIP)</button></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, files = [], results = [], timer, token = 0;
    async function run() {
      if (!files.length) return; var my = ++token, kb = parseFloat($('#kb').value) || 100, mw = parseInt($('#mw').value, 10), keep = $('#md').value === 'keep';
      $('#ls').innerHTML = ''; results = []; $('#all').disabled = true;
      for (var i = 0; i < files.length; i++) {
        var f = files[i], li = h('li', {}, [h('span', { class: 'nm' }, f.name + ' …')]); $('#ls').appendChild(li);
        try {
          var img = await CSC.fileToImage(f), c = document.createElement('canvas'), W = img.naturalWidth, H = img.naturalHeight;
          if (mw > 0 && W > mw) { H = Math.round(H * mw / W); W = mw; }
          c.width = W; c.height = H; var x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, W, H);
          var b = await CSC.fitToKB(c, kb, 0, { keepDims: keep }); if (my !== token) return;
          var nm = f.name.replace(/\.[^.]+$/, '') + '_compressed.jpg'; results.push({ b: b, nm: nm });
          var ok = b.size <= kb * 1024, dm = await CSC.fileToImage(b);
          li.innerHTML = '<span class="nm">' + esc(f.name) + '</span><span class="t-stat">' + CSC.fmtBytes(f.size) + ' → ' + CSC.fmtBytes(b.size) + '</span><span class="t-stat">' + dm.naturalWidth + '×' + dm.naturalHeight + '</span>' + (ok ? '' : '<span class="err"> above ' + kb + ' KB</span>');
          li.appendChild(h('button', { title: 'Download', 'aria-label': 'Download', onclick: (function (r) { return function () { CSC.download(r.b, r.nm); }; })(results[results.length - 1]) }, [h('i', { class: 'fa-solid fa-download' })]));
        } catch (e) { li.innerHTML = '<span class="nm err">' + esc(f.name) + ': ' + esc(e.message) + '</span>'; }
      }
      $('#all').disabled = results.length < 2;
    }
    function again() { clearTimeout(timer); timer = setTimeout(run, 500); }
    ['kb', 'mw'].forEach(function (i) { $('#' + i).oninput = again; }); $('#md').onchange = run;
    $('#dz').appendChild(CSC.dropzone({ accept: 'image/*', multiple: true, icon: 'fa-compress', label: 'Choose one or many images', onFiles: function (fs) { files = [].slice.call(fs); run(); } }));
    $('#all').onclick = async function () { await CSC.loadScript(CSC.libs.jszip); var z = new JSZip(); results.forEach(function (r) { z.file(r.nm, r.b); }); CSC.download(await z.generateAsync({ type: 'blob' }), 'compressed_images.zip'); };
  };

  /* ================= Image Converter ================= */
  T.image_converter_pro = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card no-print"><div id="dz"></div><div style="margin-top:14px"><div class="field"><label>Convert to (you can change this after choosing your pictures)</label><select id="f"><option value="image/jpeg|jpg">JPG</option><option value="image/png|png">PNG</option><option value="image/webp|webp">WebP</option></select></div>' +
      '<div class="field" id="qb"><label>Quality (JPG/WebP): <span id="qv">90</span>%</label><input type="range" id="q" value="90" min="10" max="100"></div><p class="hint">Transparent areas become white when converting to JPG. Pictures convert again automatically when you change the format or quality.</p></div></div>' +
      '<div class="card"><ul class="t-list" id="ls"><li class="hint">No images yet.</li></ul><div class="t-actions"><button class="btn" id="all" disabled><i class="fa-solid fa-file-zipper"></i> Download all (ZIP)</button></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, items = [], res = [], timer, token = 0;
    function fmtUI() { var p = $('#f').value.split('|'); $('#qb').style.display = p[1] === 'png' ? 'none' : ''; $('#qv').textContent = $('#q').value; }
    async function run() {
      if (!items.length) return; var my = ++token, p = $('#f').value.split('|'), q = (parseInt($('#q').value, 10) || 90) / 100; $('#ls').innerHTML = ''; res = []; $('#all').disabled = true;
      for (var i = 0; i < items.length; i++) {
        var it = items[i], li = h('li', {}, h('span', { class: 'nm' }, it.name)); $('#ls').appendChild(li);
        try {
          var im = it.im, c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; var x = c.getContext('2d');
          if (p[0] === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.drawImage(im, 0, 0);
          var b = await CSC.canvasBlob(c, p[0], q); if (my !== token) return;
          if (!b || b.type !== p[0]) throw new Error('Your browser cannot save ' + p[1].toUpperCase());
          var nm = it.name.replace(/\.[^.]+$/, '') + '.' + p[1]; res.push({ b: b, nm: nm });
          li.appendChild(h('span', { class: 't-stat' }, p[1].toUpperCase() + ' · ' + CSC.fmtBytes(b.size)));
          li.appendChild(h('button', { 'aria-label': 'Download', onclick: (function (r) { return function () { CSC.download(r.b, r.nm); }; })(res[res.length - 1]) }, h('i', { class: 'fa-solid fa-download' })));
        } catch (e) { li.appendChild(h('span', { class: 'err' }, e.message)); }
      }
      $('#all').disabled = res.length < 2;
    }
    $('#f').onchange = function () { fmtUI(); run(); };
    $('#q').oninput = function () { fmtUI(); clearTimeout(timer); timer = setTimeout(run, 300); };
    $('#dz').appendChild(CSC.dropzone({
      accept: 'image/*', multiple: true, icon: 'fa-right-left', label: 'Choose images to convert', onFiles: async function (files) {
        items = []; $('#ls').innerHTML = '<li class="hint">Loading…</li>';
        for (var i = 0; i < files.length; i++) { try { items.push({ name: files[i].name, im: await CSC.fileToImage(files[i]) }); } catch (e) { CSC.toast(files[i].name + ': ' + e.message, true); } }
        run();
      }
    }));
    $('#all').onclick = async function () { await CSC.loadScript(CSC.libs.jszip); var z = new JSZip(); res.forEach(function (r) { z.file(r.nm, r.b); }); CSC.download(await z.generateAsync({ type: 'blob' }), 'converted_images.zip'); };
    fmtUI();
  };

  /* Soften / shrink the cut-out edge of a transparent canvas (alpha only). */
  function refineAlpha(src, shrink, soft) {
    var w = src.width, hh = src.height, c = document.createElement('canvas'); c.width = w; c.height = hh; var x = c.getContext('2d'); x.drawImage(src, 0, 0);
    var id = x.getImageData(0, 0, w, hh), d = id.data, a = new Uint8Array(w * hh), t = new Uint8Array(w * hh), i, p, s, y, xx;
    for (i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    for (s = 0; s < shrink; s++) { for (y = 1; y < hh - 1; y++) for (xx = 1; xx < w - 1; xx++) { p = y * w + xx; t[p] = Math.min(a[p], a[p - 1], a[p + 1], a[p - w], a[p + w]); } var sw = a; a = t; t = sw; }
    for (s = 0; s < soft; s++) {
      for (y = 1; y < hh - 1; y++) for (xx = 1; xx < w - 1; xx++) { p = y * w + xx; t[p] = (a[p - 1] + a[p] + a[p + 1]) / 3; }
      var s2 = a; a = new Uint8Array(w * hh);
      for (y = 1; y < hh - 1; y++) for (xx = 1; xx < w - 1; xx++) { p = y * w + xx; a[p] = (t[p - w] + t[p] + t[p + w]) / 3; }
    }
    for (i = 0; i < a.length; i++) d[i * 4 + 3] = a[i];
    x.putImageData(id, 0, 0); return c;
  }
  var AI_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm';

  /* ================= Background remover ================= */
  T.bg_remover = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card no-print"><div id="dz"></div><div id="o" style="display:none;margin-top:14px">' +
      '<div class="field"><label>Method</label><select id="mode"><option value="plain">Plain background (fast, works offline)</option><option value="ai">AI cut-out, any background (beta)</option></select></div>' +
      '<div id="plainBox"><p class="note">Plain mode removes an even background (studio wall, white or blue sheet). Click the picture to pick the colour to remove.</p>' +
      '<div class="row2" style="margin-top:10px"><div class="field"><label>Colour to remove</label><input type="color" id="key" value="#ffffff"></div><div class="field"><label>Strength: <span id="tv">40</span></label><input type="range" id="tol" min="5" max="120" value="40"></div></div>' +
      '<div class="field"><label>Hair &amp; edge refinement: <span id="rv">60</span></label><input type="range" id="rf" min="0" max="100" value="60"></div>' +
      '<label><input type="checkbox" id="sm" checked> Smooth the edges</label></div>' +
      '<div id="aiBox" style="display:none"><p class="note">AI mode finds the person or object itself. The first time it downloads a model (about 40 MB), so it needs internet and a few seconds. The photo stays on your device.</p>' +
      '<div class="t-actions"><button class="btn" id="aiGo"><i class="fa-solid fa-wand-magic-sparkles"></i> Run AI cut-out</button></div><div id="aiSt" class="hint"></div>' +
      '<div class="row2" style="margin-top:10px"><div class="field"><label>Edge shrink: <span id="shv">1</span> px</label><input type="range" id="sh" min="0" max="4" value="1"></div><div class="field"><label>Edge softness: <span id="sov">1</span></label><input type="range" id="so" min="0" max="4" value="1"></div></div></div>' +
      '<div class="row2" style="margin-top:10px"><div class="field"><label>New background</label><select id="bg"><option value="none">Transparent (PNG)</option><option value="#ffffff">White</option><option value="#1e66d0">Blue</option><option value="#d12b2b">Red</option><option value="custom">Custom colour</option></select></div><div class="field"><label>Custom colour</label><input type="color" id="cu" value="#cfe8ff"></div></div>' +
      '<div class="t-actions"><button class="btn" id="dl"><i class="fa-solid fa-download"></i> Download</button></div></div></div>' +
      '<div class="card"><div class="t-preview" id="pv"><p class="hint">Choose a photo to start.</p></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, src, cut, aiRaw, name = 'photo', timer;
    function ai() { return $('#mode').value === 'ai'; }
    function bgColor() { var v = $('#bg').value; return v === 'none' ? null : v === 'custom' ? $('#cu').value : v; }
    function compose(c) {
      var o = document.createElement('canvas'); o.width = c.width; o.height = c.height; var x = o.getContext('2d'), bc = bgColor();
      if (bc) { x.fillStyle = bc; x.fillRect(0, 0, o.width, o.height); } x.drawImage(c, 0, 0); return o;
    }
    function run() {
      if (!src) return;
      if (ai()) { if (aiRaw) { cut = refineAlpha(aiRaw, +$('#sh').value, +$('#so').value); show(); } else { $('#pv').innerHTML = '<p class="hint">Press “Run AI cut-out”.</p>'; } return; }
      cut = CSC.removeBg(src, hexToRgb($('#key').value), +$('#tol').value, $('#sm').checked, +$('#rf').value); show();
    }
    function show() {
      if (!cut) return; var o = compose(cut); var pv = $('#pv'); pv.innerHTML = ''; pv.appendChild(o);
      if (!ai()) { o.style.cursor = 'crosshair'; o.title = 'Click to pick the colour to remove'; o.onclick = function (e) { var b = o.getBoundingClientRect(), px = Math.round((e.clientX - b.left) * src.width / b.width), py = Math.round((e.clientY - b.top) * src.height / b.height); var d = src.getContext('2d').getImageData(px, py, 1, 1).data; $('#key').value = rgbHex([d[0], d[1], d[2]]); run(); }; }
    }
    $('#mode').onchange = function () { $('#plainBox').style.display = ai() ? 'none' : ''; $('#aiBox').style.display = ai() ? '' : 'none'; run(); };
    $('#aiGo').onclick = async function () {
      if (!src) return; var st = $('#aiSt'), btn = this; btn.disabled = true; st.textContent = 'Loading AI model… please wait.';
      try {
        var mod = await import(AI_URL), fn = mod.removeBackground || mod.default;
        var blob = await CSC.canvasBlob(src, 'image/png');
        var out = await fn(blob, { output: { format: 'image/png' }, progress: function (key, cur, tot) { if (tot) st.textContent = (key.indexOf('fetch') === 0 ? 'Downloading model ' : 'Working ') + Math.round(cur * 100 / tot) + '%'; } });
        var im = await CSC.fileToImage(out); aiRaw = document.createElement('canvas'); aiRaw.width = src.width; aiRaw.height = src.height; aiRaw.getContext('2d').drawImage(im, 0, 0, src.width, src.height);
        st.textContent = 'Done. Adjust edge shrink and softness if you see a light halo.'; run();
      } catch (e) { console.error(e); st.innerHTML = '<span class="err">AI cut-out could not start (' + esc(e.message || 'network error') + '). Check your internet connection, or use Plain background mode.</span>'; }
      btn.disabled = false;
    };
    ['key', 'sm'].forEach(function (i) { $('#' + i).onchange = run; });
    $('#tol').oninput = function () { $('#tv').textContent = this.value; clearTimeout(timer); timer = setTimeout(run, 120); };
    $('#rf').oninput = function () { $('#rv').textContent = this.value; clearTimeout(timer); timer = setTimeout(run, 120); };
    ['sh', 'so'].forEach(function (i) { $('#' + i).oninput = function () { $('#' + (i === 'sh' ? 'shv' : 'sov')).textContent = this.value; clearTimeout(timer); timer = setTimeout(run, 120); }; });
    ['bg', 'cu'].forEach(function (i) { $('#' + i).onchange = show; });
    $('#dz').appendChild(CSC.dropzone({
      accept: 'image/*', icon: 'fa-wand-magic-sparkles', label: 'Choose a photo', onFiles: async function (f) {
        try { var im = await CSC.fileToImage(f[0]); name = f[0].name.replace(/\.[^.]+$/, ''); src = toCanvas(im, 1200); aiRaw = null; $('#aiSt').textContent = ''; $('#key').value = rgbHex(cornerColor(src)); $('#o').style.display = ''; run(); } catch (e) { CSC.toast(e.message, true); }
      }
    }));
    $('#dl').onclick = async function () { if (!cut) return; var o = compose(cut), bc = bgColor(); CSC.download(await CSC.canvasBlob(o, bc ? 'image/jpeg' : 'image/png', 0.95), name + (bc ? '_bg.jpg' : '_nobg.png')); };
  };

  /* ================= Passport & stamp photo studio ================= */
  T.ai_passport_studio = function (root) {
    var SIZES = [['Passport 35 × 45 mm', 35, 45], ['Stamp 25 × 35 mm', 25, 35], ['Small stamp 20 × 25 mm', 20, 25], ['Square 51 × 51 mm (2 × 2 in)', 51, 51], ['Visa 33 × 48 mm', 33, 48], ['Custom', 0, 0]];
    var SHEETS = [['A4 (210 × 297 mm)', 210, 297], ['4 × 6 inch (102 × 152 mm)', 102, 152], ['A5 (148 × 210 mm)', 148, 210], ['5 × 7 inch (127 × 178 mm)', 127, 178]];
    root.innerHTML = '<div class="t-grid3"><div class="card no-print opt"><div id="dz"></div><div id="o" style="display:none;margin-top:14px">' +
      '<div class="field"><label>Photo size</label><select id="sz">' + SIZES.map(function (s, i) { return '<option value="' + i + '">' + s[0] + '</option>'; }).join('') + '</select></div>' +
      '<div class="row2" id="cust" style="display:none"><div class="field"><label>Width (mm)</label><input type="number" id="cw" value="35"></div><div class="field"><label>Height (mm)</label><input type="number" id="ch" value="45"></div></div>' +
      '<div class="row2"><div class="field"><label>Paper</label><select id="sh">' + SHEETS.map(function (s, i) { return '<option value="' + i + '">' + s[0] + '</option>'; }).join('') + '</select></div><div class="field"><label>Copies (0 = fill page)</label><input type="number" id="n" value="0" min="0" max="200"></div></div>' +
      '<div class="row2"><div class="field"><label>Background</label><select id="bg"><option value="keep">Keep original</option><option value="#ffffff">White</option><option value="#1e66d0">Blue</option><option value="#d12b2b">Red</option><option value="#e8e8e8">Light grey</option></select></div><div class="field"><label>Remove colour strength</label><input type="range" id="tol" min="10" max="100" value="40"></div></div>' +
      '<p class="hint">To change the background, pick a colour above. The plain wall colour in the photo corners is replaced. Use a photo with an even background.</p>' +
      '<div class="field"><label><input type="checkbox" id="fr"> Add a frame around each photo</label></div><div class="row2" id="frBox" style="display:none"><div class="field"><label>Frame width: <span id="fwv">2</span> px</label><input type="range" id="fw" min="1" max="5" value="2"></div><div class="field"><label>Frame colour</label><input type="color" id="fc" value="#000000"></div></div>' +
      '<label><input type="checkbox" id="ln" checked> Thin cut lines</label>' +
      '<p class="hint" style="margin-top:8px">Drag the crop box over the face first. Then press Make sheet.</p>' +
      '<div class="t-actions"><button class="btn" id="go"><i class="fa-solid fa-table-cells"></i> Make sheet</button></div></div></div>' +
      '<div class="card" id="cc"><h3 class="pane-t">1. Crop</h3><div id="host" style="text-align:center"><p class="hint">Choose a photo to start.</p></div></div>' +
      '<div class="card" id="oc"><h3 class="pane-t">2. Photo sheet</h3><div id="st"></div><div class="t-preview" id="pv" style="margin-top:8px"><p class="hint">Your photo sheet will show here, next to the crop.</p></div><div class="t-actions"><button class="btn" id="dlj"><i class="fa-solid fa-image"></i> Download JPG</button><button class="btn alt" id="dlp"><i class="fa-solid fa-file-pdf"></i> Download PDF</button><button class="btn alt" id="pr"><i class="fa-solid fa-print"></i> Print</button></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, cr, sheet, DPI = 300;
    function size() { var s = SIZES[+$('#sz').value]; return s[1] ? { w: s[1], h: s[2] } : { w: +$('#cw').value || 35, h: +$('#ch').value || 45 }; }
    function asp() { var s = size(); if (cr) cr.setAspect(s.w / s.h); }
    $('#fr').onchange = function () { $('#frBox').style.display = this.checked ? '' : 'none'; };
    $('#fw').oninput = function () { $('#fwv').textContent = this.value; };
    $('#sz').onchange = function () { $('#cust').style.display = SIZES[+this.value][1] ? 'none' : ''; asp(); };
    ['cw', 'ch'].forEach(function (i) { $('#' + i).oninput = asp; });
    $('#dz').appendChild(CSC.dropzone({
      accept: 'image/*', icon: 'fa-user-large', label: 'Choose a photo', onFiles: async function (f) {
        try { var im = await CSC.fileToImage(f[0]); $('#o').style.display = ''; $('#pv').innerHTML = '<p class="hint">Press Make sheet. The result will show here, next to the crop.</p>'; $('#st').innerHTML = ''; var hst = $('#host'); hst.innerHTML = ''; var s = size(); cr = CSC.cropper(im, { aspect: s.w / s.h, maxWidth: 420 }); hst.appendChild(cr.el); } catch (e) { CSC.toast(e.message, true); }
      }
    }));
    $('#go').onclick = function () {
      if (!cr) return; var s = size(), pw = MM(s.w, DPI), ph = MM(s.h, DPI), sh = SHEETS[+$('#sh').value], SW = MM(sh[1], DPI), SH = MM(sh[2], DPI);
      var one = cr.getCanvas(pw, ph), bg = $('#bg').value;
      if (bg !== 'keep') { var cut = CSC.removeBg(one, cornerColor(one), +$('#tol').value, true, 60), f = document.createElement('canvas'); f.width = pw; f.height = ph; var fx = f.getContext('2d'); fx.fillStyle = bg; fx.fillRect(0, 0, pw, ph); fx.drawImage(cut, 0, 0); one = f; }
      if ($('#fr').checked) CSC.addFrame(one, +$('#fw').value, $('#fc').value);
      var gap = MM(2, DPI), margin = MM(6, DPI), cols = Math.max(1, Math.floor((SW - 2 * margin + gap) / (pw + gap))), rows = Math.max(1, Math.floor((SH - 2 * margin + gap) / (ph + gap)));
      var cap = cols * rows, n = parseInt($('#n').value, 10) || 0; if (n <= 0 || n > cap) n = cap;
      sheet = document.createElement('canvas'); sheet.width = SW; sheet.height = SH; var x = sheet.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, SW, SH);
      var used = Math.min(cols, n), gridW = used * pw + (used - 1) * gap, x0 = Math.round((SW - gridW) / 2);
      for (var i = 0; i < n; i++) { var cx = x0 + (i % cols) * (pw + gap), cy = margin + Math.floor(i / cols) * (ph + gap); x.drawImage(one, cx, cy); if ($('#ln').checked) { x.strokeStyle = '#888'; x.lineWidth = 1; x.strokeRect(cx - 0.5, cy - 0.5, pw + 1, ph + 1); } }
      $('#pv').innerHTML = ''; $('#pv').appendChild(sheet); sheet.style.maxHeight = '620px'; sheet.style.width = 'auto';
      $('#st').innerHTML = '<span class="t-stat">' + n + ' photos</span><span class="t-stat">' + s.w + ' × ' + s.h + ' mm</span><span class="t-stat">' + sh[0] + '</span>' + (n === cap ? '' : '');
      
    };
    function jpg() { return CSC.canvasBlob(sheet, 'image/jpeg', 0.95); }
    $('#dlj').onclick = async function () { if (sheet) CSC.download(await jpg(), 'photo_sheet.jpg'); };
    $('#dlp').onclick = async function () {
      if (!sheet) return; await CSC.loadScript(CSC.libs.pdflib); var sh = SHEETS[+$('#sh').value], doc = await PDFLib.PDFDocument.create(), pg = doc.addPage([sh[1] / 25.4 * 72, sh[2] / 25.4 * 72]);
      var im = await doc.embedJpg(await (await jpg()).arrayBuffer()); pg.drawImage(im, { x: 0, y: 0, width: pg.getWidth(), height: pg.getHeight() });
      CSC.download(new Blob([await doc.save()], { type: 'application/pdf' }), 'photo_sheet.pdf');
    };
    $('#pr').onclick = function () { if (!sheet) return; var sh = SHEETS[+$('#sh').value]; CSC.printHTML('<img src="' + sheet.toDataURL('image/jpeg', .95) + '" style="width:' + sh[1] + 'mm;height:' + sh[2] + 'mm;display:block">', '@page{size:' + sh[1] + 'mm ' + sh[2] + 'mm;margin:0}'); };
  };

  /* ================= Name & date on photo ================= */
  T.name_date_photo = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card no-print"><div id="dz"></div><div id="o" style="display:none;margin-top:14px">' +
      '<div class="field"><label>Candidate name</label><input id="nm" placeholder="Full name"></div><div class="field"><label>Date of photo</label><input id="dt" placeholder="DD/MM/YYYY"></div>' +
      '<div class="row2"><div class="field"><label>Output width (px)</label><input type="number" id="w" value="400" min="100"></div><div class="field"><label>Max size (KB, optional)</label><input type="number" id="kb" placeholder="No limit"></div></div>' +
      '<div class="row2"><div class="field"><label>Strip colour</label><input type="color" id="bc" value="#ffffff"></div><div class="field"><label>Text colour</label><input type="color" id="tc" value="#000000"></div></div>' +
      '<div class="field"><label>Text lines</label><select id="ls"><option value="both">Name and date</option><option value="name">Name only</option><option value="date">Date only</option></select></div>' +
      '<div class="t-actions"><button class="btn" id="dl"><i class="fa-solid fa-download"></i> Download</button></div></div></div>' +
      '<div class="card"><div class="t-preview" id="pv"><p class="hint">Choose a photo to start.</p></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, img, c, nm0 = 'photo';
    $('#dt').value = today();
    function draw() {
      if (!img) return; var W = Math.max(100, +$('#w').value || 400), ph = Math.round(W * img.naturalHeight / img.naturalWidth), lines = [], m = $('#ls').value;
      if (m !== 'date' && $('#nm').value.trim()) lines.push($('#nm').value.trim().toUpperCase()); if (m !== 'name' && $('#dt').value.trim()) lines.push($('#dt').value.trim());
      var fs = Math.round(W * 0.075), strip = lines.length ? Math.round(lines.length * fs * 1.35 + fs * 0.4) : 0;
      c = document.createElement('canvas'); c.width = W; c.height = ph + strip; var x = c.getContext('2d');
      x.fillStyle = $('#bc').value; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, W, ph);
      x.fillStyle = $('#tc').value; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 ' + fs + 'px Arial, sans-serif';
      lines.forEach(function (t, i) { var f = fs; x.font = '700 ' + f + 'px Arial'; while (x.measureText(t).width > W * 0.94 && f > 8) { f--; x.font = '700 ' + f + 'px Arial'; } x.fillText(t, W / 2, ph + fs * 0.2 + fs * 0.675 + i * fs * 1.35 + fs * 0.1); });
      $('#pv').innerHTML = ''; $('#pv').appendChild(c);
    }
    ['nm', 'dt', 'w', 'bc', 'tc', 'ls'].forEach(function (i) { $('#' + i).oninput = draw; });
    $('#dz').appendChild(CSC.dropzone({ accept: 'image/*', icon: 'fa-image', label: 'Choose a photo', onFiles: async function (f) { try { img = await CSC.fileToImage(f[0]); nm0 = f[0].name.replace(/\.[^.]+$/, ''); $('#o').style.display = ''; draw(); } catch (e) { CSC.toast(e.message, true); } } }));
    $('#dl').onclick = async function () { if (!c) return; var kb = parseFloat($('#kb').value); CSC.download(kb > 0 ? await CSC.fitToKB(c, kb) : await CSC.canvasBlob(c, 'image/jpeg', 0.95), nm0 + '_name_date.jpg'); };
  };

  /* ================= Photo & signature joiner ================= */
  T.photo_sign_joiner = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card no-print"><div class="field"><label>1. Photo</label><div id="d1"></div></div><div class="field"><label>2. Signature</label><div id="d2"></div></div>' +
      '<div class="row2"><div class="field"><label>Layout</label><select id="ly"><option value="v">Photo above signature</option><option value="h">Side by side</option></select></div><div class="field"><label>Border (px)</label><input type="number" id="bd" value="2" min="0" max="30"></div></div>' +
      '<div class="row2"><div class="field"><label>Photo width (px)</label><input type="number" id="pw" value="200" min="30"></div><div class="field"><label>Photo height (px)</label><input type="number" id="ph" value="230" min="30"></div></div>' +
      '<div class="row2"><div class="field"><label>Signature width (px)</label><input type="number" id="sw" value="200" min="30"></div><div class="field"><label>Signature height (px)</label><input type="number" id="sh" value="80" min="20"></div></div>' +
      '<div class="field"><label>Max size (KB, optional)</label><input type="number" id="kb" placeholder="No limit"></div>' +
      '<p class="hint">Images are stretched to the sizes above. Crop them first with the Photo Resizer if the shape is wrong.</p>' +
      '<div class="t-actions"><button class="btn" id="dl"><i class="fa-solid fa-download"></i> Download</button></div></div>' +
      '<div class="card"><div class="t-preview" id="pv"><p class="hint">Add both images to see the result.</p></div><div id="st" style="margin-top:8px"></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, a, b, c;
    function draw() {
      if (!a || !b) return; var bd = +$('#bd').value || 0, pw = +$('#pw').value, ph = +$('#ph').value, sw = +$('#sw').value, sh = +$('#sh').value, v = $('#ly').value === 'v';
      var W = v ? Math.max(pw, sw) + bd * 2 : pw + sw + bd * 3, H = v ? ph + sh + bd * 3 : Math.max(ph, sh) + bd * 2;
      c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.fillStyle = '#fff';
      if (v) { x.fillRect(bd, bd, W - 2 * bd, ph); x.drawImage(a, bd + (W - 2 * bd - pw) / 2, bd, pw, ph); x.fillRect(bd, ph + 2 * bd, W - 2 * bd, sh); x.drawImage(b, bd + (W - 2 * bd - sw) / 2, ph + 2 * bd, sw, sh); }
      else { x.fillRect(bd, bd, pw, H - 2 * bd); x.drawImage(a, bd, bd, pw, ph); x.fillRect(pw + 2 * bd, bd, sw, H - 2 * bd); x.drawImage(b, pw + 2 * bd, bd, sw, sh); }
      $('#pv').innerHTML = ''; $('#pv').appendChild(c); $('#st').innerHTML = '<span class="t-stat">' + W + ' × ' + H + ' px</span>';
    }
    $('#d1').appendChild(CSC.dropzone({ accept: 'image/*', icon: 'fa-user', label: 'Choose photo', onFiles: async function (f) { try { a = await CSC.fileToImage(f[0]); draw(); } catch (e) { CSC.toast(e.message, true); } } }));
    $('#d2').appendChild(CSC.dropzone({ accept: 'image/*', icon: 'fa-signature', label: 'Choose signature', onFiles: async function (f) { try { b = await CSC.fileToImage(f[0]); draw(); } catch (e) { CSC.toast(e.message, true); } } }));
    ['ly', 'bd', 'pw', 'ph', 'sw', 'sh'].forEach(function (i) { $('#' + i).oninput = draw; });
    $('#dl').onclick = async function () { if (!c) return CSC.toast('Add both images first', true); var kb = parseFloat($('#kb').value); CSC.download(kb > 0 ? await CSC.fitToKB(c, kb) : await CSC.canvasBlob(c, 'image/jpeg', 0.95), 'photo_signature.jpg'); };
  };

  /* ================= OCR ================= */
  T.image_text_extractor = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card no-print"><div id="dz"></div><div class="field" style="margin-top:14px"><label>Language in the image</label><select id="lg"><option value="eng">English</option><option value="hin">Hindi</option><option value="eng+hin">English + Hindi</option></select></div>' +
      '<p class="hint">The first run downloads the language data, so it needs internet and may take a moment. Clear, straight images give the best result.</p><div id="pg" class="hint"></div></div>' +
      '<div class="card"><div class="field"><label>Extracted text</label><textarea id="tx" style="min-height:260px" placeholder="Text will appear here"></textarea></div><div class="t-actions"><button class="btn" id="cp"><i class="fa-solid fa-copy"></i> Copy</button><button class="btn alt" id="sv"><i class="fa-solid fa-download"></i> Save .txt</button></div></div></div>';
    var $ = function (s) { return root.querySelector(s); };
    $('#dz').appendChild(CSC.dropzone({
      accept: 'image/*', icon: 'fa-font', label: 'Choose an image with text', onFiles: async function (f) {
        try {
          $('#pg').textContent = 'Loading reader…'; await CSC.loadScript(CSC.libs.tesseract);
          var r = await Tesseract.recognize(f[0], $('#lg').value, { logger: function (m) { if (m.status) $('#pg').textContent = m.status + (m.progress ? ' ' + Math.round(m.progress * 100) + '%' : ''); } });
          $('#tx').value = r.data.text.trim(); $('#pg').textContent = 'Done.';
        } catch (e) { $('#pg').textContent = ''; CSC.toast(e.message || 'Could not read the image', true); }
      }
    }));
    $('#cp').onclick = function () { $('#tx').select(); try { document.execCommand('copy'); CSC.toast('Copied'); } catch (e) { } };
    $('#sv').onclick = function () { CSC.download(new Blob([$('#tx').value], { type: 'text/plain;charset=utf-8' }), 'extracted_text.txt'); };
  };

  /* ================= WhatsApp image print (multi image to A4 grid) ================= */
  T.whatsapp_image_print = function (root) {
    root.innerHTML = '<div class="t-grid"><div class="card no-print"><div id="dz"></div><div id="o" style="display:none;margin-top:14px">' +
      '<div class="row2"><div class="field"><label>Images per page</label><select id="pp"><option value="1">1 (full page)</option><option value="2" selected>2</option><option value="4">4</option><option value="6">6</option><option value="8">8</option></select></div><div class="field"><label>Fit</label><select id="ft"><option value="contain">Show whole image</option><option value="cover">Fill the box (crop)</option></select></div></div>' +
      '<div class="row2"><div class="field"><label>Brightness: <span id="bv">0</span></label><input type="range" id="br" min="-60" max="60" value="0"></div><div class="field"><label>Contrast: <span id="cv">0</span></label><input type="range" id="ct" min="-50" max="80" value="0"></div></div>' +
      '<label><input type="checkbox" id="gr"> Black &amp; white (saves ink)</label><label style="display:block;margin-top:6px"><input type="checkbox" id="bx" checked> Thin frame around each image</label>' +
      '<div class="t-actions"><button class="btn" id="pr"><i class="fa-solid fa-print"></i> Print</button><button class="btn alt" id="pdf"><i class="fa-solid fa-file-pdf"></i> Save as PDF</button></div></div></div>' +
      '<div class="card"><div id="pv" class="t-preview"><p class="hint">Choose images to start.</p></div></div></div>';
    var $ = function (s) { return root.querySelector(s); }, imgs = [], pages = [], tm;
    var W = 1240, H = 1754; // A4 at 150 dpi
    function enhance(c) {
      var br = +$('#br').value, ct = +$('#ct').value, gr = $('#gr').checked; if (!br && !ct && !gr) return c;
      var x = c.getContext('2d'), id = x.getImageData(0, 0, c.width, c.height), d = id.data, f = (259 * (ct + 255)) / (255 * (259 - ct));
      for (var i = 0; i < d.length; i += 4) { for (var k = 0; k < 3; k++) { var v = f * (d[i + k] + br - 128) + 128; d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v; } if (gr) { var g = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = g; } }
      x.putImageData(id, 0, 0); return c;
    }
    function layout(n) { return { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4] }[n]; }
    function build() {
      if (!imgs.length) return; var per = +$('#pp').value, L = layout(per), cols = L[0], rows = L[1], m = 60, gap = 30; pages = [];
      var bw = (W - 2 * m - gap * (cols - 1)) / cols, bh = (H - 2 * m - gap * (rows - 1)) / rows;
      for (var p = 0; p * per < imgs.length; p++) {
        var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
        for (var i = 0; i < per && p * per + i < imgs.length; i++) {
          var cx = m + (i % cols) * (bw + gap), cy = m + Math.floor(i / cols) * (bh + gap), im = imgs[p * per + i], t = document.createElement('canvas');
          var sc = $('#ft').value === 'cover' ? Math.max(bw / im.naturalWidth, bh / im.naturalHeight) : Math.min(bw / im.naturalWidth, bh / im.naturalHeight);
          t.width = Math.round($('#ft').value === 'cover' ? bw : im.naturalWidth * sc); t.height = Math.round($('#ft').value === 'cover' ? bh : im.naturalHeight * sc);
          var tx = t.getContext('2d'); if ($('#ft').value === 'cover') drawCover(tx, im, 0, 0, t.width, t.height); else tx.drawImage(im, 0, 0, t.width, t.height);
          enhance(t); var ox = cx + (bw - t.width) / 2, oy = cy + (bh - t.height) / 2; x.drawImage(t, ox, oy); if ($('#bx').checked) { x.strokeStyle = '#999'; x.lineWidth = 2; x.strokeRect(ox, oy, t.width, t.height); }
        } pages.push(c);
      }
      var pv = $('#pv'); pv.innerHTML = ''; pages.forEach(function (c, i) { var w = h('div', { style: 'margin-bottom:10px' }, [h('div', { class: 'hint' }, 'Page ' + (i + 1))]); c.style.cssText = 'width:100%;max-width:420px;box-shadow:0 0 0 1px #ccc;background:#fff'; w.appendChild(c); pv.appendChild(w); });
    }
    function later() { $('#bv').textContent = $('#br').value; $('#cv').textContent = $('#ct').value; clearTimeout(tm); tm = setTimeout(build, 150); }
    ['pp', 'ft', 'br', 'ct', 'gr', 'bx'].forEach(function (i) { $('#' + i).oninput = later; });
    $('#dz').appendChild(CSC.dropzone({
      accept: 'image/*', multiple: true, icon: 'fa-images', label: 'Choose images', onFiles: async function (fs) {
        imgs = []; for (var i = 0; i < fs.length; i++) { try { imgs.push(await CSC.fileToImage(fs[i])); } catch (e) { CSC.toast(e.message, true); } }
        $('#o').style.display = imgs.length ? '' : 'none'; build();
      }
    }));
    $('#pr').onclick = function () { if (!pages.length) return; CSC.printHTML(pages.map(function (c) { return '<img src="' + c.toDataURL('image/jpeg', .92) + '" style="width:210mm;height:297mm;display:block;page-break-after:always">'; }).join('')); };
    $('#pdf').onclick = async function () {
      if (!pages.length) return; await CSC.loadScript(CSC.libs.pdflib); var doc = await PDFLib.PDFDocument.create();
      for (var i = 0; i < pages.length; i++) { var im = await doc.embedJpg(await (await CSC.canvasBlob(pages[i], 'image/jpeg', 0.92)).arrayBuffer()), pg = doc.addPage([595.28, 841.89]); pg.drawImage(im, { x: 0, y: 0, width: 595.28, height: 841.89 }); }
      CSC.download(new Blob([await doc.save()], { type: 'application/pdf' }), 'images.pdf');
    };
  };
})();
