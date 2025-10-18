import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/promptTemplates.js
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
function enforceTransitions(text) {
  const forbiddenPatterns = [
    /(Right|Well|So),\s*(another|a)\s*(week|day|batch|flurry)/gi,
    /(Right|Well|So),\s*(another|a)\s*/gi,
    /Another\s*(week|day)\s*,?\s*another/gi,
    /Well,\s*another/gi,
    /Right,\s*another/gi,
    /So,\s*there you have it/gi,
    /Now,\s*moving on to/gi
  ];

  let modifiedText = text;
  let violations = 0;

  forbiddenPatterns.forEach(pattern => {
    const matches = modifiedText.match(pattern);
    if (matches) {
      violations += matches.length;
      // Replace with better transitions
      modifiedText = modifiedText.replace(pattern, (match) => {
        const alternatives = [
          'This brings us to',
          'Meanwhile,',
          'In a related development,',
          'Shifting focus to',
          'Which naturally leads to',
          'This story connects to'
        ];
        return alternatives[Math.floor(Math.random() * alternatives.length)];
      });
    }
  });

  if (violations > 0) {
    console.log(`🚫 Fixed ${violations} transition violations`);
  }

  return modifiedText;
}

// --- ENHANCED HUMANIZER WITH TRANSITION FOCUS ---
function humanize(text) {
  // First enforce transitions
  let result = enforceTransitions(text);

  // Then apply general humanization
  const synonyms = {
    "AI": ["AI", "artificial intelligence", "these systems", "machine intelligence", "the current AI landscape"],
    "however": ["though", "that said", "but then again", "although", "then again"],
    "therefore": ["so", "which means", "consequently", "as a result", "thus"],
    "significant": ["notable", "major", "important", "substantial", "considerable"],
  };

  for (const word in synonyms) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      const options = synonyms[word];
      return options[Math.floor(Math.random() * options.length)];
    });
  }

  return result;
}

// --- INTRO PROMPT WITH TRANSITION CONTROL ---
export function getIntroPrompt({ weatherSummary, turingQuote }) {
  return `${persona}

Write the intro script. Start with a dry, witty remark about the UK weather: ${weatherSummary}.
Flow naturally into this Alan Turing quote, delivered sincerely: "${turingQuote}".

**TRANSITION RULE:** Do NOT start with "Right, another day..." or similar phrases. Begin conversationally.

Use the quote as a springboard into the show's theme, rolling smoothly into:
"Tired of drowning in AI headlines? Ready for clarity, insight, and a direct line to the pulse of innovation? Welcome to Turing's Torch: AI Weekly! I'm Jonathan Harris, your host, and I'm cutting through the noise to bring you the most critical AI developments, explained, analysed, and delivered straight to you. Let's ignite your understanding of AI, together."

Keep it compact and conversational.`;
}

