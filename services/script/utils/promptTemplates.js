// services/script/utils/promptTemplates.js

import getSponsor from './getSponsor.js';
import generateCta from './generateCta.js';
import { getRandomTone } from './toneSetter.js';
import DurationCalculator from './durationCalculator.js';

const episodeTone = getRandomTone();

// --- STRICTER PERSONA PROMPT ---
const persona = `You are Jonathan Harris, a witty British Gen X host of the podcast "Turing's Torch: AI Weekly".
Your persona has the following traits:
- Tone: ${episodeTone}, dry, lightly sarcastic, and highly intelligent.
- Style: You speak in a natural, conversational monologue.

**CRITICAL RULES - YOU WILL BE PENALIZED FOR VIOLATING THESE:**
1. **ABSOLUTELY NO repetitive transitions:** Never use "Right, another week...", "Well, another week...", "Right, well...", "So, there you have it...", or any variation.
2. **NO abrupt topic changes:** Create seamless transitions by finding thematic connections between stories.
3. **NO speaker labels or stage directions:** Only include spoken words.
4. **Treat the entire script as ONE continuous thought:** The listener should not detect article boundaries.

**TRANSITION ENFORCEMENT:** If you violate these rules, your response will be rejected and you'll have to start over.`;

// --- AGGRESSIVE TRANSITION ENFORCER ---
function enforceTransitions(input) {
  let modifiedText = "";

  if (Array.isArray(input)) modifiedText = input.join(" ");
  else if (typeof input === "object" && input !== null)
    modifiedText = input.text || JSON.stringify(input);
  else if (typeof input === "string") modifiedText = input;
  else modifiedText = String(input ?? "");

  const forbiddenPatterns = [
    /(Right|Well|So),\s*(another|a)\s*(week|day|batch|flurry)/gi,
    /(Right|Well|So),\s*(another|a)\s*/gi,
    /Another\s*(week|day)\s*,?\s*another/gi,
    /Well,\s*another/gi,
    /Right,\s*another/gi,
    /So,\s*there you have it/gi,
    /Now,\s*moving on to/gi,
  ];

  let violations = 0;
  for (const pattern of forbiddenPatterns) {
    if (typeof modifiedText.match === "function") {
      const matches = modifiedText.match(pattern);
      if (matches) {
        violations += matches.length;
        modifiedText = modifiedText.replace(pattern, () => {
          const alternatives = [
            "This brings us to",
            "Meanwhile,",
            "In a related development,",
            "Shifting focus to",
            "Which naturally leads to",
            "This story connects to",
          ];
          return alternatives[Math.floor(Math.random() * alternatives.length)];
        });
      }
    }
  }

  if (violations > 0)
    console.log(`🚫 Fixed ${violations} transition violations`);

  return modifiedText;
}

// --- ENHANCED HUMANIZER ---
function humanize(input) {
  let text = "";
  if (Array.isArray(input)) text = input.join(" ");
  else if (typeof input === "object" && input !== null)
    text = input.text || JSON.stringify(input);
  else text = String(input ?? "");

  let result = enforceTransitions(text);

  const synonyms = {
    AI: [
      "AI",
      "artificial intelligence",
      "these systems",
      "machine intelligence",
      "the current AI landscape",
    ],
    however: ["though", "that said", "but then again", "although", "then again"],
    therefore: ["so", "which means", "consequently", "as a result", "thus"],
    significant: ["notable", "major", "important", "substantial", "considerable"],
  };

  for (const word in synonyms) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(regex, () => {
      const options = synonyms[word];
      return options[Math.floor(Math.random() * options.length)];
    });
  }

  return result;
}

