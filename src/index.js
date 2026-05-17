// src/index.js
import { supabase } from "./lib/supabase.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getSteamApiUrls() {
  const { data, error } = await supabase
    .from("steam")
    .select("id, api_url")
    .order("price_updated_at", { ascending: true, nullsFirst: true });

  if (error) throw new Error(error.message);
  return data;
}

async function savePrice(id, price) {
  const { error } = await supabase
    .from("steam")
    .update({ price: price, price_updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

async function fetchAllSteamApis() {
  const urls = await getSteamApiUrls();

  for (const { id, api_url } of urls) {
    try {
      console.log(`[${id}] Fetching: ${api_url}`);

      const response = await fetch(api_url);

      if (response.status === 429) {
        console.warn(`[${id}] Too Many Requests (429), esperando 60s...`);
        await delay(60000);
        continue;
      }

      const data = await response.json();
      console.log(`[${id}] Respuesta:`, data);

      const rawPrice = data.lowest_price ?? data.median_price;
      const price = Number(rawPrice.replace("$", "").replace(",", ""));
      await savePrice(id, price);
      console.log(`[${id}] Precio actualizado: ${price}`);
    } catch (error) {
      console.error(`[${id}] Error en ${api_url}:`, error.message);
    }

    await delay(5000);
  }
}

await fetchAllSteamApis();
