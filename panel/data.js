/* ===================================================================
   URANIUM 235 · PANEL DE OPERACIONES
   data.js — catálogos fijos: unidades/colores, plantilla de roster,
   roles, mapas y puntos. Todo lo que no cambia partida a partida.
   =================================================================== */
window.U = window.U || {};

/* --- Unidades tácticas: el color es la identidad que viaja del roster
       al stratsketch. Rojo/Verde/Azul son los del juego, no se tocan. --- */
U.UNITS = [
  { id: 'red',     nombre: 'Norte · Rojo',      corto: 'NORTE',  color: '#c0392b' },
  { id: 'green',   nombre: 'Centro · Verde',    corto: 'CENTRO', color: '#5f8a3a' },
  { id: 'blue',    nombre: 'Sur · Azul',        corto: 'SUR',    color: '#2f6fb0' },
  { id: 'alfa',    nombre: 'Ariete · Flex',     corto: 'FLEX',   color: '#d98324' },
  { id: 'defense', nombre: 'Defensa',           corto: 'DEF',    color: '#7d5bbe' },
  { id: 'command', nombre: 'Comandancia',       corto: 'CMD',    color: '#e0b64a' },
  { id: 'recon',   nombre: 'Recon',             corto: 'RECON',  color: '#3fa8a0' },
  { id: 'wamo',    nombre: 'Incursor · WAMO',   corto: 'WAMO',   color: '#c85a9b' },
  { id: 'arty',    nombre: 'Artillería',        corto: 'ARTY',   color: '#9a6b2f' },
  { id: 'tanks',   nombre: 'Tanques',           corto: 'TANQUE', color: '#b9a988' },
  { id: 'free',    nombre: 'Libre · neutro',    corto: 'LIBRE',  color: '#e7e0cd' }
];
U.unit = function (id) { return U.UNITS.find(u => u.id === id) || U.UNITS[U.UNITS.length - 1]; };

/* --- Roles: mismo vocabulario que la hoja "Datos" del dashboard --- */
U.ROLES = {
  'COMMANDER':     { ico: '👑', tipo: 'mando' },
  'LOGISTIC':      { ico: '🛠️', tipo: 'mando' },
  'SL':            { ico: '🎖️', tipo: 'mando' },
  'SL (PUSH)':     { ico: '🎖️', tipo: 'mando' },
  'SL (HOLD)':     { ico: '🎖️', tipo: 'mando' },
  'INFANTRY':      { ico: '🪖', tipo: 'inf' },
  'MACHINE GUN':   { ico: '🔫', tipo: 'inf' },
  'ANTI TANK':     { ico: '🚀', tipo: 'inf' },
  'ENGINEER':      { ico: '🛠️', tipo: 'inf' },
  'SUPPLY BOX':    { ico: '📦', tipo: 'inf' },
  'EXPLOSIVE':     { ico: '🧨', tipo: 'inf' },
  'FLEX':          { ico: '🏓', tipo: 'inf' },
  'RECON':         { ico: '👁️', tipo: 'recon' },
  'SNIPER':        { ico: '🎯', tipo: 'recon' },
  'FLARE':         { ico: '🌟', tipo: 'recon' },
  'DEF (CENTRO)':  { ico: '🛡️', tipo: 'def' },
  'DEF (IZQUIERDA)': { ico: '🛡️', tipo: 'def' },
  'DEF (DERECHA)': { ico: '🛡️', tipo: 'def' },
  'CAP':           { ico: '🎖️', tipo: 'tanque' },
  'ART':           { ico: '🪖', tipo: 'tanque' },
  'DRIVER':        { ico: '🪖', tipo: 'tanque' },
  'RED TRUCK (IZQ|NORTE)':  { ico: '🛻', tipo: 'truck' },
  'GREEN TRUCK (CENTRO)':   { ico: '🛻', tipo: 'truck' },
  'BLUE TRUCK (DER|SUR)':   { ico: '🛻', tipo: 'truck' },
  'SUPPLY TRUCK':           { ico: '🚚', tipo: 'truck' },
  'RESERVA':       { ico: '🕗', tipo: 'inf' }
};
U.roleIco = function (r) { return (U.ROLES[r] || {}).ico || '·'; };

