// Helper function to format prices in emails based on country
// This is a shared helper that can be used across all email functions

// Cache for exchange rate (valid for 1 hour)
let exchangeRateCache = {
  rate: null,
  timestamp: null,
  expiry: 60 * 60 * 1000 // 1 hour in milliseconds
};

/**
 * Fetch USD to INR exchange rate
 */
export const fetchUSDToINR = async () => {
  // Check cache first
  const now = Date.now();
  if (exchangeRateCache.rate && exchangeRateCache.timestamp) {
    const age = now - exchangeRateCache.timestamp;
    if (age < exchangeRateCache.expiry) {
      return exchangeRateCache.rate;
    }
  }

  try {
    // Using exchangerate-api.com free API (no API key needed)
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    
    if (data && data.rates && data.rates.INR) {
      const rate = data.rates.INR;
      // Update cache
      exchangeRateCache.rate = rate;
      exchangeRateCache.timestamp = now;
      return rate;
    }
    
    // Fallback rate if API fails
    const fallbackRate = 83;
    exchangeRateCache.rate = fallbackRate;
    exchangeRateCache.timestamp = now;
    return fallbackRate;
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    // Return cached rate if available, otherwise fallback
    if (exchangeRateCache.rate) {
      return exchangeRateCache.rate;
    }
    return 83; // Approximate fallback rate
  }
};

/**
 * Check if country is India
 */
export const isIndia = (country) => {
  if (!country) return false;
  const countryLower = country.toLowerCase();
  return countryLower === 'india' || countryLower.includes('india');
};

/**
 * Format price for email based on country
 * @param {number} price - Price in USD
 * @param {string} country - Country name
 * @param {number} exchangeRate - USD to INR exchange rate
 * @returns {string} Formatted price string
 */
export const formatEmailPrice = (price, country, exchangeRate) => {
  if (!price && price !== 0) return '';
  
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) return '';
  
  if (isIndia(country)) {
    const inrPrice = numPrice * exchangeRate;
    return `₹${inrPrice.toFixed(2)}`;
  }
  
  return `$${numPrice.toFixed(2)}`;
};
