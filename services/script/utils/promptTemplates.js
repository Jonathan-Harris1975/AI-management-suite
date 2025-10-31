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

// --- AGGRESSIVE TRANSITION ENFORCER (hardened) ---
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

// --- ENHANCED HUMANIZER WITH TRANSITION FOCUS (hardened) ---
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

// --- UPDATED INTRO PROMPT (natural flow, no temperature) ---
export function getIntroPrompt({ weatherSummary, turingQuote }) {
  return `${persona}

Write the podcast intro script in a natural, conversational tone.
Start with a dry, witty observation about the UK weather, based on this input: ${weatherSummary}.
⚠️ Do NOT mention temperature, numbers, or weather data values.
Let the remark sound natural — like a human would speak, not a robot.

Then flow seamlessly into this Alan Turing quote, delivered sincerely but conversationally:
"${turingQuote}"

Use that quote as a thematic bridge into the show's introduction:

"Tired of drowning in AI headlines? Ready for clarity, insight, and a direct line to the pulse of innovation? Welcome to Turing's Torch: AI Weekly! I'm Jonathan Harris, your host, and I'm cutting through the noise to bring you the most critical AI developments, explained, analysed, and delivered straight to you. Let's ignite your understanding of AI, together."

**STYLE REQUIREMENTS:**
- Keep it compact, human, and fluent
- Avoid robotic or abrupt transitions
- Exclude temperature or numeric details
- Plain text only (no sound cues, notes, or directions)
- Smooth flow: weather → quote → theme intro`;
}

// --- ULTRA-STRICT MAIN PROMPT ---
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

**ZERO TOLERANCE RULES - VIOLATION MEANS FAILURE:**
❌ NEVER use: "Right, another week...", "Well, another week...", "Right, well...", "So, there you have it..."
❌ NEVER start a new topic abruptly
❌ NEVER use numerical indicators like "first", "second", "next"

**REQUIRED TRANSITION TECHNIQUES:**
✅ Use thematic bridges: Connect stories through common themes like ${articleThemes.join(", ")}
✅ Use cause-and-effect: "This development naturally leads us to consider..."
✅ Use contrasting perspectives: "While that story focused on X, this one shows Y..."
✅ Use question flows: "But what does this mean for Z? That question brings us to..."

**EXAMPLE OF PERFECT FLOW:**
"The massive computing infrastructure being built by tech giants raises important questions about practical applications, which brings us to a fascinating development in the legal sector where AI is being deployed in surprisingly effective ways..."

**ARTICLES TO COVER:**
${normalizedArticles
    .map((text, index) => `--- ARTICLE ${index + 1} ---\n${text.substring(0, 500)}...`)
    .join("\n\n")}

**YOUR TASK:**
1. Write ONE continuous monologue (no breaks, no sections)
2. Find natural connections between the articles
3. Maintain your witty, analytical tone throughout
4. Keep it conversational and flowing

**REMEMBER:** If you use repetitive transitions, your response will be rejected. Focus on creating a narrative that connects all stories organically.`;

  return humanize(mainPrompt);
}

// --- THEMATIC ANALYSIS HELPER ---
function analyzeArticleThemes(articles) {
  const themes = new Set();
  const themeKeywords = {
    legal: ["legal", "law", "court", "litigation", "lawyer", "firm"],
    technology: ["AI", "algorithm", "software", "tech", "digital", "compute"],
    business: ["funding", "investment", "startup", "market", "business"],
    infrastructure: ["infrastructure", "data center", "server", "GPU", "compute"],
    education: ["education", "training", "curriculum", "school", "learn"],
  };

  articles.forEach((article) => {
    const articleText =
      typeof article === "string" ? article.toLowerCase() : JSON.stringify(article).toLowerCase();
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some((keyword) => articleText.includes(keyword))) {
        themes.add(theme);
      }
    }
  });

  return Array.from(themes);
}

// --- OUTRO PROMPT (hardened + validated) ---
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

  const outroPrompt = `${persona}

Write the closing script that flows naturally from the final story.

**TRANSITION RULE:** Do NOT start with "Well, another week..." or similar. Create a smooth bridge from the last topic.

**STRUCTURE:**
1. Start with a reflection that connects to the final story's theme
2. Transition personally to your book using this CTA: "${safeCta}"
3. Mention the book title: "${safeTitle}" and website: "${safeUrl}"
4. Deliver the branded sign-off

**BOOK PROMOTION GUIDELINES:**
- Keep it authentic and personal - it's YOUR book
- Integrate the CTA naturally: "${safeCta}"
- Pronounce URLs naturally: "${safeUrl.replace(/\./g, " dot ")}"
- Make it feel like a genuine recommendation, not an advertisement

**EXAMPLE STRUCTURE:**
"These legal technology developments show how AI is transforming traditional sectors... [CTA: ${safeCta}] I explore this transformation in depth in my book '${safeTitle}' available at ${safeUrl.replace(
    /\./g,
    " dot "
  )}. And that's a wrap on another week in AI land..."

**CRITICAL:**
- MUST include the CTA: "${safeCta}"
- MUST mention the book title and URL
- No stage directions, only spoken words
- Maintain continuous flow from the main content

Create a single, unbroken closing monologue that includes all these elements naturally.`;

  if (!outroPrompt || outroPrompt.trim().length < 10) {
    throw new Error("Invalid outro prompt — empty or malformed content");
  }

  return outroPrompt;
}

// --- VALIDATION HELPERS ---
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
  const starterFrequency = starters.reduce((acc, starter) => {
    acc[starter] = (acc[starter] || 0) + 1;
    return acc;
  }, {});

  Object.entries(starterFrequency).forEach(([starter, count]) => {
    if (count > 3 && count > sentences.length * 0.2) {
      violations.push({
        pattern: "Repetitive starter",
        matches: [`"${starter}" used ${count} times`],
        message: `Overused sentence starter`,
      });
    }
  });

  return {
    isValid: violations.length === 0,
    violations,
    score: Math.max(0, 10 - violations.length * 2),
  };
}

export function validateOutro(script, expectedCta, expectedTitle, expectedUrl) {
  const issues = [];
  const safeScript = String(script ?? "");

  if (expectedCta && !safeScript.includes(expectedCta))
    issues.push(`Missing CTA: "${expectedCta}"`);
  if (expectedTitle && !safeScript.includes(expectedTitle))
    issues.push(`Missing book title: "${expectedTitle}"`);

  const cleanUrl = expectedUrl?.replace(/^https?:\/\//, "");
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
