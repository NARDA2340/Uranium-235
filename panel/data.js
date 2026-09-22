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

/* --- Roles y su clase en el juego. El ícono es el del propio HLL
       (assets sacados del juego, vía Maps Let Loose). --- */
U.CLASES = {
  'COMMANDER': 'class-commander',
  'LOGISTIC': 'class-support',
  'SL': 'class-officer',
  'SL (PUSH)': 'class-officer',
  'SL (HOLD)': 'class-officer',
  'INFANTRY': 'class-rifleman',
  'RIFLEMAN': 'class-rifleman',
  'ASSAULT': 'class-assault',
  'AUTO RIFLEMAN': 'class-auto-rifleman',
  'MEDIC': 'class-medic',
  'MACHINE GUN': 'class-machine-gunner',
  'ANTI TANK': 'class-anti-tank',
  'ENGINEER': 'class-engineer',
  'SUPPLY BOX': 'class-support',
  'SUPPORT': 'class-support',
  'EXPLOSIVE': 'class-assault',
  'FLEX': 'class-rifleman',
  'RECON': 'class-spotter',
  'FLARE': 'class-spotter',
  'SNIPER': 'class-sniper',
  'DEF (CENTRO)': 'class-rifleman',
  'DEF (IZQUIERDA)': 'class-rifleman',
  'DEF (DERECHA)': 'class-rifleman',
  'CAP': 'class-officer',
  'ART': 'tank-med',
  'DRIVER': 'tank-med',
  'RED TRUCK (IZQ|NORTE)': 'truck-transport',
  'GREEN TRUCK (CENTRO)': 'truck-transport',
  'BLUE TRUCK (DER|SUR)': 'truck-transport',
  'SUPPLY TRUCK': 'truck-supply',
  'RESERVA': 'class-rifleman'
};
U.ICONO_BASE = '../media/iconos/';
U.rolIcono = function (rol) { return U.ICONO_BASE + (U.CLASES[rol] || 'class-rifleman') + '.png'; };

/* roles que puede tomar un slot cuando se edita a mano */
U.ROLES_EDITABLES = Object.keys(U.CLASES);

/* los que NO se tocan al rellenar: ya tienen una tarea de apertura */
U.ROLES_TAREA = ['ENGINEER', 'RED TRUCK (IZQ|NORTE)', 'GREEN TRUCK (CENTRO)', 'BLUE TRUCK (DER|SUR)', 'SUPPLY TRUCK'];
/* los que sí se completan solos */
U.ROLES_RELLENO = ['INFANTRY', 'MACHINE GUN', 'ANTI TANK', 'ASSAULT', 'AUTO RIFLEMAN', 'MEDIC', 'FLEX', 'RIFLEMAN', 'SUPPORT'];

/* --- Plantillas de roster por formato. Son el punto de partida: una
       vez creada la partida, los bloques se copian adentro y se pueden
       renombrar, mover, agrandar o borrar sin tocar esto. --- */
U.FORMATOS = ['x18', 'x25', 'x36', 'x49'];

