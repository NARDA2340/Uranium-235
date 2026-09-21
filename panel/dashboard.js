/* ===================================================================
   dashboard.js — el "Dashboard Uranium" del Excel, pero vivo.
   Todo lo que muestra sale de los datos del panel: base de jugadores
   + partidas cargadas. Nada está hardcodeado.
   =================================================================== */
window.U = window.U || {};

U.dash = (function () {
  var cont;

  /* ---------- cálculos ---------- */
  function statsPartida(p) {
    var vistos = {}, total = 0, ok = 0;
    Object.keys(p.asignaciones).forEach(function (k) {
      var a = p.asignaciones[k];
      if (!a || !a.m) return;
      if (!vistos[a.m]) { vistos[a.m] = a.ok ? 2 : 1; }
      else if (a.ok) vistos[a.m] = 2;
    });
    Object.keys(vistos).forEach(function (id) { total++; if (vistos[id] === 2) ok++; });
    return { total: total, ok: ok, falta: total - ok, pct: total ? Math.round(ok / total * 100) : 0, jugadores: vistos };
  }

  function asistenciaPorJugador() {
    var m = {};
    U.state.partidas.forEach(function (p) {
      var s = statsPartida(p);
      Object.keys(s.jugadores).forEach(function (id) {
        m[id] = m[id] || { conv: 0, ok: 0 };
        m[id].conv++;
        if (s.jugadores[id] === 2) m[id].ok++;
      });
    });
    return m;
  }

  function coberturaBloques() {
    return U.ROSTER.map(function (g) {
      var slots = U.slotsDe(g.id);
      var ocup = slots.filter(function (_, i) { return U.asig(g.id, i); }).length;
      return { g: g, ocup: ocup, total: slots.length, color: U.unit(g.unidad).color };
    });
  }

  /* ---------- render ---------- */
  function render() {
    if (!cont) return;
    U.vaciar(cont);
    var p = U.partida();
    if (!p) return;
    var st = statsPartida(p);
    var activos = U.state.miembros.filter(function (m) { return m.estado === 'Activo'; }).length;
    var conPartidas = U.state.partidas.filter(function (x) { return Object.keys(x.asignaciones).length; });

    /* --- KPIs --- */
    var kpis = U.el('div', { class: 'd-kpis' });
    [
      { k: 'Plantel', v: U.state.miembros.length, s: activos + ' activos' },
      { k: 'Convocados', v: st.total, s: 'en ' + p.nombre },
      { k: 'Asistencia', v: st.pct + '%', s: st.ok + ' de ' + st.total, tono: st.pct >= 85 ? 'ok' : st.pct >= 65 ? 'warn' : 'bad' },
      { k: 'Faltaron', v: st.falta, s: 'sin avisar', tono: st.falta ? 'bad' : 'ok' },
      { k: 'Banco', v: p.reservas.length, s: 'reservas' },
      { k: 'Partidas', v: conPartidas.length, s: 'cargadas' }
    ].forEach(function (t) {
      kpis.appendChild(U.el('div', { class: 'd-kpi ' + (t.tono || '') }, [
        U.el('span', { class: 'k', text: t.k }),
        U.el('b', { text: t.v }),
        U.el('small', { text: t.s })
      ]));
    });
    cont.appendChild(kpis);

    /* --- ficha de la partida --- */
    var mapa = U.map(p.strat.mapa || p.mapa);
    var ficha = U.el('div', { class: 'd-card ficha' });
    ficha.appendChild(U.el('div', { class: 'd-card-head' }, [
      U.el('h3', { text: 'Próxima partida' }),
      U.el('span', { class: 'tag', text: p.fecha })
    ]));
    var fg = U.el('div', { class: 'ficha-grid' });
    [['Partida', p.nombre], ['Mapa', mapa.nombre], ['Punto', p.punto || '—'], ['Bando', p.bando],
     ['Modo', p.modo], ['Server', p.server.name || '—'], ['Pass', p.server.pass || '—'],
     ['Briefing', p.briefing || '—'], ['Resultado', p.resultado || '—']]
      .forEach(function (r) {
        fg.appendChild(U.el('div', { class: 'ficha-i' }, [U.el('span', { text: r[0] }), U.el('b', { text: r[1] })]));
      });
    ficha.appendChild(fg);
    var acc = U.el('div', { class: 'ficha-acc' }, [
      U.el('button', { class: 'btn sm', text: 'Ir al roster →', onclick: function () { U.tab('roster'); } }),
      U.el('button', { class: 'btn sm', text: 'Ir a la estrategia →', onclick: function () { U.tab('strat'); } })
    ]);
    ficha.appendChild(acc);
    cont.appendChild(ficha);

    /* --- grilla de gráficos --- */
    var grid = U.el('div', { class: 'd-grid' });
    grid.appendChild(cardCobertura());
    grid.appendChild(cardAsistencia());
    grid.appendChild(cardEstados());
    grid.appendChild(cardTop());
    cont.appendChild(grid);

    cont.appendChild(cardPartidas());
    cont.appendChild(cardPlantel());
  }

  /* --- cobertura del roster (barras horizontales, una serie) --- */
  function cardCobertura() {
    var c = card('Cobertura del roster', 'Slots ocupados por bloque en la partida activa');
    var body = U.el('div', { class: 'bars' });
    coberturaBloques().forEach(function (b) {
      var pct = b.total ? b.ocup / b.total * 100 : 0;
      var row = U.el('div', { class: 'bar-row', title: b.g.titulo + ': ' + b.ocup + ' de ' + b.total });
      row.appendChild(U.el('span', { class: 'lb', text: b.g.titulo.replace(/ ·.*/, '') }));
      var track = U.el('div', { class: 'track' });
      track.appendChild(U.el('div', { class: 'fill', style: { width: pct + '%', background: b.color } }));
      row.appendChild(track);
      row.appendChild(U.el('span', { class: 'vl' + (b.ocup === b.total ? ' full' : b.ocup === 0 ? ' zero' : ''), text: b.ocup + '/' + b.total }));
      body.appendChild(row);
    });
    c.appendChild(body);
    return c;
  }

  /* --- asistencia por partida (columnas) --- */
  function cardAsistencia() {
    var c = card('Asistencia por partida', '% de convocados que aparecieron');
    var ps = U.state.partidas.filter(function (x) { return Object.keys(x.asignaciones).length; }).slice(-10);
    if (!ps.length) { c.appendChild(vacio('Todavía no hay partidas con roster cargado.')); return c; }
    var W = 560, H = 190, padL = 34, padB = 42, padT = 14;
    var bw = Math.min((W - padL - 10) / ps.length, 78);
    var svg = svgEl(W, H);
    [0, 50, 100].forEach(function (g) {
      var y = padT + (H - padT - padB) * (1 - g / 100);
      svg.appendChild(el('line', { x1: padL, y1: y, x2: W - 6, y2: y, stroke: '#3a3016', 'stroke-width': 1 }));
      var t = el('text', { x: padL - 8, y: y + 4, fill: '#9c8e6c', 'font-size': 10, 'text-anchor': 'end', 'font-family': 'Space Mono, monospace' });
      t.textContent = g + '%'; svg.appendChild(t);
    });
    ps.forEach(function (p, i) {
      var s = statsPartida(p);
      var h = (H - padT - padB) * s.pct / 100;
      var x = padL + i * bw + bw * 0.16, w = bw * 0.68;
      var y = padT + (H - padT - padB) - h;
      var g = el('g', { class: 'col' });
      g.appendChild(el('rect', { x: x, y: y, width: w, height: Math.max(h, 2), rx: 4, fill: '#c99a2e' }));
      var v = el('text', { x: x + w / 2, y: y - 5, fill: '#dccfb0', 'font-size': 11, 'text-anchor': 'middle', 'font-family': 'Space Mono, monospace' });
      v.textContent = s.pct + '%'; g.appendChild(v);
      var lb = el('text', { x: x + w / 2, y: H - padB + 15, fill: '#9c8e6c', 'font-size': 9.5, 'text-anchor': 'middle', 'font-family': 'Space Mono, monospace' });
      lb.textContent = (p.nombre || '').slice(0, 11); g.appendChild(lb);
      var lb2 = el('text', { x: x + w / 2, y: H - padB + 28, fill: '#6b6048', 'font-size': 9, 'text-anchor': 'middle', 'font-family': 'Space Mono, monospace' });
      lb2.textContent = s.ok + '/' + s.total; g.appendChild(lb2);
      var tt = el('title'); tt.textContent = p.nombre + ' · ' + s.ok + ' de ' + s.total + ' (' + s.pct + '%)';
      g.appendChild(tt);
      svg.appendChild(g);
    });
    c.appendChild(svg);
    return c;
  }

  /* --- estado del plantel (barra segmentada + leyenda) --- */
  var TONOS = { 'Activo': '#6f8a3f', 'Comprometido': '#c99a2e', 'Contactado': '#8a7a52', 'Reserva': '#4a7fa5', 'Inalcanzable': '#b0432f', 'Retirado': '#5a4d2a' };
  function cardEstados() {
    var c = card('Estado del plantel', 'Cómo está repartida la base de jugadores');
    var cuenta = {};
    U.state.miembros.forEach(function (m) { cuenta[m.estado] = (cuenta[m.estado] || 0) + 1; });
    var total = U.state.miembros.length || 1;
    var barra = U.el('div', { class: 'seg' });
    U.ESTADOS.filter(function (e) { return cuenta[e]; }).forEach(function (e) {
      barra.appendChild(U.el('div', {
        class: 'seg-i', title: e + ': ' + cuenta[e],
        style: { width: (cuenta[e] / total * 100) + '%', background: TONOS[e] || '#5a4d2a' }
      }));
    });
    c.appendChild(barra);
    var leg = U.el('div', { class: 'leg' });
    U.ESTADOS.filter(function (e) { return cuenta[e]; }).forEach(function (e) {
      leg.appendChild(U.el('span', { class: 'leg-i', style: { '--c': TONOS[e] || '#5a4d2a' }, html: '<i></i>' + e + ' <b>' + cuenta[e] + '</b>' }));
    });
    c.appendChild(leg);

    var porUnidad = {};
    U.state.miembros.forEach(function (m) { porUnidad[m.unidad] = (porUnidad[m.unidad] || 0) + 1; });
    var body = U.el('div', { class: 'bars compact' });
    Object.keys(porUnidad).sort(function (a, b) { return porUnidad[b] - porUnidad[a]; }).forEach(function (u) {
      var row = U.el('div', { class: 'bar-row' });
      row.appendChild(U.el('span', { class: 'lb', text: u }));
      var track = U.el('div', { class: 'track' });
      track.appendChild(U.el('div', { class: 'fill', style: { width: (porUnidad[u] / total * 100) + '%', background: '#8a7a52' } }));
      row.appendChild(track);
      row.appendChild(U.el('span', { class: 'vl', text: porUnidad[u] }));
      body.appendChild(row);
    });
    c.appendChild(body);
    return c;
  }

  /* --- ranking de asistencia --- */
  function cardTop() {
    var c = card('Asistencia acumulada', 'Sobre todas las partidas cargadas');
    var m = asistenciaPorJugador();
    var arr = Object.keys(m).map(function (id) {
      return { id: id, nombre: U.nombreMiembro(id), conv: m[id].conv, ok: m[id].ok, pct: Math.round(m[id].ok / m[id].conv * 100) };
    }).sort(function (a, b) { return b.ok - a.ok || b.pct - a.pct; }).slice(0, 12);
    if (!arr.length) { c.appendChild(vacio('Cargá el roster y marcá quién vino.')); return c; }
    var max = arr[0].conv || 1;
    var body = U.el('div', { class: 'bars' });
    arr.forEach(function (j) {
      var row = U.el('div', { class: 'bar-row', title: j.nombre + ': vino ' + j.ok + ' de ' + j.conv });
      row.appendChild(U.el('span', { class: 'lb', text: j.nombre }));
      var track = U.el('div', { class: 'track' });
      track.appendChild(U.el('div', { class: 'fill', style: { width: (j.ok / max * 100) + '%', background: '#c99a2e' } }));
      track.appendChild(U.el('div', { class: 'ghost', style: { width: (j.conv / max * 100) + '%' } }));
      row.appendChild(track);
      row.appendChild(U.el('span', { class: 'vl', text: j.ok + '/' + j.conv }));
      body.appendChild(row);
    });
    c.appendChild(body);
    return c;
  }

  /* --- tabla de partidas --- */
  function cardPartidas() {
    var c = card('Partidas', 'Historial cargado en el panel');
    var t = U.el('table', { class: 'tabla' });
    t.appendChild(U.el('thead', {}, [U.el('tr', {}, ['Partida', 'Fecha', 'Mapa', 'Punto', 'Modo', 'Convocados', 'Vinieron', 'Resultado', ''].map(function (h) { return U.el('th', { text: h }); }))]));
    var tb = U.el('tbody');
    U.state.partidas.slice().reverse().forEach(function (p) {
      var s = statsPartida(p);
      var tr = U.el('tr', { class: p.id === U.state.activa ? 'on' : '' });
      [p.nombre, p.fecha, U.map(p.strat.mapa || p.mapa).nombre, p.punto || '—', p.modo, s.total, s.ok + ' (' + s.pct + '%)', p.resultado || '—']
        .forEach(function (v) { tr.appendChild(U.el('td', { text: v })); });
      tr.appendChild(U.el('td', {}, [
        U.el('button', { class: 'btn xs', text: p.id === U.state.activa ? 'activa' : 'activar', onclick: function () { U.state.activa = p.id; U.save(); U.emit('partidas'); U.emit('todo'); } })
      ]));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    c.appendChild(t);
    return c;
  }

  /* --- tabla del plantel --- */
  function cardPlantel() {
    var c = card('Base de jugadores', U.state.miembros.length + ' cargados · doble clic para editar');
    var buscar = U.el('input', { class: 'inp', placeholder: 'Filtrar por nombre, unidad o estado…' });
    c.appendChild(buscar);
    var wrap = U.el('div', { class: 'tabla-wrap' });
    var t = U.el('table', { class: 'tabla' });
    t.appendChild(U.el('thead', {}, [U.el('tr', {}, ['Jugador', 'Unidad', 'Estado', 'Convocatorias', 'Asistencias', '%', 'Steam / ID'].map(function (h) { return U.el('th', { text: h }); }))]));
    var tb = U.el('tbody');
    t.appendChild(tb);
    wrap.appendChild(t);
    c.appendChild(wrap);
    var asis = asistenciaPorJugador();

    function pintar() {
      U.vaciar(tb);
      var q = buscar.value.trim().toLowerCase();
      U.state.miembros.filter(function (m) {
        return !q || (m.nombre + ' ' + m.unidad + ' ' + m.estado).toLowerCase().indexOf(q) >= 0;
      }).forEach(function (m) {
        var a = asis[m.id] || { conv: 0, ok: 0 };
        var tr = U.el('tr');
        tr.appendChild(U.el('td', { class: 'nm', text: m.nombre }));
        tr.appendChild(U.el('td', { text: m.unidad || '—' }));
        tr.appendChild(U.el('td', {}, [U.el('span', { class: 'pill', style: { '--c': TONOS[m.estado] || '#5a4d2a' }, text: m.estado })]));
        tr.appendChild(U.el('td', { text: a.conv }));
        tr.appendChild(U.el('td', { text: a.ok }));
        tr.appendChild(U.el('td', { text: a.conv ? Math.round(a.ok / a.conv * 100) + '%' : '—' }));
        tr.appendChild(U.el('td', { class: 'mono', text: (m.steam || '').slice(0, 18) }));
        tr.addEventListener('dblclick', function () { U.emit('editarMiembro', m); });
        tb.appendChild(tr);
      });
    }
    buscar.addEventListener('input', pintar);
    pintar();
    return c;
  }

  /* ---------- utilidades de armado ---------- */
  function card(tit, sub) {
    var c = U.el('div', { class: 'd-card' });
    c.appendChild(U.el('div', { class: 'd-card-head' }, [
      U.el('h3', { text: tit }),
      sub ? U.el('span', { class: 'sub', text: sub }) : null
    ]));
    return c;
  }
  function vacio(txt) { return U.el('p', { class: 'd-vacio', text: txt }); }
  function el(t, a) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', t);
    if (a) Object.keys(a).forEach(function (k) { n.setAttribute(k, a[k]); });
    return n;
  }
  function svgEl(w, h) {
    var s = el('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'chart' });
    s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return s;
  }

  return {
    montar: function (nodo) { cont = nodo; render(); },
    render: render
  };
})();
