/* ===================================================================
   store.js — estado único del panel + persistencia.
   Todo vive en localStorage (JSON) y las capturas en IndexedDB
   (pesan demasiado para localStorage). Export/import a archivo .json
   para pasarlo entre PCs hasta que haya backend.
   =================================================================== */
window.U = window.U || {};

U.KEY = 'u235.panel.v1';

U.uid = function (p) { return (p || 'x') + Math.random().toString(36).slice(2, 9); };

/* ---------- partida vacía ---------- */
U.nuevaPartida = function (nombre, formato) {
  formato = formato || 'x36';
  return {
    id: U.uid('p'),
    nombre: nombre || 'Partida sin nombre',
    fecha: new Date().toISOString().slice(0, 10),
    mapa: 'carentan',
    bando: 'Aliados',
    punto: '',
    modo: formato,
    formato: formato,
    bloques: U.plantilla(formato),   // la estructura vive acá: se edita por partida
    server: { name: '', pass: '' },
    briefing: '',
    resultado: '',
    notas: '',
    asignaciones: {},   // "grupo:indice" -> { m: idMiembro, ok: bool }
    extraSlots: {},     // "grupo" -> [rol, rol...]
    convocados: [],     // ids de la votación de Discord: la pre-lista
    strat: {
      mapa: 'carentan',
      espacio: 1920,
      capas: { grid: true, puntos: true },
      activa: 0,
      slides: [{ id: U.uid('s'), nombre: 'Apertura', objs: [] }]
    }
  };
};

/* ---------- carga / guardado ---------- */
U.estadoInicial = function () {
  return {
    v: 2,
    miembros: (U.MEMBERS_SEED || []).map(function (m) {
      return Object.assign({ notas: '', partidas: 0, asistencias: 0 }, m);
    }),
    partidas: [],
    activa: null,
    ui: { tab: 'partidas' }
  };
};

/* carga sincrónica desde este navegador (siempre disponible) */
U.load = function () {
  var raw = null;
  try { raw = localStorage.getItem(U.KEY); } catch (e) { }
  if (raw) {
    try {
      var s = JSON.parse(raw);
      if (s && s.miembros) { U.state = s; U.migrar(); return; }
    } catch (e) { console.warn('estado corrupto, se regenera', e); }
  }
  U.state = U.estadoInicial();
  U.save(true);
};

/* si hay base en la nube, manda ella: pisa lo local y lo deja cacheado */
U.sincronizarInicio = function () {
  return U.db.detectar().then(function (modo) {
    if (modo !== 'nube') return 'local';
    return U.db.cargarTodo().then(function (r) {
      if (!r) return 'local';
      if (r.miembros && r.miembros.length) U.state.miembros = r.miembros;
      else U.db.guardarMiembros(U.state.miembros);          // base vacía: la sembramos
      if (r.partidas) U.state.partidas = r.partidas;
      U.migrar();
      try { localStorage.setItem(U.KEY, JSON.stringify(U.state)); } catch (e) { }
      return 'nube';
    });
  });
};

