/* Modo demonstração (GitHub Pages, sem servidor).
   Interceta as chamadas /api/... e responde no próprio browser:
   - pré-visualização simplificada do stencil feita em canvas (sem as pontes automáticas);
   - capa com o nome;
   - "encomenda" que não envia nada para lado nenhum.
   Só é carregado na versão estática; a versão com servidor (app.py) não usa este ficheiro. */
(function () {
  var BASE = window.BASE || '';
  var FORMATOS = { A5: [210, 148], A6: [148, 105] };
  var LARG = 700;                 // largura da imagem da folha (px)
  var imagens = {};               // id -> HTMLImageElement (só durante a visita)

  function novoId() {
    var a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.from(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function json(obj, status) {
    return Promise.resolve(new Response(JSON.stringify(obj), {
      status: status || 200, headers: { 'Content-Type': 'application/json' }
    }));
  }
  function carregar(file) {
    return new Promise(function (ok, erro) {
      var url = URL.createObjectURL(file);
      var im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { erro(new Error('Este ficheiro não parece ser uma imagem.')); };
      im.src = url;
    });
  }

  // ---------------------------------------------------------------- folha base
  function folha(formato) {
    var mm = FORMATOS[formato] || FORMATOS.A5;
    var k = LARG / mm[0];
    var c = document.createElement('canvas');
    c.width = LARG; c.height = Math.round(mm[1] * k);
    var g = c.getContext('2d');
    g.fillStyle = '#fafaf7';
    g.beginPath(); g.roundRect(0, 0, c.width, c.height, 6 * k); g.fill();
    // ranhuras abertas para a borda (4)
    g.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < 4; i++) {
      var y = (20 + i * (mm[1] - 40) / 3) * k;
      g.beginPath(); g.arc(6 * k, y, 2.75 * k, 0, Math.PI * 2); g.fill();
      g.fillRect(0, y - 1.5 * k, 6 * k, 3 * k);
    }
    g.globalCompositeOperation = 'source-over';
    var zona = { x: 18.75 * k, y: 10 * k, w: (mm[0] - 28.75) * k, h: (mm[1] - 20) * k };
    return { c: c, g: g, k: k, mm: mm, zona: zona };
  }

  // ---------------------------------------------------------------- máscara de recorte
  function mascara(fonte, modo) {
    // reduz a imagem para processar depressa
    var max = 700, s = Math.min(1, max / Math.max(fonte.width, fonte.height));
    var w = Math.max(1, Math.round(fonte.width * s)), h = Math.max(1, Math.round(fonte.height * s));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);   // fundo transparente conta como branco
    g.drawImage(fonte, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h).data;
    var lum = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];

    var corte = new Uint8Array(w * h);
    if (modo === 'contorno') {
      var mag = new Float32Array(w * h), vals = [];
      for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
        var p = y * w + x;
        var gx = lum[p + 1] - lum[p - 1], gy = lum[p + w] - lum[p - w];
        mag[p] = Math.hypot(gx, gy); if ((x + y) % 7 === 0) vals.push(mag[p]);
      }
      vals.sort(function (a, b) { return a - b; });
      var lim = Math.max(18, vals[Math.floor(vals.length * 0.93)] || 18);
      for (i = 0; i < w * h; i++) corte[i] = mag[i] > lim ? 1 : 0;
    } else {
      // limiar de Otsu
      var hist = new Array(256).fill(0);
      for (i = 0; i < w * h; i++) hist[Math.min(255, lum[i] | 0)]++;
      var total = w * h, soma = 0; for (i = 0; i < 256; i++) soma += i * hist[i];
      var sB = 0, wB = 0, melhor = 0, t = 128;
      for (i = 0; i < 256; i++) {
        wB += hist[i]; if (!wB) continue;
        var wF = total - wB; if (!wF) break;
        sB += i * hist[i];
        var mB = sB / wB, mF = (soma - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
        if (v > melhor) { melhor = v; t = i; }
      }
      // a classe escura do Otsu inclui o próprio limiar (<=); com "<" as imagens só a preto e branco não recortavam nada
      for (i = 0; i < w * h; i++) corte[i] = (lum[i] | 0) <= t ? 1 : 0;
    }
    // caixa do conteúdo
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (corte[y * w + x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    var mw = x1 - x0 + 1, mh = y1 - y0 + 1;
    var m = document.createElement('canvas'); m.width = mw; m.height = mh;
    var mg = m.getContext('2d'), out = mg.createImageData(mw, mh);
    for (y = 0; y < mh; y++) for (x = 0; x < mw; x++) {
      if (corte[(y + y0) * w + (x + x0)]) out.data[(y * mw + x) * 4 + 3] = 255;
    }
    mg.putImageData(out, 0, 0);
    return m;
  }

  function recortar(f, m, modo, escala) {
    var z = f.zona;
    var s = Math.min(z.w / m.width, z.h / m.height) * (escala || 1);
    var w = m.width * s, h = m.height * s;
    var x = z.x + (z.w - w) / 2, y = z.y + (z.h - h) / 2;
    f.g.globalCompositeOperation = 'destination-out';
    f.g.imageSmoothingEnabled = true;
    // engrossa um pouco os traços finos (largura mínima de recorte)
    var r = modo === 'silhueta' ? 0 : Math.max(1, f.k * 0.5);
    var passos = r ? [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] : [[0, 0]];
    passos.forEach(function (p) { f.g.drawImage(m, x + p[0], y + p[1], w, h); });
    f.g.globalCompositeOperation = 'source-over';
  }

  function peso(f, espessura) {
    var d = f.g.getImageData(0, 0, f.c.width, f.c.height).data, n = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] > 127) n++;
    return Math.round(n / (f.k * f.k) * espessura / 1000 * 1.24 * 10) / 10;
  }

  function preverImagem(im, modo, formato) {
    var f = folha(formato);
    var m = mascara(im, modo);
    if (!m) return null;
    recortar(f, m, modo);
    return { preview: f.c.toDataURL('image/png'), peso_g: peso(f, 0.6) };
  }

  function preverTexto(texto, formato) {
    var t = document.createElement('canvas'); t.width = 2400; t.height = 420;
    var g = t.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, t.width, t.height);
    g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 300px Nunito, "Arial Black", Arial, sans-serif';
    g.fillText(texto, t.width / 2, t.height / 2);
    var f = folha(formato);
    var m = mascara(t, 'silhueta');
    if (m) recortar(f, m, 'silhueta', 0.9);
    return f.c.toDataURL('image/png');
  }

  // ---------------------------------------------------------------- fetch falso
  var fetchOriginal = window.fetch.bind(window);
  window.fetch = async function (url, opts) {
    var u = typeof url === 'string' ? url : url.url;
    var caminho = u.replace(/^https?:\/\/[^/]+/, '').replace(BASE, '');
    try {
      if (caminho === '/api/imagem') {
        var fd = opts.body, file = fd.get('imagem');
        var im = await carregar(file);
        var r = preverImagem(im, fd.get('modo'), fd.get('formato'));
        if (!r) return json({ erro: 'Não encontrámos nenhum desenho nesta imagem. Experimenta outra ou outro estilo.' }, 422);
        var id = novoId(); imagens[id] = im;
        return json({ id: id, modo: fd.get('modo'), pontes: 0, peso_g: r.peso_g, preview: r.preview, original: im.src });
      }
      var m = caminho.match(/^\/api\/imagem\/([a-f0-9]+)\/preview$/);
      if (m) {
        var corpo = JSON.parse(opts.body || '{}');
        var im2 = imagens[m[1]];
        if (!im2) return json({ erro: 'Volta a carregar esta imagem.' }, 404);
        var r2 = preverImagem(im2, corpo.modo, corpo.formato);
        if (!r2) return json({ erro: 'Não encontrámos nenhum desenho com este estilo.' }, 422);
        return json({ id: m[1], modo: corpo.modo, pontes: 0, peso_g: r2.peso_g, preview: r2.preview });
      }
      if (caminho === '/api/capa') {
        var c = JSON.parse(opts.body || '{}');
        var texto = String(c.texto || '').trim().toUpperCase().slice(0, 14);
        if (!texto) return json({ preview: null });
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        return json({ texto: texto, preview: preverTexto(texto, c.formato) });
      }
      if (caminho === '/api/encomenda') {
        // nada é enviado: é só uma demonstração
        return json({ numero: 'DEMO', url: BASE + '/encomenda-enviada/' });
      }
    } catch (e) {
      return json({ erro: e.message || 'Erro na demonstração.' }, 400);
    }
    return fetchOriginal(url, opts);
  };
})();
