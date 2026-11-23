// Schlagzeilen aus frei abrufbaren RSS-Feeds (ohne Schlüssel, ohne Kosten).
// Liste bekannter Quellen: die wichtigsten öffentlichen Nachrichtenangebote der Länder, in denen Deutsch, Englisch
// oder Portugiesisch gesprochen wird, plus Weltnachrichten. label = Kategorie im Brief, country = Land (ISO), für die automatische Auswahl.
export const FEEDS = [
  { id: 'ts_world', name: 'tagesschau', label: 'Welt', lang: 'de', url: 'https://www.tagesschau.de/ausland/index~rss2.xml' },
  { id: 'bbc_world', name: 'BBC', label: 'Welt', lang: 'en', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'dw_world', name: 'DW', label: 'Welt', lang: 'en', url: 'https://rss.dw.com/rdf/rss-en-all' },
  { id: 'ts_de', name: 'tagesschau', label: 'Deutschland', lang: 'de', country: 'DE', url: 'https://www.tagesschau.de/inland/index~rss2.xml' },
  { id: 'orf_at', name: 'ORF', label: 'Österreich', lang: 'de', country: 'AT', url: 'https://rss.orf.at/news.xml' },
  { id: 'srf_ch', name: 'SRF', label: 'Schweiz', lang: 'de', country: 'CH', url: 'https://www.srf.ch/news/bnf/rss/1890' },
  { id: 'rtp_pt', name: 'RTP', label: 'Portugal', lang: 'pt', country: 'PT', url: 'https://www.rtp.pt/noticias/rss' },
  { id: 'g1_br', name: 'g1', label: 'Brasilien', lang: 'pt', country: 'BR', url: 'https://g1.globo.com/rss/g1/' },
  { id: 'abr_br', name: 'Agência Brasil', label: 'Brasilien', lang: 'pt', country: 'BR', url: 'https://agenciabrasil.ebc.com.br/feed/ultimasnoticias/feed.xml' },
  { id: 'bbc_uk', name: 'BBC', label: 'Vereinigtes Königreich', lang: 'en', country: 'GB', url: 'https://feeds.bbci.co.uk/news/uk/rss.xml' },
  { id: 'rte_ie', name: 'RTÉ', label: 'Irland', lang: 'en', country: 'IE', url: 'https://www.rte.ie/feeds/rss/?index=/news' },
  { id: 'npr_us', name: 'NPR', label: 'USA', lang: 'en', country: 'US', url: 'https://feeds.npr.org/1001/rss.xml' },
  { id: 'cbc_ca', name: 'CBC', label: 'Kanada', lang: 'en', country: 'CA', url: 'https://www.cbc.ca/webfeed/rss/rss-topstories' },
  { id: 'abc_au', name: 'ABC', label: 'Australien', lang: 'en', country: 'AU', url: 'https://www.abc.net.au/news/feed/46182/rss.xml' },
  { id: 'rnz_nz', name: 'RNZ', label: 'Neuseeland', lang: 'en', country: 'NZ', url: 'https://www.rnz.co.nz/rss/national.xml' },
];
export const FEED_BY_ID = Object.fromEntries(FEEDS.map((f) => [f.id, f]));
const OLD = { world: ['ts_world', 'bbc_world'], pt: ['rtp_pt'], de: ['ts_de'] };

/** Aktivierte Quellen-IDs (mit Übernahme der alten Einstellung Welt/Portugal/Deutschland). */
export function enabledFeedIds(profile) {
  if (Array.isArray(profile?.news_feeds)) return profile.news_feeds;
  const n = profile?.news || { world: true, de: true };
  return [...new Set(Object.entries(OLD).filter(([k]) => n[k]).flatMap(([, ids]) => ids))];
}
/** Aktivierte Quellen als Objekte (Liste + eigene RSS-Feeds). */
export function enabledFeeds(profile) {
  const custom = Object.fromEntries((profile?.custom_feeds || []).map((f) => [f.id, { ...f, label: f.name, lang: f.lang || null, custom: true }]));
  return enabledFeedIds(profile).map((id) => FEED_BY_ID[id] || custom[id]).filter(Boolean);
}
/** Beim Ortswechsel: Quellen des neuen Landes ergänzen, automatisch hinzugefügte des alten entfernen. */
export function applyCountryFeeds(profile, cc) {
  const ids = [...enabledFeedIds(profile)];
  const auto = new Set(profile.news_auto || []);
  const keep = ids.filter((id) => !(auto.has(id) && FEED_BY_ID[id]?.country !== cc));
  const add = FEEDS.filter((f) => f.country && f.country === cc && !keep.includes(f.id)).map((f) => f.id);
  profile.news_feeds = [...keep, ...add];
  profile.news_auto = [...[...auto].filter((id) => keep.includes(id)), ...add];
  return { added: add.map((id) => FEED_BY_ID[id]), removed: ids.filter((id) => !keep.includes(id)).map((id) => FEED_BY_ID[id]).filter(Boolean) };
}
/** Nur öffentliche http(s)-Adressen zulassen (kein Zugriff auf das eigene Netz über eigene Feeds). */
export function safeFeedUrl(raw) {
  let u; try { u = new URL(String(raw).trim()); } catch { throw new Error('Das ist keine gültige Adresse'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Nur http- oder https-Adressen');
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '0.0.0.0' || h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')
    || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || !h.includes('.') && !h.includes(':')) throw new Error('Diese Adresse ist nicht erlaubt');
  return u.toString();
}

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

export async function fetchFeed(feed, timeoutMs = 8000) {
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
    items.feedTitle = feedTitle(xml);
    return items;
  } finally { clearTimeout(t); }
}

/** enabled: { world: true, pt: false, de: true } -> { world: [...], de: [...] , errors: [] } */
/** Titel eines Feeds (für eigene Quellen). */
export function feedTitle(xml) { const m = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? decode(m[1]).slice(0, 60) : ''; }

/** Schlagzeilen je Kategorie (label) aus den übergebenen Quellen. */
export async function getHeadlines(feeds, { maxAgeH = 30, perCategory = 10 } = {}) {
  const groups = {}; const errors = [];
  const cutoff = Date.now() - maxAgeH * 3600e3;
  const byLabel = {};
  for (const f of feeds || []) (byLabel[f.label] ||= []).push(f);
  await Promise.all(Object.entries(byLabel).map(async ([label, list]) => {
    const items = [];
    await Promise.all(list.map(async (f) => {
      try { items.push(...await fetchFeed(f)); } catch (e) { errors.push(`${f.name}: ${e.message}`); }
    }));
    const fresh = items.filter((x) => !x.date || isNaN(x.date) || x.date.getTime() >= cutoff);
    // je Quelle die neuesten, dann abwechselnd mischen – so verdrängt keine Quelle die andere
    const bySource = {};
    for (const x of fresh) (bySource[x.source] ||= []).push(x);
    const lists = Object.values(bySource).map((l) => l.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)));
    const mixed = [];
    for (let i = 0; mixed.length < perCategory && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && mixed.length < perCategory) mixed.push(l[i]);
    groups[label] = mixed.map((x) => ({ text: `${x.title} (${x.source})${x.summary ? ` – ${x.summary}` : ''}`, lang: x.lang || '?' }));
  }));
  return { groups, errors };
}
