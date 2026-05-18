// src/index.js
import { supabase } from "./lib/supabase.js";

// Delay aleatorio entre min y max ms
const randomDelay = (min, max) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min),
  );

// Headers que simulan un navegador real
const getBrowserHeaders = () => ({
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://steamcommunity.com/market/",
  "X-Requested-With": "XMLHttpRequest",
  Connection: "keep-alive",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
});

async function getSteamApiUrls() {
  const { data, error } = await supabase
    .from("steam")
    .select("id, api_url")
    .order("price_updated_at", { ascending: true })
    .limit(10000);
  if (error) throw new Error(error.message);
  return data;
}

async function savePrice(id, price) {
  const { error } = await supabase
    .from("steam")
    .update({ price, price_updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function fetchWithRetry(id, api_url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(api_url, { headers: getBrowserHeaders() });

      // Rate limit → espera larga y reintenta
      if (response.status === 429) {
        const waitMs = 60000 * attempt; // 60s, 120s, 180s según intento
        console.warn(
          `[${id}] 429 Too Many Requests. Intento ${attempt}/${retries}. Esperando ${waitMs / 1000}s...`,
        );
        await randomDelay(waitMs, waitMs + 10000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Steam a veces responde { success: false } sin lanzar error HTTP
      if (!data.success) {
        console.warn(`[${id}] Steam respondió success:false`);
        return null;
      }

      return data;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(
        `[${id}] Error intento ${attempt}/${retries}: ${err.message}`,
      );
      await randomDelay(10000, 20000);
    }
  }
  return null;
}

async function fetchAllSteamApis() {
  const urls = await getSteamApiUrls();
  const total = urls.length;

  for (let i = 0; i < total; i++) {
    const { id, api_url } = urls[i];
    console.log(`[${i + 1}/${total}] [${id}] Fetching: ${api_url}`);

    try {
      const data = await fetchWithRetry(id, api_url);

      if (!data) {
        console.log(`[${id}] Sin datos, se omite.`);
      } else {
        const rawPrice = data.lowest_price ?? data.median_price;
        if (!rawPrice) {
          console.warn(`[${id}] Sin precio en respuesta.`);
        } else {
          const price = Number(rawPrice.replace("$", "").replace(",", ""));
          await savePrice(id, price);
          console.log(`[${id}] ✓ Precio actualizado: $${price}`);
        }
      }
    } catch (error) {
      console.error(`[${id}] ✗ Error fatal en ${api_url}:`, error.message);
    }

    // Delay entre requests: aleatorio 8s–20s para parecer humano
    // Cada 10 items, pausa larga (simula que el usuario navega)
    if (i < total - 1) {
      if ((i + 1) % 10 === 0) {
        const pause = 10000; // 1 min cada 10 items
        console.log(`\n[Pausa larga: ${pause / 1000}s tras ${i + 1} items]\n`);
        await randomDelay(pause, pause + 15000);
      } else {
        await randomDelay(5000, 8000); // 8–20s entre requests normales
      }
    }
  }

  console.log("\n✅ Proceso completado.");
}

await fetchAllSteamApis();