// --- ULTRA-STRICT MAIN PROMPT ---
export function getMainPrompt(articleTextArray, targetDuration = 60) {
  const articleCount = articleTextArray.length;
  
  if (articleCount === 0) {
    return `${persona}\n\nNo articles are available. Create an engaging 5-7 minute monologue about recent AI developments.`;
  }
  
  const { targetChars, estimatedMinutes } = DurationCalculator.calculateArticleTargets(
    targetDuration, 
    articleCount
  );
  
  console.log(`📝 Articles: ${articleCount}, Target: ${targetChars} chars/article, Est: ${estimatedMinutes.toFixed(1)}min content`);

  // Analyze articles for thematic connections
  const articleThemes = analyzeArticleThemes(articleTextArray);
  
  const mainPrompt = `${persona}

**YOUR PRIMARY MISSION:** Create a SINGLE, SEAMLESS monologue where ${articleCount} news stories flow together naturally. The listener should NOT be able to tell where one article ends and the next begins.

**ZERO TOLERANCE RULES - VIOLATION MEANS FAILURE:**
❌ NEVER use: "Right, another week...", "Well, another week...", "Right, well...", "So, there you have it..."
❌ NEVER start a new topic abruptly
❌ NEVER use numerical indicators like "first", "second", "next"

**REQUIRED TRANSITION TECHNIQUES:**
✅ Use thematic bridges: Connect stories through common themes like ${articleThemes.join(', ')}
✅ Use cause-and-effect: "This development naturally leads us to consider..."
✅ Use contrasting perspectives: "While that story focused on X, this one shows Y..."
✅ Use question flows: "But what does this mean for Z? That question brings us to..."

**EXAMPLE OF PERFECT FLOW:**
"The massive computing infrastructure being built by tech giants raises important questions about practical applications, which brings us to a fascinating development in the legal sector where AI is being deployed in surprisingly effective ways..."

**ARTICLES TO COVER:**
${articleTextArray.map((text, index) => `--- ARTICLE ${index + 1} ---\n${text.substring(0, 500)}...`).join('\n\n')}

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
    'legal': ['legal', 'law', 'court', 'litigation', 'lawyer', 'firm'],
    'technology': ['AI', 'algorithm', 'software', 'tech', 'digital', 'compute'],
    'business': ['funding', 'investment', 'startup', 'market', 'business'],
    'infrastructure': ['infrastructure', 'data center', 'server', 'GPU', 'compute'],
    'education': ['education', 'training', 'curriculum', 'school', 'learn']
  };

  articles.forEach(article => {
    const articleText = article.toLowerCase();
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(keyword => articleText.includes(keyword))) {
        themes.add(theme);
      }
    }
  });

  return Array.from(themes);
}

// --- CORRECTED OUTRO PROMPT ---
export async function getOutroPromptFull() {
  const myBook = await getSponsor();
  const title = myBook?.title ?? 'Digital Diagnosis: How AI Is Revolutionizing Healthcare';
  const url = myBook?.url?.replace(/^https?:\/\//, '') ?? 'jonathan-harris.online';
  const cta = await generateCta(myBook); // Ensure this is awaited and used

  return `${persona}

Write the closing script that flows naturally from the final story.

**TRANSITION RULE:** Do NOT start with "Well, another week..." or similar. Create a smooth bridge from the last topic.

**STRUCTURE:**
1. Start with a reflection that connects to the final story's theme
2. Transition personally to your book using this CTA: "${cta}"
3. Mention the book title: "${title}" and website: "${url}"
4. Deliver the branded sign-off

**BOOK PROMOTION GUIDELINES:**
- Keep it authentic and personal - it's YOUR book
- Integrate the CTA naturally: "${cta}"
- Pronounce URLs naturally: "${url.replace(/\./g, ' dot ')}" (e.g., "jonathan-harris dot online")
- Make it feel like a genuine recommendation, not an advertisement

**EXAMPLE STRUCTURE:**
"These legal technology developments show how AI is transforming traditional sectors... [CTA: ${cta}] I explore this transformation in depth in my book '${title}' available at ${url.replace(/\./g, ' dot ')}. And that's a wrap on another week in AI land..."

**CRITICAL:**
- MUST include the CTA: "${cta}"
- MUST mention the book title and URL
- No stage directions, only spoken words
- Maintain continuous flow from the main content

Create a single, unbroken closing monologue that includes all these elements naturally.`;
}

// --- STRICT VALIDATION FUNCTION ---
export function validateScript(script) {
  const violations = [];
  
  const forbiddenPatterns = [
    /(Right|Well|So),\s*(another|a)\s*(week|day|batch|flurry)/gi,
    /Another\s*(week|day)\s*,?\s*another/gi,
    /Well,\s*another/gi,
    /Right,\s*another/gi,
    /So,\s*there you have it/gi
  ];

  forbiddenPatterns.forEach(pattern => {
    const matches = script.match(pattern);
    if (matches) {
      violations.push({
        pattern: pattern.toString(),
        matches: matches,
        message: `Found forbidden transition pattern`
      });
    }
  });

  // Check for repetitive sentence structure
  const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const starters = sentences.map(s => s.trim().split(' ')[0].toLowerCase());
  const starterFrequency = starters.reduce((acc, starter) => {
    acc[starter] = (acc[starter] || 0) + 1;
    return acc;
  }, {});

  Object.entries(starterFrequency).forEach(([starter, count]) => {
    if (count > 3 && count > sentences.length * 0.2) {
      violations.push({
        pattern: 'Repetitive starter',
        matches: [`"${starter}" used ${count} times`],
        message: `Overused sentence starter`
      });
    }
  });

  return {
    isValid: violations.length === 0,
    violations: violations,
    score: Math.max(0, 10 - violations.length * 2) // Score out of 10
  };
}

// --- VALIDATE OUTRO FUNCTION ---
export function validateOutro(script, expectedCta, expectedTitle, expectedUrl) {
  const issues = [];
  
  // Check for CTA inclusion
  if (expectedCta && !script.includes(expectedCta)) {
    issues.push(`Missing CTA: "${expectedCta}"`);
  }
  
  // Check for book title inclusion
  if (expectedTitle && !script.includes(expectedTitle)) {
    issues.push(`Missing book title: "${expectedTitle}"`);
  }
  
  // Check for URL inclusion (clean version)
  const cleanUrl = expectedUrl?.replace(/^https?:\/\//, '');
  if (cleanUrl && !script.includes(cleanUrl)) {
    issues.push(`Missing website: "${cleanUrl}"`);
  }
  
  // Check for forbidden transitions
  const transitionViolations = validateScript(script).violations;
  if (transitionViolations.length > 0) {
    issues.push(...transitionViolations.map(v => v.message));
  }
  
  return {
    isValid: issues.length === 0,
    issues: issues,
    hasCta: expectedCta ? script.includes(expectedCta) : false,
    hasBook: expectedTitle ? script.includes(expectedTitle) : false,
    hasUrl: cleanUrl ? script.includes(cleanUrl) : false
  };
}

export default {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
  validateScript,
  validateOutro,
  humanize,
  enforceTransitions
};
