/* ===================================================================
   main.js — arranque, pestañas y barra superior.
   Orden de arranque: pinta con lo que hay en este navegador (instantáneo)
   y en paralelo pregunta si existe base en la nube; si existe, manda ella
   y se repinta.
   =================================================================== */
window.U = window.U || {};

U.tab = function (id) {
  U.state.ui.tab = id;
  U.$$('.tabbtn').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === id); });
  U.$$('.vista').forEach(function (v) { v.classList.toggle('on', v.id === 'v-' + id); });
  U.save();
  if (id === 'partidas') U.partidas.render();
  if (id === 'dashboard') U.dash.render();
  if (id === 'roster') U.roster.render();
  if (id === 'strat') U.sketch.render();
};

U.arrancar = function () {
  U.load();

  var bar = U.$('#topbar');

  /* --- marca --- */
  bar.appendChild(U.el('a', { class: 'marca', href: '../index.html' }, [
    U.el('img', { src: '../media/logo-mark.png', alt: '' }),
    U.el('span', { html: 'URANIUM 235<small>Panel de operaciones</small>' })
  ]));

  /* --- pestañas --- */
  var tabs = U.el('div', { class: 'tabs' });
  [['partidas', 'Partidas'], ['dashboard', 'Dashboard'], ['roster', 'Roster'], ['strat', 'Estrategia']]
    .forEach(function (t) {
      tabs.appendChild(U.el('button', { class: 'tabbtn', 'data-tab': t[0], text: t[1], onclick: function () { U.tab(t[0]); } }));
    });
  bar.appendChild(tabs);

  /* --- partida activa siempre a la vista --- */
  var der = U.el('div', { class: 'bar-der' });
  var activa = U.el('button', {
    class: 'partida-activa', title: 'Cambiar de partida',
    onclick: function () { U.tab('partidas'); }
  });
  function pintarActiva() {
    var p = U.partida();
    U.vaciar(activa);
    if (!p) { activa.appendChild(U.el('span', { class: 'nm', text: 'sin partida' })); return; }
    activa.appendChild(U.el('span', { class: 'k', text: 'Partida' }));
    activa.appendChild(U.el('span', { class: 'nm', text: p.nombre }));
    activa.appendChild(U.el('span', { class: 'mp', text: U.map(p.strat.mapa || p.mapa).nombre }));
  }
  pintarActiva();
  der.appendChild(activa);
  der.appendChild(U.el('span', { id: 'save-ind', class: 'save-ind', text: '● guardado' }));
  bar.appendChild(der);

  /* --- vistas --- */
  U.partidas.montar(U.$('#v-partidas'));
  U.dash.montar(U.$('#v-dashboard'));
  U.roster.montar(U.$('#roster-grid'), U.$('#roster-side'));
  U.sketch.montar(U.$('#v-strat'));

  /* --- cableado entre módulos --- */
  U.on('partidas', pintarActiva);
  U.on('roster', function () { U.dash.render(); });
  U.on('dash', function () { U.dash.render(); });
  U.on('editarMiembro', function (m) { U.roster.editar(m); });
  U.on('nuevoMiembro', function () { U.roster.nuevo(); });
  U.on('importarMiembros', function () { U.roster.importarLista(); });
  U.on('todo', function () { pintarActiva(); U.dash.render(); U.roster.render(); U.sketch.recargarMapa(); });
  U.on('strat', function () { U.sketch.recargarMapa(); });
  U.on('mapa', function () { pintarActiva(); U.roster.render(); });

  U.tab(U.state.ui.tab || 'partidas');

  /* --- base compartida, si está --- */
  U.sincronizarInicio().then(function (modo) {
    if (modo === 'nube') {
      U.toast('Base compartida conectada');
      U.emit('todo'); U.partidas.render();
    }
    var ind = U.$('#save-ind');
    if (ind) ind.title = modo === 'nube'
      ? 'Se guarda en la base compartida del clan'
      : 'Se guarda en este navegador (sin backend). Usá exportar/importar.';
  });
};

document.addEventListener('DOMContentLoaded', U.arrancar);
