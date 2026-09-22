/* ===================================================================
   roster.js — la hoja de roster.

   La estructura ya no es fija: cada partida se crea con la plantilla de
   su formato (x25 / x36 / x49) y desde acá se renombra, se mueve, se
   suman o sacan slots y se cambian roles. Los nombres salen de la base
   de jugadores: clic o arrastrar.
   =================================================================== */
window.U = window.U || {};

U.roster = (function () {
  var cont, side, arrastrando = null, arrastrandoBloque = null;

  /* ---------------- render principal ---------------- */
  function render() {
    if (!cont) return;
    var p = U.partida();
    U.vaciar(cont);
    if (!p) { cont.appendChild(U.el('p', { class: 'pt-vacio', text: 'Elegí una partida en la pestaña Partidas.' })); pintarSidebar(); return; }

    cont.appendChild(cabecera(p));

    var grilla = U.el('div', { class: 'r-grilla' });
    U.bloques().forEach(function (b, i) { grilla.appendChild(bloque(b, i)); });
    grilla.appendChild(U.el('button', {
      class: 'r-bloque nuevo', html: '＋<span>Agregar bloque</span>',
      onclick: function () { U.agregarBloque(); render(); }
    }));
    cont.appendChild(grilla);

    cont.appendChild(pie(p));
    pintarSidebar();
  }

  /* ---------------- cabecera ---------------- */
  function cabecera(p) {
    var mapa = U.map(p.strat.mapa || p.mapa);
    var box = U.el('div', { class: 'r-head' });
    box.appendChild(U.campo('Partida', p.nombre, function (v) { p.nombre = v; U.save(); U.emit('partidas'); }));
    box.appendChild(U.campo('Fecha', p.fecha, function (v) { p.fecha = v; U.save(); }, { tipo: 'date' }));
    box.appendChild(U.campo('Mapa', mapa.nombre, function (v) {
      var m = U.MAPS.find(function (x) { return x.nombre === v; });
      if (m) { p.mapa = m.id; p.strat.mapa = m.id; p.punto = ''; U.save(); render(); U.emit('strat'); }
    }, { opciones: U.MAPS.map(function (m) { return m.nombre; }) }));
    box.appendChild(U.campo('Punto', p.punto, function (v) { p.punto = v; U.save(); U.emit('dash'); }, { lista: mapa.puntos, ph: 'punto en disputa' }));
    box.appendChild(U.campo('Bando', p.bando, function (v) { p.bando = v; U.save(); }, { opciones: U.BANDOS }));
    box.appendChild(U.campo('Formato', p.formato, function (v) {
      if (v === p.formato) return;
      U.confirmar('Cambiar a ' + v + ' rearma los bloques con la plantilla de ese formato. Lo que no entre se pierde. ¿Seguimos?',
        function () { U.cambiarFormato(v); render(); U.toast('Roster armado para ' + v); });
    }, { opciones: U.FORMATOS }));

    var acc = U.el('div', { class: 'r-head-acc' }, [
      U.el('button', {
        class: 'btn primary', text: '⚡ Rellenar infantería',
        title: 'Completa los puestos de infantería vacíos con la gente disponible. No toca ingenieros ni choferes.',
        onclick: function () {
          var n = U.rellenar();
          render();
          U.toast(n ? n + ' puestos completados' : 'No quedó gente libre para rellenar', n ? '' : 'err');
        }
      })
    ]);
    box.appendChild(acc);
    return box;
  }

  /* ---------------- un bloque ---------------- */
  function bloque(g, indice) {
    var u = U.unit(g.unidad);
    var ocupados = g.slots.filter(function (_, i) { return U.asig(g.id, i); }).length;

    var caja = U.el('div', { class: 'r-bloque t-' + g.tipo, style: { '--c': u.color } });

    var head = U.el('div', { class: 'r-bloque-head', draggable: 'true', title: 'Arrastrá para mover el bloque' });
    var ttl = U.el('span', {
      class: 'ttl', text: g.titulo, title: 'Clic para renombrar',
      onclick: function () {
        U.pedirTexto('Nombre del bloque', g.titulo, function (t) {
          if (t) { U.renombrarBloque(g.id, t); render(); }
        });
      }
    });
    head.appendChild(ttl);
    head.appendChild(U.el('span', { class: 'cnt', text: ocupados + '/' + g.slots.length }));
    head.appendChild(U.el('button', {
      class: 'mas', text: '+', title: 'Sumar un slot',
      onclick: function () { U.agregarSlot(g.id); render(); }
    }));
    head.appendChild(U.el('button', {
      class: 'mas menos', text: '✕', title: 'Borrar el bloque entero',
      onclick: function () {
        U.confirmar('¿Borrar el bloque "' + g.titulo + '"?', function () { U.borrarBloque(g.id); render(); });
      }
    }));

    head.addEventListener('dragstart', function (e) {
      arrastrandoBloque = g.id;
      e.dataTransfer.setData('text/plain', 'bloque:' + g.id);
      caja.classList.add('moviendo');
    });
    head.addEventListener('dragend', function () { arrastrandoBloque = null; caja.classList.remove('moviendo'); });
    caja.addEventListener('dragover', function (e) {
      if (!arrastrandoBloque || arrastrandoBloque === g.id) return;
      e.preventDefault(); caja.classList.add('destino');
    });
    caja.addEventListener('dragleave', function () { caja.classList.remove('destino'); });
    caja.addEventListener('drop', function (e) {
      if (!arrastrandoBloque) return;
      e.preventDefault(); e.stopPropagation();
      caja.classList.remove('destino');
      U.moverBloque(arrastrandoBloque, indice);
      arrastrandoBloque = null; render();
    });

    caja.appendChild(head);
    g.slots.forEach(function (rol, i) { caja.appendChild(slotRow(g, rol, i)); });
    return caja;
  }

  /* ---------------- una fila ---------------- */
  function slotRow(g, rol, i) {
    var a = U.asig(g.id, i);
    var est = a ? (a.est || '') : '';
    var row = U.el('div', { class: 'r-slot' + (a ? ' lleno' : '') + (est ? ' e-' + est : '') });

    row.appendChild(U.el('span', {
      class: 'chk', text: est === 'ok' ? '✔' : est === 'falta' ? '✕' : '',
      title: a ? 'Sin marcar → vino → faltó' : 'Asigná un jugador primero',
      onclick: function (e) { e.stopPropagation(); if (a) { U.ciclarAsistencia(g.id, i); render(); } }
    }));

    var lbl = U.el('span', { class: 'rol', title: 'Clic para cambiar el rol' });
    lbl.appendChild(U.el('img', { class: 'cls', src: U.rolIcono(rol), alt: '' }));
    lbl.appendChild(U.el('span', { class: 'txt', text: rol }));
    lbl.addEventListener('click', function (e) { e.stopPropagation(); menuRol(g, i, rol); });
    row.appendChild(lbl);

    /* Slot vacío: el clic asigna. Slot lleno: el clic pasa lista
       (para cambiar al jugador está la ✕, o le arrastrás otro encima). */
    var nm = U.el('span', {
      class: 'nm' + (a ? ' puesto' : ''),
      text: a ? U.nombreMiembro(a.m) : '— asignar —',
      title: a ? 'Clic: pasar lista · doble clic: cambiar jugador' : 'Clic para asignar',
      onclick: function (e) {
        if (a) return;                    // deja que el clic llegue a la fila
        e.stopPropagation();
        abrirPicker();
      },
      ondblclick: function (e) { e.stopPropagation(); abrirPicker(); }
    });
    function abrirPicker() {
      U.elegirJugador({
        titulo: g.titulo + ' · ' + rol, permitirVacio: !!a,
        ok: function (id) { U.asignar(g.id, i, id); render(); }
      });
    }
    if (a) {
      nm.draggable = true;
      nm.addEventListener('dragstart', function (e) { arrastrando = { m: a.m, from: [g.id, i] }; e.dataTransfer.setData('text/plain', a.m); });
    }
    row.appendChild(nm);

    var acc = U.el('span', { class: 'acc' });
    if (a) acc.appendChild(U.el('button', {
      class: 'quitar', text: '✕', title: 'Sacar a ' + U.nombreMiembro(a.m),
      onclick: function (e) { e.stopPropagation(); U.asignar(g.id, i, null); render(); }
    }));
    acc.appendChild(U.el('button', {
      class: 'quitar slot', text: '⌫', title: 'Eliminar este puesto',
      onclick: function (e) { e.stopPropagation(); U.quitarSlot(g.id, i); render(); }
    }));
    row.appendChild(acc);

    /* clic en la fila = pasar lista */
    row.addEventListener('click', function () { if (a) { U.ciclarAsistencia(g.id, i); render(); } });

    row.addEventListener('dragover', function (e) {
      if (arrastrandoBloque) return;
      e.preventDefault(); row.classList.add('drop');
    });
    row.addEventListener('dragleave', function () { row.classList.remove('drop'); });
    row.addEventListener('drop', function (e) {
      if (arrastrandoBloque) return;
      e.preventDefault(); e.stopPropagation(); row.classList.remove('drop');
      var id = (arrastrando && arrastrando.m) || e.dataTransfer.getData('text/plain');
      if (!id || id.indexOf('bloque:') === 0) return;
      if (arrastrando && arrastrando.from) U.asignar(arrastrando.from[0], arrastrando.from[1], null);
      quitarReserva(id);
      U.asignar(g.id, i, id);
      arrastrando = null; render();
    });
    return row;
  }

  function menuRol(g, i, actual) {
    var lista = U.el('div', { class: 'picker-list roles' });
    U.ROLES_EDITABLES.forEach(function (r) {
      var fila = U.el('div', { class: 'pick' + (r === actual ? ' on' : '') });
      fila.appendChild(U.el('img', { class: 'cls', src: U.rolIcono(r), alt: '' }));
      fila.appendChild(U.el('span', { class: 'nm', text: r }));
      fila.addEventListener('click', function () { m.cerrar(); U.cambiarRol(g.id, i, r); render(); });
      lista.appendChild(fila);
    });
    var m = U.modal('Rol del puesto', lista, { clase: 'sm', noFoco: true });
  }

  /* ---------------- pie ---------------- */
  function pie(p) {
    var box = U.el('div', { class: 'r-pie' });
    box.appendChild(U.campo('Server name', p.server.name, function (v) { p.server.name = v; U.save(); }));
    box.appendChild(U.campo('Server pass', p.server.pass, function (v) { p.server.pass = v; U.save(); }));
    box.appendChild(U.campo('Briefing', p.briefing, function (v) { p.briefing = v; U.save(); }, { ph: 'hora / canal' }));
    box.appendChild(U.campo('Resultado', p.resultado, function (v) { p.resultado = v; U.save(); U.emit('dash'); }, { ph: 'ej: 5-0 / 3-2 W' }));
    return box;
  }

  /* ================= sidebar ================= */
  var filtro = { q: '', unidad: 'Todos', soloLibres: false };

  function pintarSidebar() {
    if (!side) return;
    U.vaciar(side);
    var p = U.partida();
    if (!p) return;

    /* --- contadores, ahora acá --- */
    var c = U.contadores();
    var cont4 = U.el('div', { class: 'sb-cont' });
    [['Convocados', c.total, ''], ['Vinieron', c.asistieron, 'ok'],
     ['Faltaron', c.faltaron, c.faltaron ? 'bad' : ''], ['Sin marcar', c.sinMarcar, c.sinMarcar ? 'warn' : '']]
      .forEach(function (r) {
        cont4.appendChild(U.el('div', { class: 'sb-num ' + r[2] }, [
          U.el('b', { text: r[1] }), U.el('span', { text: r[0] })
        ]));
      });
    side.appendChild(cont4);
    side.appendChild(U.el('p', { class: 'ayuda', text: 'Clic en una fila del roster para pasar lista: vino → faltó → sin marcar.' }));

    var head = U.el('div', { class: 'sb-head' }, [
      U.el('h3', { text: 'Jugadores' }),
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

    side.appendChild(U.el('div', { class: 'sb-list', id: 'sb-list' }));

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
      if (!id || id.indexOf('bloque:') === 0) return;
      if (arrastrando && arrastrando.from) U.asignar(arrastrando.from[0], arrastrando.from[1], null);
      if (p.reservas.indexOf(id) < 0) p.reservas.push(id);
      arrastrando = null; U.save(); render();
    });
    banco.appendChild(zona);
    side.appendChild(banco);

    side.appendChild(U.el('div', { class: 'sb-pie' }, [
      U.el('button', { class: 'btn sm', text: '＋ Jugador', onclick: nuevoJugador }),
      U.el('button', { class: 'btn sm', text: '⇪ Importar', onclick: importarPegado }),
      U.el('button', {
        class: 'btn sm ghost', text: 'Vaciar roster', onclick: function () {
          U.confirmar('Se borran todas las asignaciones de esta partida. ¿Seguimos?', function () {
            var p = U.partida(); p.asignaciones = {}; p.reservas = []; U.save(); render();
          });
        }
      })
    ]));

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
        var b = gs.length ? U.bloque(gs[0]) : null;
        var color = b ? U.unit(b.unidad).color : 'transparent';
        var row = U.el('div', {
          class: 'sb-row' + (gs.length ? ' asignado' : ''), draggable: 'true',
          style: { '--c': color, '--e': U.ESTADO_COLOR[m.estado] || '#5a4d2a' }
        }, [
          U.el('span', { class: 'dot' }),
          U.el('span', { class: 'nm', text: m.nombre }),
          U.el('button', {
            class: 'est', title: 'Estado: ' + m.estado + ' (clic para cambiar)',
            onclick: function (e) {
              e.stopPropagation();
              m.estado = U.ESTADO_SIGUIENTE[m.estado] || 'Activo';
              U.save(); pintarLista(); U.emit('dash');
            }
          })
        ]);
        row.addEventListener('dragstart', function (e) { arrastrando = { m: m.id }; e.dataTransfer.setData('text/plain', m.id); });
        row.addEventListener('dblclick', function () { editarJugador(m); });
        lista.appendChild(row);
      });
  }

  function quitarReserva(id) {
    var p = U.partida(); if (!p) return;
    var i = p.reservas.indexOf(id);
    if (i >= 0) { p.reservas.splice(i, 1); U.save(); }
  }

  /* ---------------- alta y edición de jugadores ---------------- */
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
    f.appendChild(U.el('p', { class: 'ayuda', text: 'Activo = juega siempre · Tibio = se anota a veces · Inactivo = no está más.' }));
    var pie = U.el('div', { class: 'modal-pie' });
    var mm = U.modal(m.id ? 'Editar jugador' : 'Nuevo jugador', f, { pie: pie });
    if (m.id) pie.appendChild(U.el('button', {
      class: 'btn danger ghost', text: 'Eliminar', onclick: function () {
        U.confirmar('¿Borrar a ' + m.nombre + ' de la base?', function () {
          U.state.miembros = U.state.miembros.filter(function (x) { return x.id !== m.id; });
          U.save(); mm.cerrar(); render(); U.emit('dash');
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
        U.save(); mm.cerrar(); render(); U.emit('dash'); U.toast(n + ' jugadores importados');
      }
    }));
  }

  return {
    montar: function (nodoGrid, nodoSide) { cont = nodoGrid; side = nodoSide; render(); },
    render: render,
    editar: editarJugador,
    nuevo: nuevoJugador,
    importarLista: importarPegado
  };
})();
