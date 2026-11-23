// Schlagzeilen aus frei abrufbaren RSS-Feeds (ohne Schlüssel, ohne Kosten).
export const NEWS_CATEGORIES = {
  world: { label: 'Welt', feeds: [
    { name: 'tagesschau', lang: 'de', url: 'https://www.tagesschau.de/ausland/index~rss2.xml' },
    { name: 'BBC', lang: 'en', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  ] },
  pt: { label: 'Portugal', feeds: [
    { name: 'RTP', lang: 'pt', url: 'https://www.rtp.pt/noticias/rss' },
  ] },
  de: { label: 'Deutschland', feeds: [
    { name: 'tagesschau', lang: 'de', url: 'https://www.tagesschau.de/inland/index~rss2.xml' },
  ] },
};

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, ' ') // als Text kodiertes HTML nach dem Dekodieren entfernen
  .replace(/\s+/g, ' ').trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};

/** Liest RSS 2.0 / RDF / Atom und gibt [{title, link, date, summary}] zurück. */
export function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  return blocks.map((b) => {
    let link = tag(b, 'link');
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ''; }
    const date = tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'dc:date') || tag(b, 'published');
    return { title: tag(b, 'title'), link, date: date ? new Date(date) : null, summary: (tag(b, 'description') || tag(b, 'summary')).slice(0, 200) };
  }).filter((x) => x.title);
}

/** Zeichensatz aus Header oder XML-Deklaration (z. B. ISO-8859-1) beachten. */
export function decodeBody(bytes, contentType = '') {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 200));
  const cs = (contentType.match(/charset=([\w-]+)/i) || head.match(/encoding=["']([\w-]+)["']/i) || [])[1] || 'utf-8';
  try { return new TextDecoder(cs.toLowerCase()).decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

async function fetchFeed(feed, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Manche Sender (RTP, BBC) blocken unbekannte Programme – wie ein normaler Browser anfragen
    const r = await fetch(feed.url, { signal: ctrl.signal, redirect: 'follow', headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 MeinTag/1.0',
      Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
      'Accept-Language': feed.lang === 'pt' ? 'pt-PT,pt;q=0.9' : feed.lang === 'en' ? 'en-GB,en;q=0.9' : 'de-DE,de;q=0.9',
    } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = decodeBody(new Uint8Array(await r.arrayBuffer()), r.headers.get('content-type') || '');
    const items = parseFeed(xml).map((x) => ({ ...x, source: feed.name, lang: feed.lang }));
    if (!items.length) throw new Error(`keine Meldungen gefunden (Antwort beginnt mit: ${xml.slice(0, 60).replace(/\s+/g, ' ')})`);
    return items;
  } finally { clearTimeout(t); }
}

/** enabled: { world: true, pt: false, de: true } -> { world: [...], de: [...] , errors: [] } */
export async function getHeadlines(enabled, { maxAgeH = 30, perCategory = 10 } = {}) {
  const out = {}; const errors = [];
  const cutoff = Date.now() - maxAgeH * 3600e3;
  await Promise.all(Object.entries(NEWS_CATEGORIES).filter(([id]) => enabled?.[id]).map(async ([id, cat]) => {
    const items = [];
    await Promise.all(cat.feeds.map(async (f) => {
      try { items.push(...await fetchFeed(f)); } catch (e) { errors.push(`${f.name}: ${e.message}`); }
    }));
    const fresh = items.filter((x) => !x.date || isNaN(x.date) || x.date.getTime() >= cutoff);
    // je Quelle die neuesten, dann abwechselnd mischen – so verdrängt keine Quelle die andere
    const bySource = {};
    for (const x of fresh) (bySource[x.source] ||= []).push(x);
    const lists = Object.values(bySource).map((l) => l.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)));
    const mixed = [];
    for (let i = 0; mixed.length < perCategory && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && mixed.length < perCategory) mixed.push(l[i]);
    out[id] = mixed
      .map((x) => ({ text: `${x.title} (${x.source})${x.summary ? ` – ${x.summary}` : ''}`, lang: x.lang }));
  }));
  return { ...out, errors };
}