U.migrar = function () {
  U.state.miembros.forEach(function (m) {
    if (m.partidas == null) m.partidas = 0;
    if (m.asistencias == null) m.asistencias = 0;
    if (!m.dias) m.dias = [];
    // los seis estados del Excel pasaron a tres con semáforo
    if (U.ESTADOS.indexOf(m.estado) < 0) m.estado = U.ESTADO_VIEJO[m.estado] || 'Tibio';
  });
  U.state.partidas.forEach(function (p) {
    if (!p.strat) p.strat = { mapa: p.mapa || 'carentan', activa: 0, slides: [{ id: U.uid('s'), nombre: 'Apertura', objs: [] }] };
    if (!p.strat.capas) p.strat.capas = { grid: true, puntos: true };
    if (!p.strat.espacio) {
      // antes las coordenadas iban en píxeles de la imagen del mapa;
      // ahora todo vive en el espacio fijo de 1920 de la comunidad
      var viejo = p.strat.mapa === 'carentan' ? 1123 : 2000;
      U.reescalar(p.strat, 1920 / viejo);
      p.strat.espacio = 1920;
    }
    if (!p.strat.slides.length) p.strat.slides.push({ id: U.uid('s'), nombre: 'Apertura', objs: [] });
    // la plantilla global pasó a ser parte de cada partida
    if (!p.bloques) {
      if (U.FORMATOS.indexOf(p.modo) < 0) p.modo = 'x49';
      p.formato = p.formato || p.modo;
      p.bloques = U.plantilla(p.formato);
      var ex = p.extraSlots || {};
      Object.keys(ex).forEach(function (gid) {
        var b = p.bloques.find(function (x) { return x.id === gid; });
        if (b) b.slots = b.slots.concat(ex[gid]);
      });
    }
    if (!p.formato) p.formato = U.FORMATOS.indexOf(p.modo) >= 0 ? p.modo : 'x49';
    delete p.extraSlots;
    // banco + roster pasaron a ser una sola lista: los convocados
    if (!p.convocados) {
      p.convocados = (p.reservas || []).slice();
      Object.keys(p.asignaciones).forEach(function (k) {
        var a = p.asignaciones[k];
        if (a && a.m && p.convocados.indexOf(a.m) < 0) p.convocados.push(a.m);
      });
    }
    delete p.reservas;
    // la asistencia pasó de booleano (vino sí/no) a tres estados
    Object.keys(p.asignaciones).forEach(function (k) {
      var a = p.asignaciones[k];
      if (!a) return;
      if (a.est === undefined) { a.est = a.ok ? 'ok' : ''; delete a.ok; }
    });
  });
  if (!U.state.activa || !U.partida()) U.state.activa = U.state.partidas[0] && U.state.partidas[0].id;
};

/* reescala los objetos de un strat cuando cambia el sistema de coordenadas */
U.reescalar = function (st, k) {
  if (!k || k === 1) return;
  (st.slides || []).forEach(function (sl) {
    (sl.objs || []).forEach(function (o) {
      if (o.pts) o.pts = o.pts.map(function (q) { return [q[0] * k, q[1] * k]; });
      ['x', 'y', 'x2', 'y2', 'w', 'h', 'r', 'size'].forEach(function (f) {
        if (typeof o[f] === 'number') o[f] = o[f] * k;
      });
    });
  });
};

var saveT = null, nubeT = null;
U.save = function (inmediato) {
  clearTimeout(saveT);
  var doIt = function () {
    try {
      localStorage.setItem(U.KEY, JSON.stringify(U.state));
      U.flashSave(U.db.esNube() ? 'guardado' : 'guardado local');
    } catch (e) {
      U.flashSave('sin espacio', true);
      console.error(e);
    }
    empujarNube();
  };
  if (inmediato) doIt(); else saveT = setTimeout(doIt, 250);
};

/* manda a la nube lo que se está editando: la base de jugadores y la
   partida activa. Con 1,5s de gracia para no escribir en cada tecla. */
function empujarNube() {
  if (!U.db.esNube()) return;
  clearTimeout(nubeT);
  nubeT = setTimeout(function () {
    U.db.guardarMiembros(U.state.miembros);
    var p = U.partida();
    if (p) U.db.guardarPartida(p);
  }, 1500);
}
U.empujarNube = empujarNube;

/* borrar una partida en los dos lados */
U.borrarPartida = function (id) {
  U.state.partidas = U.state.partidas.filter(function (p) { return p.id !== id; });
  if (U.state.activa === id) U.state.activa = (U.state.partidas[0] || {}).id || null;
  U.db.borrarPartida(id);
  U.save(true);
};

U.flashSave = function (txt, err) {
  var el = document.getElementById('save-ind');
  if (!el) return;
  el.textContent = '● ' + txt;
  el.classList.toggle('err', !!err);
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('on'); }, 1400);
};

/* ---------- accesores ---------- */
U.partida = function () {
  return U.state.partidas.find(function (p) { return p.id === U.state.activa; });
};
U.miembro = function (id) {
  return U.state.miembros.find(function (m) { return m.id === id; });
};
U.nombreMiembro = function (id) {
  var m = U.miembro(id); return m ? m.nombre : '';
};

/* ---------- bloques del roster (viven dentro de la partida) ---------- */
U.bloques = function () { var p = U.partida(); return (p && p.bloques) || []; };
U.bloque = function (id) { return U.bloques().find(function (b) { return b.id === id; }); };
U.group = U.bloque;                       // alias histórico
U.slotsDe = function (gid) { var b = U.bloque(gid); return b ? b.slots : []; };

