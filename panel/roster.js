/* ===================================================================
   roster.js — la hoja de roster, versión web.
   Misma estructura que el Excel (nodos, camiones, escuadras, defensa,
   tanques, pie de hoja) pero alimentada por la base de jugadores:
   arrastrás un nombre al slot y queda enganchado al color del grupo.
   =================================================================== */
window.U = window.U || {};

U.roster = (function () {
  var cont, side, arrastrando = null;

  function render() {
    if (!cont) return;
    var p = U.partida();
    U.vaciar(cont);
    if (!p) { cont.appendChild(U.el('p', { text: 'No hay partida activa.' })); return; }

    cont.appendChild(cabecera(p));

    var filas = {};
    U.ROSTER.forEach(function (g) { (filas[g.fila] = filas[g.fila] || []).push(g); });
    Object.keys(filas).sort().forEach(function (f) {
      var row = U.el('div', { class: 'r-fila' });
      filas[f].forEach(function (g) { row.appendChild(bloque(g)); });
      if (f === '4') row.appendChild(contadores());
      cont.appendChild(row);
    });

    cont.appendChild(pie(p));
    pintarSidebar();
  }

  /* --- cabecera: datos de la partida --- */
  function cabecera(p) {
    var mapa = U.map(p.strat.mapa || p.mapa);
    var box = U.el('div', { class: 'r-head' });
    box.appendChild(U.campo('Partida', p.nombre, function (v) { p.nombre = v; U.save(); U.emit('partidas'); }));
    box.appendChild(U.campo('Fecha', p.fecha, function (v) { p.fecha = v; U.save(); }, { tipo: 'date' }));
    box.appendChild(U.campo('Mapa', mapa.nombre, function (v) {
      var m = U.MAPS.find(function (x) { return x.nombre === v; });
      if (m) { p.mapa = m.id; p.strat.mapa = m.id; p.punto = ''; U.save(); render(); U.emit('strat'); }
    }, { opciones: U.MAPS.map(function (m) { return m.nombre; }) }));
    box.appendChild(U.campo('Punto', p.punto, function (v) { p.punto = v; U.save(); }, { opciones: mapa.puntos, vacio: true }));
    box.appendChild(U.campo('Bando', p.bando, function (v) { p.bando = v; U.save(); }, { opciones: U.BANDOS }));
    box.appendChild(U.campo('Modo', p.modo, function (v) { p.modo = v; U.save(); }, { opciones: U.MODOS }));
    return box;
  }

  /* --- un bloque de la hoja --- */
  function bloque(g) {
    var u = U.unit(g.unidad);
    var slots = U.slotsDe(g.id);
    var ocupados = slots.filter(function (_, i) { return U.asig(g.id, i); }).length;

    var caja = U.el('div', { class: 'r-bloque t-' + g.tipo, style: { '--c': u.color } });
    var head = U.el('div', { class: 'r-bloque-head' }, [
      U.el('span', { class: 'ttl', text: g.titulo }),
      U.el('span', { class: 'cnt', text: ocupados + '/' + slots.length })
    ]);
    if (g.extra) head.appendChild(U.el('button', {
      class: 'mas', text: '+', title: 'Sumar un slot',
      onclick: function () {
        var p = U.partida();
        (p.extraSlots[g.id] = p.extraSlots[g.id] || []).push(g.extra);
        U.save(); render();
      }
    }));
    caja.appendChild(head);

    slots.forEach(function (rol, i) { caja.appendChild(slotRow(g, rol, i)); });
    return caja;
  }

  function slotRow(g, rol, i) {
    var a = U.asig(g.id, i);
    var esExtra = i >= g.slots.length;
    var row = U.el('div', { class: 'r-slot' + (a ? ' lleno' : '') + (a && a.ok ? ' ok' : '') });

    row.appendChild(U.el('span', {
      class: 'chk', text: a && a.ok ? '✔' : '', title: 'Vino / no vino',
      onclick: function (e) { e.stopPropagation(); U.togglePresente(g.id, i); render(); }
    }));
    row.appendChild(U.el('span', { class: 'rol', html: '<i>' + U.roleIco(rol) + '</i>' + rol }));

    var nm = U.el('span', {
      class: 'nm', text: a ? U.nombreMiembro(a.m) : '—',
      onclick: function () {
        U.elegirJugador({
          titulo: g.titulo + ' · ' + rol,
          permitirVacio: !!a,
          ok: function (id) { U.asignar(g.id, i, id); render(); }
        });
      }
    });
    if (a) { nm.draggable = true; nm.addEventListener('dragstart', function (e) { arrastrando = { m: a.m, from: [g.id, i] }; e.dataTransfer.setData('text/plain', a.m); }); }
    row.appendChild(nm);

    if (esExtra) row.appendChild(U.el('span', {
      class: 'del', text: '×', title: 'Quitar slot',
      onclick: function () {
        var p = U.partida();
        p.extraSlots[g.id].splice(i - g.slots.length, 1);
        delete p.asignaciones[g.id + ':' + i];
        U.save(); render();
      }
    }));

    row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('drop'); });
    row.addEventListener('dragleave', function () { row.classList.remove('drop'); });
    row.addEventListener('drop', function (e) {
      e.preventDefault(); row.classList.remove('drop');
      var id = (arrastrando && arrastrando.m) || e.dataTransfer.getData('text/plain');
      if (!id) return;
      if (arrastrando && arrastrando.from) U.asignar(arrastrando.from[0], arrastrando.from[1], null);
      if (arrastrando && arrastrando.reserva) quitarReserva(id);
      U.asignar(g.id, i, id);
      arrastrando = null; render();
    });
    return row;
  }

  /* --- contadores (TOTAL PLAYERS / ATTENDES / TRAITORS) --- */
  function contadores() {
    var c = U.contadores();
    var caja = U.el('div', { class: 'r-bloque t-cont' });
    caja.appendChild(U.el('div', { class: 'r-bloque-head' }, [U.el('span', { class: 'ttl', text: 'CONTADORES' })]));
    [['TOTAL PLAYERS', c.total, 'tot'], ['TOTAL ATTENDES', c.asistieron, 'ok'], ['TOTAL TRAITORS', c.faltaron, 'bad']]
      .forEach(function (r) {
        caja.appendChild(U.el('div', { class: 'r-cont ' + r[2] }, [
          U.el('span', { text: r[0] }), U.el('b', { text: r[1] })
        ]));
      });
    var res = U.partida().reservas.length;
    caja.appendChild(U.el('div', { class: 'r-cont res' }, [U.el('span', { text: 'RESERVAS' }), U.el('b', { text: res })]));
    return caja;
  }

  /* --- pie de hoja --- */
  function pie(p) {
    var box = U.el('div', { class: 'r-pie' });
    box.appendChild(U.campo('Server name', p.server.name, function (v) { p.server.name = v; U.save(); }));
    box.appendChild(U.campo('Server pass', p.server.pass, function (v) { p.server.pass = v; U.save(); }));
    box.appendChild(U.campo('Briefing', p.briefing, function (v) { p.briefing = v; U.save(); }, { ph: 'hora / canal' }));
    box.appendChild(U.campo('Resultado', p.resultado, function (v) { p.resultado = v; U.save(); U.emit('dash'); }, { ph: 'ej: 5-0 / 3-2 W' }));
    return box;
  }

  /* ================= sidebar: base de jugadores ================= */
  var filtro = { q: '', unidad: 'Todos', soloLibres: false };

  function pintarSidebar() {
    if (!side) return;
    U.vaciar(side);
    var p = U.partida();

    var head = U.el('div', { class: 'sb-head' }, [
      U.el('h3', { text: 'Base de jugadores' }),
      U.el('span', { class: 'n', text: U.state.miembros.length })
    ]);
    side.appendChild(head);

    var buscar = U.el('input', { class: 'inp', placeholder: 'Buscar…', value: filtro.q });
    buscar.addEventListener('input', function () { filtro.q = buscar.value; pintarLista(); });
    side.appendChild(buscar);

    var chips = U.el('div', { class: 'sb-chips' });
    ['Todos'].concat(U.UNIDADES_MIEMBRO).forEach(function (u) {
      chips.appendChild(U.el('button', {
        class: 'chip' + (filtro.unidad === u ? ' on' : ''), text: u,
        onclick: function () { filtro.unidad = u; pintarSidebar(); }
      }));
    });
    chips.appendChild(U.el('button', {
      class: 'chip' + (filtro.soloLibres ? ' on' : ''), text: 'Sin asignar',
      onclick: function () { filtro.soloLibres = !filtro.soloLibres; pintarSidebar(); }
    }));
    side.appendChild(chips);

    var lista = U.el('div', { class: 'sb-list', id: 'sb-list' });
    side.appendChild(lista);

    var banco = U.el('div', { class: 'sb-banco' });
    banco.appendChild(U.el('h4', { text: 'Reservas · banco' }));
    var zona = U.el('div', { class: 'banco-zona' });
    (p.reservas || []).forEach(function (id) {
      zona.appendChild(U.el('span', {
        class: 'banco-chip', text: U.nombreMiembro(id),
        onclick: function () { quitarReserva(id); render(); }
      }));
    });
    if (!p.reservas.length) zona.appendChild(U.el('span', { class: 'vacio', text: 'Arrastrá nombres acá' }));
    zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('drop'); });
    zona.addEventListener('dragleave', function () { zona.classList.remove('drop'); });
    zona.addEventListener('drop', function (e) {
      e.preventDefault(); zona.classList.remove('drop');
      var id = (arrastrando && arrastrando.m) || e.dataTransfer.getData('text/plain');
      if (!id) return;
      if (arrastrando && arrastrando.from) U.asignar(arrastrando.from[0], arrastrando.from[1], null);
      if (p.reservas.indexOf(id) < 0) p.reservas.push(id);
      arrastrando = null; U.save(); render();
    });
    banco.appendChild(zona);
    side.appendChild(banco);

    var pieSb = U.el('div', { class: 'sb-pie' }, [
      U.el('button', { class: 'btn sm', text: '＋ Jugador', onclick: nuevoJugador }),
      U.el('button', { class: 'btn sm', text: '⇪ Importar lista', onclick: importarPegado }),
      U.el('button', { class: 'btn sm ghost', text: 'Vaciar roster', onclick: function () {
        U.confirmar('Se borran todas las asignaciones de esta partida. ¿Seguimos?', function () {
          var p = U.partida(); p.asignaciones = {}; p.reservas = []; U.save(); render();
        });
      } })
    ]);
    side.appendChild(pieSb);

    pintarLista();
  }

  function pintarLista() {
    var lista = U.$('#sb-list'); if (!lista) return;
    U.vaciar(lista);
    var q = filtro.q.trim().toLowerCase();
    U.state.miembros
      .filter(function (m) {
        if (q && m.nombre.toLowerCase().indexOf(q) < 0) return false;
        if (filtro.unidad !== 'Todos' && m.unidad !== filtro.unidad) return false;
        if (filtro.soloLibres && U.gruposDe(m.id).length) return false;
        return true;
      })
      .forEach(function (m) {
        var gs = U.gruposDe(m.id);
        var color = gs.length ? U.unit(U.group(gs[0]).unidad).color : 'transparent';
        var row = U.el('div', {
          class: 'sb-row' + (gs.length ? ' asignado' : ''), draggable: 'true',
          style: { '--c': color }
        }, [
          U.el('span', { class: 'dot' }),
          U.el('span', { class: 'nm', text: m.nombre }),
          U.el('span', { class: 'un', text: (m.unidad || '').slice(0, 3).toUpperCase() })
        ]);
        row.addEventListener('dragstart', function (e) { arrastrando = { m: m.id }; e.dataTransfer.setData('text/plain', m.id); });
        row.addEventListener('dblclick', function () { editarJugador(m); });
        lista.appendChild(row);
      });
  }

  function quitarReserva(id) {
    var p = U.partida();
    var i = p.reservas.indexOf(id);
    if (i >= 0) { p.reservas.splice(i, 1); U.save(); }
  }

  function nuevoJugador() {
    editarJugador({ id: null, nombre: '', steam: '', discord: '', unidad: 'Infantería', estado: 'Activo', dias: [], notas: '' });
  }

  function editarJugador(m) {
    var tmp = Object.assign({}, m);
    var f = U.el('div', { class: 'form' });
    f.appendChild(U.campo('Nombre', tmp.nombre, function (v) { tmp.nombre = v; }));
    f.appendChild(U.campo('Steam / ID', tmp.steam, function (v) { tmp.steam = v; }));
    f.appendChild(U.campo('Discord', tmp.discord, function (v) { tmp.discord = v; }));
    f.appendChild(U.campo('Unidad', tmp.unidad, function (v) { tmp.unidad = v; }, { opciones: U.UNIDADES_MIEMBRO }));
    f.appendChild(U.campo('Estado', tmp.estado, function (v) { tmp.estado = v; }, { opciones: U.ESTADOS }));
    var pie = U.el('div', { class: 'modal-pie' });
    var mm = U.modal(m.id ? 'Editar jugador' : 'Nuevo jugador', f, { pie: pie });
    if (m.id) pie.appendChild(U.el('button', {
      class: 'btn danger ghost', text: 'Eliminar', onclick: function () {
        U.confirmar('¿Borrar a ' + m.nombre + ' de la base?', function () {
          U.state.miembros = U.state.miembros.filter(function (x) { return x.id !== m.id; });
          U.save(); mm.cerrar(); render();
        });
      }
    }));
    pie.appendChild(U.el('button', {
      class: 'btn primary', text: 'Guardar', onclick: function () {
        if (!tmp.nombre.trim()) { U.toast('Falta el nombre', 'err'); return; }
        if (m.id) Object.assign(U.miembro(m.id), tmp);
        else { tmp.id = U.uid('m'); tmp.partidas = 0; tmp.asistencias = 0; U.state.miembros.push(tmp); }
        U.save(); mm.cerrar(); render(); U.emit('dash');
      }
    }));
  }

  function importarPegado() {
    var ta = U.el('textarea', { class: 'inp ta', placeholder: 'Un jugador por línea.\nOpcional: Nombre, SteamID, Unidad' });
    var pie = U.el('div', { class: 'modal-pie' });
    var mm = U.modal('Importar jugadores', ta, { pie: pie });
    pie.appendChild(U.el('button', {
      class: 'btn primary', text: 'Importar', onclick: function () {
        var n = 0;
        ta.value.split('\n').forEach(function (l) {
          var parts = l.split(/[,;\t]/).map(function (s) { return s.trim(); });
          if (!parts[0]) return;
          if (U.state.miembros.some(function (x) { return x.nombre.toLowerCase() === parts[0].toLowerCase(); })) return;
          U.state.miembros.push({
            id: U.uid('m'), nombre: parts[0], steam: parts[1] || '', discord: '',
            unidad: parts[2] || 'Infantería', estado: 'Activo', dias: [], notas: '', partidas: 0, asistencias: 0
          });
          n++;
        });
        U.save(); mm.cerrar(); render(); U.toast(n + ' jugadores importados');
      }
    }));
  }

  return {
    montar: function (nodoGrid, nodoSide) { cont = nodoGrid; side = nodoSide; render(); },
    render: render,
    editar: editarJugador
  };
})();