/* --- Plantilla del roster: misma estructura que la hoja de cálculo.
       fila = bloque de la grilla (4 columnas), extra = permite sumar slots --- */
U.ROSTER = [
  { id: 'node1', titulo: 'NODE #1 · IZQUIERDA | NORTE', unidad: 'red',   fila: 1, tipo: 'tarea',
    slots: ['ENGINEER', 'SUPPLY BOX', 'SUPPLY BOX', 'SUPPLY BOX'] },
  { id: 'node2', titulo: 'NODE #2 · CENTRO', unidad: 'green', fila: 1, tipo: 'tarea',
    slots: ['ENGINEER', 'SUPPLY BOX', 'SUPPLY BOX', 'SUPPLY BOX'] },
  { id: 'node3', titulo: 'NODE #3 · DERECHO | SUR', unidad: 'blue', fila: 1, tipo: 'tarea',
    slots: ['ENGINEER', 'SUPPLY BOX', 'SUPPLY BOX', 'SUPPLY BOX'] },
  { id: 'trucks', titulo: 'TRUCKS', unidad: 'free', fila: 1, tipo: 'tarea',
    slots: ['RED TRUCK (IZQ|NORTE)', 'GREEN TRUCK (CENTRO)', 'BLUE TRUCK (DER|SUR)', 'SUPPLY TRUCK'] },

  { id: 'sq_red', titulo: 'RED | ROJO', unidad: 'red', fila: 2, tipo: 'escuadra', extra: 'INFANTRY',
    slots: ['SL', 'SL', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'MACHINE GUN'] },
  { id: 'sq_green', titulo: 'GREEN | VERDE', unidad: 'green', fila: 2, tipo: 'escuadra', extra: 'INFANTRY',
    slots: ['SL', 'SL', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'MACHINE GUN'] },
  { id: 'sq_blue', titulo: 'BLUE | AZUL', unidad: 'blue', fila: 2, tipo: 'escuadra', extra: 'INFANTRY',
    slots: ['SL', 'SL', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'MACHINE GUN'] },
  { id: 'sq_alfa', titulo: 'ALFA | ARIETE', unidad: 'alfa', fila: 2, tipo: 'escuadra', extra: 'INFANTRY',
    slots: ['SL', 'SL', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'FLEX'] },

  { id: 'commander', titulo: 'COMMANDER', unidad: 'command', fila: 3, tipo: 'mando',
    slots: ['COMMANDER', 'LOGISTIC'] },
  { id: 'recon1', titulo: 'RECON A', unidad: 'recon', fila: 3, tipo: 'mando',
    slots: ['RECON', 'SNIPER'] },
  { id: 'recon2', titulo: 'RECON B', unidad: 'recon', fila: 3, tipo: 'mando',
    slots: ['FLARE', 'SNIPER'] },
  { id: 'defense', titulo: 'DEFENSE', unidad: 'defense', fila: 3, tipo: 'escuadra', extra: 'INFANTRY',
    slots: ['DEF (CENTRO)', 'DEF (IZQUIERDA)', 'DEF (DERECHA)', 'INFANTRY', 'INFANTRY', 'INFANTRY', 'INFANTRY'] },

  { id: 'arty', titulo: 'ARTILLERÍA', unidad: 'arty', fila: 4, tipo: 'mando',
    slots: ['CAP', 'INFANTRY', 'INFANTRY'] },
  { id: 'wamo', titulo: 'INCURSOR (WAMO)', unidad: 'wamo', fila: 4, tipo: 'mando',
    slots: ['SL', 'EXPLOSIVE', 'SUPPLY BOX'] },

  { id: 't1', titulo: 'TANQUE T1 · LEAD', unidad: 'tanks', fila: 5, tipo: 'tanque',
    slots: ['CAP', 'ART', 'DRIVER'] },
  { id: 't2', titulo: 'TANQUE T2', unidad: 'tanks', fila: 5, tipo: 'tanque',
    slots: ['CAP', 'ART', 'DRIVER'] },
  { id: 't3', titulo: 'TANQUE T3 · FLEX', unidad: 'tanks', fila: 5, tipo: 'tanque',
    slots: ['CAP', 'ART', 'DRIVER'] },
  { id: 't4', titulo: 'TANQUE T4', unidad: 'tanks', fila: 5, tipo: 'tanque',
    slots: ['CAP', 'ART', 'DRIVER'] }
];
U.group = function (id) { return U.ROSTER.find(g => g.id === id); };

