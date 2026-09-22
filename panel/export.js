/* ===================================================================
   export.js — sacar el material para mandar al Discord.

   Dos piezas:
   · ROSTER  — una imagen grande con todos los bloques y los nombres.
   · SLIDES  — una imagen por diapositiva: el mapa dibujado a la
               izquierda y la leyenda de quién va dónde a la derecha.

   Se dibuja todo en un canvas propio (nada de librerías): el mapa se
   arma serializando el SVG y metiéndole las imágenes adentro como
   data URL, porque un <img> no carga archivos externos desde un SVG.
   =================================================================== */
window.U = window.U || {};

U.exportarImagenes = (function () {
  var TINTA = '#e7dfc6', TENUE = '#9c8e6c', FONDO = '#14100a', PANEL = '#1e1810', LINEA = '#5a4d2a', AMBAR = '#c99a2e';

  /* ---------- utilidades ---------- */
  function aDataURL(url) {
    return fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
      return new Promise(function (res) {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.readAsDataURL(b);
      });
    });
  }
  function cargarImagen(src) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = rej;
      i.src = src;
    });
  }
  function redondeado(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function recortar(c, txt, ancho) {
    txt = String(txt == null ? '' : txt);
    if (c.measureText(txt).width <= ancho) return txt;
    while (txt.length > 1 && c.measureText(txt + '…').width > ancho) txt = txt.slice(0, -1);
    return txt + '…';
  }
  function bajar(canvas, nombre) {
    return new Promise(function (res) {
      canvas.toBlob(function (b) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = nombre;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); res(); }, 1500);
      }, 'image/png');
    });
  }
  function limpio(s) { return String(s || '').replace(/[^\w\dáéíóúñ .-]/gi, '').replace(/\s+/g, '-').slice(0, 40); }

  /* ---------- 1. el roster ---------- */
  function roster(p) {
    var bloques = U.bloques();
    var COLS = 4, ANCHO = 1840, MARGEN = 30, GAP = 18;
    var W = (ANCHO - MARGEN * 2 - GAP * (COLS - 1)) / COLS;
    var FILA = 30, CABEZA = 34, TOPE = 250;

    /* reparto en columnas por la más corta */
    var alturas = [], col = [];
    for (var i = 0; i < COLS; i++) { alturas.push(0); col.push([]); }
    bloques.forEach(function (b) {
      var k = alturas.indexOf(Math.min.apply(null, alturas));
      col[k].push(b);
      alturas[k] += CABEZA + b.slots.length * FILA + 16;
    });
    var H = TOPE + Math.max.apply(null, alturas) + 70;

    var cv = document.createElement('canvas');
    cv.width = ANCHO; cv.height = H;
    var c = cv.getContext('2d');

    /* fondo */
    c.fillStyle = FONDO; c.fillRect(0, 0, ANCHO, H);
    c.strokeStyle = LINEA; c.lineWidth = 2; c.strokeRect(10, 10, ANCHO - 20, H - 20);

    /* cabecera */
    c.fillStyle = AMBAR;
    c.font = '700 46px Georgia, serif';
    c.fillText('URANIUM 235 · ROSTER', MARGEN, 74);
    c.fillStyle = TINTA;
    c.font = '700 34px Georgia, serif';
    c.fillText(recortar(c, p.nombre, ANCHO - MARGEN * 2), MARGEN, 122);

    var mapa = U.map(p.strat.mapa || p.mapa);
    var datos = [
      ['FECHA', p.fecha], ['FORMATO', p.formato || p.modo], ['MAPA', mapa.nombre],
      ['PUNTO', p.punto || '—'], ['BANDO', p.bando],
      ['SERVER', p.server.name || '—'], ['PASS', p.server.pass || '—'], ['BRIEFING', p.briefing || '—']
    ];
    var dx = MARGEN, dw = (ANCHO - MARGEN * 2) / datos.length;
    datos.forEach(function (d) {
      c.fillStyle = TENUE; c.font = '600 15px monospace';
      c.fillText(d[0], dx, 160);
      c.fillStyle = TINTA; c.font = '600 21px Georgia, serif';
      c.fillText(recortar(c, d[1], dw - 14), dx, 186);
      dx += dw;
    });

    /* contadores */
    var ct = U.contadores();
    var cont = [['CONVOCADOS', ct.total, TINTA], ['VINIERON', ct.asistieron, '#9dbd63'],
                ['FALTARON', ct.faltaron, '#d98878'], ['SIN MARCAR', ct.sinMarcar, AMBAR]];
    var cx = MARGEN;
    cont.forEach(function (n) {
      c.fillStyle = PANEL; redondeado(c, cx, 204, 210, 40, 3); c.fill();
      c.fillStyle = n[2]; c.font = '700 26px Georgia, serif';
      c.fillText(n[1], cx + 12, 233);
      c.fillStyle = TENUE; c.font = '600 13px monospace';
      c.fillText(n[0], cx + 62, 230);
      cx += 222;
    });

    /* bloques */
    var iconos = {};
    var roles = {};
    bloques.forEach(function (b) { b.slots.forEach(function (r) { roles[r] = U.rolIcono(r); }); });

    return Promise.all(Object.keys(roles).map(function (r) {
      return cargarImagen(roles[r]).then(function (im) { iconos[r] = im; }).catch(function () { });
    })).then(function () {
      col.forEach(function (bs, ci) {
        var x = MARGEN + ci * (W + GAP), y = TOPE;
        bs.forEach(function (b) {
          var u = U.unit(b.unidad);
          var alto = CABEZA + b.slots.length * FILA;
          c.fillStyle = PANEL; c.fillRect(x, y, W, alto);
          c.fillStyle = u.color; c.fillRect(x, y, W, 4);
          c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(x, y + 4, W, CABEZA - 4);
          c.fillStyle = TINTA; c.font = '700 19px Georgia, serif';
          c.fillText(recortar(c, b.titulo, W - 90), x + 10, y + 26);
          var ocup = b.slots.filter(function (_, i) { return U.asig(b.id, i); }).length;
          c.fillStyle = TENUE; c.font = '600 14px monospace';
          c.fillText(ocup + '/' + b.slots.length, x + W - 48, y + 25);

          b.slots.forEach(function (rol, i) {
            var fy = y + CABEZA + i * FILA;
            var a = U.asig(b.id, i);
            var est = a ? (a.est || '') : '';
            if (i % 2) { c.fillStyle = 'rgba(255,255,255,.022)'; c.fillRect(x, fy, W, FILA); }

            c.font = '700 17px monospace';
            if (est === 'ok') { c.fillStyle = '#9dbd63'; c.fillText('✔', x + 9, fy + 21); }
            else if (est === 'falta') { c.fillStyle = '#d98878'; c.fillText('✕', x + 9, fy + 21); }

            if (iconos[rol]) c.drawImage(iconos[rol], x + 28, fy + 6, 18, 18);
            c.fillStyle = TENUE; c.font = '600 12.5px monospace';
            c.fillText(recortar(c, rol, W * 0.42), x + 52, fy + 20);

            c.fillStyle = a ? (est === 'falta' ? '#b9a08f' : TINTA) : '#5d543d';
            c.font = (a ? '600 16px' : '400 14px') + ' Georgia, serif';
            var nom = a ? U.nombreMiembro(a.m) : '—';
            var nx = x + W * 0.52;
            c.fillText(recortar(c, nom, W * 0.46), nx, fy + 20);
            if (est === 'falta') {
              var an = c.measureText(recortar(c, nom, W * 0.46)).width;
              c.strokeStyle = 'rgba(217,136,120,.7)'; c.lineWidth = 1.5;
              c.beginPath(); c.moveTo(nx, fy + 15); c.lineTo(nx + an, fy + 15); c.stroke();
            }
          });
          y += alto + 16;
        });
      });

      c.fillStyle = TENUE; c.font = '600 15px monospace';
      c.fillText('Uranium 235 · panel de operaciones · ' + new Date().toLocaleDateString('es-AR'), MARGEN, H - 28);
      return cv;
    });
  }

  /* ---------- 2. una diapositiva ---------- */
  function slide(p, i) {
    var d = U.sketch.svgDeSlide(i);
    if (!d) return Promise.resolve(null);
    var leyenda = U.sketch.leyendaDeSlide(i);

    /* meter adentro del SVG las imágenes que apunta afuera */
    var urls = [];
    d.xml.replace(/(?:xlink:)?href="([^"]+)"/g, function (_, u) {
      if (u.indexOf('data:') !== 0 && urls.indexOf(u) < 0) urls.push(u);
      return _;
    });

    return Promise.all(urls.map(function (u) {
      return aDataURL(u).then(function (dataUrl) { return [u, dataUrl]; }).catch(function () { return null; });
    })).then(function (pares) {
      var xml = d.xml;
      pares.forEach(function (par) {
        if (!par) return;
        xml = xml.split('"' + par[0] + '"').join('"' + par[1] + '"');
      });
      var blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      return cargarImagen(url).then(function (im) { URL.revokeObjectURL(url); return im; });
    }).then(function (mapaImg) {
      var M = 1500, LEY = 720, W = M + LEY, H = M + 96;
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var c = cv.getContext('2d');
      c.fillStyle = FONDO; c.fillRect(0, 0, W, H);

      /* barra de título */
      c.fillStyle = PANEL; c.fillRect(0, 0, W, 72);
      c.fillStyle = AMBAR; c.font = '700 30px Georgia, serif';
      c.fillText(recortar(c, p.nombre, 620), 24, 46);
      c.fillStyle = TINTA; c.font = '600 22px Georgia, serif';
      var mapa = U.map(p.strat.mapa || p.mapa);
      c.fillText('· ' + mapa.nombre + (p.punto ? ' · ' + p.punto : ''), 660, 45);
      c.fillStyle = TENUE; c.font = '600 20px monospace';
      var tit = (i + 1) + ' · ' + d.nombre;
      c.fillText(recortar(c, tit, LEY - 60), M + 24, 45);

      c.drawImage(mapaImg, 0, 72, M, M);

      /* leyenda */
      c.fillStyle = '#16120a'; c.fillRect(M, 72, LEY, M);
      var y = 132;
      c.fillStyle = AMBAR; c.font = '700 24px Georgia, serif';
      c.fillText('QUIÉN VA DÓNDE', M + 24, y); y += 26;

      leyenda.forEach(function (g) {
        if (y > M + 20) return;
        y += 26;
        c.fillStyle = g.color; c.fillRect(M + 24, y - 17, 6, 22);
        c.fillStyle = TINTA; c.font = '700 21px Georgia, serif';
        c.fillText(g.titulo, M + 40, y);
        y += 10;
        var colX = M + 42, colW = (LEY - 80) / 2, fila = 0;
        g.jugadores.forEach(function (j, n) {
          var xx = colX + (n % 2) * colW;
          var yy = y + Math.floor(n / 2) * 25 + 20;
          if (yy > M + 60) return;
          c.fillStyle = j.lider ? AMBAR : TENUE;
          c.font = (j.lider ? '700 18px' : '400 17px') + ' Georgia, serif';
          c.fillText(recortar(c, j.nombre, colW - 16), xx, yy);
          fila = Math.floor(n / 2) + 1;
        });
        y += fila * 25 + 16;
      });

      c.fillStyle = TENUE; c.font = '600 15px monospace';
      c.fillText('Uranium 235 · ' + p.fecha, 24, H - 26);
      return cv;
    });
  }

  /* ---------- panel de exportación ---------- */
  function abrir() {
    var p = U.partida();
    if (!p) { U.toast('Elegí una partida primero', 'err'); return; }

    var cuerpo = U.el('div', { class: 'exp' });
    var estado = U.el('p', { class: 'ayuda', text: 'Generando las imágenes…' });
    var galeria = U.el('div', { class: 'exp-galeria' });
    cuerpo.appendChild(estado); cuerpo.appendChild(galeria);
    var pie = U.el('div', { class: 'modal-pie' });
    var m = U.modal('Exportar para el Discord', cuerpo, { pie: pie, clase: 'lg' });
    pie.appendChild(U.el('button', {
      class: 'btn ghost', text: 'Copia de seguridad (.json)',
      title: 'Baja todo el panel en un archivo para respaldo o para pasarlo a otra PC',
      onclick: function () { U.exportar(true); U.toast('Exportando la copia…'); }
    }));

    var hechos = [];
    function agregar(cv, nombre, etiqueta) {
      hechos.push({ cv: cv, nombre: nombre });
      var caja = U.el('div', { class: 'exp-item' });
      var img = U.el('img', { src: cv.toDataURL('image/png') });
      caja.appendChild(img);
      caja.appendChild(U.el('div', { class: 'exp-pie' }, [
        U.el('span', { text: etiqueta }),
        U.el('button', { class: 'btn xs', text: '↓ PNG', onclick: function () { bajar(cv, nombre); } })
      ]));
      galeria.appendChild(caja);
    }

    roster(p).then(function (cv) {
      agregar(cv, 'roster-' + limpio(p.nombre) + '.png', 'Roster completo');
      var slides = (p.strat.slides || []);
      var cadena = Promise.resolve();
      slides.forEach(function (sl, i) {
        cadena = cadena.then(function () {
          estado.textContent = 'Generando la diapositiva ' + (i + 1) + ' de ' + slides.length + '…';
          return slide(p, i).then(function (c2) {
            if (c2) agregar(c2, 'strat-' + (i + 1) + '-' + limpio(sl.nombre) + '.png', (i + 1) + ' · ' + sl.nombre);
          });
        });
      });
      return cadena;
    }).then(function () {
      estado.textContent = 'Listo: ' + hechos.length + ' imágenes. Bajalas de a una o todas juntas.';
      pie.appendChild(U.el('button', {
        class: 'btn primary', text: '↓ Bajar todas',
        onclick: function () {
          var q = Promise.resolve();
          hechos.forEach(function (h) { q = q.then(function () { return bajar(h.cv, h.nombre); }); });
          q.then(function () { U.toast('Imágenes descargadas'); });
        }
      }));
    }).catch(function (e) {
      console.error(e);
      estado.textContent = 'Algo falló al generar las imágenes: ' + (e && e.message || e);
      estado.classList.add('err');
    });
  }

  return { abrir: abrir, roster: roster, slide: slide };
})();