// --- INTRO PROMPT ---
export function getIntroPrompt({ weatherSummary, turingQuote }) {
  const introVariants = [
    "Welcome to another episode of Turing's Torch: AI Weekly.",
    "You're listening to Turing's Torch: AI Weekly.",
    "This is Turing's Torch: AI Weekly — your spark in the world of AI.",
  ];
  const selectedIntro = introVariants[Math.floor(Math.random() * introVariants.length)];

  return `${persona}

Write the podcast intro script in a natural, conversational tone.
Start with a dry, witty observation about the UK weather, based on this input: ${weatherSummary}.
⚠️ Do NOT mention temperature, numbers, or weather data values.
Let the remark sound natural — like a human would speak, not a robot.

Then flow seamlessly into this Alan Turing quote, delivered sincerely but conversationally:
"${turingQuote}"

Use that quote as a thematic bridge into the show's introduction:

"Tired of drowning in AI headlines? Ready for clarity, insight, and a direct line to the pulse of innovation? ${selectedIntro} I'm Jonathan Harris, your host, cutting through the noise to bring you the most critical AI developments, explained, analysed, and delivered straight to you. Let's ignite your understanding of AI, together."

**STYLE REQUIREMENTS:**
- Keep it compact, human, and fluent
- Avoid robotic or abrupt transitions
- Exclude temperature or numeric details
- Plain text only (no sound cues, notes, or directions)
- Smooth flow: weather → quote → theme intro`;
}

// --- MAIN PROMPT ---
export function getMainPrompt({ articles = [], targetDuration = 60 }) {
  const normalizedArticles = Array.isArray(articles)
    ? articles.filter((a) => typeof a === "string" && a.trim().length > 0)
    : typeof articles === "string"
    ? [articles]
    : [];

  const articleCount = normalizedArticles.length;

  if (articleCount === 0) {
    return `${persona}\n\nNo articles are available. Create an engaging 5-7 minute monologue about recent AI developments.`;
  }

  const { targetChars, estimatedMinutes } = DurationCalculator.calculateArticleTargets(
    targetDuration,
    articleCount
  );

  console.log(
    `📝 Articles: ${articleCount}, Target: ${targetChars} chars/article, Est: ${estimatedMinutes.toFixed(
      1
    )}min content`
  );

  const articleThemes = analyzeArticleThemes(normalizedArticles);

  const mainPrompt = `${persona}

**YOUR PRIMARY MISSION:** Create a SINGLE, SEAMLESS monologue where ${articleCount} news stories flow together naturally. The listener should NOT be able to tell where one article ends and the next begins.

**ZERO TOLERANCE RULES:**
❌ NEVER use "Right, another week..." or similar
❌ NEVER start a new topic abruptly
❌ NEVER use "first", "second", "next" to enumerate

**TRANSITION TECHNIQUES:**
✅ Thematic bridges — connect stories through shared ideas: ${articleThemes.join(", ")}
✅ Cause and effect: "This development naturally leads us to consider..."
✅ Contrast: "While that story focused on X, this one shows Y..."
✅ Question flow: "But what does this mean for Z? That brings us to..."

**ARTICLES:**
${normalizedArticles
    .map((text, i) => `--- ARTICLE ${i + 1} ---\n${text.substring(0, 500)}...`)
    .join("\n\n")}

Now write one continuous, witty, analytical monologue in plain text with smooth flow.`;

  return humanize(mainPrompt);
}

// --- THEME DETECTOR ---
function analyzeArticleThemes(articles) {
  const themes = new Set();
  const themeKeywords = {
    legal: ["legal", "law", "court", "litigation", "lawyer", "firm"],
    technology: ["AI", "algorithm", "software", "tech", "digital", "compute"],
    business: ["funding", "investment", "startup", "market", "business"],
    infrastructure: ["infrastructure", "data center", "server", "GPU", "compute"],
    education: ["education", "training", "curriculum", "school", "learn"],
  };

  articles.forEach((a) => {
    const text = (typeof a === "string" ? a : JSON.stringify(a)).toLowerCase();
    for (const [theme, words] of Object.entries(themeKeywords)) {
      if (words.some((w) => text.includes(w))) themes.add(theme);
    }
  });
  return Array.from(themes);
}

