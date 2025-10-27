import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/fetchFeeds.js
import Parser from "rss-parser";
import durationRotator from './durationRotator.js';
import DurationCalculator from './durationCalculator.js'; // Ensure this is imported

const parser = new Parser();

// Helper method to score article quality (moved outside the main function for clarity)
function calculateArticleScore(item) {
  let score = 0;
  if (item.title) {
    const titleLength = item.title.length;
    if (titleLength > 20 && titleLength < 120) score += 3;
    else if (titleLength >= 10) score += 1;
  }
  if (item.contentSnippet && item.contentSnippet.length > 100) score += 2;
  
  // --- FIX #2: Use the correct date field for scoring ---
  const dateValue = item.pubDate || item.isoDate || item.published;
  if (dateValue) {
    const pubDate = new Date(dateValue);
    const daysOld = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 1) score += 3;
    else if (daysOld < 3) score += 2;
    else if (daysOld < 7) score += 1;
  }
  return score;
}

export default async function fetchFeeds(feedUrl, targetDuration = 60) {
  try {
    console.log(`📡 Fetching RSS feed from: ${feedUrl}`);
    const feed = await parser.parseURL(feedUrl);
    
    const optimalArticleCount = DurationCalculator.calculateOptimalArticleCount(targetDuration);
    console.log(`🎯 Target duration: ${targetDuration}min, aiming for ~${optimalArticleCount} articles.`);
    
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const filteredItems = feed.items.filter(item => {
      // --- FIX #1: Check for 'published' and 'updated' fields ---
      const dateValue = item.pubDate || item.isoDate || item.published || item.updated;
      
      if (!dateValue) {
        console.warn(`⚠️ Article "${item.title}" has no date field. Skipping.`);
        return false;
      }
      
      const pubDate = new Date(dateValue);
      
      // Check if the date is valid before comparing
      if (isNaN(pubDate.getTime())) {
        console.warn(`⚠️ Article "${item.title}" has an invalid date: "${dateValue}". Skipping.`);
        return false;
      }
      
      return pubDate >= sevenDaysAgo && pubDate <= now;
    }).filter(item => item.title && item.title.length > 10); // Basic quality filter
    
    if (filteredItems.length === 0) {
      console.warn('🚫 No articles found within the last 7 days after filtering.');
      return [];
    }
    console.log(`🔍 Found ${filteredItems.length} recent articles.`);
    
    const prioritizedItems = filteredItems
      .map(item => ({
        ...item,
        score: calculateArticleScore(item)
      }))
      .sort((a, b) => b.score - a.score);
      
    const selectedItems = prioritizedItems
      .slice(0, Math.min(optimalArticleCount, prioritizedItems.length))
      .map(item => ({
        title: item.title || 'Untitled',
        summary: item.contentSnippet?.slice(0, 250) || '',
        link: item.link,
        pubDate: item.pubDate || item.isoDate || item.published || item.updated || '',
        score: item.score
      }));
    
    console.log(`✅ Selected ${selectedItems.length} articles for the podcast.`);
    return selectedItems;
    
  } catch (error) {
    console.error('❌ Error fetching or parsing RSS feed:', error);
    return []; // Return an empty array on error to prevent crashes
  }
}