function nodos() {
  return [
    { id: 'node1', titulo: 'NODE #1 · IZQUIERDA | NORTE', unidad: 'red', tipo: 'tarea',
      slots: ['ENGINEER', 'SUPPLY BOX', 'SUPPLY BOX', 'SUPPLY BOX'] },
    { id: 'node2', titulo: 'NODE #2 · CENTRO', unidad: 'green', tipo: 'tarea',
      slots: ['ENGINEER', 'SUPPLY BOX', 'SUPPLY BOX', 'SUPPLY BOX'] },
    { id: 'node3', titulo: 'NODE #3 · DERECHO | SUR', unidad: 'blue', tipo: 'tarea',
      slots: ['ENGINEER', 'SUPPLY BOX', 'SUPPLY BOX', 'SUPPLY BOX'] },
    { id: 'trucks', titulo: 'TRUCKS', unidad: 'free', tipo: 'tarea',
      slots: ['RED TRUCK (IZQ|NORTE)', 'GREEN TRUCK (CENTRO)', 'BLUE TRUCK (DER|SUR)', 'SUPPLY TRUCK'] }
  ];
}
function escuadra(id, titulo, unidad, sls, infs, ultimo) {
  var slots = [];
  for (var i = 0; i < sls; i++) slots.push('SL');
  for (var j = 0; j < infs; j++) slots.push('INFANTRY');
  if (ultimo) slots.push(ultimo);
  return { id: id, titulo: titulo, unidad: unidad, tipo: 'escuadra', extra: 'INFANTRY', slots: slots };
}
function defensa(infs) {
  var slots = ['DEF (CENTRO)', 'DEF (IZQUIERDA)', 'DEF (DERECHA)'];
  for (var i = 0; i < infs; i++) slots.push('INFANTRY');
  return { id: 'defense', titulo: 'DEFENSA', unidad: 'defense', tipo: 'escuadra', extra: 'INFANTRY', slots: slots };
}
function tanque(id, titulo) {
  return { id: id, titulo: titulo, unidad: 'tanks', tipo: 'tanque', slots: ['CAP', 'ART', 'DRIVER'] };
}
var COMANDO = { id: 'commander', titulo: 'COMMANDER', unidad: 'command', tipo: 'mando', slots: ['COMMANDER', 'LOGISTIC'] };
var RECON_A = { id: 'recon1', titulo: 'RECON A', unidad: 'recon', tipo: 'mando', slots: ['RECON', 'SNIPER'] };
var RECON_B = { id: 'recon2', titulo: 'RECON B', unidad: 'recon', tipo: 'mando', slots: ['FLARE', 'SNIPER'] };
var ARTILLERIA = { id: 'arty', titulo: 'ARTILLERÍA', unidad: 'arty', tipo: 'mando', slots: ['CAP', 'INFANTRY', 'INFANTRY'] };
var WAMO = { id: 'wamo', titulo: 'INCURSOR (WAMO)', unidad: 'wamo', tipo: 'mando', slots: ['SL', 'EXPLOSIVE', 'SUPPLY BOX'] };

U.PLANTILLAS = {
  /* 18 · tres oficiales y nada más: sin nodos ni tanques, solo camiones */
  x18: function () {
    return [
      { id: 'trucks', titulo: 'TRUCKS', unidad: 'free', tipo: 'tarea',
        slots: ['RED TRUCK (IZQ|NORTE)', 'GREEN TRUCK (CENTRO)', 'BLUE TRUCK (DER|SUR)'] },
      escuadra('sq_red', 'NORTE | ROJO', 'red', 1, 4, 'MACHINE GUN'),
      escuadra('sq_green', 'CENTRO | VERDE', 'green', 1, 4, 'MACHINE GUN'),
      escuadra('sq_blue', 'SUR | AZUL', 'blue', 1, 4, 'MACHINE GUN'),
      COMANDO
    ];
  },
  /* 25 · sin ariete ni incursor; la defensa ocupa el cuarto lugar */
  x25: function () {
    return nodos().concat([
      escuadra('sq_red', 'NORTE | ROJO', 'red', 1, 4, 'MACHINE GUN'),
      escuadra('sq_green', 'CENTRO | VERDE', 'green', 1, 4, 'MACHINE GUN'),
      escuadra('sq_blue', 'SUR | AZUL', 'blue', 1, 4, 'MACHINE GUN'),
      defensa(2),
      COMANDO, RECON_A,
      tanque('t1', 'TANQUE T1 · LEAD'), tanque('t2', 'TANQUE T2')
    ]);
  },
  /* 36 · igual que 25 pero con más gente y recon doble */
  x36: function () {
    return nodos().concat([
      escuadra('sq_red', 'NORTE | ROJO', 'red', 2, 4, 'MACHINE GUN'),
      escuadra('sq_green', 'CENTRO | VERDE', 'green', 2, 4, 'MACHINE GUN'),
      escuadra('sq_blue', 'SUR | AZUL', 'blue', 2, 4, 'MACHINE GUN'),
      defensa(3),
      COMANDO, RECON_A, RECON_B, ARTILLERIA,
      tanque('t1', 'TANQUE T1 · LEAD'), tanque('t2', 'TANQUE T2'), tanque('t3', 'TANQUE T3')
    ]);
  },
  /* 49 · el completo, con ariete e incursor */
  x49: function () {
    return nodos().concat([
      escuadra('sq_red', 'NORTE | ROJO', 'red', 2, 6, 'MACHINE GUN'),
      escuadra('sq_green', 'CENTRO | VERDE', 'green', 2, 6, 'MACHINE GUN'),
      escuadra('sq_blue', 'SUR | AZUL', 'blue', 2, 6, 'MACHINE GUN'),
      escuadra('sq_alfa', 'ARIETE | FLEX', 'alfa', 2, 6, 'FLEX'),
      COMANDO, RECON_A, RECON_B, defensa(4),
      ARTILLERIA, WAMO,
      tanque('t1', 'TANQUE T1 · LEAD'), tanque('t2', 'TANQUE T2'),
      tanque('t3', 'TANQUE T3 · FLEX'), tanque('t4', 'TANQUE T4')
    ]);
  }
};
U.plantilla = function (formato) {
  var f = U.PLANTILLAS[formato] || U.PLANTILLAS.x49;
  return JSON.parse(JSON.stringify(f()));
};

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
U.MODOS  = ['x18', 'x25', 'x36', 'x49'];
/* Estado del jugador: tres, con semáforo.
   Activo = juega siempre · Tibio = se anota a veces · Inactivo = no está más */