/* renombrar */
U.renombrarBloque = function (id, titulo) {
  var b = U.bloque(id); if (!b || !titulo) return;
  b.titulo = titulo; U.save(); U.emit('roster');
};

/* mover un bloque a otra posición de la grilla */
U.moverBloque = function (id, destino) {
  var bs = U.bloques();
  var i = bs.findIndex(function (b) { return b.id === id; });
  if (i < 0) return;
  var b = bs.splice(i, 1)[0];
  bs.splice(Math.max(0, Math.min(destino, bs.length)), 0, b);
  U.save(); U.emit('roster');
};

/* agregar / quitar / cambiar slots, corrigiendo las asignaciones */
U.agregarSlot = function (gid, rol) {
  var b = U.bloque(gid); if (!b) return;
  b.slots.push(rol || b.extra || 'INFANTRY');
  U.save(); U.emit('roster');
};
U.quitarSlot = function (gid, i) {
  var b = U.bloque(gid), p = U.partida(); if (!b) return;
  b.slots.splice(i, 1);
  // las claves son "bloque:indice": hay que correrlas una posición
  var nuevas = {};
  Object.keys(p.asignaciones).forEach(function (k) {
    var parte = k.split(':');
    if (parte[0] !== gid) { nuevas[k] = p.asignaciones[k]; return; }
    var idx = +parte[1];
    if (idx === i) return;                 // el que se borró
    nuevas[gid + ':' + (idx > i ? idx - 1 : idx)] = p.asignaciones[k];
  });
  p.asignaciones = nuevas;
  U.save(); U.emit('roster');
};
U.cambiarRol = function (gid, i, rol) {
  var b = U.bloque(gid); if (!b) return;
  b.slots[i] = rol; U.save(); U.emit('roster');
};
U.borrarBloque = function (id) {
  var p = U.partida();
  p.bloques = p.bloques.filter(function (b) { return b.id !== id; });
  Object.keys(p.asignaciones).forEach(function (k) {
    if (k.split(':')[0] === id) delete p.asignaciones[k];
  });
  U.save(); U.emit('roster');
};
U.agregarBloque = function (base) {
  var p = U.partida();
  var b = Object.assign({
    id: U.uid('b'), titulo: 'NUEVO BLOQUE', unidad: 'free', tipo: 'escuadra',
    extra: 'INFANTRY', slots: ['SL', 'INFANTRY', 'INFANTRY']
  }, base || {});
  p.bloques.push(b);
  U.save(); U.emit('roster');
  return b;
};

/* cambiar el formato: vuelve a la plantilla, conservando lo que encaje */
U.cambiarFormato = function (formato) {
  var p = U.partida(); if (!p) return;
  p.formato = formato; p.modo = formato;
  p.bloques = U.plantilla(formato);
  // se conservan solo las asignaciones que siguen teniendo slot
  var nuevas = {};
  Object.keys(p.asignaciones).forEach(function (k) {
    var parte = k.split(':'), b = U.bloque(parte[0]);
    if (b && b.slots[+parte[1]]) nuevas[k] = p.asignaciones[k];
  });
  p.asignaciones = nuevas;
  U.save(); U.emit('roster'); U.emit('todo');
};

/* ---------- rellenar la infantería que falta ----------
   No toca a los que ya tienen tarea de apertura (ingenieros y choferes)
   ni repite gente que ya está en otra escuadra. Las cajas de supply sí
   pueden estar en los dos lados. */
/* candidatos libres, ordenados por estado */
U.disponibles = function () {
  var p = U.partida(); if (!p) return [];
  var conTarea = {}, enEscuadra = {};
  Object.keys(p.asignaciones).forEach(function (k) {
    var a = p.asignaciones[k]; if (!a || !a.m) return;
    var gid = k.split(':')[0], i = +k.split(':')[1];
    var b = U.bloque(gid); if (!b) return;
    var rol = b.slots[i];
    if (U.ROLES_TAREA.indexOf(rol) >= 0) conTarea[a.m] = true;
    if (b.tipo === 'escuadra') enEscuadra[a.m] = true;
  });
  var orden = { 'Activo': 0, 'Tibio': 1, 'Inactivo': 2 };
  var conv = p.convocados || [];
  return U.state.miembros.filter(function (m) {
    if (conTarea[m.id] || enEscuadra[m.id]) return false;
    // si ya se cargó la votación, se rellena solo con los convocados
    if (conv.length) return conv.indexOf(m.id) >= 0;
    return m.estado !== 'Inactivo';
  }).sort(function (a, b) { return (orden[a.estado] || 9) - (orden[b.estado] || 9); });
};

