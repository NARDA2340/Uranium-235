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
    var est = {};
    Object.keys(p.asignaciones || {}).forEach(function (k) {
      var a = p.asignaciones[k];
      if (!a || !a.m) return;
      if (est[a.m] === 'ok') return;
      var e = a.est || '';
      if (e === 'ok' || !est[a.m] || (est[a.m] === '' && e)) est[a.m] = e;
    });
    var total = 0, ok = 0, falta = 0, sm = 0;
    Object.keys(est).forEach(function (id) {
      total++;
      if (est[id] === 'ok') ok++;
      else if (est[id] === 'falta') falta++;
      else sm++;
    });
    var marcados = ok + falta;
    return {
      total: total, ok: ok, falta: falta, sinMarcar: sm,
      pct: marcados ? Math.round(ok / marcados * 100) : 0,
      jugadores: est
    };
  }

  function asistenciaPorJugador() {
    var m = {};
    U.state.partidas.forEach(function (p) {
      var s = statsPartida(p);
      Object.keys(s.jugadores).forEach(function (id) {
        m[id] = m[id] || { conv: 0, ok: 0, falta: 0 };
        m[id].conv++;
        if (s.jugadores[id] === 'ok') m[id].ok++;
        else if (s.jugadores[id] === 'falta') m[id].falta++;
      });
    });
    return m;
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

    /* --- primero: la próxima partida --- */
    var mapa = U.map(p.strat.mapa || p.mapa);
    var ficha = U.el('div', { class: 'd-card ficha' });
    ficha.appendChild(U.el('div', { class: 'd-card-head' }, [
      U.el('h3', { text: 'Próxima partida' }),
      U.el('span', { class: 'tag', text: p.fecha })
    ]));
    var fg = U.el('div', { class: 'ficha-grid' });
    var res = p.resultado || (U.resultadoHabilitado(p) ? '—' : 'después del ' + U.fechaCorta(p.fecha));
    [['Partida', p.nombre], ['Mapa', mapa.nombre], ['Punto', p.punto || '—'], ['Bando', p.bando],
     ['Formato', p.formato || p.modo], ['Server', p.server.name || '—'], ['Pass', p.server.pass || '—'],
     ['Briefing', p.briefing || '—'], ['Resultado', res]]
      .forEach(function (r) {
        fg.appendChild(U.el('div', { class: 'ficha-i' }, [U.el('span', { text: r[0] }), U.el('b', { text: r[1] })]));
      });
    ficha.appendChild(fg);
    ficha.appendChild(U.el('div', { class: 'ficha-acc' }, [
      U.el('button', { class: 'btn sm', text: 'Ir al roster →', onclick: function () { U.tab('roster'); } }),
      U.el('button', { class: 'btn sm', text: 'Ir a la estrategia →', onclick: function () { U.tab('strat'); } })
    ]));
    cont.appendChild(ficha);

    /* --- números del plantel --- */
    var kpis = U.el('div', { class: 'd-kpis' });
    [
      { k: 'Plantel', v: U.state.miembros.length, s: activos + ' activos' },
      { k: 'Convocados', v: (p.convocados || []).length, s: st.total + ' en el roster' },
      { k: 'Asistencia', v: (st.ok + st.falta) ? st.pct + '%' : '—', s: st.ok + ' vinieron de ' + (st.ok + st.falta) + ' marcados', tono: st.pct >= 85 ? 'ok' : st.pct >= 65 ? 'warn' : 'bad' },
      { k: 'Faltaron', v: st.falta, s: 'tildados a mano', tono: st.falta ? 'bad' : 'ok' },
      { k: 'Sin marcar', v: st.sinMarcar, s: 'falta pasar lista', tono: st.sinMarcar ? 'warn' : 'ok' },
      { k: 'Partidas', v: conPartidas.length, s: 'cargadas' }
    ].forEach(function (t) {
      kpis.appendChild(U.el('div', { class: 'd-kpi ' + (t.tono || '') }, [
        U.el('span', { class: 'k', text: t.k }),
        U.el('b', { text: t.v }),
        U.el('small', { text: t.s })
      ]));
    });
    cont.appendChild(kpis);

    /* --- las tres métricas, una al lado de la otra --- */
    var grid = U.el('div', { class: 'd-grid tres' });
    grid.appendChild(cardAsistencia());
    grid.appendChild(cardEstados());
    grid.appendChild(cardTop());
    cont.appendChild(grid);

    cont.appendChild(cardPlantel());
    cont.appendChild(cardPartidas());
  }

  /* --- asistencia por partida (columnas) --- */
  function cardAsistencia() {
    var c = card('Asistencia por partida');
    var ps = U.state.partidas.filter(function (x) { return Object.keys(x.asignaciones).length; }).slice(-10);
    if (!ps.length) { c.appendChild(vacio('Todavía no hay partidas con roster cargado.')); return c; }
    var W = 420, H = 230, padL = 34, padB = 42, padT = 16;
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
      lb2.textContent = s.ok + '/' + (s.ok + s.falta); g.appendChild(lb2);
      var tt = el('title'); tt.textContent = p.nombre + ' · ' + s.ok + ' de ' + s.total + ' (' + s.pct + '%)';
      g.appendChild(tt);
      svg.appendChild(g);
    });
    c.appendChild(svg);
    return c;
  }

  /* --- estado del plantel (barra segmentada + leyenda) --- */
  function tono(e) { return U.ESTADO_COLOR[e] || '#5a4d2a'; }

  function cardEstados() {
    var c = card('Estado del plantel');
    var cuenta = {};
    U.state.miembros.forEach(function (m) { cuenta[m.estado] = (cuenta[m.estado] || 0) + 1; });
    var total = U.state.miembros.length || 1;

    var barra = U.el('div', { class: 'seg' });
    U.ESTADOS.filter(function (e) { return cuenta[e]; }).forEach(function (e) {
      barra.appendChild(U.el('div', {
        class: 'seg-i', title: e + ': ' + cuenta[e],
        style: { width: (cuenta[e] / total * 100) + '%', background: tono(e) }
      }));
    });
    c.appendChild(barra);

    var leg = U.el('div', { class: 'leg' });
    U.ESTADOS.forEach(function (e) {
      leg.appendChild(U.el('span', {
        class: 'leg-i', style: { '--c': tono(e) },
        html: '<i></i>' + e + ' <b>' + (cuenta[e] || 0) + '</b>'
      }));
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

  /* --- ranking de asistencia: los 10 que más vienen y los 10 que menos --- */
  function cardTop() {
    var c = card('Asistencia');
    var m = asistenciaPorJugador();
    var arr = Object.keys(m).filter(function (id) { return U.miembro(id) && (m[id].ok + m[id].falta); }).map(function (id) {
      var marc = m[id].ok + m[id].falta;
      return { nombre: U.nombreMiembro(id), ok: m[id].ok, falta: m[id].falta, marc: marc, pct: Math.round(m[id].ok / marc * 100) };
    });
    if (!arr.length) { c.appendChild(vacio('Cargá el roster y marcá quién vino.')); return c; }
    var mas = arr.slice().sort(function (a, b) { return b.ok - a.ok || b.pct - a.pct; }).slice(0, 10);
    var menos = arr.slice().sort(function (a, b) { return a.pct - b.pct || b.falta - a.falta; }).slice(0, 10);
    var cols = U.el('div', { class: 'top2' });
    [['Top 10 · más', mas, 'mas'], ['Top 10 · menos', menos, 'menos']].forEach(function (t) {
      var col = U.el('div', { class: 'top-col ' + t[2] }, [U.el('h4', { text: t[0] })]);
      var ol = U.el('ol');
      t[1].forEach(function (j) {
        ol.appendChild(U.el('li', { title: j.nombre + ': vino ' + j.ok + ' · faltó ' + j.falta }, [
          U.el('span', { class: 'nm', text: j.nombre }),
          U.el('span', { class: 'vl', text: j.pct + '%' }),
          U.el('span', { class: 'bar', style: { width: j.pct + '%' } })
        ]));
      });
      col.appendChild(ol);
      cols.appendChild(col);
    });
    c.appendChild(cols);
    return c;
  }

  /* --- tabla de partidas --- */
  function cardPartidas() {
    var c = card('Partidas');
    var t = U.el('table', { class: 'tabla' });
    t.appendChild(U.el('thead', {}, [U.el('tr', {}, ['Partida', 'Fecha', 'Mapa', 'Punto', 'Modo', 'Convocados', 'Vinieron', 'Faltaron', 'Resultado', ''].map(function (h) { return U.el('th', { text: h }); }))]));
    var tb = U.el('tbody');
    U.state.partidas.slice().reverse().forEach(function (p) {
      var s = statsPartida(p);
      var tr = U.el('tr', { class: p.id === U.state.activa ? 'on' : '' });
      [p.nombre, p.fecha, U.map(p.strat.mapa || p.mapa).nombre, p.punto || '—', p.modo, s.total, s.ok, s.falta, p.resultado || '—']
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

  /* --- tabla del plantel: alta rápida y semáforo de un clic --- */
  function cardPlantel() {
    var c = card('Base de jugadores', U.state.miembros.length + ' jugadores');

    var acciones = U.el('div', { class: 'plantel-acc' }, [
      U.el('button', { class: 'btn primary', text: '＋ Agregar jugador', onclick: function () { U.emit('nuevoMiembro'); } }),
      U.el('button', { class: 'btn', text: '⇪ Pegar lista', title: 'Pegar varios nombres de una', onclick: function () { U.emit('importarMiembros'); } })
    ]);
    c.appendChild(acciones);

    var buscar = U.el('input', { class: 'inp', placeholder: 'Filtrar por nombre, unidad o estado…' });
    c.appendChild(buscar);

    var wrap = U.el('div', { class: 'tabla-wrap' });
    var t = U.el('table', { class: 'tabla' });
    t.appendChild(U.el('thead', {}, [U.el('tr', {},
      ['Jugador', 'Unidad', 'Estado', 'Convocatorias', 'Vino', 'Faltó', '%', 'Steam / ID', ''].map(function (h) { return U.el('th', { text: h }); })
    )]));
    var tb = U.el('tbody');
    t.appendChild(tb); wrap.appendChild(t); c.appendChild(wrap);

    function pintar() {
      var asis = asistenciaPorJugador();
      U.vaciar(tb);
      var q = buscar.value.trim().toLowerCase();
      U.state.miembros.filter(function (m) {
        return !q || (m.nombre + ' ' + m.unidad + ' ' + m.estado).toLowerCase().indexOf(q) >= 0;
      }).forEach(function (m) {
        var a = asis[m.id] || { conv: 0, ok: 0, falta: 0 };
        var tr = U.el('tr');
        tr.appendChild(U.el('td', { class: 'nm', text: m.nombre }));
        tr.appendChild(U.el('td', { text: m.unidad || '—' }));
        tr.appendChild(U.el('td', {}, [U.el('button', {
          class: 'pill click', style: { '--c': tono(m.estado) }, text: m.estado,
          title: 'Clic para pasar a ' + (U.ESTADO_SIGUIENTE[m.estado] || 'Activo'),
          onclick: function () {
            m.estado = U.ESTADO_SIGUIENTE[m.estado] || 'Activo';
            U.save(); render();
          }
        })]));
        tr.appendChild(U.el('td', { text: a.conv }));
        tr.appendChild(U.el('td', { class: a.ok ? 'bien' : '', text: a.ok }));
        tr.appendChild(U.el('td', { class: a.falta ? 'mal' : '', text: a.falta }));
        tr.appendChild(U.el('td', { text: a.conv ? Math.round(a.ok / a.conv * 100) + '%' : '—' }));
        tr.appendChild(U.el('td', { class: 'mono', text: (m.steam || '').slice(0, 18) }));
        tr.appendChild(U.el('td', {}, [U.el('button', {
          class: 'btn xs', text: 'editar', onclick: function () { U.emit('editarMiembro', m); }
        })]));
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