U.ESTADOS = ['Activo', 'Tibio', 'Inactivo'];
U.ESTADO_COLOR = { 'Activo': '#6f8a3f', 'Tibio': '#d9a62e', 'Inactivo': '#b0432f' };
U.ESTADO_SIGUIENTE = { 'Activo': 'Tibio', 'Tibio': 'Inactivo', 'Inactivo': 'Activo' };
/* equivalencias de los estados viejos del Excel */
U.ESTADO_VIEJO = {
  'Activo': 'Activo', 'Comprometido': 'Activo',
  'Contactado': 'Tibio', 'Reserva': 'Tibio',
  'Inalcanzable': 'Inactivo', 'Retirado': 'Inactivo'
};

/* Marca de asistencia por partida y por slot */
U.ASISTENCIA = { '': 'sin marcar', 'ok': 'vino', 'falta': 'faltó' };
U.ASISTENCIA_SIGUIENTE = { '': 'ok', 'ok': 'falta', 'falta': '' };
U.UNIDADES_MIEMBRO = ['Infantería', 'Oficiales', 'Tanquistas', 'Artillería', 'Recon', 'Comandante', 'Invitado', 'Reservas'];
U.DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/* --- Íconos del mapa. Los que existen en el juego son los assets
       reales; los que no (L/M/R de tanques, marcas), los dibujamos. --- */
