// services/script/utils/generateCta.js

export default function generateCta(book) {
  const safeTitle = book?.title?.replace(/[-]/g, " ") ?? "this topic";

  const rawUrl = book?.url || "https://jonathan-harris.online";
  const spokenUrl = rawUrl
    .replace(/^https?:\/\//, "")
    .replace(/www\./, "")
    .replace(/\./g, " dot ")
    .replace(/-/g, " dash ")
    .replace(/\//g, " slash ")
    .trim();

  return `Curious to explore "${safeTitle}" and more? Head over to ${spokenUrl} — you'll find my full ebook collection, daily artificial intelligence newsletter, and plenty of sharp, spam-free insights.`;
}
