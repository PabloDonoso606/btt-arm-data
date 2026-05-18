import { supabase } from "./lib/supabase.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  Referer: "https://steamcommunity.com/market/",
};

async function getSteamApiUrls() {
  const PAGE_SIZE = 1000;
  let allData = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("steam")
      .select("id, api_url")
      .order("price_updated_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    allData.push(...data);

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allData;
}

async function savePrice(id, price) {
  const { error } = await supabase
    .from("steam")
    .update({ price, price_updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function fetchWithRetry(api_url, maxRetries = 5) {
  let attempt = 0;

  while (attempt < maxRetries) {
    const response = await fetch(api_url, { headers: HEADERS });

    if (response.ok) return response.json();

    if (response.status === 429) {
      attempt++;
      if (attempt >= maxRetries)
        throw new Error(`429 tras ${maxRetries} intentos — ${api_url}`);

      const backoff = Math.pow(2, attempt) * 10_000;
      const jitter = Math.random() * 5000;
      const wait = backoff + jitter;

      console.warn(
        `  ↳ 429 recibido, reintento ${attempt}/${maxRetries} en ${(wait / 1000).toFixed(1)}s...`,
      );
      await delay(wait);
      continue;
    }

    throw new Error(`HTTP ${response.status} — ${api_url}`);
  }
}

async function fetchPrice(id, api_url) {
  const json = await fetchWithRetry(api_url);

  if (!json.success) return null;

  const raw = json.lowest_price ?? json.median_price ?? null;
  if (!raw) return null;

  const price = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return isNaN(price) ? null : price;
}

async function run() {
  const urls = await getSteamApiUrls();
  console.log(`Procesando ${urls.length} URLs...`);

  for (const [i, { id, api_url }] of urls.entries()) {
    try {
      const price = await fetchPrice(id, api_url);

      if (price !== null) {
        await savePrice(id, price);
        console.log(`[${i + 1}/${urls.length}] ✓ id=${id} price=${price}`);
      } else {
        console.warn(`[${i + 1}/${urls.length}] ⚠ Sin precio — id=${id}`);
      }
    } catch (err) {
      console.error(`[${i + 1}/${urls.length}] ✗ id=${id}: ${err.message}`);
    }

    if (i < urls.length - 1) {
      const ms = Math.floor(Math.random() * 5000) + 5000;
      console.log(`  ↳ Esperando ${(ms / 1000).toFixed(1)}s...`);
      await delay(ms);
    }
  }

  console.log("Proceso completado.");
}

await run();
