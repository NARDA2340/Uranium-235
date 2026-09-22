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

    var grilla = U.el('div', { class: 'r-grilla', id: 'r-grilla' });
    U.bloques().forEach(function (b) { grilla.appendChild(bloque(b)); });
    grilla.appendChild(U.el('button', {
      class: 'r-bloque nuevo', html: '＋<span>Agregar bloque</span>',
      onclick: function () { U.agregarBloque(); render(); }
    }));
    /* mientras arrastrás, las tarjetas se corren solas */
    grilla.addEventListener('dragover', function (e) {
      if (!arrastrandoBloque) return;
      e.preventDefault();
      var origen = grilla.querySelector('[data-bid="' + arrastrandoBloque + '"]');
      var destino = e.target.closest ? e.target.closest('.r-bloque[data-bid]') : null;
      if (!origen || !destino || destino === origen) return;
      var r = destino.getBoundingClientRect();
      var despues = (e.clientY - r.top) > r.height / 2 || (e.clientX - r.left) > r.width / 2;
      grilla.insertBefore(origen, despues ? destino.nextSibling : destino);
    });
    grilla.addEventListener('drop', function (e) { if (arrastrandoBloque) e.preventDefault(); });
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

    return box;
  }

  /* ---------------- un bloque ---------------- */
  function bloque(g) {
    var u = U.unit(g.unidad);
    var ocupados = g.slots.filter(function (_, i) { return U.asig(g.id, i); }).length;
    var caja = U.el('div', { class: 'r-bloque t-' + g.tipo, 'data-bid': g.id, style: { '--c': u.color } });

    var head = U.el('div', { class: 'r-bloque-head', draggable: 'true', title: 'Arrastrá para mover el bloque' });
    head.appendChild(U.el('span', {
      class: 'ttl', text: g.titulo, title: 'Clic para renombrar',
      onclick: function () {
        U.pedirTexto('Nombre del bloque', g.titulo, function (t) {
          if (t) { U.renombrarBloque(g.id, t); render(); }
        });
      }
    }));
    head.appendChild(U.el('span', { class: 'cnt', text: ocupados + '/' + g.slots.length }));
    head.appendChild(U.el('button', {
      class: 'mas', text: '+', title: 'Sumar un puesto',
      onclick: function () { U.agregarSlot(g.id); render(); }
    }));
    head.appendChild(U.el('button', {
      class: 'mas menos', text: '✕', title: 'Borrar el bloque entero',
      onclick: function () {
        U.confirmar('¿Borrar el bloque "' + g.titulo + '"?', function () { U.borrarBloque(g.id); render(); });
      }
    }));
    head.appendChild(U.el('button', {
      class: 'rayo' + (U.bloqueRellenado(g.id) ? ' on' : ''), text: '⚡',
      title: U.bloqueRellenado(g.id)
        ? 'Volver atrás el relleno de este bloque'
        : 'Rellenar los puestos de infantería vacíos de este bloque',
      onclick: function () {
        var n = U.rellenarBloque(g.id);
        render();
        U.toast(n < 0 ? 'Relleno deshecho' : n ? n + ' puestos completados' : 'No quedó gente libre', n ? '' : 'err');
      }
    }));

    head.addEventListener('dragstart', function (e) {
      arrastrandoBloque = g.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'bloque:' + g.id);
      setTimeout(function () { caja.classList.add('moviendo'); }, 0);
    });
    head.addEventListener('dragend', function () {
      caja.classList.remove('moviendo');
      if (!arrastrandoBloque) return;
      arrastrandoBloque = null;
      guardarOrden();
    });

    caja.appendChild(head);
    g.slots.forEach(function (rol, i) { caja.appendChild(slotRow(g, rol, i)); });
    return caja;
  }

  /* pasa el orden que quedó en pantalla al modelo */
  function guardarOrden() {
    var grilla = U.$('#r-grilla'); if (!grilla) return;
    var orden = U.$$('.r-bloque[data-bid]', grilla).map(function (n) { return n.getAttribute('data-bid'); });
    var p = U.partida();
    p.bloques.sort(function (a, b) { return orden.indexOf(a.id) - orden.indexOf(b.id); });
    U.save(); render();
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
    var box = U.el('div', { class: 'r-pie solo-resultado' });
    if (U.resultadoHabilitado(p)) {
      box.appendChild(U.campo('Resultado', p.resultado, function (v) {
        p.resultado = v; U.save(); U.emit('dash'); U.emit('partidas');
      }, { ph: 'ej: 5-0 / 3-2 W' }));
    } else {
      box.appendChild(U.el('div', { class: 'campo bloqueado' }, [
        U.el('span', { text: 'Resultado' }),
        U.el('div', { class: 'inp off', text: 'Se carga después del ' + U.fechaCorta(p.fecha) })
      ]));
    }
    return box;
  }

  /* ================= sidebar =================
     Una sola lista: los convocados de la votación de Discord.
     Se pegan, quedan como pre-lista y de ahí se arrastran al roster.
     Los que no tienen puesto son el banco. */
  var filtro = { q: '', vista: 'conv', unidad: 'Todos' };

  function pintarSidebar() {
    if (!side) return;
    U.vaciar(side);
    var p = U.partida();
    if (!p) return;

    var c = U.contadores();
    var cont4 = U.el('div', { class: 'sb-cont' });
    [['Convocados', p.convocados.length, ''], ['Vinieron', c.asistieron, 'ok'],
     ['Faltaron', c.faltaron, c.faltaron ? 'bad' : ''], ['Sin marcar', c.sinMarcar, c.sinMarcar ? 'warn' : '']]
      .forEach(function (r) {
        cont4.appendChild(U.el('div', { class: 'sb-num ' + r[2] }, [
          U.el('b', { text: r[1] }), U.el('span', { text: r[0] })
        ]));
      });
    side.appendChild(cont4);

    side.appendChild(U.el('button', {
      class: 'btn primary sb-votacion', text: '⇪ Pegar votación de Discord', onclick: pegarVotacion
    }));

    var tabs = U.el('div', { class: 'sb-tabs' });
    [['conv', 'Convocados', p.convocados.length], ['base', 'Toda la base', U.state.miembros.length]].forEach(function (t) {
      tabs.appendChild(U.el('button', {
        class: 'sb-tab' + (filtro.vista === t[0] ? ' on' : ''),
        html: t[1] + ' <b>' + t[2] + '</b>',
        onclick: function () { filtro.vista = t[0]; pintarSidebar(); }
      }));
    });
    side.appendChild(tabs);

    var fila = U.el('div', { class: 'sb-buscar' });
    var buscar = U.el('input', { class: 'inp', placeholder: 'Buscar…', value: filtro.q });
    buscar.addEventListener('input', function () { filtro.q = buscar.value; pintarLista(); });
    fila.appendChild(buscar);
    if (filtro.vista === 'base') {
      var sel = U.el('select', { class: 'inp filtro', title: 'Filtrar por unidad' });
      ['Todos'].concat(U.UNIDADES_MIEMBRO).forEach(function (u) {
        sel.appendChild(U.el('option', { value: u, text: u, selected: u === filtro.unidad ? 'selected' : null }));
      });
      sel.addEventListener('change', function () { filtro.unidad = sel.value; pintarLista(); });
      fila.appendChild(sel);
    }
    side.appendChild(fila);

    var lista = U.el('div', { class: 'sb-list', id: 'sb-list' });
    /* soltar un nombre del roster acá lo devuelve a la pre-lista */
    lista.addEventListener('dragover', function (e) {
      if (!arrastrando || !arrastrando.from) return;
      e.preventDefault(); lista.classList.add('drop');
    });
    lista.addEventListener('dragleave', function (e) { if (e.target === lista) lista.classList.remove('drop'); });
    lista.addEventListener('drop', function (e) {
      lista.classList.remove('drop');
      if (!arrastrando || !arrastrando.from) return;
      e.preventDefault();
      U.asignar(arrastrando.from[0], arrastrando.from[1], null);
      arrastrando = null; render();
    });
    side.appendChild(lista);

    side.appendChild(U.el('div', { class: 'sb-pie' }, [
      U.el('button', { class: 'btn sm', text: '＋ Jugador', onclick: nuevoJugador }),
      U.el('button', {
        class: 'btn sm ghost', text: 'Vaciar roster', onclick: function () {
          U.confirmar('Se borran las asignaciones de esta partida. Los convocados quedan en la lista. ¿Seguimos?', function () {
            var p = U.partida(); p.asignaciones = {}; U.save(); render();
          });
        }
      })
    ]));

    pintarLista();
  }

  function filaJugador(m, extra) {
    var gs = U.gruposDe(m.id);
    var b = gs.length ? U.bloque(gs[0]) : null;
    var row = U.el('div', {
      class: 'sb-row' + (gs.length ? ' asignado' : ''), draggable: 'true',
      title: b ? 'En ' + b.titulo : 'Arrastralo a un puesto del roster',
      style: { '--c': b ? U.unit(b.unidad).color : 'transparent', '--e': U.ESTADO_COLOR[m.estado] || '#5a4d2a' }
    }, [
      U.el('span', { class: 'dot' }),
      U.el('span', { class: 'nm', text: m.nombre }),
      b ? U.el('span', { class: 'donde', text: b.titulo.replace(/ ·.*/, '') }) : null,
      extra
    ]);
    row.addEventListener('dragstart', function (e) { arrastrando = { m: m.id }; e.dataTransfer.setData('text/plain', m.id); });
    row.addEventListener('dragend', function () { arrastrando = null; });
    row.addEventListener('dblclick', function () { editarJugador(m); });
    return row;
  }

  function pintarLista() {
    var lista = U.$('#sb-list'); if (!lista) return;
    var p = U.partida();
    U.vaciar(lista);
    var q = filtro.q.trim().toLowerCase();
    var pasa = function (m) { return m && (!q || m.nombre.toLowerCase().indexOf(q) >= 0); };

    if (filtro.vista === 'conv') {
      var conv = p.convocados.map(U.miembro).filter(pasa);
      if (!p.convocados.length) {
        lista.appendChild(U.el('p', { class: 'sb-vacio', text: 'Pegá la votación de Discord o sumá gente desde “Toda la base”.' }));
        return;
      }
      var libres = conv.filter(function (m) { return !U.gruposDe(m.id).length; });
      var puestos = conv.filter(function (m) { return U.gruposDe(m.id).length; });
      var seccion = function (tit, arr) {
        if (!arr.length) return;
        lista.appendChild(U.el('h4', { class: 'sb-sec', html: tit + ' <b>' + arr.length + '</b>' }));
        arr.forEach(function (m) {
          lista.appendChild(filaJugador(m, U.el('button', {
            class: 'x', text: '✕', title: 'Sacar de los convocados',
            onclick: function (e) { e.stopPropagation(); U.desconvocar(m.id); render(); }
          })));
        });
      };
      seccion('Sin puesto', libres);
      seccion('En el roster', puestos);
      return;
    }

    U.state.miembros
      .filter(function (m) { return pasa(m) && (filtro.unidad === 'Todos' || m.unidad === filtro.unidad); })
      .forEach(function (m) {
        var esta = p.convocados.indexOf(m.id) >= 0;
        lista.appendChild(filaJugador(m, U.el('button', {
          class: 'x mas' + (esta ? ' on' : ''), text: esta ? '✓' : '＋',
          title: esta ? 'Ya está convocado' : 'Sumar a los convocados',
          onclick: function (e) {
            e.stopPropagation();
            if (esta) return;
            U.convocar([m.id]); pintarSidebar();
          }
        })));
      });
  }

  /* ---------------- votación de Discord ----------------
     Se pega tal cual sale del canal: un nombre por línea o separados
     por coma. Se limpian números, viñetas, @ y emojis, y se busca cada
     uno en la base sin importar mayúsculas ni símbolos. */
  function limpio(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9ñáéíóúü]/g, ''); }

  function leerVotacion(txt) {
    var vistos = {}, out = { ok: [], nuevos: [] };
    txt.split(/[\n,;]+/).forEach(function (l) {
      var nom = l.replace(/^\s*(\d+[.)-]?|[-*•·>]+)\s*/, '').replace(/@/g, '')
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}️]/gu, '').trim();
      var k = limpio(nom);
      if (!k || vistos[k]) return;
      vistos[k] = true;
      var m = U.state.miembros.find(function (x) { return limpio(x.nombre) === k; })
        || U.state.miembros.find(function (x) { var n = limpio(x.nombre); return n.length > 2 && (n.indexOf(k) >= 0 || k.indexOf(n) >= 0); });
      if (m) { if (out.ok.indexOf(m) < 0) out.ok.push(m); }
      else out.nuevos.push(nom);
    });
    return out;
  }

  function pegarVotacion() {
    var ta = U.el('textarea', { class: 'inp ta', placeholder: 'Pegá los nombres de la votación.\nUno por línea o separados por coma.' });
    var prev = U.el('div', { class: 'vot-prev' });
    var cuerpo = U.el('div', { class: 'form' }, [ta, prev]);
    var pie = U.el('div', { class: 'modal-pie' });
    var mm = U.modal('Votación de Discord', cuerpo, { pie: pie });
    var r = { ok: [], nuevos: [] };
    function pintar() {
      r = leerVotacion(ta.value);
      U.vaciar(prev);
      if (!r.ok.length && !r.nuevos.length) return;
      prev.appendChild(U.el('p', { class: 'vot-t', text: r.ok.length + ' encontrados en la base' }));
      prev.appendChild(U.el('div', { class: 'vot-chips' }, r.ok.map(function (m) {
        return U.el('span', { class: 'vot-chip ok', text: m.nombre });
      })));
      if (r.nuevos.length) {
        prev.appendChild(U.el('p', { class: 'vot-t', text: r.nuevos.length + ' no están: se agregan a la base' }));
        prev.appendChild(U.el('div', { class: 'vot-chips' }, r.nuevos.map(function (n) {
          return U.el('span', { class: 'vot-chip nuevo', text: n });
        })));
      }
    }
    ta.addEventListener('input', pintar);
    pie.appendChild(U.el('button', { class: 'btn', text: 'Cancelar', onclick: function () { mm.cerrar(); } }));
    pie.appendChild(U.el('button', {
      class: 'btn primary', text: 'Convocar', onclick: function () {
        pintar();
        var ids = r.ok.map(function (m) { return m.id; });
        r.nuevos.forEach(function (n) {
          var nm = { id: U.uid('m'), nombre: n, steam: '', discord: '', unidad: 'Infantería', estado: 'Activo', dias: [], notas: '', partidas: 0, asistencias: 0 };
          U.state.miembros.push(nm); ids.push(nm.id);
        });
        var n = U.convocar(ids);
        filtro.vista = 'conv';
        mm.cerrar(); render(); U.emit('dash');
        U.toast(n + ' convocados' + (r.nuevos.length ? ' · ' + r.nuevos.length + ' nuevos en la base' : ''));
      }
    }));
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
