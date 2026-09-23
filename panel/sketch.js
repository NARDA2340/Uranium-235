/* ===================================================================
   sketch.js — el stratsketch propio.

   Decisiones de diseño:
   · El mapa está FIJO: se ve entero siempre, no se mueve ni se hace
     zoom. Así el trazo cae exactamente donde apuntás.
   · Las coordenadas se calculan con getScreenCTM (matriz real del
     SVG), no a ojo: aunque la ventana cambie, el dibujo no se corre.
   · Cada objeto puede pertenecer a un grupo del roster: hereda su
     color y la leyenda de la derecha dice quién va ahí.
   · Un clic pone el objeto y listo. Arrastrarlo lo mueve; doble clic
     lo abre para editar (tamaño, giro, grupo). Sin marco de selección.
   · Ctrl+Z / Ctrl+Y sobre cada slide.
   =================================================================== */
window.U = window.U || {};

U.sketch = (function () {
  var host, svg, gMapa, gObjs, gTmp, gSel, leyenda, slidesBar, toolbar, marcoMapa, barraObj, cabecera;
  var NAT = { w: 1920, h: 1920 };
  var tool = 'sel', grupoActivo = 'sq_red', colorLibre = '#e6bc55';
  var grosor = 7, escalaIcono = 1, iconoActivo = 'garrison';
  var sel = null, dibujando = null, shotsCache = {}, paneo = null, recien = null, pinT = null;
  var multi = [];                     // selección de varios a la vez
  var espacio = false;                // Espacio apretado = mano para mover el mapa
  var vista = { z: 1, x: 0, y: 0 };   // zoom y esquina del viewBox
  var abierto = { iconos: true, mapa: false, grupos: false };

  /* colores libres: para marcar cosas que no son de un escuadrón */
  var LIBRES = ['#e6bc55', '#f2efe6', '#1a1914', '#d94b3a', '#3b82c4', '#6fae3f', '#e08a2e', '#9b6bd1'];

  /* estilo de cada herramienta de dibujo, como en StratSketch:
     tipo de línea, punta, relleno y forma */
  var estilo = {
    pen: { trazo: 'solido', punta: 'nada' },
    line: { trazo: 'solido', punta: 'flecha' },
    rect: { trazo: 'solido', relleno: 'suave', forma: 'rect' },
    poly: { trazo: 'solido', relleno: 'suave' },
    circle: { trazo: 'guiones', relleno: 'suave' }
  };
  var OPACIDAD = { nada: 0, suave: 0.18, lleno: 0.5 };
  var FORMAS = [
    { id: 'rect', t: 'Rectángulo', real: 'rect' }, { id: 'cuadrado', t: 'Cuadrado', real: 'rect', fija: true },
    { id: 'elipse', t: 'Elipse', real: 'elipse' }, { id: 'circulo', t: 'Círculo', real: 'elipse', fija: true },
    { id: 'tri', t: 'Triángulo', real: 'tri' }, { id: 'rombo', t: 'Rombo', real: 'rombo' }
  ];
  var historia = {}, futuro = {};

  /* ---------------- helpers ---------------- */
  function P() { return U.partida(); }
  function hay() { return !!(P() && P().strat); }
  function strat() { return P().strat; }
  function slide() { var s = strat(); return s.slides[Math.min(s.activa, s.slides.length - 1)]; }
  function objs() { return slide().objs; }
  function ocultos() { var st = strat(); if (!st.ocultos) st.ocultos = {}; return st.ocultos; }
  function visible(o) { return !(o.grupo && ocultos()[o.grupo]); }

  /* ---- selección: uno (sel) o varios (multi) ---- */
  function limpiarSel() { sel = null; multi = []; }
  function estaSel(o) { return sel === o || multi.indexOf(o) >= 0; }
  function seleccionados() { return multi.length ? multi.slice() : (sel ? [sel] : []); }
  function fijarSel(lista) {
    if (lista.length === 1) { sel = lista[0]; multi = []; }
    else { sel = null; multi = lista; }
    pintarTools(); render();
  }

  /* estilo de un objeto, con los valores de antes para lo ya dibujado */
  function props(o) {
    return {
      trazo: o.trazo || (o.tipo === 'circle' ? 'guiones' : 'solido'),
      punta: o.punta || (o.tipo === 'line' ? 'flecha' : 'nada'),
      relleno: o.relleno || 'suave',
      forma: o.forma || 'rect'
    };
  }
  function estiloDe(tipo) {
    var e = estilo[tipo]; if (!e) return {};
    var out = {};
    Object.keys(e).forEach(function (k) { if (k !== 'forma') out[k] = e[k]; });
    if (tipo === 'rect') out.forma = formaReal(e.forma);
    return out;
  }
  function formaReal(id) { var f = FORMAS.find(function (x) { return x.id === id; }); return f ? f.real : 'rect'; }
  function formaFija(id) { var f = FORMAS.find(function (x) { return x.id === id; }); return !!(f && f.fija); }
  function guiones(trazo, g) {
    if (trazo === 'guiones') return (g * 2.4).toFixed(1) + ',' + (g * 1.8).toFixed(1);
    if (trazo === 'puntos') return '0.01,' + (g * 2).toFixed(1);
    return null;
  }
  function colorElegido() { return grupoActivo === '__libre' ? { color: colorLibre } : { grupo: grupoActivo }; }
  function colorDe(o) {
    if (o.grupo) { var g = U.group(o.grupo); if (g) return U.unit(g.unidad).color; }
    return o.color || colorLibre;
  }
  function colorActual() {
    if (grupoActivo === '__libre') return colorLibre;
    var g = U.group(grupoActivo); return g ? U.unit(g.unidad).color : colorLibre;
  }
  function ns(t, a) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', t);
    if (a) Object.keys(a).forEach(function (k) { if (a[k] !== null && a[k] !== undefined) n.setAttribute(k, a[k]); });
    return n;
  }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* punto exacto del mapa bajo el cursor */
  function svgPt(e) {
    var pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    var m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    var p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  /* ---------------- historial ---------------- */
  function snapshot() {
    var id = slide().id;
    (historia[id] = historia[id] || []).push(JSON.stringify(objs()));
    if (historia[id].length > 60) historia[id].shift();
    futuro[id] = [];
    pintarAcciones();
  }
  function deshacer() {
    var id = slide().id, h = historia[id] || [];
    if (!h.length) { U.toast('Nada para deshacer'); return; }
    (futuro[id] = futuro[id] || []).push(JSON.stringify(objs()));
    slide().objs = JSON.parse(h.pop());
    limpiarSel(); U.save(); pintarTools(); render();
  }
  function rehacer() {
    var id = slide().id, f = futuro[id] || [];
    if (!f.length) return;
    (historia[id] = historia[id] || []).push(JSON.stringify(objs()));
    slide().objs = JSON.parse(f.pop());
    limpiarSel(); U.save(); pintarTools(); render();
  }

  /* ---------------- montaje ---------------- */
  function montar(nodo) {
    host = nodo;
    U.vaciar(host);

    toolbar = U.el('div', { class: 'sk-tools' });
    var lienzo = U.el('div', { class: 'sk-lienzo' });
    cabecera = U.el('div', { class: 'sk-cabecera', id: 'sk-cabecera' });
    lienzo.appendChild(cabecera);
    leyenda = U.el('div', { class: 'sk-leyenda' });
    host.appendChild(toolbar);
    host.appendChild(lienzo);
    host.appendChild(leyenda);

    marcoMapa = U.el('div', { class: 'sk-marco' });
    marcoMapa.appendChild(U.el('div', { class: 'sk-zoom' }, [
      U.el('button', { text: '−', title: 'Alejar', onclick: function () { zoomA(vista.z / 1.4); } }),
      U.el('span', { id: 'sk-zoom-val', text: '100%' }),
      U.el('button', { text: '+', title: 'Acercar (rueda del mouse)', onclick: function () { zoomA(vista.z * 1.4); } }),
      U.el('button', { text: '⤢', title: 'Ver el mapa entero', onclick: function () { encuadrar(); } })
    ]));
    svg = ns('svg', { class: 'sk-svg', xmlns: 'http://www.w3.org/2000/svg' });
    gMapa = ns('g'); gObjs = ns('g'); gTmp = ns('g', { 'pointer-events': 'none' }); gSel = ns('g', { class: 'sk-selcapa' });
    svg.appendChild(defsSVG());
    svg.appendChild(gMapa); svg.appendChild(gObjs); svg.appendChild(gTmp); svg.appendChild(gSel);
    marcoMapa.appendChild(svg);
    lienzo.appendChild(marcoMapa);

    barraObj = U.el('div', { class: 'sk-obj', id: 'sk-obj' });
    lienzo.appendChild(barraObj);

    slidesBar = U.el('div', { class: 'sk-slides' });
    lienzo.appendChild(slidesBar);

    eventos();
    aplicarEscalaPaneles();
    if (!hay()) { vacio(); return; }
    pintarTools();
    cargarMapa();
    render();
  }

  /* sin partida elegida todavía */
  function vacio() {
    U.vaciar(toolbar); U.vaciar(leyenda); U.vaciar(slidesBar); U.vaciar(gMapa); U.vaciar(gObjs);
    leyenda.appendChild(U.el('p', {
      class: 'ley-vacio',
      text: 'Elegí una partida en la pestaña Partidas para empezar a dibujar.'
    }));
    svg.setAttribute('viewBox', '0 0 100 100');
  }

  /* ---------------- mapa (fijo) ---------------- */
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
  function cargarMapa() {
    if (!hay()) return;
    U.vaciar(gMapa);
    var m = U.map(strat().mapa), c = capas(), E = U.ESPACIO;

    if (strat().imgPropia) {
      var img = new Image();
      img.onload = function () {
        NAT = { w: E, h: Math.round(E * img.naturalHeight / img.naturalWidth) };
        U.vaciar(gMapa);
        gMapa.appendChild(imagen(strat().imgPropia, NAT.w, NAT.h));
        encuadrar(); render();
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
    encuadrar();
  }
  function encuadrar() {
    vista = { z: 1, x: 0, y: 0 };
    // el marco toma la proporción del mapa: así no quedan bandas negras
    if (marcoMapa) marcoMapa.style.aspectRatio = (NAT.w / NAT.h).toFixed(4);
    aplicarVista();
  }

  /* ---------------- zoom ----------------
     Todo pasa por el viewBox: el dibujo sigue cayendo exacto porque las
     coordenadas se calculan con getScreenCTM, que ya lo tiene en cuenta. */
  var ZMAX = 6;
  function aplicarVista() {
    var w = NAT.w / vista.z, h = NAT.h / vista.z;
    vista.x = Math.max(0, Math.min(NAT.w - w, vista.x));
    vista.y = Math.max(0, Math.min(NAT.h - h, vista.y));
    svg.setAttribute('viewBox', vista.x.toFixed(2) + ' ' + vista.y.toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2));
    var et = U.$('#sk-zoom-val');
    if (et) et.textContent = Math.round(vista.z * 100) + '%';
    if (marcoMapa) marcoMapa.classList.toggle('con-zoom', vista.z > 1);
    if (sel && !dibujando) pintarSel();
  }
  function zoomA(z, cx, cy) {
    var nz = Math.max(1, Math.min(ZMAX, z));
    if (cx === undefined) { cx = vista.x + NAT.w / vista.z / 2; cy = vista.y + NAT.h / vista.z / 2; }
    var k = vista.z / nz;                       // cuánto cambia el ancho visible
    vista.x = cx - (cx - vista.x) * k;
    vista.y = cy - (cy - vista.y) * k;
    vista.z = nz;
    aplicarVista();
  }
  function escalaPantalla() {
    var r = svg.getBoundingClientRect();
    return r.width / (NAT.w / vista.z);         // px de pantalla por unidad de mapa
  }

  /* ---------------- barra de herramientas ---------------- */
  var TOOLS = [
    { id: 'sel', ico: '<svg viewBox="0 0 24 24" width="1.05em" height="1.05em"><path d="M6 2.5v17l4.3-4.1 3 6.3 2.6-1.2-3-6.2 5.9-.3z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>', t: 'Seleccionar · V — arrastrá en el vacío para agarrar varios, arrastrá un objeto para moverlo, doble clic para editar' },
    { id: 'pen', ico: '✎', t: 'Trazo libre · P' },
    { id: 'line', ico: '↗', t: 'Línea / flecha · L' },
    { id: 'rect', ico: '▭', t: 'Formas · R — rectángulo, cuadrado, elipse, círculo, triángulo, rombo' },
    { id: 'poly', ico: '⬠', t: 'Zona libre · G — doble clic cierra' },
    { id: 'circle', ico: '◯', t: 'Radio · C' },
    { id: 'icon', ico: '⚑', t: 'Poner el ícono elegido · I' },
    { id: 'text', ico: 'T', t: 'Texto · T — mantené apretado para el tamaño' },
    { id: 'pin', ico: '▣', t: 'Pinear una captura del juego · S' },
    { id: 'del', ico: '⌫', t: 'Borrar: clic sobre el objeto · Supr' }
  ];

  function pintarTools() {
    if (!hay()) return;
    U.vaciar(toolbar);

    /* --- tamaño de los paneles --- */
    toolbar.appendChild(U.el('div', { class: 'sk-escala' }, [
      U.el('button', { text: '−', title: 'Achicar los paneles', onclick: function () { escalaPaneles(-1); } }),
      U.el('span', { text: 'paneles' }),
      U.el('button', { text: '+', title: 'Agrandar los paneles', onclick: function () { escalaPaneles(1); } })
    ]));

    /* --- herramientas --- */
    var gt = U.el('div', { class: 'sk-grid-tools' });
    TOOLS.forEach(function (t) {
      var b = U.el('button', {
        class: 'sk-tool' + (tool === t.id ? ' on' : ''), title: t.t, html: t.ico,
        onclick: function () { terminar(); tool = t.id; cerrarPop(); pintarTools(); render(); }
      });
      mantener(b, function () { popTamano(b, t.id); });
      gt.appendChild(b);
    });
    toolbar.appendChild(gt);

    /* --- deshacer / rehacer --- */
    var acc = U.el('div', { class: 'sk-grid-tools chico', id: 'sk-acciones' });
    acc.appendChild(U.el('button', { class: 'sk-tool', html: '↶', title: 'Deshacer · Ctrl+Z', onclick: deshacer }));
    acc.appendChild(U.el('button', { class: 'sk-tool', html: '↷', title: 'Rehacer · Ctrl+Y', onclick: rehacer }));
    toolbar.appendChild(acc);

    /* --- estilo del trazo (según la herramienta o lo seleccionado) --- */
    var est = panelEstilo();
    if (est) toolbar.appendChild(est);

    /* --- escuadrones: tocar el activo otra vez lo suelta y pasa a libre --- */
    toolbar.appendChild(U.el('div', { class: 'sk-sep', text: 'Escuadrón' }));
    var grupos = gruposDibujables(), LIM = 6;
    var visibles = (abierto.grupos || grupos.length <= LIM + 1) ? grupos : grupos.slice(0, LIM);
    var activo = grupos.find(function (g) { return g.id === grupoActivo; });
    if (activo && visibles.indexOf(activo) < 0) visibles = visibles.concat([activo]);
    var gg = U.el('div', { class: 'sk-swatches' });
    visibles.forEach(function (g) {
      gg.appendChild(U.el('button', {
        class: 'sw' + (grupoActivo === g.id ? ' on' : ''),
        style: { '--c': U.unit(g.unidad).color },
        title: g.titulo + ' · ' + U.plantel(g.id).length + ' jugadores' + (grupoActivo === g.id ? ' — clic para soltarlo y usar color libre' : ''),
        text: corto(g),
        onclick: function () {
          // cambiar de color termina lo que se estaba haciendo: lo ya puesto
          // no se toca y la herramienta queda lista para el color nuevo
          grupoActivo = grupoActivo === g.id ? '__libre' : g.id;
          terminar(); pintarTools(); render();
        }
      }));
    });
    if (grupos.length > LIM + 1) {
      gg.appendChild(U.el('button', {
        class: 'sw-mas', text: abierto.grupos ? '▴ ver menos' : '▾ ver ' + (grupos.length - LIM) + ' más',
        onclick: function () { abierto.grupos = !abierto.grupos; pintarTools(); }
      }));
    }
    toolbar.appendChild(gg);

    /* --- color libre: sin escuadrón --- */
    toolbar.appendChild(U.el('div', {
      class: 'sk-sep' + (grupoActivo === '__libre' ? ' activo' : ''),
      text: grupoActivo === '__libre' ? 'Libre · en uso' : 'Color libre'
    }));
    var cl = U.el('div', { class: 'sk-libres' });
    var propio = LIBRES.indexOf(colorLibre) < 0;
    LIBRES.concat(propio ? [colorLibre] : []).forEach(function (c) {
      cl.appendChild(U.el('button', {
        class: 'lib' + (grupoActivo === '__libre' && colorLibre === c ? ' on' : ''),
        style: { '--c': c }, title: 'Color libre',
        onclick: function () { grupoActivo = '__libre'; colorLibre = c; terminar(); pintarTools(); render(); }
      }));
    });
    var otro = U.el('button', { class: 'lib otro', title: 'Otro color', text: '+' });
    otro.addEventListener('click', function () {
      var inp = U.el('input', { type: 'color', value: colorLibre, class: 'sk-color-oculto' });
      document.body.appendChild(inp);
      inp.addEventListener('input', function () { grupoActivo = '__libre'; colorLibre = inp.value; });
      inp.addEventListener('change', function () { inp.remove(); terminar(); pintarTools(); render(); });
      inp.click();
    });
    cl.appendChild(otro);
    toolbar.appendChild(cl);

    /* --- íconos, plegable --- */
    toolbar.appendChild(plegable('Íconos', 'iconos', function (caja) {
      var grupos = {};
      U.ICONS.forEach(function (ic) { (grupos[ic.grupo] = grupos[ic.grupo] || []).push(ic); });
      Object.keys(grupos).forEach(function (gr) {
        caja.appendChild(U.el('span', { class: 'sk-ico-t', text: gr }));
        var gi = U.el('div', { class: 'sk-iconos' });
        grupos[gr].forEach(function (ic) {
          var b = U.el('button', {
            class: 'sk-ico' + (iconoActivo === ic.id ? ' on' : '') + (ic.grupo === 'vehículos' ? ' veh' : ''), title: ic.nombre,
            style: { '--c': colorActual() },
            onclick: function () { iconoActivo = ic.id; tool = 'icon'; pintarTools(); }
          });
          if (ic.img) {
            b.appendChild(U.el('img', { src: U.ICONO_BASE + ic.img + '.png', alt: ic.nombre }));
          } else {
            var sv = ns('svg', { viewBox: '-24 -24 48 48' });
            sv.innerHTML = iconSVG(ic.id, colorActual());
            b.appendChild(sv);
          }
          gi.appendChild(b);
        });
        caja.appendChild(gi);
      });
    }));

    /* --- mapa, plegable --- */
    toolbar.appendChild(plegable('Mapa', 'mapa', function (caja) {
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
      caja.appendChild(selMapa);

      var cps = capas();
      cps.grid = true;                               // la cuadrícula va siempre
      caja.appendChild(U.el('button', {
        class: 'sk-capa' + (cps.puntos ? ' on' : ''), text: 'Puntos y nombres',
        onclick: function () { cps.puntos = !cps.puntos; U.save(); cargarMapa(); pintarTools(); }
      }));
    }));

    /* --- acciones finales --- */

  }

  /* ---------- panel de estilo, como el de StratSketch ----------
     Con una herramienta de dibujo elegida define cómo sale lo próximo;
     con formas seleccionadas, las cambia a ellas. */
  function panelEstilo() {
    var objetivo = seleccionados().filter(function (o) { return estilo[o.tipo]; });
    var tipo = objetivo.length ? objetivo[0].tipo : (estilo[tool] ? tool : null);
    if (!tipo) return null;
    var actual = objetivo.length ? props(objetivo[0]) : estilo[tipo];
    if (objetivo.length && tipo === 'rect') {
      var f = objetivo[0].forma || 'rect';
      actual = Object.assign({}, actual, { forma: f === 'elipse' ? 'elipse' : f });
    }
    var caja = U.el('div', { class: 'sk-estilo' });

    function fila(titulo, prop, opciones, aplica) {
      if (!aplica) return;
      caja.appendChild(U.el('span', { class: 'sk-est-t', text: titulo }));
      var g = U.el('div', { class: 'sk-est-op n' + opciones.length });
      opciones.forEach(function (op) {
        g.appendChild(U.el('button', {
          class: 'sk-est' + (actual[prop] === op.id ? ' on' : ''), title: op.t, html: op.svg,
          onclick: function () { aplicarEstilo(tipo, objetivo, prop, op.id); }
        }));
      });
      caja.appendChild(g);
    }
    var L = function (extra, dash) {
      return '<svg viewBox="0 0 40 16"><line x1="5" y1="8" x2="' + (extra ? 29 : 35) + '" y2="8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>' + (extra || '') + '</svg>';
    };
    var cabeza = '<path d="M36,8 L27,3 L27,13 Z" fill="currentColor"/>';
    var cola = '<path d="M4,8 L13,3 L13,13 Z" fill="currentColor"/>';

    fila('Forma', 'forma', FORMAS.map(function (fm) {
      var d = {
        rect: '<rect x="6" y="3" width="28" height="10" rx="1"/>', cuadrado: '<rect x="13" y="1.5" width="13" height="13" rx="1"/>',
        elipse: '<ellipse cx="20" cy="8" rx="14" ry="6"/>', circulo: '<circle cx="20" cy="8" r="6.5"/>',
        tri: '<path d="M20,1.5 L28,14.5 L12,14.5 Z"/>', rombo: '<path d="M20,1 L28,8 L20,15 L12,8 Z"/>'
      }[fm.id];
      return { id: fm.id, t: fm.t, svg: '<svg viewBox="0 0 40 16" fill="none" stroke="currentColor" stroke-width="2">' + d + '</svg>' };
    }), tipo === 'rect');
    fila('Línea', 'trazo', [
      { id: 'solido', t: 'Continua', svg: L() },
      { id: 'guiones', t: 'Guiones', svg: L('', '6,4') },
      { id: 'puntos', t: 'Puntos', svg: L('', '0.01,5') }
    ], true);
    fila('Punta', 'punta', [
      { id: 'nada', t: 'Sin punta', svg: L() },
      { id: 'flecha', t: 'Flecha', svg: L(cabeza) },
      { id: 'doble', t: 'Flecha doble', svg: '<svg viewBox="0 0 40 16"><line x1="11" y1="8" x2="29" y2="8" stroke="currentColor" stroke-width="2.4"/>' + cabeza + cola + '</svg>' },
      { id: 'barra', t: 'Tope (bloqueo)', svg: L('<line x1="33" y1="2" x2="33" y2="14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>') }
    ], tipo === 'pen' || tipo === 'line');
    fila('Relleno', 'relleno', [
      { id: 'nada', t: 'Sin relleno', svg: '<svg viewBox="0 0 40 16"><rect x="11" y="2" width="18" height="12" fill="none" stroke="currentColor" stroke-width="2"/></svg>' },
      { id: 'suave', t: 'Suave', svg: '<svg viewBox="0 0 40 16"><rect x="11" y="2" width="18" height="12" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-width="2"/></svg>' },
      { id: 'lleno', t: 'Lleno', svg: '<svg viewBox="0 0 40 16"><rect x="11" y="2" width="18" height="12" fill="currentColor" fill-opacity=".75" stroke="currentColor" stroke-width="2"/></svg>' }
    ], tipo === 'rect' || tipo === 'poly' || tipo === 'circle');

    /* grosor */
    var gv = objetivo.length ? (objetivo[0].grosor || 7) : grosor;
    caja.appendChild(U.el('span', { class: 'sk-est-t', text: 'Grosor' }));
    var fg = U.el('div', { class: 'sk-est-gros' });
    var rng = U.el('input', { type: 'range', min: 2, max: 26, step: 1, value: gv });
    var val = U.el('b', { text: gv });
    var tomado = false;
    rng.addEventListener('input', function () {
      val.textContent = rng.value;
      grosor = Number(rng.value);
      if (!objetivo.length) return;
      if (!tomado) { snapshot(); tomado = true; }
      objetivo.forEach(function (o) { o.grosor = grosor; repintarObj(o); });
    });
    rng.addEventListener('change', function () { tomado = false; if (objetivo.length) U.save(); });
    fg.appendChild(rng); fg.appendChild(val);
    caja.appendChild(fg);
    return caja;
  }

  function aplicarEstilo(tipo, objetivo, prop, valor) {
    estilo[tipo][prop] = valor;                     // lo próximo sale así
    if (objetivo.length) {
      snapshot();
      objetivo.forEach(function (o) {
        if (prop === 'forma') { if (o.tipo === 'rect') o.forma = formaReal(valor); }
        else if (prop === 'punta') { if (o.tipo === 'pen' || o.tipo === 'line') o.punta = valor; }
        else if (prop === 'relleno') { if (o.tipo !== 'pen' && o.tipo !== 'line') o.relleno = valor; }
        else o[prop] = valor;
      });
      U.save(); render();
    }
    pintarTools();
  }

  /* nombre corto para la muestra de color y la leyenda */
  /* tres tamaños de panel: chico, normal y grande */
  function escalaPaneles(d) {
    var n = (U.state.ui.panel || 1) + d;
    U.state.ui.panel = Math.max(0, Math.min(2, n));
    U.save();
    aplicarEscalaPaneles();
  }
  function aplicarEscalaPaneles() {
    var n = U.state.ui.panel == null ? 1 : U.state.ui.panel;
    if (host) host.setAttribute('data-panel', n);
  }

  function corto(g) {
    return String(g.titulo || '')
      .split('|')[0]
      .split('·')[0]
      .replace('INCURSOR (WAMO)', 'WAMO')
      .replace('ARTILLERÍA', 'ARTY')
      .replace('COMMANDER', 'CMD')
      .replace('TANQUE ', 'T')
      .replace('RECON ', 'REC ')
      .trim();
  }

  function gruposDibujables() {
    return U.bloques().filter(function (g) { return g.tipo !== 'tarea'; });
  }

  function plegable(titulo, clave, armar) {
    var wrap = U.el('div', { class: 'sk-pleg' + (abierto[clave] ? ' on' : '') });
    wrap.appendChild(U.el('button', {
      class: 'sk-pleg-t', html: titulo + '<i>' + (abierto[clave] ? '▾' : '▸') + '</i>',
      onclick: function () { abierto[clave] = !abierto[clave]; pintarTools(); }
    }));
    if (abierto[clave]) {
      var caja = U.el('div', { class: 'sk-pleg-c' });
      armar(caja);
      wrap.appendChild(caja);
    }
    return wrap;
  }

  /* --- mantener apretado para el tamaño --- */
  function mantener(btn, fn) {
    var t = null;
    btn.addEventListener('pointerdown', function () { t = setTimeout(fn, 320); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      btn.addEventListener(ev, function () { clearTimeout(t); });
    });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); fn(); });
  }

  var pop = null;
  function cerrarPop() { if (pop) { pop.remove(); pop = null; } }
  function popTamano(btn, cual) {
    cerrarPop();
    var esIcono = cual === 'icon', esTexto = cual === 'text';
    var r = btn.getBoundingClientRect();
    var valor = esIcono || esTexto ? escalaIcono : grosor;
    var min = esIcono || esTexto ? 0.4 : 2, max = esIcono || esTexto ? 3 : 26, paso = esIcono || esTexto ? 0.1 : 1;

    pop = U.el('div', { class: 'sk-pop', style: { top: (r.top) + 'px', left: (r.right + 8) + 'px' } });
    pop.appendChild(U.el('span', { class: 't', text: esIcono || esTexto ? 'Tamaño' : 'Grosor' }));
    var muestra = U.el('div', { class: 'muestra' });
    var linea = U.el('div', { class: 'l', style: { background: colorActual() } });
    muestra.appendChild(linea);
    var val = U.el('b', { text: valor });
    var rng = U.el('input', { type: 'range', min: min, max: max, step: paso, value: valor });

    function aplicar(v) {
      val.textContent = (esIcono || esTexto) ? Number(v).toFixed(1) + '×' : v;
      linea.style.height = ((esIcono || esTexto) ? v * 7 : v) + 'px';
      if (esIcono || esTexto) escalaIcono = Number(v); else grosor = Number(v);
      if (sel) {
        if (sel.tipo === 'icon') sel.escala = escalaIcono;
        else if (sel.tipo === 'text') sel.size = Math.round(40 * escalaIcono);
        else sel.grosor = grosor;
        U.save(); render();
      }
    }
    rng.addEventListener('input', function () { aplicar(rng.value); });
    pop.appendChild(muestra); pop.appendChild(rng); pop.appendChild(val);
    document.body.appendChild(pop);
    aplicar(valor);

    setTimeout(function () {
      document.addEventListener('pointerdown', fuera, { once: true });
    }, 50);
    function fuera(e) { if (pop && !pop.contains(e.target)) cerrarPop(); }
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
    svg.addEventListener('wheel', function (e) {
      if (!hay()) return;
      e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && sel) {          // Ctrl + rueda: tamaño del objeto
        escalarSel(e.deltaY > 0 ? 0.9 : 1.11);
        return;
      }
      if (e.altKey && sel && rotable(sel)) {          // Alt + rueda: girarlo
        girarSel(e.deltaY > 0 ? 15 : -15);
        return;
      }
      var p = svgPt(e);
      zoomA(vista.z * (e.deltaY > 0 ? 0.82 : 1.22), p.x, p.y);
    }, { passive: false });
    svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    svg.addEventListener('pointerdown', down);
    svg.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    /* doble clic sobre algo = editarlo */
    svg.addEventListener('dblclick', function (e) {
      if (dibujando && dibujando.modo === 'poly' && dibujando.pts.length > 2) { cerrarPoly(); return; }
      clearTimeout(pinT);
      var obj = objetoDe(e);
      if (!obj) return;
      if (tool !== 'sel') { tool = 'sel'; pintarTools(); }
      seleccionar(obj);
    });

    document.addEventListener('keydown', function (e) {
      if (!host || host.offsetParent === null || !hay()) return;
      if (/input|textarea|select/i.test(e.target.tagName || '')) return;
      var ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? rehacer() : deshacer(); return; }
      if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); rehacer(); return; }
      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        tool = 'sel'; fijarSel(objs().filter(visible));
        return;
      }
      if (ctrl) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (!espacio) { espacio = true; marcoMapa.classList.add('mano'); }
        return;
      }
      var mapa = { v: 'sel', p: 'pen', l: 'line', r: 'rect', g: 'poly', c: 'circle', i: 'icon', t: 'text', s: 'pin' };
      var k = e.key.toLowerCase();
      if (mapa[k]) { terminar(); tool = mapa[k]; pintarTools(); render(); }
      if (e.key === '+' || e.key === '=') zoomA(vista.z * 1.4);
      if (e.key === '-' || e.key === '_') zoomA(vista.z / 1.4);
      if (k === '0') encuadrar();
      if ((e.key === 'Delete' || e.key === 'Backspace') && seleccionados().length) borrarSel();
      if ((k === 'q' || k === 'e') && sel && rotable(sel)) girarSel(k === 'q' ? -15 : 15);
      if (e.key === 'Escape') { terminar(); cerrarPop(); pintarTools(); render(); }
    });
    document.addEventListener('keyup', function (e) {
      if (e.key === ' ' && espacio) { espacio = false; if (marcoMapa) marcoMapa.classList.remove('mano'); }
    });

    /* soltar una imagen encima del mapa la pinea donde la soltaste */
    ['dragenter', 'dragover'].forEach(function (ev) {
      svg.addEventListener(ev, function (e) {
        if (!hay()) return;
        e.preventDefault();
        marcoMapa.classList.add('drop');
      });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      svg.addEventListener(ev, function () { marcoMapa.classList.remove('drop'); });
    });
    svg.addEventListener('drop', function (e) {
      e.preventDefault();
      marcoMapa.classList.remove('drop');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) agregarCaptura(f, svgPt(e));
    });

    document.addEventListener('paste', function (e) {
      if (!host || host.offsetParent === null) return;
      var it = Array.prototype.slice.call(e.clipboardData.items).find(function (i) { return i.type.indexOf('image') === 0; });
      if (!it) return;
      agregarCaptura(it.getAsFile(), { x: NAT.w / 2, y: NAT.h / 2 });
    });
  }

  function objetoDe(e) {
    var hit = e.target.closest ? e.target.closest('[data-id]') : null;
    return hit ? objs().find(function (o) { return o.id === hit.getAttribute('data-id'); }) : null;
  }

  /* Cómo responde el mapa:
     · Cursor: arrastrar un objeto lo mueve, arrastrar el mapa lo corre,
       clic en el vacío suelta la selección.
     · Ícono: clic pone uno. Arrastrar un objeto lo mueve igual.
     · Trazos y zonas: se dibujan; la herramienta queda puesta.
     · Doble clic sobre cualquier cosa: se abre para editarla. */
  function down(e) {
    if (!hay()) return;
    cerrarPop();
    var p = svgPt(e);
    var obj = objetoDe(e);

    var asa = e.target.closest ? e.target.closest('[data-asa]') : null;
    if (asa && sel && e.button === 0) {
      snapshot();
      var c = centro(sel);
      dibujando = { modo: 'rotar', o: sel, c: c };
      svg.setPointerCapture && svg.setPointerCapture(e.pointerId);
      return;
    }

    if (e.button === 1 || e.button === 2 || espacio) { empezarPaneo(e, false); return; }
    if (e.button !== 0) return;

    if (tool === 'del') { if (obj) borrar(obj); else empezarPaneo(e, false); return; }

    if (tool === 'sel' || tool === 'icon') {
      if (obj) {
        if (e.shiftKey && tool === 'sel') { alternar(obj); return; }
        // si es parte de lo seleccionado se mueve todo junto
        var lista = (multi.length && estaSel(obj)) ? multi.slice() : [obj];
        dibujando = {
          modo: 'mover', o: obj, p0: p, sx: e.clientX, sy: e.clientY, movido: false,
          lista: lista.map(function (x) { return { o: x, snap: JSON.parse(JSON.stringify(x)) }; })
        };
        return;
      }
      if (tool === 'sel') {
        dibujando = { modo: 'caja', a: p, b: p, sx: e.clientX, sy: e.clientY, sumar: e.shiftKey };
        return;
      }
      dibujando = { modo: 'colocar', p: p, sx: e.clientX, sy: e.clientY, e: e };
      return;
    }
    if (tool === 'pen') { dibujando = { modo: 'pen', pts: [[p.x, p.y]] }; return; }
    if (tool === 'line' || tool === 'rect' || tool === 'circle') { dibujando = { modo: tool, a: p, b: p }; return; }
    if (tool === 'poly') {
      if (!dibujando || dibujando.modo !== 'poly') dibujando = { modo: 'poly', pts: [[p.x, p.y]] };
      else dibujando.pts.push([p.x, p.y]);
      previa(); return;
    }
    if (tool === 'text') {
      U.pedirTexto('Texto en el mapa', '', function (t) {
        if (t) { nuevo({ tipo: 'text', texto: t, x: p.x, y: p.y, size: Math.round(40 * escalaIcono) }); }
      }, { ph: 'ej: TRÁFICO — marcar' });
      return;
    }
    if (tool === 'pin') {
      U.elegirArchivo('image/*', function (f) { agregarCaptura(f, p); });
      return;
    }
  }

  /* cierra lo que esté a medio hacer y suelta la selección */
  function terminar() {
    if (dibujando && dibujando.modo === 'poly' && dibujando.pts.length > 2) cerrarPoly();
    dibujando = null; U.vaciar(gTmp);
    limpiarSel();
  }

  function cajaDe(a, b) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }
  /* la caja de una forma: cuadrado y círculo (o Shift) salen parejos */
  function cajaForma(d) {
    var w = d.b.x - d.a.x, h = d.b.y - d.a.y;
    if (d.fija || formaFija(estilo.rect.forma)) {
      var m = Math.max(Math.abs(w), Math.abs(h));
      w = (w < 0 ? -1 : 1) * m; h = (h < 0 ? -1 : 1) * m;
    }
    return {
      x: Math.min(d.a.x, d.a.x + w), y: Math.min(d.a.y, d.a.y + h), w: Math.abs(w), h: Math.abs(h),
      forma: formaReal(estilo.rect.forma)
    };
  }
  function toca(a, b) { return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y; }

  /* Shift + clic suma o saca un objeto de la selección */
  function alternar(o) {
    var l = seleccionados(), i = l.indexOf(o);
    if (i >= 0) l.splice(i, 1); else l.push(o);
    fijarSel(l);
  }

  function borrarSel() {
    var l = seleccionados(); if (!l.length) return;
    snapshot();
    slide().objs = objs().filter(function (o) { return l.indexOf(o) < 0; });
    renumerar(); limpiarSel(); U.save(); pintarTools(); render();
  }

  function empezarPaneo(e, esClic) {
    paneo = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, clic: esClic, movido: false };
  }

  function move(e) {
    if (paneo) {
      if (!paneo.movido && Math.abs(e.clientX - paneo.x) + Math.abs(e.clientY - paneo.y) < 4) return;
      if (!paneo.movido) { paneo.movido = true; marcoMapa.classList.add('paneando'); }
      var k = escalaPantalla();
      vista.x = paneo.vx - (e.clientX - paneo.x) / k;
      vista.y = paneo.vy - (e.clientY - paneo.y) / k;
      aplicarVista();
      return;
    }
    if (!dibujando) return;
    var d = dibujando;
    var p = svgPt(e);
    if (d.modo === 'pen') { d.pts.push([p.x, p.y]); previa(); }
    else if (d.modo === 'colocar') {
      // si arrastra en vez de hacer clic, en realidad quiere mover el mapa
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 5) {
        dibujando = null;
        paneo = { x: d.sx, y: d.sy, vx: vista.x, vy: vista.y, clic: false, movido: true };
        marcoMapa.classList.add('paneando');
        move(e);
      }
    }
    else if (d.modo === 'mover') {
      if (!d.movido) {
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 4) return;
        d.movido = true; snapshot();
        marcoMapa.classList.add('moviendo');
      }
      var dx = p.x - d.p0.x, dy = p.y - d.p0.y;
      d.lista.forEach(function (it) {
        var o = it.o, sn = it.snap;
        if (sn.pts) o.pts = sn.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
        if (sn.x !== undefined) { o.x = sn.x + dx; o.y = sn.y + dy; }
        if (sn.x2 !== undefined) { o.x2 = sn.x2 + dx; o.y2 = sn.y2 + dy; }
        repintarObj(o);
      });
    }
    else if (d.modo === 'caja') {
      d.b = p;
      var px = 1 / (escalaPantalla() || 1), r = cajaDe(d.a, d.b);
      U.vaciar(gTmp);
      gTmp.appendChild(ns('rect', {
        x: r.x, y: r.y, width: r.w, height: r.h, fill: '#fff', 'fill-opacity': .07,
        stroke: '#fff', 'stroke-opacity': .8, 'stroke-width': 1.2 * px, 'stroke-dasharray': (5 * px) + ',' + (4 * px)
      }));
    }
    else if (d.modo === 'rotar') {
      var ang = Math.atan2(p.x - d.c.x, -(p.y - d.c.y)) * 180 / Math.PI;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      d.o.rot = Math.round((ang + 360) % 360);
      repintarObj(d.o);
      var rr = U.$('#sk-rot'); if (rr) { rr.value = d.o.rot; rr.nextSibling.textContent = d.o.rot + '°'; }
    }
    else if (d.b !== undefined) { d.b = p; d.fija = e.shiftKey; previa(); }
    else if (d.modo === 'poly') { d.cursor = [p.x, p.y]; previa(); }
  }

  function up() {
    if (paneo) {
      var pn = paneo; paneo = null;
      marcoMapa.classList.remove('paneando');
      if (pn.clic && !pn.movido && sel) seleccionar(null);   // clic en el vacío: suelta
      return;
    }
    if (!dibujando) return;
    var d = dibujando;
    if (d.modo === 'pen') {
      if (d.pts.length > 2) nuevo({ tipo: 'pen', pts: simplificar(d.pts) });
      dibujando = null;
    } else if (d.modo === 'line') {
      if (Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) > 10) nuevo({ tipo: 'line', x: d.a.x, y: d.a.y, x2: d.b.x, y2: d.b.y });
      dibujando = null;
    } else if (d.modo === 'rect') {
      var cr = cajaForma(d);
      if (cr.w > 10 && cr.h > 4) nuevo(Object.assign({ tipo: 'rect' }, cr));
      dibujando = null;
    } else if (d.modo === 'caja') {
      dibujando = null; U.vaciar(gTmp);
      var chico = Math.abs(d.b.x - d.a.x) * escalaPantalla() < 4 && Math.abs(d.b.y - d.a.y) * escalaPantalla() < 4;
      if (chico) { if (!d.sumar && seleccionados().length) fijarSel([]); return; }
      var rc = cajaDe(d.a, d.b);
      var dentro = objs().filter(function (o) { return visible(o) && toca(bbox(o), rc); });
      if (d.sumar) seleccionados().forEach(function (o) { if (dentro.indexOf(o) < 0) dentro.push(o); });
      fijarSel(dentro);
      return;
    } else if (d.modo === 'circle') {
      var r = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
      if (r > 10) nuevo({ tipo: 'circle', x: d.a.x, y: d.a.y, r: r });
      dibujando = null;
    } else if (d.modo === 'colocar') {
      dibujando = null;
      nuevo({ tipo: 'icon', icono: iconoActivo, x: d.p.x, y: d.p.y, escala: escalaIcono });
      return;
    } else if (d.modo === 'mover') {
      dibujando = null;
      marcoMapa.classList.remove('moviendo');
      if (d.movido) { U.save(); render(); return; }
      // clic simple sobre una captura: se abre, salvo que venga un doble clic
      if (d.o.tipo === 'pin') {
        clearTimeout(pinT);
        pinT = setTimeout(function () { abrirPin(d.o); }, 260);
      }
      return;
    } else if (d.modo === 'rotar') {
      dibujando = null;
      U.save(); render();
      return;
    }
    U.vaciar(gTmp);
    render();
  }

  function cerrarPoly() {
    if (!dibujando || dibujando.modo !== 'poly') return;
    nuevo({ tipo: 'poly', pts: dibujando.pts.map(function (p) { return [Math.round(p[0]), Math.round(p[1])]; }) });
    dibujando = null; U.vaciar(gTmp); render();
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
    snapshot();
    var o = Object.assign({ id: U.uid('o'), grosor: grosor }, estiloDe(base.tipo), base, colorElegido());
    objs().push(o);
    renumerar();
    // un clic y queda puesto: no se selecciona ni hay que "fijarlo".
    // Para editarlo después, doble clic.
    limpiarSel(); recien = o.id;
    if (o.tipo === 'text' || o.tipo === 'pin') tool = 'sel';
    U.save(); pintarTools(); render();
    return o;
  }

  /* 1 SL = 1 OP: cada grupo numera sus OPs 1, 2, 3… en el orden que se
     pusieron. Si se borra o se cambia de grupo, se renumeran solos. */
  function renumerar() {
    var cuenta = {};
    objs().forEach(function (o) {
      if (o.tipo !== 'icon') return;
      var ic = U.icono(o.icono);
      if (!ic || !ic.numerado) return;
      if (!o.grupo) { delete o.num; return; }
      var k = o.icono + '|' + o.grupo;
      cuenta[k] = (cuenta[k] || 0) + 1;
      o.num = cuenta[k];
    });
  }

  function borrar(o) {
    snapshot();
    var i = objs().indexOf(o);
    if (i >= 0) objs().splice(i, 1);
    renumerar();
    limpiarSel(); U.save(); pintarTools(); render();
  }

  /* Agrega una captura al mapa. El pin se crea apenas tenemos la imagen;
     guardarla en IndexedDB o en la nube es aparte y no puede frenar nada. */
  function agregarCaptura(file, p) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { U.toast('Eso no es una imagen', 'err'); return; }
    if (!hay()) { U.toast('Elegí una partida primero', 'err'); return; }
    U.toast('Procesando la captura…');

    U.optimizarImagen(file, 1600).then(function (r) {
      var id = U.uid('shot');
      shotsCache[id] = r.url;                    // ya se puede dibujar
      var o = nuevo({ tipo: 'pin', x: p.x, y: p.y, shotId: id, etiqueta: '' });
      U.shots.put(id, r.url);                    // en segundo plano
      U.pedirTexto('Etiqueta del pin', '', function (t) {
        if (t && o) { o.etiqueta = t; U.save(); render(); }
      }, {
        ph: 'ej: vista desde el granero',
        ayuda: 'Opcional. Es lo que se lee abajo de la foto en el briefing.',
        cancelar: 'Sin etiqueta'
      });
    }).catch(function (e) {
      console.error(e);
      U.toast('No se pudo leer esa imagen', 'err');
    });
  }

  /* botón directo: no hace falta acertarle al mapa, cae en el centro */
  function pedirCaptura() {
    if (!hay()) return;
    U.elegirArchivo('image/*', function (f) {
      agregarCaptura(f, { x: NAT.w / 2, y: NAT.h / 2 });
    });
  }

  /* ---------------- dibujo ---------------- */
  /* la vista previa se dibuja igual que el objeto final */
  function previa() {
    U.vaciar(gTmp);
    var d = dibujando; if (!d) return;
    var base = null;
    if (d.modo === 'pen') base = { tipo: 'pen', pts: d.pts };
    else if (d.modo === 'line') base = { tipo: 'line', x: d.a.x, y: d.a.y, x2: d.b.x, y2: d.b.y };
    else if (d.modo === 'rect') base = Object.assign({ tipo: 'rect' }, cajaForma(d));
    else if (d.modo === 'circle') base = { tipo: 'circle', x: d.a.x, y: d.a.y, r: Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) };
    else if (d.modo === 'poly') base = { tipo: 'poly', pts: d.pts.concat(d.cursor ? [d.cursor] : []) };
    if (!base) return;
    var o = Object.assign({ id: 'previa', grosor: grosor }, estiloDe(base.tipo), base, colorElegido());
    gTmp.appendChild(nodoDe(o, true));
  }

  function render() {
    if (!svg) return;
    if (!hay()) { vacio(); return; }
    U.vaciar(gObjs);
    if (sel && objs().indexOf(sel) < 0) sel = null;
    multi = multi.filter(function (o) { return objs().indexOf(o) >= 0; });
    objs().forEach(function (o) { if (visible(o)) gObjs.appendChild(nodoDe(o)); });
    recien = null;
    pintarSel();
    svg.setAttribute('data-tool', tool);
    pintarCabecera();
    pintarBarraObj();
    pintarLeyenda();
    pintarSlides();
    pintarAcciones();
  }

  function pintarAcciones() {
    var caja = U.$('#sk-acciones'); if (!caja) return;
    var id = slide().id;
    caja.children[0].disabled = !(historia[id] || []).length;
    caja.children[1].disabled = !(futuro[id] || []).length;
  }

  function nodoDe(o, sinSel) {
    var c = colorDe(o), g = o.grosor || 7;
    var wrap = ns('g', { 'data-id': o.id, class: 'ob' + (!sinSel && estaSel(o) ? ' sel' : '') + (!sinSel && recien === o.id ? ' nuevo' : '') });
    var afuera = wrap;
    // los íconos giran por dentro (el número queda derecho); el resto, entero
    if (o.rot && o.tipo !== 'icon' && o.tipo !== 'pin') {
      var cc = centro(o);
      wrap = ns('g', { transform: 'rotate(' + o.rot + ' ' + cc.x + ' ' + cc.y + ')' });
      afuera.appendChild(wrap);
    }
    var pr = props(o);
    var linea = { stroke: c, 'stroke-width': g, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': guiones(pr.trazo, g) };
    var relleno = { fill: c, 'fill-opacity': OPACIDAD[pr.relleno] };
    var pts = function (arr) { return arr.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); };
    var con = function (a, b) { return Object.assign({}, a, b); };
    if (o.tipo === 'pen' || o.tipo === 'line') {
      var P = o.tipo === 'pen' ? o.pts : [[o.x, o.y], [o.x2, o.y2]];
      // zona de clic más ancha que el trazo: agarrarlo no es puntería
      if (!sinSel) wrap.appendChild(ns('polyline', { points: pts(P), fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(g, 22), 'stroke-linecap': 'round' }));
      wrap.appendChild(ns('polyline', con(linea, { points: pts(P), fill: 'none' })));
      if (pr.punta !== 'nada' && P.length > 1) {
        puntas(wrap, P, pr.punta, g, c);
      }
    } else if (o.tipo === 'rect') {
      var f = o.forma || 'rect', x = o.x, y = o.y, w = o.w, h = o.h;
      var forma;
      if (f === 'elipse') forma = ns('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 });
      else if (f === 'tri') forma = ns('polygon', { points: pts([[x + w / 2, y], [x + w, y + h], [x, y + h]]) });
      else if (f === 'rombo') forma = ns('polygon', { points: pts([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]) });
      else forma = ns('rect', { x: x, y: y, width: w, height: h });
      Object.keys(con(linea, relleno)).forEach(function (k) { var v = con(linea, relleno)[k]; if (v !== null && v !== undefined) forma.setAttribute(k, v); });
      wrap.appendChild(forma);
    } else if (o.tipo === 'poly') {
      wrap.appendChild(ns('polygon', con(con(linea, relleno), { points: pts(o.pts) })));
    } else if (o.tipo === 'circle') {
      wrap.appendChild(ns('circle', con(con(linea, relleno), { cx: o.x, cy: o.y, r: o.r })));
    } else if (o.tipo === 'text') {
      var s = o.size || 40;
      var t = ns('text', { x: o.x, y: o.y, fill: c, 'font-size': s, 'font-family': 'Zilla Slab, Georgia, serif', 'font-weight': 700, stroke: '#0b0a06', 'stroke-width': s / 12, 'paint-order': 'stroke' });
      t.textContent = o.texto;
      wrap.appendChild(t);
    } else if (o.tipo === 'icon') {
      var k = (o.escala || 1) * (NAT.w / 1100);
      var gi = ns('g', { transform: 'translate(' + o.x + ',' + o.y + ') scale(' + k + ')' });
      var ic = U.icono(o.icono);
      var giro = o.rot ? ns('g', { transform: 'rotate(' + o.rot + ')' }) : null;
      if (ic && ic.img) {
        var esVehiculo = ic.grupo === 'vehículos';
        var iim = ns('image', { x: -21, y: -21, width: 42, height: 42, preserveAspectRatio: 'xMidYMid meet' });
        iim.setAttributeNS('http://www.w3.org/1999/xlink', 'href', U.ICONO_BASE + ic.img + '.png');
        iim.setAttributeNS(null, 'href', U.ICONO_BASE + ic.img + '.png');
        if (esVehiculo) {
          // como en el juego: vehículo oscuro sobre el disco del escuadrón
          gi.appendChild(ns('circle', { cx: 0, cy: 0, r: 25, fill: c, 'fill-opacity': .92, stroke: '#0b0a06', 'stroke-width': 2.5 }));
          iim.setAttribute('filter', 'url(#u235-oscuro)');
          iim.setAttribute('x', -23); iim.setAttribute('y', -23);
          iim.setAttribute('width', 46); iim.setAttribute('height', 46);
        } else {
          // disco del color del grupo detrás del ícono del juego
          gi.appendChild(ns('circle', { cx: 0, cy: 0, r: 25, fill: '#0b0a06', 'fill-opacity': .55 }));
          gi.appendChild(ns('circle', { cx: 0, cy: 0, r: 25, fill: c, 'fill-opacity': .3, stroke: c, 'stroke-width': 3 }));
        }
        if (giro) { giro.appendChild(iim); gi.appendChild(giro); } else gi.appendChild(iim);
        if (o.num) {
          gi.appendChild(ns('circle', { cx: 19, cy: -19, r: 13, fill: c, stroke: '#0b0a06', 'stroke-width': 2.5 }));
          var tn = ns('text', {
            x: 19, y: -14, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 700,
            'font-family': 'Space Mono, monospace', fill: '#0b0a06'
          });
          tn.textContent = o.num;
          gi.appendChild(tn);
        }
      } else {
        gi.innerHTML = o.rot ? '<g transform="rotate(' + o.rot + ')">' + iconSVG(o.icono, c) + '</g>' : iconSVG(o.icono, c);
      }
      wrap.appendChild(gi);
      if (o.etiqueta) {
        var te = ns('text', { x: o.x, y: o.y + 46 * k, fill: c, 'font-size': 22 * k, 'text-anchor': 'middle', 'font-family': 'Space Mono, monospace', stroke: '#0b0a06', 'stroke-width': 3 * k, 'paint-order': 'stroke' });
        te.textContent = o.etiqueta;
        wrap.appendChild(te);
      }
    } else if (o.tipo === 'pin') {
      // chinche chica: no tapa el mapa. Un clic la abre en grande.
      var kk = (o.escala || 1) * (NAT.w / 1100), R = 22;
      var n = objs().filter(function (x) { return x.tipo === 'pin'; }).indexOf(o) + 1;
      var gp = ns('g', { transform: 'translate(' + o.x + ',' + o.y + ') scale(' + kk + ')', class: 'pin' });
      gp.appendChild(ns('path', { d: 'M0,4 L-9,-10 L9,-10 Z', fill: c, stroke: '#0b0a06', 'stroke-width': 2 }));
      gp.appendChild(ns('circle', { cx: 0, cy: -30, r: R, fill: '#0b0a06', stroke: c, 'stroke-width': 4 }));
      // glifo de foto
      gp.appendChild(ns('rect', { x: -11, y: -39, width: 22, height: 17, rx: 2.5, fill: 'none', stroke: c, 'stroke-width': 2.6 }));
      gp.appendChild(ns('circle', { cx: 0, cy: -30, r: 4.6, fill: c }));
      gp.appendChild(ns('rect', { x: -4, y: -42, width: 8, height: 3.4, rx: 1, fill: c }));
      var tnum = ns('text', {
        x: 0, y: -55, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700,
        'font-family': 'Space Mono, monospace', fill: c, stroke: '#0b0a06', 'stroke-width': 3, 'paint-order': 'stroke'
      });
      tnum.textContent = n;
      gp.appendChild(tnum);
      if (o.etiqueta) {
        var tl = ns('text', {
          x: 0, y: 22, fill: c, 'font-size': 15, 'text-anchor': 'middle',
          'font-family': 'Space Mono, monospace', stroke: '#0b0a06', 'stroke-width': 3.5, 'paint-order': 'stroke'
        });
        tl.textContent = o.etiqueta;
        gp.appendChild(tl);
      }
      wrap.appendChild(gp);
    }
    return afuera;
  }

  /* reemplaza solo el nodo de un objeto: moverlo o girarlo no repinta
     todo el panel, por eso va fluido */
  function repintarObj(o) {
    var viejo = gObjs.querySelector('[data-id="' + o.id + '"]');
    var n = nodoDe(o);
    if (viejo) gObjs.replaceChild(n, viejo); else gObjs.appendChild(n);
    pintarSel();
  }

  /* flecha, flecha doble o tope en la punta de una línea o trazo */
  function puntas(wrap, P, tipo, g, c) {
    var L = Math.max(g * 3.2, 16);
    function dir(desde, haciaAtras) {
      // mira un poco hacia atrás en el trazo para que la punta no tiemble
      var a = P[desde], i = desde, paso = haciaAtras ? -1 : 1;
      while (i + paso >= 0 && i + paso < P.length && Math.hypot(P[i][0] - a[0], P[i][1] - a[1]) < L) i += paso;
      var b = P[i];
      return Math.atan2(a[1] - b[1], a[0] - b[0]);
    }
    function una(q, ang) {
      if (tipo === 'barra') {
        var bl = Math.max(g * 2.4, 12);
        wrap.appendChild(ns('line', {
          x1: q[0] + bl * Math.cos(ang + Math.PI / 2), y1: q[1] + bl * Math.sin(ang + Math.PI / 2),
          x2: q[0] - bl * Math.cos(ang + Math.PI / 2), y2: q[1] - bl * Math.sin(ang + Math.PI / 2),
          stroke: c, 'stroke-width': g * 1.15, 'stroke-linecap': 'round'
        }));
        return;
      }
      wrap.appendChild(ns('polygon', {
        points: [[q[0] + g * 0.6 * Math.cos(ang), q[1] + g * 0.6 * Math.sin(ang)],
          [q[0] - L * Math.cos(ang - 0.45), q[1] - L * Math.sin(ang - 0.45)],
          [q[0] - L * Math.cos(ang + 0.45), q[1] - L * Math.sin(ang + 0.45)]]
          .map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '),
        fill: c, stroke: c, 'stroke-width': g * 0.4, 'stroke-linejoin': 'round'
      }));
    }
    una(P[P.length - 1], dir(P.length - 1, true));
    if (tipo === 'doble') una(P[0], dir(0, false));
  }

  /* filtro que oscurece los vehículos (va también en lo exportado) */
  function defsSVG() {
    var d = ns('defs');
    d.innerHTML = '<filter id="u235-oscuro" color-interpolation-filters="sRGB">' +
      '<feColorMatrix type="matrix" values="0 0 0 0 0.07  0 0 0 0 0.065  0 0 0 0 0.05  0 0 0 1 0"/></filter>';
    return d;
  }

  function rotable(o) { return o && o.tipo !== 'pin' && o.tipo !== 'circle'; }
  function centro(o) {
    if (o.tipo === 'icon' || o.tipo === 'text' || o.tipo === 'pin') return { x: o.x, y: o.y };
    var b = bbox(o);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  /* lo único que marca la selección: una manija chica para girar */
  function pintarSel() {
    if (!gSel) return;
    U.vaciar(gSel);
    if (!sel || !visible(sel) || !rotable(sel)) return;
    var px = 1 / (escalaPantalla() || 1);
    var c = centro(sel), d;
    if (sel.tipo === 'icon') d = 25 * (sel.escala || 1) * (NAT.w / 1100) + 22 * px;
    else if (sel.tipo === 'text') d = (sel.size || 40) + 18 * px;
    else { var b = bbox(sel); d = Math.max(b.w, b.h) / 2 + 22 * px; }
    var a = (sel.rot || 0) * Math.PI / 180;
    var hx = c.x + d * Math.sin(a), hy = c.y - d * Math.cos(a);
    gSel.appendChild(ns('line', { x1: c.x, y1: c.y, x2: hx, y2: hy, stroke: '#fff', 'stroke-width': 1.5 * px, 'stroke-opacity': .55, 'stroke-dasharray': (4 * px) + ',' + (3 * px), 'pointer-events': 'none' }));
    gSel.appendChild(ns('circle', { cx: hx, cy: hy, r: 7 * px, fill: '#fff', stroke: '#0b0a06', 'stroke-width': 2 * px, 'data-asa': 'rot', class: 'asa' }));
  }

  function girarSel(g) {
    if (!sel) return;
    snapshot();
    sel.rot = Math.round(((sel.rot || 0) + g + 360) % 360);
    U.save(); render();
  }

  function abrirPin(o) {
    var mostrar = function (u) { U.verCaptura(u, o.etiqueta || 'Captura del terreno'); };
    if (shotsCache[o.shotId]) return mostrar(shotsCache[o.shotId]);
    U.shots.get(o.shotId).then(function (u) {
      if (u) { shotsCache[o.shotId] = u; mostrar(u); }
      else U.toast('La captura no está disponible', 'err');
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
    if (o.tipo === 'icon') { var ri = 25 * (o.escala || 1) * (NAT.w / 1100); return { x: o.x - ri, y: o.y - ri, w: ri * 2, h: ri * 2 }; }
    var s = (o.size || 40);
    if (o.tipo === 'text') return { x: o.x, y: o.y - s * 0.8, w: s * 0.55 * String(o.texto || '').length, h: s };
    return { x: o.x - s, y: o.y - s, w: s * 2, h: s * 2 };
  }

  /* ---------------- selección y tamaño ---------------- */
  function seleccionar(o) { fijarSel(o ? [o] : []); }

  /* qué significa "tamaño" según el tipo de objeto */
  function rangoTam(o) {
    if (!o) return null;
    if (o.tipo === 'icon' || o.tipo === 'pin') return { min: 30, max: 320, paso: 5, unidad: '%' };
    if (o.tipo === 'text') return { min: 14, max: 180, paso: 2, unidad: 'px' };
    if (o.tipo === 'circle') return { min: 20, max: 900, paso: 5, unidad: '' };
    if (o.tipo === 'rect') return { min: 30, max: 1800, paso: 10, unidad: '' };
    return { min: 2, max: 40, paso: 1, unidad: '' };      // trazos
  }
  function valorTam(o) {
    if (o.tipo === 'icon' || o.tipo === 'pin') return Math.round((o.escala || 1) * 100);
    if (o.tipo === 'text') return Math.round(o.size || 40);
    if (o.tipo === 'circle') return Math.round(o.r);
    if (o.tipo === 'rect') return Math.round(o.w);
    return Math.round(o.grosor || 7);
  }
  function aplicarTam(o, v) {
    v = Number(v);
    if (o.tipo === 'icon' || o.tipo === 'pin') o.escala = v / 100;
    else if (o.tipo === 'text') o.size = v;
    else if (o.tipo === 'circle') o.r = v;
    else if (o.tipo === 'rect') {
      var k = v / o.w;
      o.x -= (v - o.w) / 2; o.y -= (o.h * k - o.h) / 2;
      o.h = o.h * k; o.w = v;
    } else o.grosor = v;
    U.save(); render();
  }
  function escalarSel(k) {
    if (!sel) return;
    var r = rangoTam(sel);
    var v = Math.max(r.min, Math.min(r.max, valorTam(sel) * k));
    aplicarTam(sel, v);
  }

  /* barra horizontal al pie del mapa: aparece con algo seleccionado.
     Con uno: grupo, tamaño y giro. Con varios: grupo, duplicar y borrar. */
  function pintarBarraObj() {
    if (!barraObj) return;
    U.vaciar(barraObj);
    var lista = seleccionados();
    if (!lista.length) { barraObj.classList.remove('on'); return; }
    barraObj.classList.add('on');
    var uno = lista.length === 1 ? lista[0] : null;

    /* el color de lo ya puesto se cambia acá, a propósito */
    var mismo = lista.every(function (o) { return o.grupo === lista[0].grupo; }) ? lista[0].grupo : null;
    var quien = U.el('span', { class: 'quien', style: { '--c': uno ? colorDe(uno) : (mismo ? colorDe(lista[0]) : '#9c8e6c') } }, [U.el('i')]);
    var selG = U.el('select', { class: 'inp sm grupo-sel', title: 'Cambiar el color / escuadrón' });
    if (!mismo) selG.appendChild(U.el('option', { value: '', text: lista.some(function (o) { return o.grupo; }) ? 'varios' : 'libre', selected: 'selected' }));
    gruposDibujables().forEach(function (gr) {
      selG.appendChild(U.el('option', { value: gr.id, text: corto(gr), selected: mismo === gr.id ? 'selected' : null }));
    });
    selG.appendChild(U.el('option', { value: '__libre', text: 'Color libre elegido' }));
    selG.addEventListener('change', function () {
      if (!selG.value) return;
      snapshot();
      lista.forEach(function (o) {
        if (selG.value === '__libre') { o.color = colorLibre; delete o.grupo; }
        else { o.grupo = selG.value; delete o.color; }
      });
      renumerar(); U.save(); render();
    });
    quien.appendChild(selG);
    quien.appendChild(U.el('span', { text: '· ' + (uno ? nombreTipo(uno) : lista.length + ' objetos') }));
    barraObj.appendChild(quien);

    if (uno) {
      var r = rangoTam(uno), tomado = false;
      barraObj.appendChild(U.el('span', { class: 'et', text: 'Tamaño' }));
      var rng = U.el('input', { type: 'range', min: r.min, max: r.max, step: r.paso, value: valorTam(uno) });
      var val = U.el('b', { text: valorTam(uno) + r.unidad });
      rng.addEventListener('input', function () {
        if (!tomado) { snapshot(); tomado = true; }
        val.textContent = rng.value + r.unidad;
        aplicarTamSinRepintar(uno, rng.value);
      });
      rng.addEventListener('change', function () { tomado = false; U.save(); render(); });
      barraObj.appendChild(rng);
      barraObj.appendChild(val);

      if (rotable(uno)) {
        barraObj.appendChild(U.el('span', { class: 'et', text: 'Giro' }));
        var rot = U.el('input', { type: 'range', id: 'sk-rot', class: 'giro', min: 0, max: 359, step: 1, value: uno.rot || 0 });
        var rv = U.el('b', { class: 'giro-v', text: (uno.rot || 0) + '°' });
        var antes = false;
        rot.addEventListener('input', function () {
          if (!antes) { snapshot(); antes = true; }
          uno.rot = Number(rot.value); rv.textContent = rot.value + '°';
          repintarObj(uno);
        });
        rot.addEventListener('change', function () { antes = false; U.save(); });
        barraObj.appendChild(rot);
        barraObj.appendChild(rv);
      }
    } else {
      barraObj.appendChild(U.el('span', { class: 'et', text: 'Arrastrá cualquiera para mover todos · Shift+clic suma o saca' }));
    }

    barraObj.appendChild(U.el('button', {
      class: 'btn xs', text: '⧉', title: 'Duplicar',
      onclick: function () {
        snapshot();
        var copias = lista.map(function (o) {
          var c = JSON.parse(JSON.stringify(o));
          c.id = U.uid('o');
          if (c.x !== undefined) { c.x += 40; c.y += 40; }
          if (c.x2 !== undefined) { c.x2 += 40; c.y2 += 40; }
          if (c.pts) c.pts = c.pts.map(function (q) { return [q[0] + 40, q[1] + 40]; });
          objs().push(c);
          return c;
        });
        renumerar(); U.save(); fijarSel(copias);
      }
    }));
    barraObj.appendChild(U.el('button', {
      class: 'btn xs', text: '↑', title: 'Traer al frente',
      onclick: function () {
        snapshot();
        slide().objs = objs().filter(function (o) { return lista.indexOf(o) < 0; }).concat(lista);
        U.save(); render();
      }
    }));
    barraObj.appendChild(U.el('button', {
      class: 'btn xs danger', text: '✕ Borrar', onclick: borrarSel
    }));
  }
  /* mientras movés el slider no queremos repintar todo el panel */
  function aplicarTamSinRepintar(o, v) {
    v = Number(v);
    if (o.tipo === 'icon' || o.tipo === 'pin') o.escala = v / 100;
    else if (o.tipo === 'text') o.size = v;
    else if (o.tipo === 'circle') o.r = v;
    else if (o.tipo === 'rect') {
      var k = v / o.w;
      o.x -= (v - o.w) / 2; o.y -= (o.h * k - o.h) / 2;
      o.h = o.h * k; o.w = v;
    } else o.grosor = v;
    repintarObj(o);
  }
  function nombreTipo(o) {
    if (o.tipo === 'icon') { var ic = U.icono(o.icono); return ic ? ic.nombre : 'ícono'; }
    return ({ pen: 'trazo', line: 'línea', rect: 'forma', poly: 'zona', circle: 'radio', text: 'texto', pin: 'captura' })[o.tipo] || o.tipo;
  }

  /* datos de la partida, centrados arriba del mapa */
  function pintarCabecera() {
    if (!cabecera) return;
    U.vaciar(cabecera);
    var p = U.partida(); if (!p) return;
    var m = U.map(strat().mapa);
    cabecera.appendChild(U.el('b', { text: p.nombre }));
    cabecera.appendChild(U.el('span', { text: p.fecha }));
    cabecera.appendChild(U.el('span', { class: 'mapa', text: m.nombre }));
    if (p.punto) cabecera.appendChild(U.el('span', { class: 'punto', text: p.punto }));
    cabecera.appendChild(U.el('span', { text: p.formato || p.modo }));
  }

  /* ---------------- leyenda ---------------- */
  /* Por defecto se listan TODOS los grupos con gente o con algo en el
     mapa: borrar los dibujos de una escuadra no puede hacerla desaparecer
     de acá, porque se ve igual que haber perdido el roster. "Solo en el
     mapa" es opt-in y se recuerda en state.ui. */
  function soloMapa() { return !!(U.state.ui && U.state.ui.leySoloMapa); }
  function pintarLeyenda() {
    U.vaciar(leyenda);
    var usados = {};
    objs().forEach(function (o) { if (o.grupo) usados[o.grupo] = (usados[o.grupo] || 0) + 1; });

    leyenda.appendChild(U.el('div', { class: 'ley-head' }, [
      U.el('h3', { text: 'Quién va dónde' }),
      U.el('button', {
        class: 'chip' + (soloMapa() ? ' on' : ''), text: soloMapa() ? 'Solo en el mapa' : 'Todos',
        title: soloMapa() ? 'Mostrar todos los grupos del roster' : 'Mostrar solo los grupos que tienen algo dibujado',
        onclick: function () { U.state.ui.leySoloMapa = !soloMapa(); U.save(); pintarLeyenda(); }
      })
    ]));

    var grupos = U.bloques().filter(function (g) {
      return soloMapa() ? usados[g.id] : (usados[g.id] || U.plantel(g.id).length);
    });
    if (!grupos.length) {
      leyenda.appendChild(U.el('p', {
        class: 'ley-vacio',
        text: soloMapa()
          ? 'Ningún grupo tiene nada dibujado en esta slide. El roster sigue intacto: tocá "Solo en el mapa" para verlo entero.'
          : 'Todavía no hay jugadores asignados en el Roster.'
      }));
    }

    grupos.forEach(function (g) {
      var u = U.unit(g.unidad), pl = U.plantel(g.id);
      var caja = U.el('div', {
        class: 'ley-grupo' + (grupoActivo === g.id ? ' on' : '') + (usados[g.id] ? '' : ' sin-mapa'),
        style: { '--c': u.color }
      });
      var oculto = !!ocultos()[g.id];
      var t = U.el('div', { class: 'ley-t' + (oculto ? ' apagada' : '') });
      t.appendChild(U.el('button', {
        class: 'ojo' + (oculto ? ' off' : ''),
        title: oculto ? 'Mostrar esta capa en el mapa' : 'Ocultar esta capa del mapa',
        html: oculto
          ? '<svg viewBox="0 0 24 24"><path d="M3 3l18 18" /><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3.1 3.4M6.3 7.9A15.5 15.5 0 0 0 3 12s4 6 9 6a9.4 9.4 0 0 0 3.6-.7" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>'
          : '<svg viewBox="0 0 24 24"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="3" /></svg>',
        onclick: function (e) {
          e.stopPropagation();
          if (oculto) delete ocultos()[g.id]; else ocultos()[g.id] = true;
          U.save(); render();
        }
      }));
      t.appendChild(U.el('i'));
      t.appendChild(U.el('span', { text: corto(g) }));
      t.appendChild(U.el('b', { text: usados[g.id] || 0 }));
      t.addEventListener('click', function () { grupoActivo = g.id; pintarTools(); pintarLeyenda(); resaltar(g.id); });
      caja.appendChild(t);
      var ul = U.el('div', { class: 'ley-jug' });
      if (!pl.length) ul.appendChild(U.el('span', { class: 'vacio', text: 'sin jugadores' }));
      pl.forEach(function (j) {
        ul.appendChild(U.el('span', {
          class: 'j' + (/SL|COMMANDER|CAP/.test(j.rol) ? ' lider' : '') + (j.est === 'ok' ? ' ok' : j.est === 'falta' ? ' falta' : ''),
          title: j.rol
        }, [
          U.el('img', { class: 'cls', src: U.rolIcono(j.rol), alt: '' }),
          U.el('span', { text: j.nombre })
        ]));
      });
      caja.appendChild(ul);
      leyenda.appendChild(caja);
    });

    var pins = objs().filter(function (o) { return o.tipo === 'pin'; });
    leyenda.appendChild(U.el('div', { class: 'ley-head' }, [
      U.el('h3', { text: 'Capturas' }),
      U.el('button', { class: 'chip', text: '＋ subir', title: 'Subir una foto al mapa', onclick: pedirCaptura })
    ]));
    if (!pins.length) {
      leyenda.appendChild(U.el('p', { class: 'ley-vacio', text: 'Subí una foto, arrastrala sobre el mapa o pegala con Ctrl+V.' }));
    } else {
      var cont = U.el('div', { class: 'ley-pins' });
      pins.forEach(function (o, i) {
        cont.appendChild(U.el('button', {
          class: 'ley-pin', text: (i + 1) + ' · ' + (o.etiqueta || 'sin etiqueta'),
          onclick: function () { abrirPin(o); }
        }));
      });
      leyenda.appendChild(cont);
    }
  }

  function resaltar(gid) {
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
      slidesBar.appendChild(U.el('button', {
        class: 'sk-slide' + (i === s.activa ? ' on' : ''),
        onclick: function () { s.activa = i; limpiarSel(); U.save(); pintarTools(); render(); },
        ondblclick: function () {
          U.pedirTexto('Nombre de la slide', sl.nombre, function (n) {
            if (n) { sl.nombre = n; U.save(); pintarSlides(); }
          });
        }
      }, [
        U.el('span', { class: 'n', text: (i + 1) }),
        U.el('span', { class: 'nm', text: sl.nombre }),
        U.el('span', { class: 'c', text: sl.objs.length })
      ]));
    });
    slidesBar.appendChild(U.el('button', {
      class: 'sk-slide add', text: '＋',  title: 'Nueva slide',
      onclick: function () {
        s.slides.push({ id: U.uid('s'), nombre: 'Slide ' + (s.slides.length + 1), objs: [] });
        s.activa = s.slides.length - 1; U.save(); render();
      }
    }));
    slidesBar.appendChild(U.el('button', {
      class: 'sk-slide add', text: '⧉', title: 'Duplicar slide',
      onclick: function () {
        var c = JSON.parse(JSON.stringify(slide()));
        c.id = U.uid('s'); c.nombre = c.nombre + ' (copia)';
        c.objs.forEach(function (o) { o.id = U.uid('o'); });
        s.slides.splice(s.activa + 1, 0, c); s.activa++; U.save(); render();
      }
    }));
    slidesBar.appendChild(U.el('button', {
      class: 'sk-play', html: '▶', title: 'Presentar para el briefing', onclick: presentar
    }));
    if (s.slides.length > 1) slidesBar.appendChild(U.el('button', {
      class: 'sk-slide add del', text: '✕', title: 'Borrar slide',
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
      var clon = ns('svg', { class: 'sk-svg', viewBox: '0 0 ' + NAT.w + ' ' + NAT.h });
      clon.appendChild(defsSVG());
      clon.appendChild(gMapa.cloneNode(true));
      var go = ns('g');
      sl.objs.forEach(function (o) { go.appendChild(nodoDe(o, true)); });
      clon.appendChild(go);
      vista.appendChild(clon);

      var p = U.partida();
      barra.appendChild(U.el('div', {
        class: 'p-tit',
        html: '<b>' + esc(p.nombre) + '</b> · ' + esc(U.map(s.mapa).nombre) + (p.punto ? ' · ' + esc(p.punto) : '') + ' · <span>' + esc(sl.nombre) + '</span>'
      }));
      barra.appendChild(U.el('div', { class: 'p-nav' }, [
        U.el('button', { class: 'btn sm', text: '‹', onclick: function () { i = (i - 1 + s.slides.length) % s.slides.length; pintar(); } }),
        U.el('span', { text: (i + 1) + ' / ' + s.slides.length }),
        U.el('button', { class: 'btn sm', text: '›', onclick: function () { i = (i + 1) % s.slides.length; pintar(); } }),
        U.el('button', { class: 'btn sm ghost', text: 'Salir (Esc)', onclick: salir })
      ]));

      var usados = {};
      sl.objs.forEach(function (o) { if (o.grupo) usados[o.grupo] = true; });
      U.bloques().filter(function (g) { return usados[g.id]; }).forEach(function (g) {
        var u = U.unit(g.unidad), pl = U.plantel(g.id);
        var c = U.el('div', { class: 'p-grupo', style: { '--c': u.color } });
        c.appendChild(U.el('h4', { html: '<i></i>' + corto(g) }));
        var l = U.el('div', { class: 'p-jug' });
        pl.forEach(function (j) {
          l.appendChild(U.el('span', { class: /SL|COMMANDER|CAP/.test(j.rol) ? 'lider' : '' }, [
            U.el('img', { class: 'cls', src: U.rolIcono(j.rol), alt: '' }),
            U.el('span', { text: j.nombre })
          ]));
        });
        if (!pl.length) l.appendChild(U.el('span', { class: 'vacio', text: '—' }));
        c.appendChild(l); ley.appendChild(c);
      });
      var pins = sl.objs.filter(function (o) { return o.tipo === 'pin'; });
      if (pins.length) {
        var pc = U.el('div', { class: 'p-grupo', style: { '--c': '#c99a2e' } });
        pc.appendChild(U.el('h4', { html: '<i></i>CAPTURAS' }));
        var pl2 = U.el('div', { class: 'p-jug' });
        pins.forEach(function (o, n) {
          pl2.appendChild(U.el('span', { text: '▣ ' + (o.etiqueta || ('pin ' + (n + 1))), onclick: function () { abrirPin(o); } }));
        });
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

  /* ---------------- íconos tácticos ---------------- */
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

  /* ---------- lo que necesita el exportador ---------- */
  function svgDeSlide(i) {
    if (!hay()) return null;
    var st = strat(), sl = st.slides[i];
    if (!sl) return null;
    var clon = ns('svg', {
      xmlns: 'http://www.w3.org/2000/svg', 'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      viewBox: '0 0 ' + NAT.w + ' ' + NAT.h, width: NAT.w, height: NAT.h
    });
    clon.appendChild(defsSVG());
    clon.appendChild(gMapa.cloneNode(true));
    var go = ns('g');
    sl.objs.forEach(function (o) { go.appendChild(nodoDe(o, true)); });
    clon.appendChild(go);
    return { xml: new XMLSerializer().serializeToString(clon), w: NAT.w, h: NAT.h, nombre: sl.nombre };
  }

  function leyendaDeSlide(i) {
    if (!hay()) return [];
    var sl = strat().slides[i]; if (!sl) return [];
    var usados = {};
    sl.objs.forEach(function (o) { if (o.grupo) usados[o.grupo] = true; });
    return U.bloques().filter(function (g) { return usados[g.id]; }).map(function (g) {
      return {
        titulo: corto(g), color: U.unit(g.unidad).color,
        jugadores: U.plantel(g.id).map(function (j) {
          return { nombre: j.nombre, rol: j.rol, lider: /SL|COMMANDER|CAP/.test(j.rol) };
        })
      };
    });
  }

  return {
    montar: montar,
    svgDeSlide: svgDeSlide,
    leyendaDeSlide: leyendaDeSlide,
    render: function () { if (svg) render(); },
    recargarMapa: function () {
      if (!svg) return;
      historia = {}; futuro = {}; limpiarSel();
      if (!hay()) { vacio(); return; }
      cargarMapa(); pintarTools(); render();
    }
  };
})();