/* --- Mapas. Texturas del juego (4096) reescaladas a 2560 + capas de
       cuadrícula y puntos, todas en el espacio de 1920x1920 que usa la
       comunidad. Sumar un mapa = sumar una entrada acá. --- */
U.ESPACIO = 1920;   // sistema de coordenadas del sketch, fijo para todos los mapas
U.MAPS = [
  { id: 'carentan', nombre: 'Carentan',
    puntos: ['Blactot', 'Pumping Station', 'Canal Crossing', 'Customs', 'Canal Locks', '502nd Start',
             'Ruins', 'Town Center', 'Rail Crossing', 'Rail Causeway', 'Farm Ruins', 'Derailed Train',
             'Train Station', 'Mont Halais', 'La Maison des Ormes'] },
  { id: 'smdm',  nombre: 'Sainte-Marie-du-Mont', puntos: ['The Dugout', 'AA Network', "Pierre's Farm", 'Winters Landing', 'Le Grand Chemin', 'Brecourt', 'Rue de la Gare'] },
  { id: 'sme',   nombre: 'Sainte-Mère-Église',  puntos: ['Hospice', 'Ste-Mere-Eglise', 'Checkpoint', 'Flak Position', 'Vaulaville', 'Artillery Battery', 'Cemetery'] },
  { id: 'driel', nombre: 'Driel',               puntos: ['Brick Factory', 'Railway Factory', 'Gun Emplacement', 'Rail Bridge', 'Schaduwwolken', 'Middel Windmill'] },
  { id: 'hill400', nombre: 'Hill 400',          puntos: ['Flak Pits', 'Hill 400', 'Southern Approach', 'Eastern Descent', 'Convoy Ambush'] },
  { id: 'hurtgen', nombre: 'Hürtgen Forest',    puntos: ['North Pass', 'The Scar', 'The Siegfried Line', 'Reserve Station', "Jacob's Barn"] },
  { id: 'foy',   nombre: 'Foy',                 puntos: ['West Bend', 'Southern Edge', 'Dugout Barn', 'Road To Foy', 'Foy', 'Flak Battery'] },
  { id: 'kursk', nombre: 'Kursk',               puntos: ['The Windmills', 'Yamki', "Oleg's House", 'Defence In Depth', 'Grushki'] },
  { id: 'stalingrad', nombre: 'Stalingrad',     puntos: ['Railway Crossing', 'Carriage Depot', 'Train Station', 'House Of Culture', "Pavlov's House"] },
  { id: 'kharkov', nombre: 'Kharkov',           puntos: ['Water Mill', 'St Mary', 'Distillery', 'Marsh Town', 'Bitter Spring'] },
  { id: 'remagen', nombre: 'Remagen',           puntos: ['St Severin Chapel', 'Ludendorf Chapel', 'Bauernhof Am Rhein', 'Erpel', 'Kasbach Outskirts'] },
  { id: 'omaha', nombre: 'Omaha Beach',         puntos: ['West Vierville', 'Vierville Sur Mer', 'Hamel Au Pretre', 'Church Road', 'Dog Green'] },
  { id: 'utah',  nombre: 'Utah Beach',          puntos: ['WN4', 'The Chapel', 'WN7', 'Sunken Bridge', 'Flooded House'] },
  { id: 'phl',   nombre: 'Purple Heart Lane',   puntos: ['Grout Pilbox', 'Carentan Causeway', 'Flak Position', 'Madeleine Farm', "Dead Man's Corner"] },
  { id: 'elalamein', nombre: 'El Alamein',      puntos: ['Desert Rat Trenches', 'Oasis', 'Valley', 'Miteirya Ridge', 'Watchtower'] },
  { id: 'elsenborn', nombre: 'Elsenborn Ridge', puntos: ['Road To Elsenborn Ridge', 'Dug Out Tank', 'Checkpoint', 'Buschit Farm', 'Trenches'] },
  { id: 'mortain', nombre: 'Mortain',           puntos: ['Hill 314', 'Petit Chapelle Saint Michael', 'US Southern Roadblock', 'Abbaye Blanche', 'Le Neufbourg'] },
  { id: 'tobruk', nombre: 'Tobruk',             puntos: ['Desert Rat Caves', 'Church Grounds', 'Admiralty House', 'Fort Airente', 'Bir El Medauuar'] },
  { id: 'smolensk', nombre: 'Smolensk',         puntos: ['Cathedral', 'Rail Yard', 'Lopatinsky Garden'] },
  { id: 'juno',  nombre: 'Juno Beach',          puntos: ['Nan White', 'Mike Sector', 'Courseulles-sur-Mer', 'The Chateau', 'Rue de Mer'] }
];
/* rutas de las capas de cada mapa */
U.MAPS.forEach(function (m) {
  m.base = '../media/maps/base/' + m.id + '.webp';
  m.capaPuntos = '../media/maps/puntos/' + m.id + '.webp';
});
U.MAPA_GRID = '../media/maps/grid.webp';
U.map = function (id) { return U.MAPS.find(m => m.id === id) || U.MAPS[0]; };

