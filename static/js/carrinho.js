/* Carrinho no localStorage. Quando ligarmos ao Shopify, isto passa a ser o carrinho do Shopify. */
(function () {
  var CHAVE = 'zs-carrinho-v1';

  function ler() {
    try { return JSON.parse(localStorage.getItem(CHAVE)) || []; } catch (e) { return []; }
  }
  function gravar(itens) {
    localStorage.setItem(CHAVE, JSON.stringify(itens));
    atualizarContador();
  }
  function eur(v) {
    return v.toFixed(2).replace('.', ',') + ' €';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function atualizarContador() {
    var n = ler().reduce(function (a, i) { return a + i.quantidade; }, 0);
    document.querySelectorAll('[data-carrinho-n]').forEach(function (el) {
      el.textContent = n; el.hidden = n === 0;
    });
  }
  function aviso(txt) {
    var el = document.querySelector('[data-aviso]');
    if (!el) return;
    el.innerHTML = txt; el.hidden = false;
    clearTimeout(aviso._t);
    aviso._t = setTimeout(function () { el.hidden = true; }, 4000);
  }
  function totais(itens) {
    var sub = itens.reduce(function (a, i) { return a + i.preco * i.quantidade; }, 0);
    var L = window.LOJA || { portes: 0, gratis: 0 };
    var portes = sub === 0 || sub >= L.gratis ? 0 : L.portes;
    return { sub: sub, portes: portes, total: sub + portes, falta: Math.max(0, L.gratis - sub) };
  }

  function linhaHTML(it, idx, editavel) {
    var thumbs = (it.capaPreview ? [it.capaPreview] : []).concat(it.thumbs).slice(0, 5)
      .map(function (u) { return '<img src="' + esc(u) + '" alt="">'; }).join('');
    return '<article class="linha">' +
      '<div class="linha__thumbs">' + thumbs + '</div>' +
      '<div class="linha__txt"><h3>' + esc(it.titulo) + '</h3>' +
      '<p class="pequeno">' + esc(it.varianteTitulo) + ' · ' + esc(it.modoNome) + ' · ' + (it.colecao ? (Number(it.nFolhas) || 0) + ' folhas' : (it.imagens || []).length + ' imagem(ns)') +
      (it.capa ? ' · capa: ' + esc(it.capa) : '') + '</p>' +
      (editavel ? '<div class="linha__acoes"><label class="pequeno">Qtd. <input type="number" min="1" max="20" value="' + (Number(it.quantidade) || 1) + '" data-qtd="' + idx + '"></label>' +
        '<button type="button" class="link" data-remover="' + idx + '">Remover</button></div>' : '<p class="pequeno">Qtd. ' + (Number(it.quantidade) || 1) + '</p>') +
      '</div><p class="linha__preco">' + eur(it.preco * it.quantidade) + '</p></article>';
  }

  // ------------------------------------------------------------ encomenda por WhatsApp
  function referencia() {
    var d = new Date();
    var dd = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0');
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = '';
    for (var i = 0; i < 4; i++) r += abc[Math.floor(Math.random() * abc.length)];
    return 'WS-' + dd + '-' + r;
  }

  function mensagemWhatsApp(ref, itens, cliente, recolhaEmMao, t, cfg) {
    var L = [];
    L.push('Olá ' + (cfg.nome || '') + '! Quero fazer esta encomenda:');
    L.push('Referência: ' + ref);
    L.push('');
    var imagensEmFalta = 0;
    itens.forEach(function (it) {
      var det = [it.varianteTitulo];
      if (it.colecao) det.push(it.nFolhas + ' folhas');
      else {
        det.push(it.modoNome);
        det.push(it.imagens.length + ' imagem(ns)');
        imagensEmFalta += it.imagens.length;
      }
      if (it.capa) det.push('capa: ' + it.capa);
      L.push('• ' + it.quantidade + ' × ' + it.titulo + ' — ' + det.join(' · ') + ' — ' + eur(it.preco * it.quantidade));
      if (it.notas) L.push('   Notas: ' + it.notas);
    });
    L.push('');
    L.push('Subtotal: ' + eur(t.sub));
    L.push((recolhaEmMao ? 'Recolha em mão: ' : 'Portes: ') + (t.portes ? eur(t.portes) : 'grátis'));
    L.push('Total: ' + eur(t.total));
    L.push('');
    L.push('Nome: ' + cliente.nome);
    if (cliente.email) L.push('Email: ' + cliente.email);
    if (recolhaEmMao) L.push('Entrega: recolha em mão (combinamos o local)');
    else L.push('Morada: ' + cliente.morada + ', ' + cliente.codigo_postal + ' ' + cliente.localidade);
    L.push('Pagamento: ' + (cfg.pagamento || 'MB WAY'));
    if (imagensEmFalta) {
      L.push('');
      L.push('Vou enviar a seguir, nesta conversa, as imagens para os stencils personalizados.');
    }
    return L.join('\n');
  }

  function paginaCheckoutWhatsApp(form, itens, cfg, recolha, totaisAtuais, renderResumo) {
    var morada = form.querySelector('[data-morada]');
    var ajuda = form.querySelector('[data-entrega-ajuda]');
    function atualizarEntrega() {
      var r = recolha();
      morada.hidden = r;
      morada.querySelectorAll('input').forEach(function (i) { i.required = !r; i.disabled = r; });
      ajuda.textContent = r ? 'Combinamos contigo o local e a hora pelo WhatsApp.' : 'Enviamos por correio para todo o país.';
      renderResumo();
    }
    form.querySelectorAll('input[name=entrega]').forEach(function (i) { i.addEventListener('change', atualizarEntrega); });
    atualizarEntrega();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var erro = form.querySelector('[data-erro]');
      erro.hidden = true;
      if (!cfg.whatsapp) {
        erro.textContent = 'O número de WhatsApp da loja ainda não está configurado.';
        erro.hidden = false; return;
      }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var cliente = Object.fromEntries(new FormData(form).entries());
      var ref = referencia();
      var t = totaisAtuais();
      var texto = mensagemWhatsApp(ref, itens, cliente, recolha(), t, cfg);
      var link = 'https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent(texto);
      var personalizados = itens.some(function (it) { return !it.colecao && it.imagens.length; });
      sessionStorage.setItem('ws-encomenda', JSON.stringify({ ref: ref, link: link, total: t.total, personalizados: personalizados }));
      window.open(link, '_blank', 'noopener');
      location.href = (window.BASE || '') + '/encomenda-enviada/';
    });
  }

  window.Carrinho = {
    ler: ler, eur: eur, esc: esc, aviso: aviso,
    adicionar: function (item) {
      var itens = ler(); itens.push(item); gravar(itens);
    },
    limpar: function () { gravar([]); },

    paginaCarrinho: function () {
      var lista = document.querySelector('[data-lista]');
      function render() {
        var itens = ler();
        document.querySelector('[data-vazio]').hidden = itens.length > 0;
        document.querySelector('[data-resumo]').hidden = itens.length === 0;
        lista.innerHTML = itens.map(function (it, i) { return linhaHTML(it, i, true); }).join('');
        var t = totais(itens);
        document.querySelector('[data-subtotal]').textContent = eur(t.sub);
        document.querySelector('[data-portes]').textContent = t.portes ? eur(t.portes) : 'Grátis';
        document.querySelector('[data-total]').textContent = eur(t.total);
        document.querySelector('[data-portes-info]').textContent =
          t.falta > 0 ? 'Faltam ' + eur(t.falta) + ' para portes grátis.' : 'Tens portes grátis.';
      }
      lista.addEventListener('click', function (e) {
        var i = e.target.getAttribute('data-remover');
        if (i === null) return;
        var itens = ler(); itens.splice(+i, 1); gravar(itens); render();
      });
      lista.addEventListener('change', function (e) {
        var i = e.target.getAttribute('data-qtd');
        if (i === null) return;
        var itens = ler();
        itens[+i].quantidade = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1));
        gravar(itens); render();
      });
      render();
    },

    paginaCheckout: function () {
      var itens = ler();
      var aside = document.querySelector('[data-resumo-checkout]');
      var form = document.querySelector('[data-checkout]');
      if (!itens.length) { location.href = (window.BASE || '') + '/carrinho/'; return; }
      var cfg = window.LOJA_CFG || {};
      var recolha = function () {
        var r = form.querySelector('input[name=entrega]:checked');
        return r && r.value === 'recolha';
      };
      var totaisAtuais = function () {
        var t = totais(itens);
        if (recolha()) { t.portes = 0; t.total = t.sub; }
        return t;
      };
      function renderResumo() {
        var t = totaisAtuais();
        aside.innerHTML = '<h2>Resumo</h2>' + itens.map(function (it, i) { return linhaHTML(it, i, false); }).join('') +
          '<dl><div><dt>Subtotal</dt><dd>' + eur(t.sub) + '</dd></div><div><dt>' + (recolha() ? 'Recolha em mão' : 'Portes') + '</dt><dd>' +
          (t.portes ? eur(t.portes) : 'Grátis') + '</dd></div><div class="resumo__total"><dt>Total</dt><dd>' + eur(t.total) + '</dd></div></dl>';
      }
      renderResumo();

      if (cfg.modo === 'whatsapp') {
        paginaCheckoutWhatsApp(form, itens, cfg, recolha, totaisAtuais, renderResumo);
        return;
      }

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var erro = form.querySelector('[data-erro]');
        if (!form.checkValidity()) {
          form.reportValidity(); return;
        }
        var cliente = Object.fromEntries(new FormData(form).entries());
        var btn = form.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'A registar…'; erro.hidden = true;
        try {
          var r = await fetch('/api/encomenda', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cliente: cliente,
              itens: itens.map(function (it) {
                return { handle: it.handle, variante: it.variante, quantidade: it.quantidade, modo: it.modo,
                  imagens: it.imagens, capa: it.capa, notas: it.notas };
              })
            })
          });
          var j = await r.json();
          if (!r.ok) throw new Error(j.erro || 'Erro');
          location.href = j.url;
        } catch (err) {
          erro.textContent = 'Não foi possível registar a encomenda: ' + err.message;
          erro.hidden = false; btn.disabled = false; btn.textContent = 'Fazer encomenda (teste)';
        }
      });
    }
  };

  atualizarContador();
})();
