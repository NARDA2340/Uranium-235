/* ===================================================================
   panel.mjs — la base de datos del panel.

   Guarda en Netlify Blobs (viene con el hosting, no hay que crear
   cuenta en ningún lado). Claves que usa:
     miembros        -> array con toda la base de jugadores
     partida/<id>    -> una partida completa (roster + estrategia)
     captura/<id>    -> una captura pineada en el mapa (dataURL)

   Si existe la variable de entorno PANEL_TOKEN, hay que mandar ese
   mismo valor en el header X-Panel-Token. Si no existe, queda abierto
   para cualquiera que tenga la URL de la web.
   =================================================================== */
import { getStore } from '@netlify/blobs';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

export default async (req) => {
  const url = new URL(req.url);
  const op = url.searchParams.get('op') || 'ping';
  const id = url.searchParams.get('id') || '';

  const clave = process.env.PANEL_TOKEN;
  if (clave && req.headers.get('x-panel-token') !== clave) {
    return json({ error: 'token' }, 401);
  }

  let store;
  try {
    store = getStore({ name: 'uranium-panel', consistency: 'strong' });
  } catch (e) {
    return json({ error: 'blobs no disponible', detalle: String(e) }, 500);
  }

  try {
    if (op === 'ping') return json({ ok: true, protegido: !!clave });

    if (op === 'todo') {
      const miembros = (await store.get('miembros', { type: 'json' })) || [];
      const { blobs } = await store.list({ prefix: 'partida/' });
      const partidas = [];
      for (const b of blobs) {
        const p = await store.get(b.key, { type: 'json' });
        if (p) partidas.push(p);
      }
      partidas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      return json({ miembros, partidas });
    }

    if (op === 'miembros') {
      if (req.method === 'PUT') {
        const body = await req.json();
        if (!Array.isArray(body)) return json({ error: 'se esperaba un array' }, 400);
        await store.setJSON('miembros', body);
        return json({ ok: true, n: body.length });
      }
      return json((await store.get('miembros', { type: 'json' })) || []);
    }

    if (op === 'partida') {
      if (!id) return json({ error: 'falta id' }, 400);
      const key = 'partida/' + id;
      if (req.method === 'PUT') {
        const body = await req.json();
        if (!body || body.id !== id) return json({ error: 'id no coincide' }, 400);
        await store.setJSON(key, body);
        return json({ ok: true });
      }
      if (req.method === 'DELETE') {
        await store.delete(key);
        return json({ ok: true });
      }
      return json((await store.get(key, { type: 'json' })) || null);
    }

    if (op === 'captura') {
      if (!id) return json({ error: 'falta id' }, 400);
      const key = 'captura/' + id;
      if (req.method === 'PUT') {
        const body = await req.json();
        if (!body || !body.d) return json({ error: 'falta la imagen' }, 400);
        await store.set(key, body.d);
        return json({ ok: true });
      }
      const d = await store.get(key, { type: 'text' });
      return json({ d: d || null });
    }

    return json({ error: 'operación desconocida' }, 400);
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 500);
  }
};