/* Rellena un solo bloque. Guarda cómo estaba para poder volver atrás
   con el mismo botón. */
U._antesDeRellenar = {};
U.bloqueRellenado = function (gid) { return !!U._antesDeRellenar[gid]; };
U.rellenarBloque = function (gid) {
  var p = U.partida(), b = U.bloque(gid);
  if (!p || !b) return 0;

  if (U._antesDeRellenar[gid]) {            // segundo toque: deshacer
    var antes = U._antesDeRellenar[gid];
    delete U._antesDeRellenar[gid];
    Object.keys(p.asignaciones).forEach(function (k) {
      if (k.split(':')[0] === gid) delete p.asignaciones[k];
    });
    Object.keys(antes).forEach(function (k) { p.asignaciones[k] = antes[k]; });
    U.save(); U.emit('roster');
    return -1;
  }

  var copia = {};
  Object.keys(p.asignaciones).forEach(function (k) {
    if (k.split(':')[0] === gid) copia[k] = JSON.parse(JSON.stringify(p.asignaciones[k]));
  });

  /* los líderes y las tareas de apertura se eligen a mano */
  var aMano = U.ROLES_TAREA.concat(['SL', 'SL (PUSH)', 'SL (HOLD)', 'COMMANDER', 'CAP']);
  var prefiere = b.tipo === 'tanque' ? 'Tanquistas' : null;
  var libres = U.disponibles();
  if (prefiere) {
    var propios = libres.filter(function (m) { return m.unidad === prefiere; });
    var resto = libres.filter(function (m) { return m.unidad !== prefiere; });
    libres = propios.concat(resto);
  }
  var n = 0;
  b.slots.forEach(function (rol, i) {
    if (aMano.indexOf(rol) >= 0) return;
    if (p.asignaciones[gid + ':' + i]) return;
    var m = libres.shift(); if (!m) return;
    p.asignaciones[gid + ':' + i] = { m: m.id, est: '' };
    n++;
  });
  if (n) U._antesDeRellenar[gid] = copia;
  U.save(); U.emit('roster');
  return n;
};

U.rellenar = function () {
  var p = U.partida(); if (!p) return 0;
  var conTarea = {}, enEscuadra = {};
  Object.keys(p.asignaciones).forEach(function (k) {
    var a = p.asignaciones[k]; if (!a || !a.m) return;
    var gid = k.split(':')[0], i = +k.split(':')[1];
    var b = U.bloque(gid); if (!b) return;
    var rol = b.slots[i];
    if (U.ROLES_TAREA.indexOf(rol) >= 0) conTarea[a.m] = true;
    if (b.tipo === 'escuadra') enEscuadra[a.m] = true;
  });

  var orden = { 'Activo': 0, 'Tibio': 1, 'Inactivo': 2 };
  var candidatos = U.state.miembros.filter(function (m) {
    if (conTarea[m.id] || enEscuadra[m.id]) return false;
    if (m.estado === 'Inactivo') return false;
    return !m.unidad || m.unidad === 'Infantería' || m.unidad === 'Oficiales' || m.unidad === 'Reservas';
  }).sort(function (a, b) { return (orden[a.estado] || 9) - (orden[b.estado] || 9); });

  var n = 0;
  U.bloques().forEach(function (b) {
    if (b.tipo !== 'escuadra') return;
    b.slots.forEach(function (rol, i) {
      if (U.ROLES_RELLENO.indexOf(rol) < 0) return;
      if (p.asignaciones[b.id + ':' + i]) return;
      var m = candidatos.shift(); if (!m) return;
      p.asignaciones[b.id + ':' + i] = { m: m.id, est: '' };
      n++;
    });
  });
  U.save(); U.emit('roster');
  return n;
};

