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
U.nuevaPartida = function (nombre) {
  return {
    id: U.uid('p'),
    nombre: nombre || 'Partida sin nombre',
    fecha: new Date().toISOString().slice(0, 10),
    mapa: 'carentan',
    bando: 'Aliados',
    punto: '',
    modo: 'Warfare',
    server: { name: '', pass: '' },
    briefing: '',
    resultado: '',
    notas: '',
    asignaciones: {},   // "grupo:indice" -> { m: idMiembro, ok: bool }
    extraSlots: {},     // "grupo" -> [rol, rol...]
    reservas: [],       // ids de miembros en banco
    strat: {
      mapa: 'carentan',
      activa: 0,
      slides: [{ id: U.uid('s'), nombre: 'Apertura', objs: [] }]
    }
  };
};

/* ---------- carga / guardado ---------- */
U.load = function () {
  var raw = null;
  try { raw = localStorage.getItem(U.KEY); } catch (e) { }
  if (raw) {
    try {
      var s = JSON.parse(raw);
      if (s && s.miembros) { U.state = s; U.migrar(); return; }
    } catch (e) { console.warn('estado corrupto, se regenera', e); }
  }
  U.state = {
    v: 1,
    miembros: (U.MEMBERS_SEED || []).map(function (m) { return Object.assign({ notas: '', partidas: 0, asistencias: 0 }, m); }),
    partidas: [],
    activa: null,
    ui: { tab: 'dashboard' }
  };
  var p = U.nuevaPartida('Próxima partida');
  U.state.partidas.push(p);
  U.state.activa = p.id;
  U.save();
};

U.migrar = function () {
  U.state.miembros.forEach(function (m) {
    if (m.partidas == null) m.partidas = 0;
    if (m.asistencias == null) m.asistencias = 0;
    if (!m.dias) m.dias = [];
  });
  U.state.partidas.forEach(function (p) {
    if (!p.strat) p.strat = { mapa: p.mapa || 'carentan', activa: 0, slides: [{ id: U.uid('s'), nombre: 'Apertura', objs: [] }] };
    if (!p.strat.slides.length) p.strat.slides.push({ id: U.uid('s'), nombre: 'Apertura', objs: [] });
    if (!p.extraSlots) p.extraSlots = {};
    if (!p.reservas) p.reservas = [];
  });
  if (!U.state.activa || !U.partida()) U.state.activa = U.state.partidas[0] && U.state.partidas[0].id;
};

var saveT = null;
U.save = function (inmediato) {
  clearTimeout(saveT);
  var doIt = function () {
    try {
      localStorage.setItem(U.KEY, JSON.stringify(U.state));
      U.flashSave('guardado');
    } catch (e) {
      U.flashSave('sin espacio', true);
      console.error(e);
    }
  };
  if (inmediato) doIt(); else saveT = setTimeout(doIt, 250);
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

/* slots efectivos de un grupo (plantilla + agregados de esta partida) */
U.slotsDe = function (gid) {
  var g = U.group(gid), p = U.partida();
  if (!g) return [];
  return g.slots.concat((p && p.extraSlots[gid]) || []);
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
    p.asignaciones[k] = { m: memberId, ok: (p.asignaciones[k] || {}).ok || false };
  }
  U.save(); U.emit('roster');
};
U.togglePresente = function (gid, i) {
  var p = U.partida(); if (!p) return;
  var a = p.asignaciones[gid + ':' + i];
  if (a) { a.ok = !a.ok; U.save(); U.emit('roster'); }
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
    if (a && a.m) out.push({ rol: rol, id: a.m, nombre: U.nombreMiembro(a.m), ok: a.ok, i: i });
  });
  return out;
};

/* contadores del pie de la hoja */
U.contadores = function () {
  var p = U.partida(); if (!p) return { total: 0, asistieron: 0, faltaron: 0 };
  var total = 0, ok = 0, vistos = {};
  Object.keys(p.asignaciones).forEach(function (k) {
    var a = p.asignaciones[k];
    if (!a || !a.m) return;
    if (vistos[a.m]) { if (a.ok) vistos[a.m] = 2; return; }
    vistos[a.m] = a.ok ? 2 : 1;
  });
  Object.keys(vistos).forEach(function (id) { total++; if (vistos[id] === 2) ok++; });
  return { total: total, asistieron: ok, faltaron: total - ok };
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
      return db().then(function (d) {
        return new Promise(function (res, rej) {
          var tx = d.transaction('shots', 'readwrite');
          tx.objectStore('shots').put(dataUrl, id);
          tx.oncomplete = function () { res(id); };
          tx.onerror = function () { rej(tx.error); };
        });
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
        var w = img.width, h = img.height;
        if (w > max) { h = Math.round(h * max / w); w = max; }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        res({ url: c.toDataURL('image/jpeg', 0.78), w: w, h: h });
      };
      img.onerror = rej;
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
