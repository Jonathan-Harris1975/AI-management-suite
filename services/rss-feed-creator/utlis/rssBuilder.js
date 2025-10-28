import xml2js from "xml2js";

// Parse existing XML into structured item array
export function parseExistingRssXml(xml) {
  if (!xml) return [];
  const parser = new xml2js.Parser({ explicitArray: false });
  let items = [];
  parser.parseString(xml, (err, res) => {
    if (err) return [];
    const raw = res?.rss?.channel?.item || [];
    items = Array.isArray(raw) ? raw : [raw];
  });
  return items.map((i) => ({
    title: i.title,
    summary: i.description,
    link: i.link,
    pubDate: i.pubDate,
    source: i.source || "",
  }));
}

// Build XML back from item array
export function buildRssXml(items) {
  const builder = new xml2js.Builder({ rootName: "rss", xmldec: { version: "1.0", encoding: "UTF-8" } });
  const channel = {
    title: "AI Digest by Jonathan Harris",
    link: "https://jonathan-harris.online",
    description: "Daily AI news digest rewritten in a human Gen-X tone.",
    language: "en",
    pubDate: new Date().toUTCString(),
    item: items.map((i) => ({
      title: i.title,
      link: i.link,
      description: i.summary,
      pubDate: i.pubDate,
    })),
  };
  return builder.buildObject({ rss: { channel } });
}
