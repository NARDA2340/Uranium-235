/* ===================================================================
   sketch.js — el stratsketch propio.
   SVG sobre el mapa táctico. Cada objeto puede pertenecer a un grupo
   del roster: ahí está la gracia — el dibujo hereda el color y la
   leyenda de la derecha muestra QUIÉN va en ese color.
   =================================================================== */
window.U = window.U || {};

U.sketch = (function () {
  var host, svg, gMapa, gObjs, gTmp, leyenda, slidesBar, toolbar;
  var VB = { x: 0, y: 0, w: 2000, h: 2000 };   // viewBox actual
  var NAT = { w: 2000, h: 2000 };              // tamaño natural del mapa
  var tool = 'sel', grupoActivo = 'sq_red', colorLibre = '#e6bc55', grosor = 6, iconoActivo = 'garrison';
  var sel = null, dibujando = null, panning = null, shotsCache = {};

  /* ---------------- helpers ---------------- */
  function P() { return U.partida(); }
  function strat() { return P().strat; }
  function slide() { var s = strat(); return s.slides[Math.min(s.activa, s.slides.length - 1)]; }
  function objs() { return slide().objs; }
  function colorDe(o) {
    if (o.grupo) { var g = U.group(o.grupo); if (g) return U.unit(g.unidad).color; }
    return o.color || colorLibre;
  }
  function colorActual() {
    if (grupoActivo === '__libre') return colorLibre;
    var g = U.group(grupoActivo); return g ? U.unit(g.unidad).color : colorLibre;
  }
  function svgPt(e) {
    var r = svg.getBoundingClientRect();
    return {
      x: VB.x + (e.clientX - r.left) / r.width * VB.w,
      y: VB.y + (e.clientY - r.top) / r.height * VB.h
    };
  }
  function ns(t, a) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', t);
    if (a) Object.keys(a).forEach(function (k) { if (a[k] !== null && a[k] !== undefined) n.setAttribute(k, a[k]); });
    return n;
  }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ---------------- montaje ---------------- */
  function montar(nodo) {
    host = nodo;
    U.vaciar(host);

    toolbar = U.el('div', { class: 'sk-tools' });
    var lienzo = U.el('div', { class: 'sk-lienzo' });
    leyenda = U.el('div', { class: 'sk-leyenda' });
    host.appendChild(toolbar);
    host.appendChild(lienzo);
    host.appendChild(leyenda);

    svg = ns('svg', { class: 'sk-svg', xmlns: 'http://www.w3.org/2000/svg' });
    gMapa = ns('g'); gObjs = ns('g'); gTmp = ns('g');
    svg.appendChild(gMapa); svg.appendChild(gObjs); svg.appendChild(gTmp);
    lienzo.appendChild(svg);

    slidesBar = U.el('div', { class: 'sk-slides' });
    lienzo.appendChild(slidesBar);

    eventos();
    pintarTools();
    cargarMapa();
    render();
  }

  /* ---------------- mapa: capas ---------------- */
  function capas() {
    var st = strat();
    if (!st.capas) st.capas = { grid: true, puntos: true };
    return st.capas;
  }

  function imagen(src, w, h) {
    var im = ns('image', { x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none' });
    im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);
    im.setAttribute('href', src);
    return im;
  }

  function cargarMapa(sinEncuadrar) {
    U.vaciar(gMapa);
    var m = U.map(strat().mapa), c = capas(), E = U.ESPACIO;

    if (strat().imgPropia) {
      // mapa subido a mano: se estira al ancho del espacio y se respeta su alto
      var img = new Image();
      img.onload = function () {
        NAT = { w: E, h: Math.round(E * img.naturalHeight / img.naturalWidth) };
        U.vaciar(gMapa);
        gMapa.appendChild(imagen(strat().imgPropia, NAT.w, NAT.h));
        aplicarVB(!sinEncuadrar); render();
      };
      img.onerror = function () { strat().imgPropia = null; U.save(); cargarMapa(); };
      img.src = strat().imgPropia;
      return;
    }

    NAT = { w: E, h: E };
    gMapa.appendChild(ns('rect', { x: 0, y: 0, width: E, height: E, fill: '#15150f' }));
    if (m.base) gMapa.appendChild(imagen(m.base, E, E));
    if (c.grid && U.MAPA_GRID) gMapa.appendChild(imagen(U.MAPA_GRID, E, E));
    if (c.puntos && m.capaPuntos) gMapa.appendChild(imagen(m.capaPuntos, E, E));
    aplicarVB(!sinEncuadrar);
  }

  function aplicarVB(reset) {
    if (reset || !VB.w || VB.w <= 0) VB = { x: 0, y: 0, w: NAT.w, h: NAT.h };
    svg.setAttribute('viewBox', VB.x + ' ' + VB.y + ' ' + VB.w + ' ' + VB.h);
  }

  /* ---------------- barra de herramientas ---------------- */
  var TOOLS = [
    { id: 'sel', ico: '➚', t: 'Seleccionar / mover (V)' },
    { id: 'pen', ico: '✎', t: 'Trazo libre (P)' },
    { id: 'line', ico: '↗', t: 'Flecha (L)' },
    { id: 'rect', ico: '▭', t: 'Zona rectangular (R)' },
    { id: 'poly', ico: '⬠', t: 'Zona poligonal (G) — doble clic cierra' },
    { id: 'circle', ico: '◯', t: 'Radio / círculo (C)' },
    { id: 'icon', ico: '⚑', t: 'Ícono táctico (I)' },
    { id: 'text', ico: 'T', t: 'Texto (T)' },
    { id: 'pin', ico: '📷', t: 'Pin con captura real (S)' },
    { id: 'del', ico: '⌫', t: 'Borrar (clic en el objeto)' }
  ];

  function pintarTools() {
    U.vaciar(toolbar);

    var gt = U.el('div', { class: 'sk-grp' });
    TOOLS.forEach(function (t) {
      gt.appendChild(U.el('button', {
        class: 'sk-tool' + (tool === t.id ? ' on' : ''), title: t.t, html: t.ico,
        onclick: function () { tool = t.id; sel = null; pintarTools(); render(); }
      }));
    });
    toolbar.appendChild(gt);

    /* selector de grupo = selector de color, pero con identidad */
    toolbar.appendChild(U.el('div', { class: 'sk-sep', text: 'Grupo' }));
    var gg = U.el('div', { class: 'sk-grupos' });
    U.ROSTER.filter(function (g) { return g.tipo === 'escuadra' || g.tipo === 'tanque' || ['commander', 'recon1', 'recon2', 'arty', 'wamo'].indexOf(g.id) >= 0; })
      .forEach(function (g) {
        var u = U.unit(g.unidad);
        var n = U.plantel(g.id).length;
        gg.appendChild(U.el('button', {
          class: 'sk-grupo' + (grupoActivo === g.id ? ' on' : ''),
          style: { '--c': u.color }, title: g.titulo + ' · ' + n + ' jugadores',
          html: '<i></i><span>' + g.titulo.replace(/ ·.*/, '').replace('TANQUE ', 'T') + '</span><b>' + n + '</b>',
          onclick: function () {
            grupoActivo = g.id;
            if (sel) { sel.grupo = g.id; delete sel.color; guardar(); }
            pintarTools(); render();
          }
        }));
      });
    gg.appendChild(U.el('button', {
      class: 'sk-grupo libre' + (grupoActivo === '__libre' ? ' on' : ''),
      style: { '--c': colorLibre }, title: 'Color libre (sin grupo)',
      html: '<i></i><span>LIBRE</span>',
      onclick: function () { grupoActivo = '__libre'; pintarTools(); }
    }));
    toolbar.appendChild(gg);

    var cl = U.el('input', { type: 'color', class: 'sk-color', value: colorLibre });
    cl.addEventListener('input', function () {
      colorLibre = cl.value; grupoActivo = '__libre';
      if (sel) { sel.color = colorLibre; delete sel.grupo; guardar(); }
      pintarTools(); render();
    });
    toolbar.appendChild(cl);

    toolbar.appendChild(U.el('div', { class: 'sk-sep', text: 'Trazo' }));
    var gr = U.el('div', { class: 'sk-grp' });
    [3, 6, 10, 16].forEach(function (w) {
      gr.appendChild(U.el('button', {
        class: 'sk-tool w' + (grosor === w ? ' on' : ''),
        html: '<span style="height:' + Math.max(2, w / 2) + 'px"></span>',
        onclick: function () { grosor = w; if (sel) { sel.grosor = w; guardar(); } pintarTools(); render(); }
      }));
    });
    toolbar.appendChild(gr);

    toolbar.appendChild(U.el('div', { class: 'sk-sep', text: 'Íconos' }));
    var gi = U.el('div', { class: 'sk-iconos' });
    U.ICONS.forEach(function (ic) {
      var b = U.el('button', {
        class: 'sk-ico' + (iconoActivo === ic.id ? ' on' : ''), title: ic.nombre,
        onclick: function () { iconoActivo = ic.id; tool = 'icon'; pintarTools(); }
      });
      var s = ns('svg', { viewBox: '-24 -24 48 48' });
      s.innerHTML = iconSVG(ic.id, colorActual());
      b.appendChild(s);
      gi.appendChild(b);
    });
    toolbar.appendChild(gi);

    toolbar.appendChild(U.el('div', { class: 'sk-sep', text: 'Mapa' }));
    var acc = U.el('div', { class: 'sk-grp col' });

    var selMapa = U.el('select', { class: 'inp sm' });
    U.MAPS.forEach(function (m) {
      selMapa.appendChild(U.el('option', { value: m.id, text: m.nombre, selected: m.id === strat().mapa ? 'selected' : null }));
    });
    selMapa.addEventListener('change', function () {
      var p = U.partida();
      strat().mapa = selMapa.value; strat().imgPropia = null;
      p.mapa = selMapa.value; p.punto = '';
      U.save(); cargarMapa(); render(); U.emit('dash'); U.emit('mapa');
    });
    acc.appendChild(selMapa);

    var cps = capas();
    [['grid', 'Cuadrícula'], ['puntos', 'Puntos y recursos']].forEach(function (c) {
      acc.appendChild(U.el('button', {
        class: 'sk-capa' + (cps[c[0]] ? ' on' : ''), text: c[1],
        onclick: function () { cps[c[0]] = !cps[c[0]]; U.save(); cargarMapa(true); pintarTools(); }
      }));
    });

    acc.appendChild(U.el('button', { class: 'btn sm', text: 'Cargar imagen', onclick: subirMapa }));
    acc.appendChild(U.el('button', { class: 'btn sm', text: 'Encuadrar', onclick: function () { aplicarVB(true); render(); } }));
    acc.appendChild(U.el('button', { class: 'btn sm', text: 'Limpiar slide', onclick: function () {
      U.confirmar('¿Borrar todo lo dibujado en esta slide?', function () { slide().objs = []; guardar(); render(); });
    } }));
    acc.appendChild(U.el('button', { class: 'btn sm primary', text: '▶ Presentar', onclick: presentar }));
    toolbar.appendChild(acc);
    toolbar.appendChild(U.el('p', { class: 'sk-credito', html: 'Capas de mapa: texturas del juego + overlays de <b>Maps Let Loose</b>.' }));
  }

  function subirMapa() {
    var inp = U.el('input', { type: 'file', accept: 'image/*' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      U.optimizarImagen(inp.files[0], 2400).then(function (r) {
        strat().imgPropia = r.url; U.save(); cargarMapa(); pintarTools();
        U.toast('Mapa cargado');
      });
    });
    inp.click();
  }

  /* ---------------- eventos del lienzo ---------------- */
  function eventos() {
    svg.addEventListener('pointerdown', down);
    svg.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = svgPt(e), f = e.deltaY > 0 ? 1.12 : 0.89;
      var nw = Math.min(NAT.w * 2.5, Math.max(NAT.w * 0.03, VB.w * f));
      var k = nw / VB.w;
      VB.x = p.x - (p.x - VB.x) * k; VB.y = p.y - (p.y - VB.y) * k;
      VB.w = VB.w * k; VB.h = VB.h * k;
      aplicarVB();
    }, { passive: false });

    document.addEventListener('keydown', function (e) {
      if (host && host.offsetParent === null) return;
      if (/input|textarea|select/i.test((e.target.tagName || ''))) return;
      var k = e.key.toLowerCase();
      var mapa = { v: 'sel', p: 'pen', l: 'line', r: 'rect', g: 'poly', c: 'circle', i: 'icon', t: 'text', s: 'pin' };
      if (mapa[k]) { tool = mapa[k]; pintarTools(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { borrar(sel); }
      if (e.key === 'Escape') { dibujando = null; sel = null; U.vaciar(gTmp); render(); }
    });

    /* pegar capturas directo con Ctrl+V */
    document.addEventListener('paste', function (e) {
      if (!host || host.offsetParent === null) return;
      var it = Array.prototype.slice.call(e.clipboardData.items).find(function (i) { return i.type.indexOf('image') === 0; });
      if (!it) return;
      var f = it.getAsFile();
      var centro = { x: VB.x + VB.w / 2, y: VB.y + VB.h / 2 };
      crearPin(f, centro);
    });
  }

  function down(e) {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      panning = { x: e.clientX, y: e.clientY, vb: Object.assign({}, VB) };
      return;
    }
    var p = svgPt(e);
    var hit = e.target.closest ? e.target.closest('[data-id]') : null;
    var obj = hit ? objs().find(function (o) { return o.id === hit.getAttribute('data-id'); }) : null;

    if (tool === 'del') { if (obj) borrar(obj); return; }
    if (tool === 'sel') {
      sel = obj || null;
      if (obj) {
        dibujando = { modo: 'mover', o: obj, p0: p, snap: JSON.parse(JSON.stringify(obj)) };
        if (obj.grupo) { grupoActivo = obj.grupo; pintarTools(); }
      } else {
        panning = { x: e.clientX, y: e.clientY, vb: Object.assign({}, VB) };
      }
      render();
      return;
    }
    if (tool === 'pen') { dibujando = { modo: 'pen', pts: [[p.x, p.y]] }; return; }
    if (tool === 'line' || tool === 'rect' || tool === 'circle') { dibujando = { modo: tool, a: p, b: p }; return; }
    if (tool === 'poly') {
      if (!dibujando || dibujando.modo !== 'poly') dibujando = { modo: 'poly', pts: [[p.x, p.y]] };
      else dibujando.pts.push([p.x, p.y]);
      previa();
      return;
    }
    if (tool === 'icon') { nuevo({ tipo: 'icon', icono: iconoActivo, x: p.x, y: p.y, escala: 1 }); return; }
    if (tool === 'text') {
      var t = prompt('Texto:');
      if (t) nuevo({ tipo: 'text', texto: t, x: p.x, y: p.y, size: Math.round(NAT.w / 46) });
      return;
    }
    if (tool === 'pin') {
      var inp = U.el('input', { type: 'file', accept: 'image/*' });
      inp.addEventListener('change', function () { if (inp.files[0]) crearPin(inp.files[0], p); });
      inp.click();
      return;
    }
  }

  function move(e) {
    if (panning) {
      var r = svg.getBoundingClientRect();
      VB.x = panning.vb.x - (e.clientX - panning.x) / r.width * VB.w;
      VB.y = panning.vb.y - (e.clientY - panning.y) / r.height * VB.h;
      aplicarVB();
      return;
    }
    if (!dibujando) return;
    var p = svgPt(e);
    if (dibujando.modo === 'pen') { dibujando.pts.push([p.x, p.y]); previa(); }
    else if (dibujando.modo === 'mover') {
      var dx = p.x - dibujando.p0.x, dy = p.y - dibujando.p0.y;
      var o = dibujando.o, s = dibujando.snap;
      if (s.pts) o.pts = s.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
      if (s.x !== undefined) { o.x = s.x + dx; o.y = s.y + dy; }
      if (s.x2 !== undefined) { o.x2 = s.x2 + dx; o.y2 = s.y2 + dy; }
      render();
    }
    else if (dibujando.b !== undefined) { dibujando.b = p; previa(); }
    else if (dibujando.modo === 'poly') previa();
  }

  function up() {
    panning = null;
    if (!dibujando) return;
    var d = dibujando;
    if (d.modo === 'pen') {
      if (d.pts.length > 2) nuevo({ tipo: 'pen', pts: simplificar(d.pts) });
      dibujando = null;
    } else if (d.modo === 'line') {
      if (Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) > 8) nuevo({ tipo: 'line', x: d.a.x, y: d.a.y, x2: d.b.x, y2: d.b.y });
      dibujando = null;
    } else if (d.modo === 'rect') {
      if (Math.abs(d.b.x - d.a.x) > 8) nuevo({ tipo: 'rect', x: Math.min(d.a.x, d.b.x), y: Math.min(d.a.y, d.b.y), w: Math.abs(d.b.x - d.a.x), h: Math.abs(d.b.y - d.a.y) });
      dibujando = null;
    } else if (d.modo === 'circle') {
      var r = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
      if (r > 8) nuevo({ tipo: 'circle', x: d.a.x, y: d.a.y, r: r });
      dibujando = null;
    } else if (d.modo === 'mover') {
      guardar(); dibujando = null;
    }
    U.vaciar(gTmp);
    render();
  }

  function simplificar(pts) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var l = out[out.length - 1];
      if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) > NAT.w / 400) out.push(pts[i]);
    }
    out.push(pts[pts.length - 1]);
    return out.map(function (p) { return [Math.round(p[0]), Math.round(p[1])]; });
  }

  function nuevo(base) {
    var o = Object.assign({ id: U.uid('o'), grosor: grosor }, base);
    if (grupoActivo === '__libre') o.color = colorLibre; else o.grupo = grupoActivo;
    objs().push(o);
    sel = o;
    if (tool !== 'icon' && tool !== 'pen') tool = 'sel';
    guardar(); pintarTools(); render();
  }

  function borrar(o) {
    var i = objs().indexOf(o);
    if (i >= 0) objs().splice(i, 1);
    if (o.shotId) U.shots.del(o.shotId);
    sel = null; guardar(); render();
  }

  function guardar() { U.save(); }

  function crearPin(file, p) {
    U.optimizarImagen(file, 1600).then(function (r) {
      var id = U.uid('shot');
      shotsCache[id] = r.url;
      return U.shots.put(id, r.url).then(function () {
        var et = prompt('Etiqueta del pin (ej: "vista desde el granero"):', '') || '';
        nuevo({ tipo: 'pin', x: p.x, y: p.y, shotId: id, etiqueta: et });
        tool = 'sel'; pintarTools();
      });
    }).catch(function (e) { U.toast('No se pudo cargar la captura', 'err'); console.error(e); });
  }

  /* ---------------- dibujo ---------------- */
  function previa() {
    U.vaciar(gTmp);
    var d = dibujando; if (!d) return;
    var c = colorActual(), g = grosor;
    if (d.modo === 'pen') gTmp.appendChild(ns('polyline', { points: d.pts.map(function (p) { return p.join(','); }).join(' '), fill: 'none', stroke: c, 'stroke-width': g, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (d.modo === 'line') gTmp.appendChild(ns('line', { x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y, stroke: c, 'stroke-width': g, 'stroke-linecap': 'round' }));
    if (d.modo === 'rect') gTmp.appendChild(ns('rect', { x: Math.min(d.a.x, d.b.x), y: Math.min(d.a.y, d.b.y), width: Math.abs(d.b.x - d.a.x), height: Math.abs(d.b.y - d.a.y), fill: c, 'fill-opacity': .18, stroke: c, 'stroke-width': g }));
    if (d.modo === 'circle') gTmp.appendChild(ns('circle', { cx: d.a.x, cy: d.a.y, r: Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y), fill: c, 'fill-opacity': .1, stroke: c, 'stroke-width': g, 'stroke-dasharray': g * 2 + ',' + g * 2 }));
    if (d.modo === 'poly') gTmp.appendChild(ns('polygon', { points: d.pts.map(function (p) { return p.join(','); }).join(' '), fill: c, 'fill-opacity': .18, stroke: c, 'stroke-width': g }));
  }

  function render(soloSvg) {
    if (!svg) return;
    U.vaciar(gObjs);
    var lista = objs();
    lista.forEach(function (o) { gObjs.appendChild(nodoDe(o)); });
    if (!soloSvg) { pintarLeyenda(); pintarSlides(); }
    svg.setAttribute('data-tool', tool);
  }

  function nodoDe(o, sinSel) {
    var c = colorDe(o), g = o.grosor || 6;
    var wrap = ns('g', { 'data-id': o.id, class: 'ob' + (!sinSel && sel === o ? ' sel' : '') });
    if (o.tipo === 'pen') {
      wrap.appendChild(ns('polyline', { points: o.pts.map(function (p) { return p.join(','); }).join(' '), fill: 'none', stroke: c, 'stroke-width': g, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    } else if (o.tipo === 'line') {
      var ang = Math.atan2(o.y2 - o.y, o.x2 - o.x), L = g * 3.2;
      wrap.appendChild(ns('line', { x1: o.x, y1: o.y, x2: o.x2, y2: o.y2, stroke: c, 'stroke-width': g, 'stroke-linecap': 'round' }));
      wrap.appendChild(ns('polygon', {
        points: [
          [o.x2, o.y2],
          [o.x2 - L * Math.cos(ang - 0.45), o.y2 - L * Math.sin(ang - 0.45)],
          [o.x2 - L * Math.cos(ang + 0.45), o.y2 - L * Math.sin(ang + 0.45)]
        ].map(function (p) { return p.join(','); }).join(' '), fill: c
      }));
    } else if (o.tipo === 'rect') {
      wrap.appendChild(ns('rect', { x: o.x, y: o.y, width: o.w, height: o.h, fill: c, 'fill-opacity': .18, stroke: c, 'stroke-width': g }));
    } else if (o.tipo === 'poly') {
      wrap.appendChild(ns('polygon', { points: o.pts.map(function (p) { return p.join(','); }).join(' '), fill: c, 'fill-opacity': .18, stroke: c, 'stroke-width': g }));
    } else if (o.tipo === 'circle') {
      wrap.appendChild(ns('circle', { cx: o.x, cy: o.y, r: o.r, fill: c, 'fill-opacity': .10, stroke: c, 'stroke-width': g, 'stroke-dasharray': g * 2 + ',' + g * 2 }));
    } else if (o.tipo === 'text') {
      var s = o.size || 40;
      var t = ns('text', { x: o.x, y: o.y, fill: c, 'font-size': s, 'font-family': 'Zilla Slab, Georgia, serif', 'font-weight': 700, stroke: '#0b0a06', 'stroke-width': s / 12, 'paint-order': 'stroke' });
      t.textContent = o.texto;
      wrap.appendChild(t);
    } else if (o.tipo === 'icon') {
      var k = (o.escala || 1) * (NAT.w / 1100);
      var gi = ns('g', { transform: 'translate(' + o.x + ',' + o.y + ') scale(' + k + ')' });
      gi.innerHTML = iconSVG(o.icono, c);
      wrap.appendChild(gi);
      if (o.etiqueta) {
        var te = ns('text', { x: o.x, y: o.y + 46 * k, fill: c, 'font-size': 22 * k, 'text-anchor': 'middle', 'font-family': 'Space Mono, monospace', stroke: '#0b0a06', 'stroke-width': 3 * k, 'paint-order': 'stroke' });
        te.textContent = o.etiqueta;
        wrap.appendChild(te);
      }
    } else if (o.tipo === 'pin') {
      var kk = NAT.w / 1100, W = 150 * kk, H = 96 * kk;
      var gp = ns('g', { transform: 'translate(' + o.x + ',' + o.y + ')' });
      gp.appendChild(ns('path', { d: 'M0,0 L' + (-10 * kk) + ',' + (-18 * kk) + ' L' + (10 * kk) + ',' + (-18 * kk) + ' Z', fill: c }));
      gp.appendChild(ns('rect', { x: -W / 2, y: -H - 18 * kk, width: W, height: H, fill: '#0b0a06', stroke: c, 'stroke-width': 4 * kk, rx: 3 }));
      var im = ns('image', { x: -W / 2 + 3 * kk, y: -H - 15 * kk, width: W - 6 * kk, height: H - 6 * kk, preserveAspectRatio: 'xMidYMid slice' });
      var url = shotsCache[o.shotId];
      if (url) { im.setAttribute('href', url); }
      else {
        U.shots.get(o.shotId).then(function (u) {
          if (u) { shotsCache[o.shotId] = u; im.setAttribute('href', u); }
        });
      }
      gp.appendChild(im);
      if (o.etiqueta) {
        var tl = ns('text', { x: 0, y: 24 * kk, fill: c, 'font-size': 20 * kk, 'text-anchor': 'middle', 'font-family': 'Space Mono, monospace', stroke: '#0b0a06', 'stroke-width': 4 * kk, 'paint-order': 'stroke' });
        tl.textContent = o.etiqueta;
        gp.appendChild(tl);
      }
      gp.addEventListener('dblclick', function () { abrirPin(o); });
      wrap.appendChild(gp);
    }
    if (!sinSel && sel === o) wrap.appendChild(marco(o));
    return wrap;
  }

  function abrirPin(o) {
    var mostrar = function (u) { U.verCaptura(u, o.etiqueta || 'Captura del terreno'); };
    if (shotsCache[o.shotId]) mostrar(shotsCache[o.shotId]);
    else U.shots.get(o.shotId).then(function (u) { if (u) { shotsCache[o.shotId] = u; mostrar(u); } else U.toast('La captura no está en este navegador', 'err'); });
  }

  function marco(o) {
    var b = bbox(o), m = NAT.w / 130;
    return ns('rect', {
      x: b.x - m, y: b.y - m, width: b.w + m * 2, height: b.h + m * 2,
      fill: 'none', stroke: '#fff', 'stroke-width': NAT.w / 500, 'stroke-dasharray': m + ',' + m, class: 'marco'
    });
  }

  function bbox(o) {
    if (o.pts) {
      var xs = o.pts.map(function (p) { return p[0]; }), ys = o.pts.map(function (p) { return p[1]; });
      return { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys), w: Math.max.apply(null, xs) - Math.min.apply(null, xs), h: Math.max.apply(null, ys) - Math.min.apply(null, ys) };
    }
    if (o.tipo === 'rect') return { x: o.x, y: o.y, w: o.w, h: o.h };
    if (o.tipo === 'circle') return { x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 };
    if (o.tipo === 'line') return { x: Math.min(o.x, o.x2), y: Math.min(o.y, o.y2), w: Math.abs(o.x2 - o.x), h: Math.abs(o.y2 - o.y) };
    if (o.tipo === 'pin') { var k = NAT.w / 1100; return { x: o.x - 75 * k, y: o.y - 114 * k, w: 150 * k, h: 114 * k }; }
    var s = (o.size || 40);
    return { x: o.x - s, y: o.y - s, w: s * 2, h: s * 2 };
  }

  /* ---------------- leyenda (la parte que conecta con el roster) ---------------- */
  var verTodos = false;
  function pintarLeyenda() {
    U.vaciar(leyenda);
    var usados = {};
    objs().forEach(function (o) { if (o.grupo) usados[o.grupo] = (usados[o.grupo] || 0) + 1; });

    leyenda.appendChild(U.el('div', { class: 'ley-head' }, [
      U.el('h3', { text: 'Quién va dónde' }),
      U.el('button', {
        class: 'chip' + (verTodos ? ' on' : ''), text: verTodos ? 'Todos' : 'En el mapa',
        onclick: function () { verTodos = !verTodos; pintarLeyenda(); }
      })
    ]));

    var grupos = U.ROSTER.filter(function (g) {
      if (verTodos) return U.plantel(g.id).length;
      return usados[g.id];
    });

    if (!grupos.length) {
      leyenda.appendChild(U.el('p', { class: 'ley-vacio', text: 'Dibujá con el color de un grupo y acá aparecen sus jugadores. Cargá primero el roster.' }));
    }

    grupos.forEach(function (g) {
      var u = U.unit(g.unidad), pl = U.plantel(g.id);
      var caja = U.el('div', { class: 'ley-grupo' + (grupoActivo === g.id ? ' on' : ''), style: { '--c': u.color } });
      caja.appendChild(U.el('div', {
        class: 'ley-t', onclick: function () { grupoActivo = g.id; pintarTools(); pintarLeyenda(); resaltar(g.id); },
        html: '<i></i><span>' + g.titulo.replace(/ ·.*/, '') + '</span><b>' + (usados[g.id] || 0) + ' marcas</b>'
      }));
      var ul = U.el('div', { class: 'ley-jug' });
      if (!pl.length) ul.appendChild(U.el('span', { class: 'vacio', text: 'sin jugadores cargados' }));
      pl.forEach(function (j) {
        ul.appendChild(U.el('span', {
          class: 'j' + (/SL|COMMANDER|CAP/.test(j.rol) ? ' lider' : '') + (j.ok ? ' ok' : ''),
          title: j.rol,
          html: '<i>' + U.roleIco(j.rol) + '</i>' + j.nombre
        }));
      });
      caja.appendChild(ul);
      leyenda.appendChild(caja);
    });

    /* pins de la slide, listados aparte */
    var pins = objs().filter(function (o) { return o.tipo === 'pin'; });
    if (pins.length) {
      leyenda.appendChild(U.el('div', { class: 'ley-head' }, [U.el('h3', { text: 'Capturas pineadas' })]));
      var cont = U.el('div', { class: 'ley-pins' });
      pins.forEach(function (o, i) {
        var b = U.el('button', { class: 'ley-pin', text: (i + 1) + ' · ' + (o.etiqueta || 'sin etiqueta'), onclick: function () { abrirPin(o); } });
        cont.appendChild(b);
      });
      leyenda.appendChild(cont);
    }
  }

  function resaltar(gid) {
    U.$$('.ob', svg).forEach(function (n) { n.classList.remove('flash'); });
    objs().forEach(function (o) {
      if (o.grupo !== gid) return;
      var n = svg.querySelector('[data-id="' + o.id + '"]');
      if (n) { n.classList.add('flash'); setTimeout(function () { n.classList.remove('flash'); }, 1400); }
    });
  }

  /* ---------------- slides ---------------- */
  function pintarSlides() {
    U.vaciar(slidesBar);
    var s = strat();
    s.slides.forEach(function (sl, i) {
      var b = U.el('button', {
        class: 'sk-slide' + (i === s.activa ? ' on' : ''),
        onclick: function () { s.activa = i; sel = null; U.save(); render(); },
        ondblclick: function () {
          var n = prompt('Nombre de la slide:', sl.nombre);
          if (n) { sl.nombre = n; U.save(); pintarSlides(); }
        }
      }, [
        U.el('span', { class: 'n', text: (i + 1) }),
        U.el('span', { class: 'nm', text: sl.nombre }),
        U.el('span', { class: 'c', text: sl.objs.length })
      ]);
      slidesBar.appendChild(b);
    });
    slidesBar.appendChild(U.el('button', {
      class: 'sk-slide add', text: '＋ slide',
      onclick: function () {
        s.slides.push({ id: U.uid('s'), nombre: 'Slide ' + (s.slides.length + 1), objs: [] });
        s.activa = s.slides.length - 1; U.save(); render();
      }
    }));
    slidesBar.appendChild(U.el('button', {
      class: 'sk-slide add', text: '⧉ duplicar',
      onclick: function () {
        var c = JSON.parse(JSON.stringify(slide()));
        c.id = U.uid('s'); c.nombre = c.nombre + ' (copia)';
        c.objs.forEach(function (o) { o.id = U.uid('o'); });
        s.slides.splice(s.activa + 1, 0, c); s.activa++; U.save(); render();
      }
    }));
    if (s.slides.length > 1) slidesBar.appendChild(U.el('button', {
      class: 'sk-slide add del', text: '✕ borrar',
      onclick: function () {
        U.confirmar('¿Borrar la slide "' + slide().nombre + '"?', function () {
          s.slides.splice(s.activa, 1); s.activa = Math.max(0, s.activa - 1); U.save(); render();
        });
      }
    }));
  }

  /* ---------------- modo briefing ---------------- */
  function presentar() {
    var s = strat(), i = s.activa;
    var back = U.el('div', { class: 'present' });
    var vista = U.el('div', { class: 'p-vista' });
    var ley = U.el('div', { class: 'p-ley' });
    var barra = U.el('div', { class: 'p-barra' });
    back.appendChild(barra); back.appendChild(vista); back.appendChild(ley);
    document.body.appendChild(back);

    function pintar() {
      var sl = s.slides[i];
      U.vaciar(vista); U.vaciar(ley); U.vaciar(barra);
      var clon = svg.cloneNode(false);
      clon.setAttribute('viewBox', '0 0 ' + NAT.w + ' ' + NAT.h);
      clon.setAttribute('class', 'sk-svg');
      clon.appendChild(gMapa.cloneNode(true));
      var go = ns('g');
      sl.objs.forEach(function (o) { go.appendChild(nodoDe(o, true)); });
      clon.appendChild(go);
      vista.appendChild(clon);

      var p = U.partida();
      barra.appendChild(U.el('div', { class: 'p-tit', html: '<b>' + esc(p.nombre) + '</b> · ' + esc(U.map(s.mapa).nombre) + (p.punto ? ' · ' + esc(p.punto) : '') + ' · <span>' + esc(sl.nombre) + '</span>' }));
      var nav = U.el('div', { class: 'p-nav' }, [
        U.el('button', { class: 'btn sm', text: '‹', onclick: function () { i = (i - 1 + s.slides.length) % s.slides.length; pintar(); } }),
        U.el('span', { text: (i + 1) + ' / ' + s.slides.length }),
        U.el('button', { class: 'btn sm', text: '›', onclick: function () { i = (i + 1) % s.slides.length; pintar(); } }),
        U.el('button', { class: 'btn sm ghost', text: 'Salir (Esc)', onclick: salir })
      ]);
      barra.appendChild(nav);

      var usados = {};
      sl.objs.forEach(function (o) { if (o.grupo) usados[o.grupo] = true; });
      U.ROSTER.filter(function (g) { return usados[g.id]; }).forEach(function (g) {
        var u = U.unit(g.unidad), pl = U.plantel(g.id);
        var c = U.el('div', { class: 'p-grupo', style: { '--c': u.color } });
        c.appendChild(U.el('h4', { html: '<i></i>' + g.titulo.replace(/ ·.*/, '') }));
        var l = U.el('div', { class: 'p-jug' });
        pl.forEach(function (j) { l.appendChild(U.el('span', { class: /SL|COMMANDER|CAP/.test(j.rol) ? 'lider' : '', html: '<i>' + U.roleIco(j.rol) + '</i>' + j.nombre })); });
        if (!pl.length) l.appendChild(U.el('span', { class: 'vacio', text: '—' }));
        c.appendChild(l);
        ley.appendChild(c);
      });
      var pins = sl.objs.filter(function (o) { return o.tipo === 'pin'; });
      if (pins.length) {
        var pc = U.el('div', { class: 'p-grupo', style: { '--c': '#c99a2e' } });
        pc.appendChild(U.el('h4', { html: '<i></i>CAPTURAS' }));
        var pl2 = U.el('div', { class: 'p-jug' });
        pins.forEach(function (o, n) { pl2.appendChild(U.el('span', { html: '<i>📷</i>' + (o.etiqueta || ('pin ' + (n + 1))), onclick: function () { abrirPin(o); } })); });
        pc.appendChild(pl2); ley.appendChild(pc);
      }
    }
    function tecla(e) {
      if (e.key === 'Escape') salir();
      if (e.key === 'ArrowRight' || e.key === ' ') { i = (i + 1) % s.slides.length; pintar(); }
      if (e.key === 'ArrowLeft') { i = (i - 1 + s.slides.length) % s.slides.length; pintar(); }
    }
    function salir() { document.removeEventListener('keydown', tecla); back.remove(); }
    document.addEventListener('keydown', tecla);
    pintar();
  }

  /* ---------------- íconos tácticos (SVG puro) ---------------- */
  function iconSVG(id, c) {
    var s = '#0b0a06';
    var base = function (inner) { return '<g stroke-linejoin="round" stroke-linecap="round">' + inner + '</g>'; };
    switch (id) {
      case 'garrison': return base('<path d="M-2,16 L-2,-16 L16,-10 L-2,-4" fill="' + c + '" stroke="' + s + '" stroke-width="2"/><line x1="-2" y1="16" x2="-2" y2="-16" stroke="' + c + '" stroke-width="4"/><rect x="-12" y="14" width="20" height="5" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/>');
      case 'op': return base('<line x1="-2" y1="18" x2="-2" y2="-16" stroke="' + c + '" stroke-width="4"/><path d="M-2,-16 L18,-8 L-2,0 Z" fill="' + c + '" stroke="' + s + '" stroke-width="2"/>');
      case 'node': return base('<circle cx="0" cy="8" r="5" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/><path d="M-10,-2 A12,12 0 0 1 10,-2" fill="none" stroke="' + c + '" stroke-width="3"/><path d="M-16,-10 A20,20 0 0 1 16,-10" fill="none" stroke="' + c + '" stroke-width="3"/>');
      case 'supply': return base('<rect x="-13" y="-10" width="26" height="20" fill="' + c + '" stroke="' + s + '" stroke-width="2"/><line x1="0" y1="-10" x2="0" y2="10" stroke="' + s + '" stroke-width="2"/><line x1="-13" y1="-2" x2="13" y2="-2" stroke="' + s + '" stroke-width="2"/>');
      case 'truck': return base('<rect x="-16" y="-8" width="20" height="12" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/><path d="M4,-4 L13,-4 L17,2 L17,4 L4,4 Z" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/><circle cx="-9" cy="7" r="4" fill="' + s + '" stroke="' + c + '" stroke-width="2"/><circle cx="10" cy="7" r="4" fill="' + s + '" stroke="' + c + '" stroke-width="2"/>');
      case 'mg': return base('<circle cx="-8" cy="6" r="5" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/><line x1="-6" y1="2" x2="14" y2="-8" stroke="' + c + '" stroke-width="4"/><path d="M-14,12 L-2,12 M-8,11 L-8,2" stroke="' + c + '" stroke-width="3"/>');
      case 'at': return base('<path d="M-14,4 L6,-6 L16,-10 L10,0 L14,6 L2,4 L-12,10 Z" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/>');
      case 'inf': return base('<circle cx="0" cy="-9" r="5" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/><path d="M0,-4 L0,8 M-8,2 L8,2 M0,8 L-6,17 M0,8 L6,17" stroke="' + c + '" stroke-width="3.5"/>');
      case 'sniper': return base('<circle cx="0" cy="0" r="13" fill="none" stroke="' + c + '" stroke-width="3"/><line x1="-18" y1="0" x2="18" y2="0" stroke="' + c + '" stroke-width="3"/><line x1="0" y1="-18" x2="0" y2="18" stroke="' + c + '" stroke-width="3"/>');
      case 'tank': return base('<rect x="-15" y="-2" width="30" height="11" rx="3" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/><rect x="-7" y="-10" width="14" height="9" rx="2" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/><line x1="7" y1="-6" x2="19" y2="-6" stroke="' + c + '" stroke-width="3"/>');
      case 'tankL': case 'tankM': case 'tankR':
        return base('<circle cx="0" cy="0" r="14" fill="' + s + '" fill-opacity=".75" stroke="' + c + '" stroke-width="3"/><text x="0" y="6" text-anchor="middle" font-size="17" font-family="Space Mono, monospace" font-weight="700" fill="' + c + '">' + id.slice(-1) + '</text>');
      case 'arty': return base('<circle cx="-8" cy="8" r="5" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/><line x1="-8" y1="6" x2="12" y2="-12" stroke="' + c + '" stroke-width="5"/><path d="M-16,13 L2,13" stroke="' + c + '" stroke-width="3"/>');
      case 'warn': return base('<path d="M0,-15 L16,13 L-16,13 Z" fill="' + c + '" stroke="' + s + '" stroke-width="2"/><line x1="0" y1="-5" x2="0" y2="5" stroke="' + s + '" stroke-width="3"/><circle cx="0" cy="9" r="1.8" fill="' + s + '"/>');
      case 'ok': return base('<path d="M-13,1 L-4,10 L14,-10" fill="none" stroke="' + c + '" stroke-width="5"/>');
      case 'no': return base('<circle cx="0" cy="0" r="13" fill="none" stroke="' + c + '" stroke-width="4"/><line x1="-9" y1="9" x2="9" y2="-9" stroke="' + c + '" stroke-width="4"/>');
      case 'eye': return base('<path d="M-16,0 Q0,-12 16,0 Q0,12 -16,0 Z" fill="none" stroke="' + c + '" stroke-width="3"/><circle cx="0" cy="0" r="4.5" fill="' + c + '"/>');
      case 'skull': return base('<path d="M-10,-12 A11,11 0 0 1 10,-12 L10,2 L5,8 L-5,8 L-10,2 Z" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/><circle cx="-4.5" cy="-4" r="2.6" fill="' + s + '"/><circle cx="4.5" cy="-4" r="2.6" fill="' + s + '"/><path d="M-7,11 L7,11" stroke="' + c + '" stroke-width="4"/>');
      default: return base('<line x1="-2" y1="16" x2="-2" y2="-14" stroke="' + c + '" stroke-width="4"/><rect x="-2" y="-14" width="17" height="11" fill="' + c + '" stroke="' + s + '" stroke-width="1.5"/>');
    }
  }

  return {
    montar: montar,
    render: function () { if (svg) { render(); } },
    recargarMapa: function () { if (svg) { cargarMapa(); pintarTools(); render(); } }
  };
})();
