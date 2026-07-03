// Content quality metrics utilities

export interface ContentMetrics {
  wordCount: number;
  readingTime: number; // in minutes
  characterCount: number;
  sentenceCount: number;
  paragraphCount: number;
  keywordDensity: { [key: string]: number };
  seoScore: number;
  topKeywords: Array<{ word: string; count: number; density: number }>;
}

// Calculate word count
export const getWordCount = (text: string): number => {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

// Calculate reading time (average 200 words per minute)
export const getReadingTime = (wordCount: number): number => {
  return Math.ceil(wordCount / 200);
};

// Get character count (excluding markdown syntax)
export const getCharacterCount = (text: string): number => {
  // Remove markdown syntax for more accurate count
  const cleanText = text
    .replace(/[#*_~`\[\]()]/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '');
  return cleanText.length;
};

// Calculate sentence count
export const getSentenceCount = (text: string): number => {
  return text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0).length;
};

// Calculate paragraph count
export const getParagraphCount = (text: string): number => {
  return text.split(/\n\n+/).filter(para => para.trim().length > 0).length;
};

// Calculate keyword density
export const getKeywordDensity = (text: string): { [key: string]: number } => {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3); // Filter out short words
  
  const totalWords = words.length;
  const wordCounts: { [key: string]: number } = {};
  
  words.forEach(word => {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  });
  
  const density: { [key: string]: number } = {};
  Object.entries(wordCounts).forEach(([word, count]) => {
    density[word] = (count / totalWords) * 100;
  });
  
  return density;
};

// Get top keywords
export const getTopKeywords = (text: string, limit: number = 10): Array<{ word: string; count: number; density: number }> => {
  const density = getKeywordDensity(text);
  const totalWords = getWordCount(text);
  
  const keywords = Object.entries(density)
    .map(([word, densityPercent]) => ({
      word,
      count: Math.round((densityPercent / 100) * totalWords),
      density: densityPercent,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  
  return keywords;
};

// Calculate SEO score (0-100)
export const calculateSEOScore = (text: string, title: string): number => {
  let score = 0;
  const wordCount = getWordCount(text);
  const titleWordCount = getWordCount(title);
  
  // Word count score (30 points) - ideal 300-2000 words
  if (wordCount >= 300 && wordCount <= 2000) {
    score += 30;
  } else if (wordCount >= 200 || wordCount <= 3000) {
    score += 15;
  }
  
  // Title length score (15 points) - ideal 5-10 words
  if (titleWordCount >= 5 && titleWordCount <= 10) {
    score += 15;
  } else if (titleWordCount >= 3 && titleWordCount <= 15) {
    score += 10;
  }
  
  // Paragraph count score (15 points) - should have multiple paragraphs
  const paragraphCount = getParagraphCount(text);
  if (paragraphCount >= 3) {
    score += 15;
  } else if (paragraphCount >= 2) {
    score += 10;
  }
  
  // Heading usage score (15 points) - check for headings
  const hasHeadings = /#{1,6}\s/.test(text);
  if (hasHeadings) {
    const headingCount = (text.match(/#{1,6}\s/g) || []).length;
    if (headingCount >= 3) {
      score += 15;
    } else if (headingCount >= 1) {
      score += 10;
    }
  }
  
  // Readability score (15 points) - average sentence length
  const sentenceCount = getSentenceCount(text);
  const avgWordsPerSentence = wordCount / sentenceCount;
  if (avgWordsPerSentence >= 15 && avgWordsPerSentence <= 20) {
    score += 15;
  } else if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 25) {
    score += 10;
  }
  
  // Keyword distribution score (10 points)
  const topKeywords = getTopKeywords(text, 1);
  if (topKeywords.length > 0 && topKeywords[0].density < 3) {
    score += 10; // Good keyword distribution, not keyword stuffing
  } else if (topKeywords.length > 0 && topKeywords[0].density < 5) {
    score += 5;
  }
  
  return Math.min(score, 100);
};

// Calculate all metrics
export const calculateContentMetrics = (content: string, title: string = ''): ContentMetrics => {
  const wordCount = getWordCount(content);
  const readingTime = getReadingTime(wordCount);
  const characterCount = getCharacterCount(content);
  const sentenceCount = getSentenceCount(content);
  const paragraphCount = getParagraphCount(content);
  const keywordDensity = getKeywordDensity(content);
  const topKeywords = getTopKeywords(content);
  const seoScore = calculateSEOScore(content, title);
  
  return {
    wordCount,
    readingTime,
    characterCount,
    sentenceCount,
    paragraphCount,
    keywordDensity,
    seoScore,
    topKeywords,
  };
};
