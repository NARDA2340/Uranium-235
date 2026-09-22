/* ===================================================================
   partidas.js — la pantalla de entrada.
   Elegís con cuál partida vas a trabajar (o creás una nueva) y recién
   ahí entrás al roster y a la estrategia. Busca por nombre, mapa,
   punto, modo o fecha.
   =================================================================== */
window.U = window.U || {};

U.partidas = (function () {
  var cont, q = '';

  function stats(p) {
    var est = {}, r = { total: 0, ok: 0, falta: 0 };
    Object.keys(p.asignaciones || {}).forEach(function (k) {
      var a = p.asignaciones[k];
      if (!a || !a.m) return;
      if (est[a.m] === 'ok') return;
      var e = a.est || '';
      if (e === 'ok' || !est[a.m] || (est[a.m] === '' && e)) est[a.m] = e;
    });
    Object.keys(est).forEach(function (id) {
      r.total++;
      if (est[id] === 'ok') r.ok++;
      else if (est[id] === 'falta') r.falta++;
    });
    return r;
  }

  function texto(p) {
    return [p.nombre, p.fecha, U.map(p.strat && p.strat.mapa || p.mapa).nombre, p.punto, p.modo, p.bando, p.resultado]
      .join(' ').toLowerCase();
  }

  function render() {
    if (!cont) return;
    U.vaciar(cont);

    var head = U.el('div', { class: 'pt-head' }, [
      U.el('div', { class: 'pt-tit' }, [
        U.el('h1', { text: 'Partidas' }),
        U.el('p', { text: 'Elegí sobre cuál trabajar. Todo lo que cargues queda guardado en esa partida.' })
      ]),
      U.el('span', {
        class: 'pt-modo ' + (U.db.esNube() ? 'nube' : 'local'),
        text: U.db.esNube() ? '● base compartida' : '● solo este navegador',
        title: U.db.esNube()
          ? 'Hay base en la nube: lo que carguen todos se ve acá.'
          : 'Sin backend: los datos viven en este navegador. Usá exportar/importar para moverlos.'
      })
    ]);
    cont.appendChild(head);

    var barra = U.el('div', { class: 'pt-barra' });
    var buscar = U.el('input', { class: 'inp', placeholder: 'Buscar por nombre, mapa, punto, modo o fecha…', value: q });
    buscar.addEventListener('input', function () { q = buscar.value; pintarLista(); });
    barra.appendChild(buscar);
    barra.appendChild(U.el('button', { class: 'btn primary', text: '＋ Nueva partida', onclick: nueva }));
    barra.appendChild(U.el('button', {
      class: 'btn', text: '⇩ Exportar',
      title: 'Genera el roster y cada diapositiva como imagen para mandar al Discord',
      onclick: function () { U.exportarImagenes.abrir(); }
    }));
    barra.appendChild(U.el('button', { class: 'btn', text: '↑ Importar', onclick: importar }));
    if (U.db.esNube()) barra.appendChild(U.el('button', {
      class: 'btn', text: '⟳ Refrescar', title: 'Traer lo que cargaron los demás',
      onclick: function () {
        U.sincronizarInicio().then(function () { render(); U.emit('todo'); U.toast('Actualizado'); });
      }
    }));
    cont.appendChild(barra);

    cont.appendChild(U.el('div', { class: 'pt-lista', id: 'pt-lista' }));
    pintarLista();
  }

  function pintarLista() {
    var lista = U.$('#pt-lista'); if (!lista) return;
    U.vaciar(lista);
    var t = q.trim().toLowerCase();
    var ps = U.state.partidas.filter(function (p) { return !t || texto(p).indexOf(t) >= 0; });
    ps.sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });

    if (!ps.length) {
      lista.appendChild(U.el('p', { class: 'pt-vacio', text: t ? 'No hay partidas que coincidan con "' + q + '".' : 'Todavía no hay partidas. Creá la primera.' }));
      return;
    }

    ps.forEach(function (p) {
      var s = stats(p);
      var mapa = U.map(p.strat && p.strat.mapa || p.mapa);
      var activa = p.id === U.state.activa;
      var marcas = (p.strat && p.strat.slides || []).reduce(function (n, sl) { return n + sl.objs.length; }, 0);

      var card = U.el('div', { class: 'pt-card' + (activa ? ' on' : '') });
      card.appendChild(U.el('div', { class: 'pt-card-top' }, [
        U.el('h3', { text: p.nombre }),
        U.el('span', { class: 'f', text: p.fecha })
      ]));
      card.appendChild(U.el('div', { class: 'pt-meta' }, [
        U.el('span', { class: 'mapa', text: mapa.nombre }),
        p.punto ? U.el('span', { text: p.punto }) : null,
        U.el('span', { text: p.modo }),
        U.el('span', { text: p.bando })
      ]));
      card.appendChild(U.el('div', { class: 'pt-nums una' }, [
        U.el('div', { class: 'pt-num res' + (p.resultado ? '' : ' vacio') }, [
          U.el('b', { text: p.resultado || '—' }),
          U.el('span', { text: 'Resultado' })
        ])
      ]));

      card.appendChild(U.el('div', { class: 'pt-acc' }, [
        U.el('button', {
          class: 'btn sm primary', text: activa ? 'Seguir acá →' : 'Abrir →',
          onclick: function () { abrir(p.id); }
        }),
        U.el('button', { class: 'btn sm', text: '⧉', title: 'Duplicar (copia el roster, borra la asistencia)', onclick: function () { duplicar(p); } }),
        U.el('button', { class: 'btn sm danger ghost', text: '✕', title: 'Borrar partida', onclick: function () { borrar(p); } })
      ]));
      lista.appendChild(card);
    });
  }

  function num(k, v, tono) {
    return U.el('div', { class: 'pt-num ' + tono }, [U.el('b', { text: v }), U.el('span', { text: k })]);
  }

  function abrir(id) {
    U.state.activa = id; U.save();
    U.emit('partidas');
    U.emit('todo');
    U.tab('roster');
  }

  function nueva() {
    var f = U.el('div', { class: 'form' });
    var datos = { nombre: '', fecha: new Date().toISOString().slice(0, 10), mapa: 'carentan', modo: 'x36', bando: 'Aliados' };
    f.appendChild(U.campo('Nombre', datos.nombre, function (v) { datos.nombre = v; }, { ph: 'ej: URA vs 360' }));
    f.appendChild(U.campo('Fecha', datos.fecha, function (v) { datos.fecha = v; }, { tipo: 'date' }));
    f.appendChild(U.campo('Mapa', U.map(datos.mapa).nombre, function (v) {
      var m = U.MAPS.find(function (x) { return x.nombre === v; }); if (m) datos.mapa = m.id;
    }, { opciones: U.MAPS.map(function (m) { return m.nombre; }) }));
    f.appendChild(U.campo('Formato', datos.modo, function (v) { datos.modo = v; }, { opciones: U.FORMATOS }));
    f.appendChild(U.el('p', { class: 'ayuda', text: 'x25 y x36 arrancan sin ariete ni incursor, con la defensa en su lugar. Después se edita todo a mano.' }));
    f.appendChild(U.campo('Bando', datos.bando, function (v) { datos.bando = v; }, { opciones: U.BANDOS }));
    var pie = U.el('div', { class: 'modal-pie' });
    var m = U.modal('Nueva partida', f, { pie: pie });
    pie.appendChild(U.el('button', {
      class: 'btn primary', text: 'Crear y abrir', onclick: function () {
        var p = U.nuevaPartida(datos.nombre.trim() || ('Partida ' + datos.fecha), datos.modo);
        p.fecha = datos.fecha; p.mapa = datos.mapa; p.strat.mapa = datos.mapa;
        p.bando = datos.bando;
        U.state.partidas.push(p);
        U.save(true);
        m.cerrar(); abrir(p.id);
      }
    }));
  }

  function duplicar(o) {
    var c = JSON.parse(JSON.stringify(o));
    c.id = U.uid('p');
    c.nombre = o.nombre + ' (copia)';
    c.resultado = '';
    c.fecha = new Date().toISOString().slice(0, 10);
    Object.keys(c.asignaciones).forEach(function (k) { c.asignaciones[k].est = ''; });
    c.strat.slides.forEach(function (s) { s.id = U.uid('s'); s.objs.forEach(function (ob) { ob.id = U.uid('o'); }); });
    U.state.partidas.push(c);
    U.state.activa = c.id;
    U.save(true); U.emit('partidas');
    render(); U.toast('Partida duplicada');
  }

  function borrar(p) {
    U.confirmar('Se borra "' + p.nombre + '" con su roster y su estrategia. ¿Seguro?', function () {
      U.borrarPartida(p.id);
      U.emit('partidas'); U.emit('todo');
      render(); U.toast('Partida borrada');
    });
  }

  function importar() {
    var inp = U.el('input', { type: 'file', accept: 'application/json' });
    inp.addEventListener('change', function () {
      if (!inp.files[0]) return;
      U.importar(inp.files[0]).then(function () {
        U.emit('partidas'); U.emit('todo'); render(); U.toast('Panel importado');
      }).catch(function () { U.toast('Archivo inválido', 'err'); });
    });
    inp.click();
  }

  return {
    montar: function (nodo) { cont = nodo; render(); },
    render: render
  };
})();
