/* Página de produto: escolher variante/estilo, carregar imagens e ver o stencil na hora. */
(function () {
  var P = JSON.parse(document.getElementById('dados-produto').textContent);
  var root = document.querySelector('[data-produto]');
  var $ = function (s) { return root.querySelector(s); };
  var form = $('[data-form]');
  var uploadsEl = $('[data-uploads]');
  var folhasEl = $('[data-folhas]');
  var visorImg = $('[data-visor-img]');
  var MAX_MB = 20;

  var AJUDA = {
    linha: 'O traço escuro do desenho é recortado. Fica ótimo com açúcar em pó, cacau ou aerógrafo.',
    silhueta: 'Toda a mancha escura é recortada. A melhor escolha para creme e glacé espalhados com espátula.',
    contorno: 'Para fotografias: tiramos os contornos principais. Resulta melhor com açúcar em pó ou cacau.'
  };

  // estado
  var slots = [];        // {id, preview, original, nome, pontes, peso, estado: 'vazio'|'a-processar'|'pronto'|'erro', erro, file}
  var capa = { texto: '', preview: null };
  var selecionado = null; // índice da folha no visor ('capa' ou número)

  function variante() {
    var id = form.querySelector('input[name=variante]:checked').value;
    return P.variantes.find(function (v) { return v.id === id; });
  }
  function modo() { return form.querySelector('input[name=modo]:checked').value; }
  function formato() { var v = variante(); return v.formato || P.formato; }

  function garantirSlots() {
    var n = variante().stencils;
    while (slots.length < n) slots.push({ estado: 'vazio' });
    if (slots.length > n) {
      var removidos = slots.slice(n).filter(function (s) { return s.estado === 'pronto'; }).length;
      slots = slots.slice(0, n);
      if (removidos) Carrinho.aviso(removidos + ' imagem(ns) ficaram de fora com esta opção.');
    }
  }

  // ---------------------------------------------------------------- render
  function renderSlots() {
    garantirSlots();
    uploadsEl.innerHTML = '';
    slots.forEach(function (s, i) {
      var el = document.createElement('div');
      el.className = 'slot slot--' + s.estado + (selecionado === i ? ' is-sel' : '');
      el.dataset.i = i;
      var interior = '<span class="slot__n">' + (i + 1) + '</span>';
      if (s.estado === 'pronto') {
        interior += '<img src="' + Carrinho.esc(s.preview) + '" alt="Stencil ' + (i + 1) + '">' +
          '<button type="button" class="slot__x" data-remover aria-label="Remover imagem ' + (i + 1) + '">×</button>';
      } else if (s.estado === 'a-processar') {
        interior += '<span class="roda"></span>';
      } else if (s.estado === 'erro') {
        interior += '<span class="slot__txt">' + Carrinho.esc(s.erro) + '</span>';
      } else {
        interior += '<span class="slot__mais" aria-hidden="true">+</span><span class="slot__txt">Imagem</span>';
      }
      interior += '<input type="file" accept="image/*" aria-label="Imagem para a folha ' + (i + 1) + '">';
      el.innerHTML = interior;
      uploadsEl.appendChild(el);
    });
    var prontos = slots.filter(function (s) { return s.estado === 'pronto'; }).length;
    $('[data-contador]').textContent = prontos + ' de ' + slots.length;
    renderFolhas();
  }

  function renderFolhas() {
    var itens = [];
    if (P.capa) itens.push({ chave: 'capa', img: capa.preview, rotulo: 'Capa' });
    slots.forEach(function (s, i) {
      itens.push({ chave: i, img: s.estado === 'pronto' ? s.preview : null, rotulo: String(i + 1) });
    });
    folhasEl.innerHTML = itens.map(function (f) {
      return '<button type="button" class="folha-mini' + (selecionado === f.chave ? ' is-sel' : '') + (f.img ? '' : ' is-vazia') +
        '" data-folha="' + f.chave + '">' + (f.img ? '<img src="' + Carrinho.esc(f.img) + '" alt="">' : '') +
        '<span>' + f.rotulo + '</span></button>';
    }).join('');
  }

  function mostrar(chave) {
    selecionado = chave;
    var vazio = $('[data-visor-vazio]');
    var legenda = $('[data-visor-legenda]');
    var info = $('[data-visor-info]');
    var src = null;
    if (chave === 'capa') {
      src = capa.preview; legenda.textContent = 'Capa';
      info.textContent = capa.preview ? 'Capa com 1,2 mm. As linhas laranja são pontes que seguram o miolo das letras.' : '';
      vazio.querySelector('p').textContent = 'Escreve um nome para o veres recortado na capa.';
    } else if (chave !== null && slots[chave]) {
      var s = slots[chave];
      legenda.textContent = 'Folha ' + (chave + 1);
      if (s.estado === 'pronto') {
        src = s.preview;
        info.textContent = s.pontes ? s.pontes + ' ponte(s) a laranja seguram as partes que cairiam (ex. o miolo de um olho). ' : 'Sem pontes necessárias. ';
      } else { info.textContent = ''; }
      vazio.querySelector('p').textContent = 'Carrega uma imagem para veres aqui o teu stencil.';
    }
    if (src) {
      visorImg.src = src; visorImg.hidden = false; vazio.hidden = true;
      $('[data-palco]').classList.add('is-stencil');
    } else if (chave === null) {
      visorImg.src = P.exemplo; visorImg.hidden = false; vazio.hidden = true; legenda.textContent = 'Exemplo';
      $('[data-palco]').classList.remove('is-stencil'); info.textContent = '';
    } else {
      visorImg.hidden = true; vazio.hidden = false;
      $('[data-palco]').classList.add('is-stencil');
    }
    renderSlots();
  }

  function carregando(on) { $('[data-visor-loading]').hidden = !on; }

  // ---------------------------------------------------------------- servidor
  async function enviar(i, file) {
    if (!file.type.startsWith('image/')) { slots[i] = { estado: 'erro', erro: 'Não é imagem' }; renderSlots(); return; }
    if (file.size > MAX_MB * 1024 * 1024) { slots[i] = { estado: 'erro', erro: 'Maior que 20 MB' }; renderSlots(); return; }
    slots[i] = { estado: 'a-processar', nome: file.name };
    renderSlots();
    if (selecionado === null || selecionado === i) { selecionado = i; carregando(true); }
    var fd = new FormData();
    fd.append('imagem', file); fd.append('modo', modo()); fd.append('formato', formato());
    try {
      var r = await fetch('/api/imagem', { method: 'POST', body: fd });
      var j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Erro');
      slots[i] = { estado: 'pronto', id: j.id, preview: j.preview, original: j.original, pontes: j.pontes, nome: file.name, modo: j.modo, formato: formato() };
    } catch (e) {
      slots[i] = { estado: 'erro', erro: e.message.length > 60 ? 'Erro a processar' : e.message };
      Carrinho.aviso(Carrinho.esc(e.message));
    }
    carregando(false);
    if (selecionado === i || selecionado === null) mostrar(i); else renderSlots();
  }

  async function reprever(i) {
    var s = slots[i];
    if (s.estado !== 'pronto' || (s.modo === modo() && s.formato === formato())) return;
    try {
      var r = await fetch('/api/imagem/' + s.id + '/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: modo(), formato: formato() })
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.erro);
      Object.assign(s, { preview: j.preview, pontes: j.pontes, modo: j.modo, formato: formato() });
    } catch (e) {
      Carrinho.aviso('Folha ' + (i + 1) + ': ' + Carrinho.esc(e.message || 'erro'));
    }
  }

  async function reprocessarTudo() {
    var prontos = slots.map(function (s, i) { return s.estado === 'pronto' ? i : -1; }).filter(function (i) { return i >= 0; });
    if (!prontos.length) return;
    carregando(true);
    for (var k = 0; k < prontos.length; k++) await reprever(prontos[k]);
    carregando(false);
    if (P.capa && capa.texto) await atualizarCapa(true);
    mostrar(selecionado === null ? prontos[0] : selecionado);
  }

  var tCapa;
  async function atualizarCapa(agora) {
    var input = $('[data-capa]');
    var texto = input.value.trim().toUpperCase();
    capa.texto = texto;
    if (!texto) { capa.preview = null; if (selecionado === 'capa') mostrar('capa'); else renderFolhas(); return; }
    selecionado = 'capa'; carregando(true);
    try {
      var r = await fetch('/api/capa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto, formato: formato() })
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.erro);
      if (capa.texto === j.texto) capa.preview = j.preview;
    } catch (e) { Carrinho.aviso('Capa: ' + Carrinho.esc(e.message || 'erro')); }
    carregando(false);
    mostrar('capa');
  }

  // ---------------------------------------------------------------- eventos
  form.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'variante') {
      $('[data-preco]').textContent = Carrinho.eur(variante().preco);
      renderSlots();
      reprocessarTudo();
    } else if (t.name === 'modo') {
      $('[data-ajuda-modo]').textContent = AJUDA[modo()];
      reprocessarTudo();
    } else if (t.type === 'file' && t.closest('.slot')) {
      if (t.files[0]) enviar(+t.closest('.slot').dataset.i, t.files[0]);
    } else if (t.matches('[data-varias]')) {
      distribuir(Array.from(t.files)); t.value = '';
    }
  });

  function distribuir(files) {
    var livres = slots.map(function (s, i) { return s.estado === 'pronto' || s.estado === 'a-processar' ? -1 : i; })
      .filter(function (i) { return i >= 0; });
    if (files.length > livres.length) Carrinho.aviso('Só cabem mais ' + livres.length + ' imagem(ns) nesta opção.');
    files.slice(0, livres.length).forEach(function (f, k) { enviar(livres[k], f); });
  }

  uploadsEl.addEventListener('click', function (e) {
    var slot = e.target.closest('.slot');
    if (!slot) return;
    var i = +slot.dataset.i;
    if (e.target.matches('[data-remover]')) {
      e.preventDefault(); slots[i] = { estado: 'vazio' }; mostrar(i); return;
    }
    // folha pronta: o clique mostra-a no visor (para trocar, remove-se com ×)
    if (slots[i].estado === 'pronto') mostrar(i);
  });

  // arrastar e largar
  ['dragenter', 'dragover'].forEach(function (ev) {
    uploadsEl.addEventListener(ev, function (e) { e.preventDefault(); uploadsEl.classList.add('is-drop'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    uploadsEl.addEventListener(ev, function (e) { e.preventDefault(); uploadsEl.classList.remove('is-drop'); });
  });
  uploadsEl.addEventListener('drop', function (e) {
    var files = Array.from(e.dataTransfer.files || []).filter(function (f) { return f.type.startsWith('image/'); });
    var slot = e.target.closest('.slot');
    if (files.length === 1 && slot) enviar(+slot.dataset.i, files[0]);
    else distribuir(files);
  });

  folhasEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-folha]');
    if (!b) return;
    var k = b.dataset.folha;
    mostrar(k === 'capa' ? 'capa' : +k);
  });

  root.querySelectorAll('[data-tinta]').forEach(function (b) {
    b.addEventListener('click', function () {
      $('[data-palco]').style.setProperty('--tinta', b.dataset.tinta);
      root.querySelectorAll('[data-tinta]').forEach(function (x) {
        x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', x === b);
      });
    });
  });

  var capaInput = $('[data-capa]');
  if (capaInput) {
    capaInput.addEventListener('input', function () {
      clearTimeout(tCapa); tCapa = setTimeout(atualizarCapa, 600);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var erro = $('[data-erro]');
    var prontos = slots.filter(function (s) { return s.estado === 'pronto'; });
    var aProcessar = slots.some(function (s) { return s.estado === 'a-processar'; });
    var msg = '';
    if (aProcessar) msg = 'Espera que as imagens acabem de ser processadas.';
    else if (!prontos.length) msg = 'Carrega pelo menos uma imagem.';
    else if (!$('[data-direitos]').checked) msg = 'Confirma que tens direitos sobre as imagens.';
    if (msg) { erro.textContent = msg; erro.hidden = false; return; }
    erro.hidden = true;

    var v = variante();
    Carrinho.adicionar({
      handle: P.handle, titulo: P.titulo, variante: v.id, varianteTitulo: v.titulo, preco: v.preco, quantidade: 1,
      modo: modo(), modoNome: P.modos[modo()],
      imagens: prontos.map(function (s) { return s.id; }),
      thumbs: prontos.map(function (s) { return s.preview; }),
      capa: P.capa ? capa.texto : '', capaPreview: P.capa ? capa.preview : null,
      notas: ($('[data-notas]') || {}).value || ''
    });
    var falta = v.stencils - prontos.length;
    Carrinho.aviso('Adicionado ao carrinho. ' + (falta > 0 ? 'As ' + falta + ' imagens em falta podes enviar depois pelo WhatsApp. ' : '') +
      '<a href="' + (window.BASE || '') + '/carrinho/">Ver carrinho</a>');
  });

  // início
  $('[data-ajuda-modo]').textContent = AJUDA[modo()];
  renderSlots();
})();