// --- OUTRO PROMPT (with dynamic tagline) ---
export async function getOutroPromptFull() {
  let myBook, title, url, cta;

  try {
    myBook = await getSponsor();
    title = myBook?.title || "Digital Diagnosis: How AI Is Revolutionizing Healthcare";
    url = myBook?.url?.replace(/^https?:\/\//, "") || "jonathan-harris.online";
    cta = await generateCta(myBook);
  } catch (err) {
    console.error("⚠️ Failed to resolve sponsor or CTA:", err);
    title = "Digital Diagnosis: How AI Is Revolutionizing Healthcare";
    url = "jonathan-harris.online";
    cta = "Explore the future of AI in my latest eBook at jonathan-harris.online";
  }

  const safeCta = String(cta ?? "Learn more about my latest AI book online.");
  const safeTitle = String(title ?? "AI Weekly");
  const safeUrl = String(url ?? "jonathan-harris.online");

  const outroVariants = [
    "That's it for this week's Turing's Torch. Keep the flame burning, stay curious, and I'll see you next week with more AI insights that matter. I'm Jonathan Harris—keep building the future.",
    "And that wraps up this week's Turing's Torch. Stay curious, keep the flame alive, and join me next week for more AI stories that truly matter. I'm Jonathan Harris—keep building the future.",
    "That’s all from this week’s Turing’s Torch. Keep that curiosity blazing, and I’ll see you next week for more insights that matter. I’m Jonathan Harris—keep building the future.",
  ];
  const selectedOutro = outroVariants[Math.floor(Math.random() * outroVariants.length)];

  const outroPrompt = `${persona}

Write the closing script that flows naturally from the final story.

**STRUCTURE:**
1. Reflect briefly on the final story's theme
2. Transition naturally into your personal CTA: "${safeCta}"
3. Mention your book title: "${safeTitle}" and website: "${safeUrl}"
4. End with this sign-off (allow natural paraphrasing, but maintain meaning):
"${selectedOutro}"

**GUIDELINES:**
- Authentic, conversational tone
- Integrate book mention naturally, not like an ad
- Speak URL naturally (dots as "dot")
- Plain text only
- Smooth continuity from previous content`;

  if (!outroPrompt || outroPrompt.trim().length < 10)
    throw new Error("Invalid outro prompt — empty or malformed content");

  return outroPrompt;
}

// --- VALIDATORS ---
export function validateScript(script) {
  const violations = [];
  const forbiddenPatterns = [
    /(Right|Well|So),\s*(another|a)\s*(week|day|batch|flurry)/gi,
    /Another\s*(week|day)\s*,?\s*another/gi,
    /Well,\s*another/gi,
    /Right,\s*another/gi,
    /So,\s*there you have it/gi,
  ];

  const safeScript = String(script ?? "");

  forbiddenPatterns.forEach((pattern) => {
    const matches = safeScript.match(pattern);
    if (matches) {
      violations.push({
        pattern: pattern.toString(),
        matches,
        message: `Found forbidden transition pattern`,
      });
    }
  });

  const sentences = safeScript.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const starters = sentences.map((s) => s.trim().split(" ")[0].toLowerCase());
  const freq = starters.reduce((acc, s) => ((acc[s] = (acc[s] || 0) + 1), acc), {});
  Object.entries(freq).forEach(([w, c]) => {
    if (c > 3 && c > sentences.length * 0.2)
      violations.push({ pattern: "Repetitive starter", matches: [`"${w}" used ${c} times`] });
  });

  return { isValid: violations.length === 0, violations, score: Math.max(0, 10 - violations.length * 2) };
}

export function validateOutro(script, expectedCta, expectedTitle, expectedUrl) {
  const issues = [];
  const safeScript = String(script ?? "");
  const cleanUrl = expectedUrl?.replace(/^https?:\/\//, "");

  if (expectedCta && !safeScript.includes(expectedCta))
    issues.push(`Missing CTA: "${expectedCta}"`);
  if (expectedTitle && !safeScript.includes(expectedTitle))
    issues.push(`Missing book title: "${expectedTitle}"`);
  if (cleanUrl && !safeScript.includes(cleanUrl))
    issues.push(`Missing website: "${cleanUrl}"`);

  const transitionViolations = validateScript(safeScript).violations;
  if (transitionViolations.length > 0)
    issues.push(...transitionViolations.map((v) => v.message));

  return {
    isValid: issues.length === 0,
    issues,
    hasCta: expectedCta ? safeScript.includes(expectedCta) : false,
    hasBook: expectedTitle ? safeScript.includes(expectedTitle) : false,
    hasUrl: cleanUrl ? safeScript.includes(cleanUrl) : false,
  };
}

export default {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
  humanize,
  enforceTransitions,
  validateScript,
  validateOutro,
};