/* asignación de un slot */
U.asig = function (gid, i) {
  var p = U.partida(); if (!p) return null;
  return p.asignaciones[gid + ':' + i] || null;
};
U.asignar = function (gid, i, memberId) {
  var p = U.partida(); if (!p) return;
  var k = gid + ':' + i;
  if (!memberId) { delete p.asignaciones[k]; }
  else {
    // un jugador puede repetirse (tarea de apertura + escuadra), pero no
    // dos veces en el mismo bloque
    p.asignaciones[k] = { m: memberId, est: (p.asignaciones[k] || {}).est || '' };
    if (p.convocados.indexOf(memberId) < 0) p.convocados.push(memberId);
  }
  U.save(); U.emit('roster');
};
/* ---------- convocados (la votación de Discord) ---------- */
U.convocar = function (ids) {
  var p = U.partida(); if (!p) return 0;
  var n = 0;
  ids.forEach(function (id) { if (p.convocados.indexOf(id) < 0) { p.convocados.push(id); n++; } });
  U.save(); U.emit('roster');
  return n;
};
/* sacarlo de la lista también lo saca del roster */
U.desconvocar = function (id) {
  var p = U.partida(); if (!p) return;
  p.convocados = p.convocados.filter(function (x) { return x !== id; });
  Object.keys(p.asignaciones).forEach(function (k) {
    if (p.asignaciones[k] && p.asignaciones[k].m === id) delete p.asignaciones[k];
  });
  U.save(); U.emit('roster');
};

/* el resultado se carga recién desde las 00:00 del día siguiente */
U.resultadoHabilitado = function (p) {
  if (!p || !p.fecha) return true;
  var f = String(p.fecha).split('-');
  if (f.length !== 3) return true;
  var diaSiguiente = new Date(+f[0], +f[1] - 1, +f[2] + 1, 0, 0, 0);
  return Date.now() >= diaSiguiente.getTime();
};
U.fechaCorta = function (iso) {
  var f = String(iso || '').split('-');
  return f.length === 3 ? f[2] + '/' + f[1] : iso;
};

/* ciclo de asistencia: sin marcar -> vino -> faltó -> sin marcar */
U.ciclarAsistencia = function (gid, i) {
  var p = U.partida(); if (!p) return;
  var a = p.asignaciones[gid + ':' + i];
  if (!a) return;
  a.est = U.ASISTENCIA_SIGUIENTE[a.est || ''];
  U.save(); U.emit('roster');
};

/* dónde está asignado un miembro (devuelve lista de grupos) */
U.gruposDe = function (memberId) {
  var p = U.partida(); if (!p) return [];
  var gs = [];
  Object.keys(p.asignaciones).forEach(function (k) {
    if (p.asignaciones[k].m === memberId) {
      var gid = k.split(':')[0];
      if (gs.indexOf(gid) < 0) gs.push(gid);
    }
  });
  return gs;
};

/* plantel de un grupo, ordenado por slot, con rol y presencia */
U.plantel = function (gid) {
  var p = U.partida(); if (!p) return [];
  var slots = U.slotsDe(gid), out = [];
  slots.forEach(function (rol, i) {
    var a = p.asignaciones[gid + ':' + i];
    if (a && a.m) out.push({ rol: rol, id: a.m, nombre: U.nombreMiembro(a.m), est: a.est || '', i: i });
  });
  return out;
};

/* contadores del pie de la hoja.
   Un jugador cuenta una sola vez aunque esté en dos bloques. */
U.contadores = function () {
  var p = U.partida();
  var vacio = { total: 0, asistieron: 0, faltaron: 0, sinMarcar: 0 };
  if (!p) return vacio;
  var est = {};
  Object.keys(p.asignaciones).forEach(function (k) {
    var a = p.asignaciones[k];
    if (!a || !a.m) return;
    var e = a.est || '';
    // gana la marca más fuerte: vino > faltó > sin marcar
    if (est[a.m] === 'ok') return;
    if (e === 'ok' || !est[a.m] || (est[a.m] === '' && e)) est[a.m] = e;
  });
  var r = { total: 0, asistieron: 0, faltaron: 0, sinMarcar: 0 };
  Object.keys(est).forEach(function (id) {
    r.total++;
    if (est[id] === 'ok') r.asistieron++;
    else if (est[id] === 'falta') r.faltaron++;
    else r.sinMarcar++;
  });
  r.estados = est;
  return r;
};

