import { createRequire } from 'module';
import { warn, error } from '#logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Explicit path resolution
const BOOKS_PATH = path.resolve(__dirname, '../data/books.json');

// 2. Type-safe default structure
const DEFAULT_BOOKS = [{
  title: "The Default Book",
  url: "https://example.com",
  author: "Default Author"
}];

// 3. Load with validation
let books;

try {
  books = require(BOOKS_PATH);
  
  // Validate structure
  if (!Array.isArray(books)) {
    throw new Error('books.json is not an array');
  }
  
  books = books.filter(book => 
    book?.title && 
    book?.url && 
    typeof book.title === 'string' && 
    typeof book.url === 'string'
  );
  
  if (books.length === 0) {
    warn('No valid books found - using defaults');
    books = DEFAULT_BOOKS;
  }
} catch (err) {
  error('Failed to load books.json', { error: err.message });
  books = DEFAULT_BOOKS;
}

// 4. Enhanced random selection
export default function getRandomSponsor() {
  try {
    if (!books.length) return null;
    
    // Weighted random selection if you add 'weight' property later
    const totalWeight = books.reduce((sum, book) => sum + (book.weight || 1), 0);
    let random = Math.random() * totalWeight;
    
    for (const book of books) {
      random -= book.weight || 1;
      if (random <= 0) return book;
    }
    
    return books[books.length - 1]; // Fallback
  } catch (err) {
    error('Sponsor selection failed', { error: err });
    return books[0] || null;
  }
}
