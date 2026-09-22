/* ===================================================================
   ui.js — helpers compartidos: creación de nodos, modales, toasts,
   selector de jugador. Sin dependencias externas.
   =================================================================== */
window.U = window.U || {};

U.el = function (tag, attrs, kids) {
  var n = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
    else if (k === 'style' && typeof attrs[k] === 'object') {
      Object.keys(attrs[k]).forEach(function (pk) {
        if (pk.slice(0, 2) === '--') n.style.setProperty(pk, attrs[k][pk]);
        else n.style[pk] = attrs[k][pk];
      });
    }
    else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  });
  (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return n;
};
U.$ = function (s, r) { return (r || document).querySelector(s); };
U.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
U.vaciar = function (n) { while (n && n.firstChild) n.removeChild(n.firstChild); return n; };

U.toast = function (txt, tipo) {
  var c = U.$('#toasts') || document.body.appendChild(U.el('div', { id: 'toasts' }));
  var t = U.el('div', { class: 'toast ' + (tipo || ''), text: txt });
  c.appendChild(t);
  setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 2600);
};

/* ---------- modal genérico ---------- */
U.modal = function (titulo, contenido, opts) {
  opts = opts || {};
  var back = U.el('div', { class: 'modal-back' });
  var box = U.el('div', { class: 'modal ' + (opts.clase || '') });
  var head = U.el('div', { class: 'modal-head' }, [
    U.el('h3', { text: titulo }),
    U.el('button', { class: 'x', text: '✕', onclick: cerrar })
  ]);
  var body = U.el('div', { class: 'modal-body' });
  if (typeof contenido === 'string') body.innerHTML = contenido; else body.appendChild(contenido);
  box.appendChild(head); box.appendChild(body);
  if (opts.pie) box.appendChild(opts.pie);
  back.appendChild(box);
  back.addEventListener('mousedown', function (e) { if (e.target === back) cerrar(); });
  document.body.appendChild(back);
  function esc(e) { if (e.key === 'Escape') cerrar(); }
  document.addEventListener('keydown', esc);
  function cerrar() { document.removeEventListener('keydown', esc); back.remove(); if (opts.alCerrar) opts.alCerrar(); }
  back.cerrar = cerrar;
  setTimeout(function () { var f = box.querySelector('input,select,textarea'); if (f && !opts.noFoco) f.focus(); }, 30);
  return back;
};

U.confirmar = function (txt, fn) {
  var pie = U.el('div', { class: 'modal-pie' });
  var m = U.modal('Confirmar', U.el('p', { text: txt }), { pie: pie, clase: 'sm' });
  pie.appendChild(U.el('button', { class: 'btn', text: 'Cancelar', onclick: function () { m.cerrar(); } }));
  pie.appendChild(U.el('button', { class: 'btn danger', text: 'Sí, dale', onclick: function () { m.cerrar(); fn(); } }));
};

/* ---------- selector de jugador (buscador) ---------- */
U.elegirJugador = function (opts) {
  opts = opts || {};
  var wrap = U.el('div', { class: 'picker' });
  var inp = U.el('input', { class: 'inp', placeholder: 'Buscar jugador…', autocomplete: 'off' });
  var lista = U.el('div', { class: 'picker-list' });
  wrap.appendChild(inp); wrap.appendChild(lista);
  var m = U.modal(opts.titulo || 'Asignar jugador', wrap, { clase: 'sm' });
  var idx = -1, filtrados = [];

  function pintar() {
    var q = inp.value.trim().toLowerCase();
    filtrados = U.state.miembros.filter(function (mb) {
      return !q || mb.nombre.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 60);
    U.vaciar(lista);
    if (opts.permitirVacio) {
      lista.appendChild(U.el('div', {
        class: 'pick vaciar', html: '<b>— vaciar slot —</b>',
        onclick: function () { m.cerrar(); opts.ok(null); }
      }));
    }
    filtrados.forEach(function (mb, i) {
      var gs = U.gruposDe(mb.id);
      var tags = gs.map(function (g) {
        var gr = U.group(g); if (!gr) return '';
        return '<span class="mini" style="--c:' + U.unit(gr.unidad).color + '">' + gr.titulo.split('·')[0].trim() + '</span>';
      }).join('');
      var row = U.el('div', {
        class: 'pick' + (i === idx ? ' on' : ''),
        html: '<span class="nm">' + mb.nombre + '</span><span class="tg">' + tags + '</span>',
        onclick: function () { m.cerrar(); opts.ok(mb.id); }
      });
      lista.appendChild(row);
    });
    if (!filtrados.length && inp.value.trim()) {
      lista.appendChild(U.el('div', {
        class: 'pick nuevo', html: '➕ Crear <b>' + inp.value.trim() + '</b> y asignarlo',
        onclick: function () {
          var nm = inp.value.trim();
          var nuevo = { id: U.uid('m'), nombre: nm, steam: '', discord: '', unidad: 'Infantería', estado: 'Activo', dias: [], notas: '', partidas: 0, asistencias: 0 };
          U.state.miembros.push(nuevo); U.save();
          m.cerrar(); opts.ok(nuevo.id);
        }
      }));
    }
  }
  inp.addEventListener('input', function () { idx = -1; pintar(); });
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, filtrados.length - 1); pintar(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); pintar(); e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (filtrados[idx < 0 ? 0 : idx]) { m.cerrar(); opts.ok(filtrados[idx < 0 ? 0 : idx].id); }
    }
  });
  pintar();
  return m;
};

