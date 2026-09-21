/* ===================================================================
   db.js — base de datos compartida.

   Dos modos, se elige solo al arrancar:
   · NUBE  — hay una función de Netlify respondiendo en
             /.netlify/functions/panel (guarda en Netlify Blobs).
             Todos los que abran la web ven lo mismo.
   · LOCAL — no hay backend (archivo abierto a mano, artifact, etc).
             Todo queda en este navegador y se mueve con export/import.

   El resto del panel no sabe en cuál está: llama a U.db y listo.
   =================================================================== */
window.U = window.U || {};

U.db = (function () {
  var BASE = '/.netlify/functions/panel';
  var modo = 'local';
  var token = '';
  try { token = localStorage.getItem('u235.token') || ''; } catch (e) { }

  function url(op, extra) {
    return BASE + '?op=' + op + (extra || '');
  }
  function pedir(op, opts) {
    opts = opts || {};
    var h = { 'Content-Type': 'application/json' };
    if (token) h['X-Panel-Token'] = token;
    return fetch(url(op, opts.extra), {
      method: opts.metodo || 'GET',
      headers: h,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 401) {
        var t = prompt('Esta base pide clave de acceso:');
        if (t) {
          token = t;
          try { localStorage.setItem('u235.token', t); } catch (e) { }
          return pedir(op, opts);
        }
        throw new Error('sin permiso');
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* --- ¿hay backend? --- */
  function detectar() {
    return pedir('ping')
      .then(function (r) { modo = r && r.ok ? 'nube' : 'local'; return modo; })
      .catch(function () { modo = 'local'; return modo; });
  }

  /* --- lectura completa --- */
  function cargarTodo() {
    if (modo !== 'nube') return Promise.resolve(null);
    return pedir('todo').catch(function (e) {
      console.warn('no se pudo leer la nube, se sigue local', e);
      modo = 'local';
      return null;
    });
  }

  /* --- escrituras (silenciosas: si fallan, queda el local) --- */
  function guardarMiembros(ms) {
    if (modo !== 'nube') return Promise.resolve();
    return pedir('miembros', { metodo: 'PUT', body: ms }).catch(avisar);
  }
  function guardarPartida(p) {
    if (modo !== 'nube') return Promise.resolve();
    return pedir('partida', { metodo: 'PUT', extra: '&id=' + encodeURIComponent(p.id), body: p }).catch(avisar);
  }
  function borrarPartida(id) {
    if (modo !== 'nube') return Promise.resolve();
    return pedir('partida', { metodo: 'DELETE', extra: '&id=' + encodeURIComponent(id) }).catch(avisar);
  }
  function guardarCaptura(id, dataUrl) {
    if (modo !== 'nube') return Promise.resolve();
    return pedir('captura', { metodo: 'PUT', extra: '&id=' + encodeURIComponent(id), body: { d: dataUrl } }).catch(avisar);
  }
  function leerCaptura(id) {
    if (modo !== 'nube') return Promise.resolve(null);
    return pedir('captura', { extra: '&id=' + encodeURIComponent(id) })
      .then(function (r) { return r && r.d; })
      .catch(function () { return null; });
  }

  var aviso = 0;
  function avisar(e) {
    console.warn('fallo al guardar en la nube', e);
    if (Date.now() - aviso > 20000) {
      aviso = Date.now();
      if (U.toast) U.toast('Sin conexión con la base: se guarda local', 'err');
    }
  }

  return {
    get modo() { return modo; },
    esNube: function () { return modo === 'nube'; },
    detectar: detectar,
    cargarTodo: cargarTodo,
    guardarMiembros: guardarMiembros,
    guardarPartida: guardarPartida,
    borrarPartida: borrarPartida,
    guardarCaptura: guardarCaptura,
    leerCaptura: leerCaptura
  };
})();