U.ICONS = [
  { id: 'garrison', nombre: 'Garrison', grupo: 'estructuras', img: 'garry-plain' },
  { id: 'op', nombre: 'OP', grupo: 'estructuras', img: 'outpost-normal-plain', numerado: true },
  { id: 'opRecon', nombre: 'OP de recon', grupo: 'estructuras', img: 'outpost-recon-plain' },
  { id: 'airhead', nombre: 'Airhead', grupo: 'estructuras', img: 'airhead-plain' },
  { id: 'nodeMan', nombre: 'Nodo manpower', grupo: 'estructuras', img: 'node-manpower' },
  { id: 'nodeMun', nombre: 'Nodo munición', grupo: 'estructuras', img: 'node-munition' },
  { id: 'nodeFuel', nombre: 'Nodo combustible', grupo: 'estructuras', img: 'node-fuel' },
  { id: 'supply', nombre: 'Supplies', grupo: 'estructuras', img: 'supplies-plain' },
  { id: 'supplyDrop', nombre: 'Supply drop', grupo: 'estructuras', img: 'supply-drop' },
  { id: 'repair', nombre: 'Estación de reparación', grupo: 'estructuras', img: 'repair-station' },

  { id: 'truck', nombre: 'Camión de transporte', grupo: 'vehículos', img: 'truck-transport' },
  { id: 'truckSupply', nombre: 'Camión de supply', grupo: 'vehículos', img: 'truck-supply' },
  { id: 'jeep', nombre: 'Jeep', grupo: 'vehículos', img: 'truck-jeep' },
  { id: 'halftrack', nombre: 'Half-track', grupo: 'vehículos', img: 'halftrack-plain' },
  { id: 'tankRecon', nombre: 'Tanque de recon', grupo: 'vehículos', img: 'tank-recon' },
  { id: 'tankLight', nombre: 'Tanque liviano', grupo: 'vehículos', img: 'tank-light' },
  { id: 'tankMed', nombre: 'Tanque mediano', grupo: 'vehículos', img: 'tank-med' },
  { id: 'tankHeavy', nombre: 'Tanque pesado', grupo: 'vehículos', img: 'tank-heavy' },
  { id: 'atgun', nombre: 'Cañón AT', grupo: 'vehículos', img: 'at-gun-plain' },

  { id: 'officer', nombre: 'Squad leader', grupo: 'clases', img: 'class-officer' },
  { id: 'inf', nombre: 'Fusilero', grupo: 'clases', img: 'class-rifleman' },
  { id: 'mg', nombre: 'Ametralladora', grupo: 'clases', img: 'class-machine-gunner' },
  { id: 'at', nombre: 'Anti tanque', grupo: 'clases', img: 'class-anti-tank' },
  { id: 'engineer', nombre: 'Ingeniero', grupo: 'clases', img: 'class-engineer' },
  { id: 'support', nombre: 'Soporte', grupo: 'clases', img: 'class-support' },
  { id: 'sniper', nombre: 'Sniper', grupo: 'clases', img: 'class-sniper' },
  { id: 'spotter', nombre: 'Spotter', grupo: 'clases', img: 'class-spotter' },
  { id: 'assault', nombre: 'Asalto', grupo: 'clases', img: 'class-assault' },
  { id: 'mineAT', nombre: 'Mina AT', grupo: 'clases', img: 'mine-at' },
  { id: 'explosivo', nombre: 'Explosivo', grupo: 'clases', img: 'box-explosive' },

  { id: 'enemyGarry', nombre: 'Garry enemiga', grupo: 'enemigo', img: 'enemy-garry' },
  { id: 'enemyOp', nombre: 'OP enemigo', grupo: 'enemigo', img: 'enemy-op' },
  { id: 'enemyInf', nombre: 'Infantería enemiga', grupo: 'enemigo', img: 'enemy-infantry' },
  { id: 'enemyTank', nombre: 'Tanque enemigo', grupo: 'enemigo', img: 'enemy-tank' },

  { id: 'tankL', nombre: 'Posición L', grupo: 'marcas', svg: true },
  { id: 'tankM', nombre: 'Posición M', grupo: 'marcas', svg: true },
  { id: 'tankR', nombre: 'Posición R', grupo: 'marcas', svg: true },
  { id: 'warn', nombre: 'Atención', grupo: 'marcas', svg: true },
  { id: 'ok', nombre: 'OK', grupo: 'marcas', svg: true },
  { id: 'no', nombre: 'Prohibido', grupo: 'marcas', svg: true },
  { id: 'eye', nombre: 'Vigilar', grupo: 'marcas', svg: true },
  { id: 'skull', nombre: 'Zona caliente', grupo: 'marcas', svg: true },
  { id: 'flag', nombre: 'Punto', grupo: 'marcas', svg: true }
];
U.icono = function (id) { return U.ICONS.find(function (i) { return i.id === id; }); };
U.iconoImg = function (id) {
  var i = U.icono(id);
  return i && i.img ? U.ICONO_BASE + i.img + '.png' : null;
};
