/* ===================================================================
   main.js — arranque, pestañas y barra superior.
   =================================================================== */
window.U = window.U || {};

U.tab = function (id) {
  U.state.ui.tab = id;
  U.$$('.tabbtn').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === id); });
  U.$$('.vista').forEach(function (v) { v.classList.toggle('on', v.id === 'v-' + id); });
  U.save();
  if (id === 'dashboard') U.dash.render();
  if (id === 'roster') U.roster.render();
  if (id === 'strat') U.sketch.render();
};

U.arrancar = function () {
  U.load();

  /* --- barra superior --- */
  var bar = U.$('#topbar');
  var sel = U.el('select', { class: 'inp partida-sel', id: 'sel-partida' });
  function pintarSel() {
    U.vaciar(sel);
    U.state.partidas.forEach(function (p) {
      sel.appendChild(U.el('option', { value: p.id, text: p.nombre + ' · ' + p.fecha, selected: p.id === U.state.activa ? 'selected' : null }));
    });
  }
  pintarSel();
  sel.addEventListener('change', function () {
    U.state.activa = sel.value; U.save();
    U.dash.render(); U.roster.render(); U.sketch.recargarMapa();
  });

  bar.appendChild(U.el('a', { class: 'marca', href: '../index.html' }, [
    U.el('img', { src: '../media/logo-mark.png', alt: '' }),
    U.el('span', { html: 'URANIUM 235<small>Panel de operaciones</small>' })
  ]));

  var tabs = U.el('div', { class: 'tabs' });
  [['dashboard', 'Dashboard'], ['roster', 'Roster'], ['strat', 'Estrategia']].forEach(function (t) {
    tabs.appendChild(U.el('button', { class: 'tabbtn', 'data-tab': t[0], text: t[1], onclick: function () { U.tab(t[0]); } }));
  });
  bar.appendChild(tabs);

  var der = U.el('div', { class: 'bar-der' });
  der.appendChild(sel);
  der.appendChild(U.el('button', {
    class: 'btn sm', text: '＋ Partida', title: 'Nueva partida',
    onclick: function () {
      var n = prompt('Nombre de la partida (ej: URA vs 360 · Carentan):', '');
      if (!n) return;
      var p = U.nuevaPartida(n);
      U.state.partidas.push(p); U.state.activa = p.id; U.save();
      pintarSel(); U.dash.render(); U.roster.render(); U.sketch.recargarMapa();
    }
  }));
  der.appendChild(U.el('button', {
    class: 'btn sm', text: '⧉', title: 'Duplicar partida (copia el roster, vacía la asistencia)',
    onclick: function () {
      var o = U.partida();
      var c = JSON.parse(JSON.stringify(o));
      c.id = U.uid('p'); c.nombre = o.nombre + ' (copia)'; c.resultado = '';
      c.fecha = new Date().toISOString().slice(0, 10);
      Object.keys(c.asignaciones).forEach(function (k) { c.asignaciones[k].ok = false; });
      c.strat.slides.forEach(function (s) { s.id = U.uid('s'); s.objs.forEach(function (ob) { ob.id = U.uid('o'); }); });
      U.state.partidas.push(c); U.state.activa = c.id; U.save();
      pintarSel(); U.dash.render(); U.roster.render(); U.sketch.recargarMapa();
      U.toast('Partida duplicada');
    }
  }));
  der.appendChild(U.el('button', {
    class: 'btn sm ghost', text: '↓', title: 'Exportar todo (incluye capturas)',
    onclick: function () { U.exportar(true); U.toast('Exportando…'); }
  }));
  der.appendChild(U.el('button', {
    class: 'btn sm ghost', text: '↑', title: 'Importar un archivo del panel',
    onclick: function () {
      var inp = U.el('input', { type: 'file', accept: 'application/json' });
      inp.addEventListener('change', function () {
        if (!inp.files[0]) return;
        U.importar(inp.files[0]).then(function () {
          pintarSel(); U.dash.render(); U.roster.render(); U.sketch.recargarMapa();
          U.toast('Panel importado');
        }).catch(function (e) { U.toast('Archivo inválido', 'err'); });
      });
      inp.click();
    }
  }));
  der.appendChild(U.el('span', { id: 'save-ind', class: 'save-ind', text: '● guardado' }));
  bar.appendChild(der);

  /* --- vistas --- */
  U.dash.montar(U.$('#v-dashboard'));
  U.roster.montar(U.$('#roster-grid'), U.$('#roster-side'));
  U.sketch.montar(U.$('#v-strat'));

  U.on('partidas', pintarSel);
  U.on('roster', function () { U.dash.render(); });
  U.on('dash', function () { U.dash.render(); });
  U.on('editarMiembro', function (m) { U.roster.editar(m); });
  U.on('todo', function () { U.dash.render(); U.roster.render(); U.sketch.recargarMapa(); });

  U.tab(U.state.ui.tab || 'dashboard');
};

document.addEventListener('DOMContentLoaded', U.arrancar);