/* campo de texto etiquetado */
U.campo = function (label, valor, onChange, opts) {
  opts = opts || {};
  var inp;
  if (opts.lista) {
    inp = U.el('input', { class: 'inp', value: valor || '', placeholder: opts.ph || '', autocomplete: 'off' });
    var lid = 'dl' + U.uid('');
    var dl = U.el('datalist', { id: lid });
    (opts.lista || []).forEach(function (o) { dl.appendChild(U.el('option', { value: o })); });
    inp.setAttribute('list', lid);
    inp.addEventListener('change', function () { onChange(inp.value); });
    return U.el('label', { class: 'campo' }, [U.el('span', { text: label }), inp, dl]);
  }
  if (opts.opciones) {
    inp = U.el('select', { class: 'inp' });
    (opts.vacio ? [''] : []).concat(opts.opciones).forEach(function (o) {
      inp.appendChild(U.el('option', { value: o, text: o || '—', selected: o === valor ? 'selected' : null }));
    });
  } else if (opts.tipo === 'date') {
    inp = U.el('input', { class: 'inp', type: 'date', value: valor || '', min: '2024-01-01', max: '2030-12-31' });
    inp.addEventListener('click', function () { try { inp.showPicker(); } catch (e) {} });
  } else {
    inp = U.el('input', { class: 'inp', value: valor || '', type: opts.tipo || 'text', placeholder: opts.ph || '' });
  }
  inp.addEventListener('change', function () { onChange(inp.value); });
  return U.el('label', { class: 'campo' }, [U.el('span', { text: label }), inp]);
};

/* lightbox de capturas */
U.verCaptura = function (dataUrl, titulo) {
  var img = U.el('img', { src: dataUrl, class: 'lb-img' });
  U.modal(titulo || 'Captura', img, { clase: 'lg' });
};

/* ---------- pedir un texto sin depender de prompt() ----------
   prompt() lo bloquean los iframes con sandbox y algunos navegadores
   cuando el usuario marca "no mostrar más diálogos". Este siempre anda. */
U.pedirTexto = function (titulo, valor, ok, opts) {
  opts = opts || {};
  var inp = U.el('input', { class: 'inp', value: valor || '', placeholder: opts.ph || '', autocomplete: 'off' });
  var cuerpo = U.el('div', { class: 'form' }, [
    opts.ayuda ? U.el('p', { class: 'ayuda', text: opts.ayuda }) : null,
    inp
  ]);
  var pie = U.el('div', { class: 'modal-pie' });
  var m = U.modal(titulo, cuerpo, { pie: pie });
  function aceptar() { m.cerrar(); ok(inp.value.trim()); }
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); aceptar(); } });
  pie.appendChild(U.el('button', {
    class: 'btn', text: opts.cancelar || 'Cancelar',
    onclick: function () { m.cerrar(); if (opts.alCancelar) opts.alCancelar(); }
  }));
  pie.appendChild(U.el('button', { class: 'btn primary', text: opts.boton || 'Guardar', onclick: aceptar }));
  return m;
};

/* ---------- selector de archivos ----------
   El input tiene que estar en el DOM: si está suelto, varios navegadores
   ignoran el click() y no se abre nada. */
U.elegirArchivo = function (accept, ok) {
  var inp = U.el('input', {
    type: 'file', accept: accept || 'image/*',
    style: { position: 'fixed', left: '-9999px', top: '0', opacity: '0' }
  });
  document.body.appendChild(inp);
  var listo = false;
  inp.addEventListener('change', function () {
    listo = true;
    var f = inp.files && inp.files[0];
    inp.remove();
    if (f) ok(f);
  });
  // si cancela el diálogo no llega ningún evento: limpiamos al volver el foco
  window.addEventListener('focus', function limpiar() {
    setTimeout(function () {
      if (!listo && inp.parentNode) inp.remove();
      window.removeEventListener('focus', limpiar);
    }, 800);
  });
  inp.click();
  return inp;
};