/* ---------- eventos internos ---------- */
U._subs = {};
U.on = function (ev, fn) { (U._subs[ev] = U._subs[ev] || []).push(fn); };
U.emit = function (ev, data) { (U._subs[ev] || []).forEach(function (f) { f(data); }); (U._subs['*'] || []).forEach(function (f) { f(ev, data); }); };

/* ---------- capturas (IndexedDB) ---------- */
U.shots = (function () {
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('u235-shots', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('shots'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  return {
    put: function (id, dataUrl) {
      U.db.guardarCaptura(id, dataUrl);   // que la vean los demás
      return db().then(function (d) {
        return new Promise(function (res) {
          var tx = d.transaction('shots', 'readwrite');
          tx.objectStore('shots').put(dataUrl, id);
          tx.oncomplete = function () { res(id); };
          tx.onerror = function () { console.warn('IndexedDB rechazó la captura', tx.error); res(id); };
        });
      }).catch(function (e) {
        // modo incógnito o almacenamiento bloqueado: la captura vive en
        // memoria y en la nube, el pin se crea igual
        console.warn('sin IndexedDB, la captura no queda cacheada acá', e);
        return id;
      });
    },
    get: function (id) {
      return db().then(function (d) {
        return new Promise(function (res, rej) {
          var tx = d.transaction('shots', 'readonly');
          var q = tx.objectStore('shots').get(id);
          q.onsuccess = function () { res(q.result || null); };
          q.onerror = function () { rej(q.error); };
        });
      }).catch(function () { return null; }).then(function (local) {
        if (local) return local;
        // no está en este navegador: la pedimos a la base y la cacheamos
        return U.db.leerCaptura(id).then(function (remota) {
          if (remota) {
            db().then(function (d) {
              var tx = d.transaction('shots', 'readwrite');
              tx.objectStore('shots').put(remota, id);
            });
          }
          return remota;
        });
      });
    },
    del: function (id) {
      return db().then(function (d) {
        var tx = d.transaction('shots', 'readwrite');
        tx.objectStore('shots').delete(id);
      });
    },
    all: function () {
      return db().then(function (d) {
        return new Promise(function (res) {
          var out = {}, tx = d.transaction('shots', 'readonly'), st = tx.objectStore('shots');
          var c = st.openCursor();
          c.onsuccess = function (e) {
            var cur = e.target.result;
            if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out);
          };
        });
      });
    }
  };
})();

/* redimensiona una captura antes de guardarla: 1600px de ancho máximo */
U.optimizarImagen = function (file, max) {
  max = max || 1600;
  return new Promise(function (res, rej) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.width, h = img.height;
          if (w > max) { h = Math.round(h * max / w); w = max; }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          res({ url: c.toDataURL('image/jpeg', 0.78), w: w, h: h });
        } catch (e) {
          // canvas "sucio" o sin memoria: la usamos tal cual vino
          console.warn('no se pudo reescalar la captura, se guarda original', e);
          res({ url: fr.result, w: img.width, h: img.height });
        }
      };
      img.onerror = function () { res({ url: fr.result, w: 0, h: 0 }); };
      img.src = fr.result;
    };
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
};

/* ---------- export / import ---------- */
U.exportar = function (conCapturas) {
  var base = { app: 'uranium-panel', v: 1, fecha: new Date().toISOString(), state: U.state };
  var fin = function (obj) {
    var blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'uranium-panel-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };
  if (conCapturas) U.shots.all().then(function (s) { base.shots = s; fin(base); });
  else fin(base);
};

U.importar = function (file) {
  return new Promise(function (res, rej) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var obj = JSON.parse(fr.result);
        if (!obj.state || !obj.state.miembros) throw new Error('archivo no reconocido');
        U.state = obj.state; U.migrar(); U.save(true);
        var ps = [];
        if (obj.shots) Object.keys(obj.shots).forEach(function (k) { ps.push(U.shots.put(k, obj.shots[k])); });
        Promise.all(ps).then(function () { res(); });
      } catch (e) { rej(e); }
    };
    fr.onerror = rej;
    fr.readAsText(file);
  });
};