U.BANDOS = ['Aliados', 'Eje', 'US', 'Wehrmacht', 'British', 'Soviético', 'DAK'];
U.MODOS  = ['Warfare', 'Offensive', 'Skirmish', '18v18', '36v36', '49v49'];
U.ESTADOS = ['Activo', 'Contactado', 'Comprometido', 'Inalcanzable', 'Reserva', 'Retirado'];
U.UNIDADES_MIEMBRO = ['Infantería', 'Oficiales', 'Tanquistas', 'Artillería', 'Recon', 'Comandante', 'Invitado', 'Reservas'];
U.DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/* --- Íconos del sketch. Se dibujan como SVG puro (nada de fuentes). --- */
U.ICONS = [
  { id: 'garrison',  nombre: 'Garrison',        grupo: 'estructura' },
  { id: 'op',        nombre: 'OP (bandera)',    grupo: 'estructura' },
  { id: 'node',      nombre: 'Nodo',            grupo: 'estructura' },
  { id: 'supply',    nombre: 'Supplies',        grupo: 'estructura' },
  { id: 'truck',     nombre: 'Camión',          grupo: 'estructura' },
  { id: 'mg',        nombre: 'Ametralladora',   grupo: 'infantería' },
  { id: 'at',        nombre: 'Anti tanque',     grupo: 'infantería' },
  { id: 'inf',       nombre: 'Infantería',      grupo: 'infantería' },
  { id: 'sniper',    nombre: 'Sniper',          grupo: 'infantería' },
  { id: 'tank',      nombre: 'Tanque',          grupo: 'blindados' },
  { id: 'tankL',     nombre: 'Tanque L',        grupo: 'blindados' },
  { id: 'tankM',     nombre: 'Tanque M',        grupo: 'blindados' },
  { id: 'tankR',     nombre: 'Tanque R',        grupo: 'blindados' },
  { id: 'arty',      nombre: 'Artillería',      grupo: 'blindados' },
  { id: 'warn',      nombre: 'Atención',        grupo: 'marcas' },
  { id: 'ok',        nombre: 'OK',              grupo: 'marcas' },
  { id: 'no',        nombre: 'Prohibido',       grupo: 'marcas' },
  { id: 'eye',       nombre: 'Vigilar',         grupo: 'marcas' },
  { id: 'skull',     nombre: 'Zona caliente',   grupo: 'marcas' },
  { id: 'flag',      nombre: 'Punto',           grupo: 'marcas' }
];
