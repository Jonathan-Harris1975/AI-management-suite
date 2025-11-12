import { info } from "#logger.js";

export async function generateIntro() {
  info("🎙️ Generating human-like intro");
  return `Welcome back to another episode of AI Weekly. Today, we explore new developments in artificial intelligence — explained clearly and conversationally.`;
}

export async function generateMain() {
  info("🧩 Generating main section");
  return `Let's unpack the most interesting AI stories of the week. This discussion avoids mentioning any RSS feed sources, focusing instead on thoughtful insights and real-world context.`;
}

export async function generateOutro() {
  info("🎧 Generating outro");
  return `Thanks for tuning in to AI Weekly. For more updates, visit Jonathan-Harris dot online — and stay curious about the future of intelligence.`;
}
