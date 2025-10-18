import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/durationCalculator.js
class DurationCalculator {
  // Average speaking rates
  static WORDS_PER_MINUTE = 155;
  static CHARS_PER_WORD = 5.1; // Including spaces and punctuation
  
  // Calculate duration from text
  static textToMinutes(text) {
    if (!text || typeof text !== 'string') return 0;
    
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    const estimatedMinutes = wordCount / this.WORDS_PER_MINUTE;
    
    return Math.max(1, Math.round(estimatedMinutes * 10) / 10); // Round to 0.1 minutes
  }
  
  // Calculate target characters per article
  static calculateArticleTargets(totalTargetMinutes, articleCount) {
    const introOutroMinutes = 4; // 2 min intro + 2 min outro
    const availableMinutes = Math.max(5, totalTargetMinutes - introOutroMinutes);
    
    const minutesPerArticle = availableMinutes / articleCount;
    const wordsPerArticle = minutesPerArticle * this.WORDS_PER_MINUTE;
    const charsPerArticle = wordsPerArticle * this.CHARS_PER_WORD;
    
    // Reasonable bounds
    const minChars = 300;
    const maxChars = 1200;
    
    return {
      targetChars: Math.min(Math.max(Math.round(charsPerArticle), minChars), maxChars),
      estimatedMinutes: availableMinutes
    };
  }
  
  // Smart article selection based on target duration
  static calculateOptimalArticleCount(targetMinutes) {
    const baseArticles = 8; // Minimum for a coherent show
    const maxArticles = 25; // Absolute maximum
    
    // Scale article count with duration
    if (targetMinutes <= 30) return Math.min(12, baseArticles + Math.floor(targetMinutes / 5));
    if (targetMinutes <= 60) return Math.min(18, baseArticles + Math.floor(targetMinutes / 4));
    return Math.min(maxArticles, baseArticles + Math.floor(targetMinutes / 3));
  }
}

export default DurationCalculator;
