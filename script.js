// --- Existing Code ---
const supabaseUrl = "https://oghdrmtorpeqaewttckr.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9naGRybXRvcnBlcWFld3R0Y2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExNjc4OTksImV4cCI6MjA1Njc0Mzg5OX0.HW5aD19Hy__kpOLp5JHi8HXLzl7D6_Tu4UNyB3mNAHs";

// Optimized Supabase client configuration for better performance
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: false, // Disable auth session for better performance
  },
  global: {
    headers: {
      'X-Client-Info': 'gruuvs-web-client',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 2, // Throttle realtime events
    },
  },
});

// Global pagination and sorting config for Search and Shuffle
let filteredData = [];
let totalRecords = 0;
let currentPage = 1;
const pageSize = 10;
let totalPages = 1;

// Global active tab state: "search", "shuffle", or "watchlist"
let activeTab = "search";

// Discogs OAuth state
let userAccessToken = null;
let oauthUser = null;
let userWantlistIds = new Set();
let cachedDiscogsWantlist = null; // Cache for full enriched Discogs wantlist

// Rate limiting for Discogs API
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // Slightly over 1 second
let requestCount = 0;
let requestWindowStart = Date.now();
const MAX_REQUESTS_PER_MINUTE = 55;


// Default: Sort by title ascending
let sortConfig = { key: "title", order: "asc" };

let youtubeApiReady = false;

// Request management for better performance
let currentFetchController = null;
let lastQuerySignature = null;
let requestInProgress = false;


// ------------------ Watchlist Data ------------------
function getWatchlistedReleases() {
  try {
    const data = localStorage.getItem("watchlistedReleases");
    if (!data) return [];
    const parsed = JSON.parse(data);
    // Validate that it's an array
    if (!Array.isArray(parsed)) {
      console.warn("Watchlist data is not an array, resetting...");
      localStorage.removeItem("watchlistedReleases");
      return [];
    }
    return parsed;
  } catch (error) {
    console.error("Error parsing watchlist data:", error);
    localStorage.removeItem("watchlistedReleases");
    return [];
  }
}

function saveWatchlistedReleases(watchlist) {
  localStorage.setItem("watchlistedReleases", JSON.stringify(watchlist));
}

function isWatchlisted(id) {
  // Check both local watchlist and Discogs wantlist if logged in
  const watchlist = getWatchlistedReleases();
  const locallyWatchlisted = watchlist.some(release => release.id === id);
  const inDiscogsWantlist = userWantlistIds.has(id);
  
  return locallyWatchlisted || inDiscogsWantlist;
}

async function toggleWatchlist(release) {
  // If logged in with Discogs, sync with Discogs wantlist
  if (oauthUser && userAccessToken) {
    await toggleDiscogsWantlist(release.id);
    return;
  }
  
  // Otherwise, just toggle local watchlist
  let watchlist = getWatchlistedReleases();
  let action;
  const locallyWatchlisted = watchlist.some(r => r.id === release.id);
  
  if (locallyWatchlisted) {
    watchlist = watchlist.filter(r => r.id !== release.id);
    action = "removed";
  } else {
    release.watchlistedAt = new Date().toISOString();
    watchlist.push(release);
    action = "added";
  }
  saveWatchlistedReleases(watchlist);
  gtag("event", "watchlist_toggle", {
    action: action,
    release_id: release.id,
    title: release.title,
  });
  const row = document.querySelector(`tr[data-id="${release.id}"]`);
  if (row) {
    const watchlistIcon = row.querySelector(".watchlist-icon");
    if (watchlistIcon) {
      if (isWatchlisted(release.id)) {
        watchlistIcon.classList.remove("bi-eye");
        watchlistIcon.classList.add("bi-eye-fill", "watchlisted");
      } else {
        watchlistIcon.classList.remove("bi-eye-fill", "watchlisted");
        watchlistIcon.classList.add("bi-eye");
      }
    }
  }
  if (activeTab === "watchlist") {
    loadWatchlist(currentPage).catch(err => console.error("Watchlist reload error:", err));
  }
}

// ------------------ Helper Functions ------------------
// Network connectivity check
function checkNetworkConnection() {
  if (!navigator.onLine) {
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = `<tr><td class="no-results" colspan="11">
      <i class="bi bi-wifi-off"></i>
      <p>No internet connection. Please check your network and try again.</p>
    </td></tr>`;
    return false;
  }
  return true;
}

function parseYearRange() {
  const yr = document.getElementById("year_range").value.trim();
  if (!yr) return { min: -Infinity, max: Infinity };
  const match = yr.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (match) {
    return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
  } else {
    const single = parseInt(yr, 10);
    return Number.isInteger(single)
      ? { min: single, max: single }
      : { min: -Infinity, max: Infinity };
  }
}

function parseRangeInput(rangeStr) {
  if (!rangeStr) return { min: -Infinity, max: Infinity };
  const match = rangeStr.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (match) {
    return { min: parseFloat(match[1]), max: parseFloat(match[2]) };
  } else {
    const single = parseFloat(rangeStr);
    return !isNaN(single)
      ? { min: single, max: single }
      : { min: -Infinity, max: Infinity };
  }
}

// ------------------ Query Functions ------------------
// Generate a unique signature for the current query to avoid duplicate requests
function getQuerySignature(page) {
  const selectedGenre = document.getElementById("genre").value;
  const selectedStyle = document.getElementById("style").value;
  const searchQuery = document.getElementById("searchInput").value.trim();
    const yearRange = document.getElementById("year_range").value.trim();
    const ratingRange = document.getElementById("rating_range").value.trim();
    const ratingCountRange = document.getElementById("rating_count_range").value.trim();
    const wantRange = document.getElementById("want_range").value.trim();
    
    return JSON.stringify({
      page,
      genre: selectedGenre,
      style: selectedStyle,
      search: searchQuery,
      year: yearRange,
      rating: ratingRange,
      ratingCount: ratingCountRange,
      want: wantRange,
      sort: sortConfig
    });
}

async function fetchReleases({ page = 1, retryCount = 0 } = {}) {
  const MAX_RETRIES = 2; // Reduced from 3
  const RETRY_DELAYS = [2000, 5000]; // Exponential backoff: 2s, 5s

  // Cancel any previous request
  if (currentFetchController) {
    currentFetchController.abort();
  }
  currentFetchController = new AbortController();
  
  // Check for duplicate requests
  const querySignature = getQuerySignature(page);
  if (querySignature === lastQuerySignature && requestInProgress) {
    console.log("Duplicate request detected, skipping...");
    return { data: filteredData, count: totalRecords };
  }
  
  lastQuerySignature = querySignature;
  requestInProgress = true;

  try {
    const selectedGenre = document.getElementById("genre").value;
    const selectedStyle = document.getElementById("style").value;
    const { min: yearMin, max: yearMax } = parseYearRange();
    const ratingRange = parseRangeInput(document.getElementById("rating_range").value.trim());
    const ratingCountRange = parseRangeInput(document.getElementById("rating_count_range").value.trim());
    const wantRange = parseRangeInput(document.getElementById("want_range").value.trim());
    let query = supabaseClient.from("releases").select("*", { count: "exact" });
    const searchQuery = document.getElementById("searchInput").value.trim();
    
    // Show loading state only on first attempt
    if (retryCount === 0) {
      const tbody = document.getElementById("releases-table-body");
      tbody.innerHTML = `<tr><td class="no-results" colspan="11">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p>Searching...</p>
      </td></tr>`;
    }

    if (searchQuery) {
      query = query.ilike("title", `%${searchQuery}%`);
    }
    if (selectedGenre) {
      query = query.ilike("genre", `%${selectedGenre}%`);
    }
    if (selectedStyle) {
      query = query.ilike("style", `%${selectedStyle}%`);
    }
    if (yearMin !== -Infinity) query = query.gte("year", yearMin);
    if (yearMax !== Infinity) query = query.lte("year", yearMax);
    if (ratingRange.min !== -Infinity) query = query.gte("average_rating", ratingRange.min);
    if (ratingRange.max !== Infinity) query = query.lte("average_rating", ratingRange.max);
    if (ratingCountRange.min !== -Infinity) query = query.gte("rating_count", ratingCountRange.min);
    if (ratingCountRange.max !== Infinity) query = query.lte("rating_count", ratingCountRange.max);
    if (wantRange.min !== -Infinity) query = query.gte("want", wantRange.min);
    if (wantRange.max !== Infinity) query = query.lte("want", wantRange.max);
    if (sortConfig.key) {
      query = query.order(sortConfig.key, { ascending: sortConfig.order === "asc" });
    }
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    query = query.range(start, end);
    
    // Add abort signal support
    query = query.abortSignal(currentFetchController.signal);
    
    const { data, count, error } = await query;
    
    if (error) {
      // Don't retry on abort errors
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        console.log('Request aborted');
        requestInProgress = false;
        return { data: [], count: 0 };
      }
      
      console.error(`Error fetching releases data (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);
      
      // Check if it's a rate limit or connection error
      const isRetryableError = error.message?.includes('rate') || 
                               error.message?.includes('timeout') ||
                               error.message?.includes('network') ||
                               error.code === 'PGRST301' || // PostgREST timeout
                               error.code === '429'; // Too many requests
      
      // Only retry on specific errors
      if (retryCount < MAX_RETRIES && isRetryableError) {
        const delay = RETRY_DELAYS[retryCount];
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchReleases({ page, retryCount: retryCount + 1 });
      }
      
      // If we've exceeded retries or it's not a retryable error, show error message
      const tbody = document.getElementById("releases-table-body");
      tbody.innerHTML = `<tr><td class="no-results" colspan="11">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <p>Failed to load results. Please try again in a moment.</p>
      </td></tr>`;
      requestInProgress = false;
      return { data: [], count: 0 };
    }

    // FIXED: Empty results are valid - don't retry!
    // This was the main bug causing unnecessary retries and rate limiting
    requestInProgress = false;
    return { data: data || [], count: count || 0 };
    
  } catch (error) {
    // Don't retry on abort errors
    if (error.name === 'AbortError') {
      console.log('Request aborted');
      requestInProgress = false;
      return { data: [], count: 0 };
    }
    
    console.error(`Error in fetchReleases (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);
    
    // Only retry on network errors
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount];
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchReleases({ page, retryCount: retryCount + 1 });
    }
    
    // If we've exceeded retries, show error message
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = `<tr><td class="no-results" colspan="11">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <p>Failed to load results. Please try again in a moment.</p>
    </td></tr>`;
    requestInProgress = false;
    return { data: [], count: 0 };
  }
}

async function loadData(page = 1) {
  // Check network connectivity first
  if (!checkNetworkConnection()) {
    return;
  }
  
  try {
    const { data, count } = await fetchReleases({ page });
    
    // Check if request was aborted
    if (!data && !count) {
      return;
    }
    
    filteredData = data || [];
    totalRecords = count || 0;
    totalPages = Math.ceil(totalRecords / pageSize) || 1;
    currentPage = page;
    renderTable();
    renderPagination();
    document.getElementById("pagination").style.display = "block";
  } catch (error) {
    // Don't show error for aborted requests
    if (error.name === 'AbortError') {
      return;
    }
    
    console.error("Error in loadData:", error);
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = `<tr><td class="no-results" colspan="11">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <p>An error occurred while loading results. Please try again.</p>
    </td></tr>`;
  }
}

async function fetchShuffleReleases({ retryCount = 0 } = {}) {
  const MAX_RETRIES = 2; // Reduced from 3
  const RETRY_DELAYS = [2000, 5000]; // Exponential backoff

  // Cancel any previous request
  if (currentFetchController) {
    currentFetchController.abort();
  }
  currentFetchController = new AbortController();

  try {
    // Apply filtering logic (same as in fetchReleases)
    const selectedGenre = document.getElementById("genre").value;
    const selectedStyle = document.getElementById("style").value;
    const { min: yearMin, max: yearMax } = parseYearRange();
    const ratingRange = parseRangeInput(document.getElementById("rating_range").value.trim());
    const ratingCountRange = parseRangeInput(document.getElementById("rating_count_range").value.trim());
    const wantRange = parseRangeInput(document.getElementById("want_range").value.trim());
    
    let query = supabaseClient.from("releases").select("*", { count: "exact" });
    const searchQuery = document.getElementById("searchInput").value.trim();
    if (searchQuery) {
      query = query.ilike("title", `%${searchQuery}%`);
    }
    if (selectedGenre) {
      query = query.ilike("genre", `%${selectedGenre}%`);
    }
    if (selectedStyle) {
      query = query.ilike("style", `%${selectedStyle}%`);
    }
    if (yearMin !== -Infinity) query = query.gte("year", yearMin);
    if (yearMax !== Infinity) query = query.lte("year", yearMax);
    if (ratingRange.min !== -Infinity) query = query.gte("average_rating", ratingRange.min);
    if (ratingRange.max !== Infinity) query = query.lte("average_rating", ratingRange.max);
    if (ratingCountRange.min !== -Infinity) query = query.gte("rating_count", ratingCountRange.min);
    if (ratingCountRange.max !== Infinity) query = query.lte("rating_count", ratingCountRange.max);
    if (wantRange.min !== -Infinity) query = query.gte("want", wantRange.min);
    if (wantRange.max !== Infinity) query = query.lte("want", wantRange.max);

    // Add abort signal support
    query = query.abortSignal(currentFetchController.signal);

    // First, get just the count efficiently without fetching all data
    const countQuery = supabaseClient.from("releases").select("*", { count: "exact", head: true });
    // Apply same filters to count query
    let countOnlyQuery = countQuery;
    if (searchQuery) countOnlyQuery = countOnlyQuery.ilike("title", `%${searchQuery}%`);
    if (selectedGenre) countOnlyQuery = countOnlyQuery.ilike("genre", `%${selectedGenre}%`);
    if (selectedStyle) countOnlyQuery = countOnlyQuery.ilike("style", `%${selectedStyle}%`);
    if (yearMin !== -Infinity) countOnlyQuery = countOnlyQuery.gte("year", yearMin);
    if (yearMax !== Infinity) countOnlyQuery = countOnlyQuery.lte("year", yearMax);
    if (ratingRange.min !== -Infinity) countOnlyQuery = countOnlyQuery.gte("average_rating", ratingRange.min);
    if (ratingRange.max !== Infinity) countOnlyQuery = countOnlyQuery.lte("average_rating", ratingRange.max);
    if (ratingCountRange.min !== -Infinity) countOnlyQuery = countOnlyQuery.gte("rating_count", ratingCountRange.min);
    if (ratingCountRange.max !== Infinity) countOnlyQuery = countOnlyQuery.lte("rating_count", ratingCountRange.max);
    if (wantRange.min !== -Infinity) countOnlyQuery = countOnlyQuery.gte("want", wantRange.min);
    if (wantRange.max !== Infinity) countOnlyQuery = countOnlyQuery.lte("want", wantRange.max);
    countOnlyQuery = countOnlyQuery.abortSignal(currentFetchController.signal);
    
    const { count, error: countError } = await countOnlyQuery;
    
    if (countError) {
      // Don't retry on abort errors
      if (countError.name === 'AbortError' || countError.message?.includes('aborted')) {
        console.log('Shuffle request aborted');
        return { data: [], count: 0 };
      }
      
      console.error(`Error fetching shuffle count (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, countError);
      
      const isRetryableError = countError.message?.includes('rate') || 
                               countError.message?.includes('timeout') ||
                               countError.message?.includes('network') ||
                               countError.code === 'PGRST301' ||
                               countError.code === '429';
      
      if (retryCount < MAX_RETRIES && isRetryableError) {
        const delay = RETRY_DELAYS[retryCount];
        console.log(`Retrying shuffle in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchShuffleReleases({ retryCount: retryCount + 1 });
      }
      
      return { data: [], count: 0 };
    }
    
    const shuffleSize = 10;
    
    // FIXED: Empty results are valid - don't retry!
    if (!count || count === 0) {
      return { data: [], count: 0 };
    }
    
    if (count > shuffleSize) {
      // Get random subset
      const randomOffset = Math.floor(Math.random() * (count - shuffleSize + 1));
      const { data, error: err } = await query.range(randomOffset, randomOffset + shuffleSize - 1);
      
      if (err) {
        // Don't retry on abort errors
        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
          console.log('Shuffle request aborted');
          return { data: [], count: 0 };
        }
        
        console.error(`Error fetching shuffle data (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, err);
        
        const isRetryableError = err.message?.includes('rate') || 
                                 err.message?.includes('timeout') ||
                                 err.message?.includes('network') ||
                                 err.code === 'PGRST301' ||
                                 err.code === '429';
        
        if (retryCount < MAX_RETRIES && isRetryableError) {
          const delay = RETRY_DELAYS[retryCount];
          console.log(`Retrying shuffle in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchShuffleReleases({ retryCount: retryCount + 1 });
        }
        
        return { data: [], count: 0 };
      }
      
      return { data: data || [], count: shuffleSize };
    } else {
      // Fetch all results if less than shuffle size
      const { data: allData, error } = await query.limit(shuffleSize);
      
      if (error) {
        // Don't retry on abort errors
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
          console.log('Shuffle request aborted');
          return { data: [], count: 0 };
        }
        
        console.error(`Error fetching shuffle data (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);
        
        const isRetryableError = error.message?.includes('rate') || 
                                 error.message?.includes('timeout') ||
                                 error.message?.includes('network') ||
                                 error.code === 'PGRST301' ||
                                 error.code === '429';
        
        if (retryCount < MAX_RETRIES && isRetryableError) {
          const delay = RETRY_DELAYS[retryCount];
          console.log(`Retrying shuffle in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchShuffleReleases({ retryCount: retryCount + 1 });
        }
        
        return { data: [], count: 0 };
      }
      
      return { data: allData || [], count };
    }
  } catch (error) {
    // Don't retry on abort errors
    if (error.name === 'AbortError') {
      console.log('Shuffle request aborted');
      return { data: [], count: 0 };
    }
    
    console.error(`Error in fetchShuffleReleases (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error);
    
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount];
      console.log(`Retrying shuffle in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchShuffleReleases({ retryCount: retryCount + 1 });
    }
    
    return { data: [], count: 0 };
  }
}


async function loadShuffleData() {
  // Check network connectivity first
  if (!checkNetworkConnection()) {
    return;
  }
  
  try {
    // Show loading state
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = `<tr><td class="no-results" colspan="11">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p>Loading shuffle results...</p>
    </td></tr>`;

    const { data, count } = await fetchShuffleReleases();
    
    // Check if request was aborted
    if (!data && !count) {
      return;
    }
    
    filteredData = data || [];
    totalRecords = count || 0;
    currentPage = 1;
    renderTable();
    document.getElementById("pagination").style.display = "none";
  } catch (error) {
    // Don't show error for aborted requests
    if (error.name === 'AbortError') {
      return;
    }
    
    console.error("Error in loadShuffleData:", error);
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = `<tr><td class="no-results" colspan="11">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <p>An error occurred while loading shuffle results. Please try again.</p>
    </td></tr>`;
  }
}

// ------------------ Load Watchlist (from Discogs or Local) ------------------
async function loadWatchlist(page = 1) {
  try {
    // If logged in with Discogs, fetch from Discogs wantlist
    if (oauthUser && userAccessToken) {
      await showUserWantlist(page);
      return;
    }
    
    // Otherwise, load from local storage
    let watchlist = getWatchlistedReleases();
    
    // Ensure watchlist is an array
    if (!Array.isArray(watchlist)) {
      console.warn("Invalid watchlist data in localStorage, resetting to empty array");
      watchlist = [];
      saveWatchlistedReleases(watchlist);
    }
    
    // Apply filters, sorting, and pagination using the shared function
    applyFiltersAndPaginationToWantlist(watchlist, page);
  } catch (error) {
    console.error("Error loading watchlist:", error);
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = '<tr><td class="no-results" colspan="11"><i class="bi bi-exclamation-triangle-fill"></i><p>An error occurred while loading your watchlist. Please try again.</p></td></tr>';
    filteredData = [];
    totalRecords = 0;
    document.getElementById("pagination").style.display = "none";
    document.getElementById("results-count").textContent = "Showing 0 result(s)";
  }
}

// ------------------ Show User Wantlist from Discogs ------------------
async function showUserWantlist(page = 1) {
  console.log('showUserWantlist called with page:', page);
  console.log('oauthUser:', oauthUser ? oauthUser.username : 'null');
  console.log('userAccessToken:', userAccessToken ? 'present' : 'null');
  
  if (!oauthUser || !userAccessToken) {
    console.log('No auth, falling back to local watchlist');
    // Fallback to local watchlist
    await loadWatchlist(page);
    return;
  }
  
  // If we have cached data, use it and just apply filters/sorting/pagination
  if (cachedDiscogsWantlist && Array.isArray(cachedDiscogsWantlist)) {
    console.log('Using cached wantlist:', cachedDiscogsWantlist.length, 'items');
    applyFiltersAndPaginationToWantlist(cachedDiscogsWantlist, page);
    return;
  }
  
  console.log('Fetching fresh wantlist from Discogs...');
  
  // Show loading in table
  const tbody = document.getElementById("releases-table-body");
  tbody.innerHTML = '<tr><td class="no-results" colspan="11"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><p>Loading your Discogs wantlist...</p></td></tr>';
  
  try {
    const username = oauthUser.username;
    const firstPageUrl = `https://api.discogs.com/users/${username}/wants?per_page=100&page=1`;
    console.log('Requesting:', firstPageUrl);
    
    const firstPage = await makeAuthenticatedRequest(firstPageUrl);
    console.log('First page received:', firstPage.wants?.length || 0, 'items');
    
    if (!firstPage.wants || firstPage.wants.length === 0) {
      tbody.innerHTML = '<tr><td class="no-results" colspan="11"><i class="bi bi-info-circle"></i><p>Your Discogs wantlist is empty.</p></td></tr>';
      filteredData = [];
      totalRecords = 0;
      cachedDiscogsWantlist = [];
      return;
    }
    
    // Collect all wantlist items across pages
    let allWants = [...firstPage.wants];
    const discogsTotalPages = firstPage.pagination?.pages || 1;
    
    if (discogsTotalPages > 1) {
      tbody.innerHTML = `<tr><td class="no-results" colspan="11"><div class="spinner-border text-primary" role="status"></div><p>Loading ${discogsTotalPages} pages from your wantlist...</p></td></tr>`;
      
      const pagePromises = [];
      for (let page = 2; page <= Math.min(discogsTotalPages, 10); page++) {
        const pageUrl = `https://api.discogs.com/users/${username}/wants?per_page=100&page=${page}`;
        pagePromises.push(makeAuthenticatedRequest(pageUrl));
      }
      
      const pages = await Promise.all(pagePromises);
      pages.forEach(pageData => {
        if (pageData.wants) {
          allWants = allWants.concat(pageData.wants);
        }
      });
    }
    
    // Show enrichment progress
    tbody.innerHTML = `<tr><td class="no-results" colspan="11">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="mt-2 mb-1">Enriching ${allWants.length} releases...</p>
      <p class="mb-0" id="enrichProgress"><strong>0 / ${allWants.length}</strong> (0%)</p>
    </td></tr>`;
    
    // Enrich each wantlist item with full data from your Supabase database
    const wantlistReleases = [];
    const releaseIds = allWants.map(item => item.basic_information.id);
    
    // Batch fetch from Supabase (chunked to avoid query size limits)
    let dbReleases = [];
    const CHUNK_SIZE = 100; // Supabase has limits on .in() query size
    
    try {
      // Process in chunks to avoid 406 errors
      for (let i = 0; i < releaseIds.length; i += CHUNK_SIZE) {
        const chunk = releaseIds.slice(i, i + CHUNK_SIZE);
        try {
          const { data, error } = await supabaseClient
            .from("releases")
            .select("*")
            .in("id", chunk);
          
          if (!error && data) {
            dbReleases = dbReleases.concat(data);
          } else if (error) {
            console.warn(`Chunk ${i / CHUNK_SIZE + 1} fetch error:`, error);
          }
        } catch (chunkError) {
          console.warn(`Chunk ${i / CHUNK_SIZE + 1} error:`, chunkError);
        }
      }
    } catch (error) {
      console.error('Batch fetch error:', error);
    }
    
    // Create a map for quick lookup
    const dbReleaseMap = new Map();
    dbReleases.forEach(r => dbReleaseMap.set(r.id, r));
    
    for (let i = 0; i < allWants.length; i++) {
      const item = allWants[i];
      const release = item.basic_information;
      
      try {
        // Check if we have this release in our database
        const dbRelease = dbReleaseMap.get(release.id);
        
        if (dbRelease) {
          // Use data from your database
          wantlistReleases.push({
            ...dbRelease,
            watchlistedAt: new Date().toISOString(),
            inWantlist: true
          });
        } else {
          // Fallback: use basic data from Discogs
          wantlistReleases.push({
            id: release.id,
            title: release.title,
            label: release.labels?.map(l => l.name).join(', ') || '',
            year: release.year || '',
            genre: (release.genres || []).join(', '),
            style: (release.styles || []).join(', '),
            average_rating: 0,
            rating_count: 0,
            demand_coeff: 0,
            gem_value: 0,
            have: 0,
            want: 0,
            link: `https://www.discogs.com/release/${release.id}`,
            youtube_links: '',
            watchlistedAt: new Date().toISOString(),
            inWantlist: true
          });
        }
      } catch (error) {
        console.error(`Failed to process release ${release.id}:`, error);
        // Add fallback data even on error
        wantlistReleases.push({
          id: release.id,
          title: release.title,
          label: release.labels?.map(l => l.name).join(', ') || '',
          year: release.year || '',
          genre: (release.genres || []).join(', '),
          style: (release.styles || []).join(', '),
          average_rating: 0,
          rating_count: 0,
          demand_coeff: 0,
          gem_value: 0,
          have: 0,
          want: 0,
          link: `https://www.discogs.com/release/${release.id}`,
          youtube_links: '',
          watchlistedAt: new Date().toISOString(),
          inWantlist: true
        });
      }
      
      // Update progress
      const progressEl = document.getElementById('enrichProgress');
      if (progressEl) {
        const completed = i + 1;
        const percentage = Math.round((completed / allWants.length) * 100);
        progressEl.innerHTML = `<strong>${completed} / ${allWants.length}</strong> (${percentage}%)`;
      }
    }
    
    // Cache the enriched wantlist
    cachedDiscogsWantlist = wantlistReleases;
    
    // Apply filters, sorting, and pagination
    applyFiltersAndPaginationToWantlist(wantlistReleases, page);
    
  } catch (error) {
    console.error('Failed to fetch Discogs wantlist:', error);
    const tbody = document.getElementById("releases-table-body");
    
    // Display specific error message
    let errorMessage = error.message || 'Failed to load Discogs wantlist. Please try again.';
    
    // Add helpful action based on error type
    let actionMessage = '';
    let showRetryButton = true;
    
    if (error.message.includes('Authentication failed') || error.message.includes('Not authenticated')) {
      actionMessage = '<br><small>Please open the profile menu and log in again with a valid token.</small>';
      showRetryButton = false;
      // Auto-logout on auth failure
      userAccessToken = null;
      oauthUser = null;
      cachedDiscogsWantlist = null;
      localStorage.removeItem("discogsToken");
      localStorage.removeItem("discogsUsername");
    } else if (error.message.includes('Rate limit')) {
      actionMessage = '<br><small>Please wait a minute before trying again.</small>';
    } else if (error.message.includes('Network error')) {
      actionMessage = '<br><small>Please check your internet connection.</small>';
    }
    
    const retryButtonHTML = showRetryButton 
      ? '<br><br><button class="btn btn-brand" onclick="cachedDiscogsWantlist = null; loadWatchlist(1);">Retry</button>'
      : '';
    
    tbody.innerHTML = `<tr><td class="no-results" colspan="11">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <p>${errorMessage}${actionMessage}${retryButtonHTML}</p>
    </td></tr>`;
    
    filteredData = [];
    totalRecords = 0;
    cachedDiscogsWantlist = null; // Clear cache on error
    document.getElementById("pagination").style.display = "none";
    document.getElementById("results-count").textContent = "Showing 0 result(s)";
  }
}

// Apply filters, sorting, and pagination to wantlist (works for both local and Discogs)
function applyFiltersAndPaginationToWantlist(watchlist, page = 1) {
  try {
    // Ensure watchlist is an array
    if (!Array.isArray(watchlist)) {
      console.error("Invalid watchlist data:", watchlist);
      watchlist = [];
    }
    
    // Apply filter criteria from the filter box:
    const searchQuery = document.getElementById("searchInput").value.trim().toLowerCase();
    const selectedGenre = document.getElementById("genre").value;
    const selectedStyle = document.getElementById("style").value;
    const { min: yearMin, max: yearMax } = parseYearRange();
    const ratingRange = parseRangeInput(document.getElementById("rating_range").value.trim());
    const ratingCountRange = parseRangeInput(document.getElementById("rating_count_range").value.trim());
    const wantRange = parseRangeInput(document.getElementById("want_range").value.trim());

    let filtered = watchlist.filter(release => {
      let pass = true;
      if (searchQuery && release.title) {
        if (!release.title.toLowerCase().includes(searchQuery)) pass = false;
      }
      if (selectedGenre) {
        if (release.genre) {
          const genres = release.genre.split(",").map(g => g.trim());
          if (!genres.includes(selectedGenre)) pass = false;
        } else {
          pass = false;
        }
      }
      if (selectedStyle) {
        if (release.style) {
          const styles = release.style.split(",").map(s => s.trim());
          if (!styles.includes(selectedStyle)) pass = false;
        } else {
          pass = false;
        }
      }
      if (release.year) {
        const yr = parseInt(release.year, 10);
        if (yr < yearMin || yr > yearMax) pass = false;
      }
      if (release.average_rating !== undefined) {
        const rating = parseFloat(release.average_rating);
        if (rating < ratingRange.min || rating > ratingRange.max) pass = false;
      }
      if (release.rating_count !== undefined) {
        const count = parseFloat(release.rating_count);
        if (count < ratingCountRange.min || count > ratingCountRange.max) pass = false;
      }
      if (release.want !== undefined) {
        const want = parseFloat(release.want);
        if (want < wantRange.min || want > wantRange.max) pass = false;
      }
      return pass;
    });

    // Sort watchlist
    if (!sortConfig || sortConfig.key === "title") {
      filtered.sort((a, b) => {
        // If title sorting, use title comparison
        if (sortConfig && sortConfig.key === "title") {
          const aVal = a.title ? a.title.toLowerCase() : "";
          const bVal = b.title ? b.title.toLowerCase() : "";
          if (aVal < bVal) return sortConfig.order === "asc" ? -1 : 1;
          if (aVal > bVal) return sortConfig.order === "asc" ? 1 : -1;
          return 0;
        }
        // Default: most recent watchlisted first
        return new Date(b.watchlistedAt || 0) - new Date(a.watchlistedAt || 0);
      });
    } else {
      filtered.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (sortConfig.key === "title" || sortConfig.key === "label") {
          aVal = aVal ? aVal.toLowerCase() : "";
          bVal = bVal ? bVal.toLowerCase() : "";
        } else if (["year", "have", "want"].includes(sortConfig.key)) {
          aVal = parseFloat(aVal) || 0;
          bVal = parseFloat(bVal) || 0;
        } else if (sortConfig.key === "rating_coeff") {
          aVal = parseFloat(a.rating_coeff) || 0;
          bVal = parseFloat(b.rating_coeff) || 0;
        }
        if (aVal < bVal) return sortConfig.order === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.order === "asc" ? 1 : -1;
        return 0;
      });
    }
    
    // Apply pagination
    totalRecords = filtered.length;
    totalPages = Math.ceil(totalRecords / pageSize) || 1;
    currentPage = page;
    
    // Handle empty results
    if (filtered.length === 0) {
      filteredData = [];
      const tbody = document.getElementById("releases-table-body");
      if (watchlist.length === 0) {
        // Watchlist is completely empty
        const message = oauthUser && userAccessToken 
          ? '<tr><td class="no-results" colspan="11"><i class="bi bi-info-circle"></i><p>Your Discogs wantlist is empty.</p></td></tr>'
          : '<tr><td class="no-results" colspan="11"><i class="bi bi-info-circle"></i><p>Your local watchlist is empty. Add some releases by clicking the eye icon.</p></td></tr>';
        tbody.innerHTML = message;
      } else {
        // Filters resulted in no matches
        tbody.innerHTML = '<tr><td class="no-results" colspan="11"><i class="bi bi-exclamation-triangle-fill"></i><p>No results match your filters. Try adjusting your filter criteria.</p></td></tr>';
      }
      document.getElementById("pagination").style.display = "none";
      document.getElementById("results-count").textContent = "Showing 0 result(s)";
      return;
    }
    
    filteredData = filtered.slice((page - 1) * pageSize, page * pageSize);
    
    // Ensure the table container is visible
    const tableContainer = document.querySelector(".table-container");
    if (tableContainer) {
      tableContainer.style.display = "block";
    }
    
    renderTable();
    renderPagination();
    
    const resultsCountText = oauthUser && userAccessToken 
      ? `Showing ${totalRecords} result(s) from your Discogs wantlist`
      : `Showing ${totalRecords} result(s)`;
    document.getElementById("results-count").textContent = resultsCountText;
  } catch (error) {
    console.error("Error in applyFiltersAndPaginationToWantlist:", error);
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = '<tr><td class="no-results" colspan="11"><i class="bi bi-exclamation-triangle-fill"></i><p>An error occurred while loading your watchlist. Please try again.</p></td></tr>';
    document.getElementById("pagination").style.display = "none";
  }
}


// ------------------ Initialize Filters ------------------
let filtersCache = null;

async function initializeFilters() {
  // Check if we have cached filter data
  const cachedFilters = localStorage.getItem('filtersCache');
  const cacheTimestamp = localStorage.getItem('filtersCacheTimestamp');
  const now = Date.now();
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days (increased from 24 hours)

  if (cachedFilters && cacheTimestamp && (now - parseInt(cacheTimestamp)) < CACHE_DURATION) {
    // Use cached data
    const { genres, styles } = JSON.parse(cachedFilters);
    populateFilterOptions(genres, styles);
    return;
  }

  // Fetch fresh data with optimized query
  try {
    // Use a more efficient approach: fetch in smaller batches with pagination
    // This reduces the load on the database and prevents timeouts
    const BATCH_SIZE = 500;
    const genresSet = new Set();
    const stylesSet = new Set();
    
    let hasMore = true;
    let offset = 0;
    let attempts = 0;
    const MAX_BATCHES = 10; // Limit to 5000 records max
    
    while (hasMore && attempts < MAX_BATCHES) {
      const { data, error } = await supabaseClient
        .from("releases")
        .select("genre, style")
        .range(offset, offset + BATCH_SIZE - 1)
        .limit(BATCH_SIZE);
      
      if (error) {
        console.error(`Error loading genres/styles (batch ${attempts + 1}):`, error);
        // If we have some data already, use it
        if (genresSet.size > 0 || stylesSet.size > 0) {
          break;
        }
        // Try with fallback data
        if (cachedFilters) {
          console.log("Using expired cache due to fetch error");
          const { genres, styles } = JSON.parse(cachedFilters);
          populateFilterOptions(genres, styles);
          return;
        }
        return;
      }
      
      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }
      
      data.forEach((row) => {
        if (row.genre) {
          row.genre.split(",").forEach((g) => {
            const trimmed = g.trim();
            if (trimmed) genresSet.add(trimmed);
          });
        }
        if (row.style) {
          row.style.split(",").forEach((s) => {
            const trimmed = s.trim();
            if (trimmed) stylesSet.add(trimmed);
          });
        }
      });
      
      offset += BATCH_SIZE;
      attempts++;
      
      // If we got less than BATCH_SIZE, we've reached the end
      if (data.length < BATCH_SIZE) {
        hasMore = false;
      }
    }
    
    const genres = Array.from(genresSet).sort();
    const styles = Array.from(stylesSet).sort();
    
    // Cache the results
    localStorage.setItem('filtersCache', JSON.stringify({ genres, styles }));
    localStorage.setItem('filtersCacheTimestamp', now.toString());
    
    populateFilterOptions(genres, styles);
  } catch (error) {
    console.error("Error initializing filters:", error);
    // Try to use expired cache if available
    const cachedFilters = localStorage.getItem('filtersCache');
    if (cachedFilters) {
      console.log("Using expired cache due to error");
      const { genres, styles } = JSON.parse(cachedFilters);
      populateFilterOptions(genres, styles);
    }
  }
}

function populateFilterOptions(genres, styles) {
  const genreSelect = document.getElementById("genre");
  genreSelect.innerHTML = '<option value="">All Genres</option>';
  genres.forEach((genre) => {
    const option = document.createElement("option");
    option.value = genre;
    option.textContent = genre;
    genreSelect.appendChild(option);
  });
  
  const styleSelect = document.getElementById("style");
  styleSelect.innerHTML = '<option value="">All Styles</option>';
  styles.forEach((style) => {
    const option = document.createElement("option");
    option.value = style;
    option.textContent = style;
    styleSelect.appendChild(option);
  });
}

document.getElementById("mobile-filters-toggle").addEventListener("click", function() {
  const extraFilters = document.querySelector(".mobile-extra-filters-wrapper");
  if (extraFilters.style.display === "block") {
    extraFilters.style.display = "none";
    this.innerHTML = '<i class="bi bi-chevron-down"></i>';
  } else {
    extraFilters.style.display = "block";
    this.innerHTML = '<i class="bi bi-chevron-up"></i>';
  }
});

// ------------------ Render Table ------------------
function renderTable() {
  const isMobile = window.innerWidth <= 768;
  const tbody = document.getElementById("releases-table-body");
  tbody.innerHTML = "";
  document.getElementById("results-count").textContent = `Showing ${totalRecords} result(s)`;
  if (filteredData.length === 0) {
    tbody.innerHTML = `<tr><td class="no-results" colspan="11">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <p>No results found.</p>
        </td></tr>`;
    return;
  }
  filteredData.forEach((release) => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-id", release.id);
    const interactedReleases = JSON.parse(localStorage.getItem("interactedReleases")) || [];
    if (interactedReleases.includes(release.id)) {
      tr.classList.add("greyed-out");
    }
    const tdWatchlist = document.createElement("td");
    tdWatchlist.className = "text-center";
    const watchlistIcon = document.createElement("i");
    watchlistIcon.style.fontSize = "1rem";
    watchlistIcon.style.cursor = "pointer";
    watchlistIcon.className = "bi watchlist-icon " + (isWatchlisted(release.id) ? "bi-eye-fill watchlisted" : "bi-eye");
    watchlistIcon.title = oauthUser ? "Toggle Discogs Wantlist" : "Toggle Local Watchlist";
    watchlistIcon.addEventListener("click", async () => {
      await toggleWatchlist(release);
    });
    tdWatchlist.appendChild(watchlistIcon);
    if (isMobile) {
      const tdMobile = document.createElement("td");
      tdMobile.className = "mobile-cell";
      tdMobile.style.position = "relative";
      let previewContent = "";
      if (release.youtube_links) {
        const links = release.youtube_links.split(",").map((l) => l.trim()).filter((l) => l);
        if (links.length > 0) {
          const yID = extractYouTubeID(links[0]);
          if (yID) {
            previewContent = `<div class="mobile-preview">
              <iframe id="youtube-player-${release.id}" class="table-iframe" loading="lazy" title="YouTube video player" aria-label="YouTube video player" src="https://www.youtube.com/embed/${yID}?enablejsapi=1&rel=0&modestbranding=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>`;
          } else {
            previewContent = `<div class="mobile-preview text-muted">Invalid YouTube link</div>`;
          }
        } else {
          previewContent = `<div class="mobile-preview text-muted">No YouTube links</div>`;
        }
      } else {
        previewContent = `<div class="mobile-preview text-muted">No YouTube links</div>`;
      }
      const titleDiv = document.createElement("div");
      titleDiv.className = "mobile-title";
      const titleLink = document.createElement("a");
      titleLink.href = release.link;
      titleLink.target = "_blank";
      titleLink.rel = "noopener noreferrer";
      titleLink.className = "text-decoration-none text-primary fw-semibold";
      titleLink.textContent = release.title;
      titleLink.addEventListener("click", () => {
        markAsInteracted(release.id);
        tr.classList.add("greyed-out");
        trackReleaseLinkClick(release);
      });
      const copyBtn = document.createElement("button");
      copyBtn.className = "copy-btn";
      copyBtn.setAttribute("data-title", release.title);
      copyBtn.title = "Copy Title";
      copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(release.title).then(() => {
          markAsInteracted(release.id);
          tr.classList.add("greyed-out");
          const originalTitle = copyBtn.title;
          copyBtn.title = "Copied!";
          const tooltip = new bootstrap.Tooltip(copyBtn, { container: "body", trigger: "manual" });
          tooltip.show();
          setTimeout(() => {
            copyBtn.title = originalTitle;
            tooltip.hide();
            tooltip.dispose();
          }, 1500);
          trackCopyButtonClick(release);
        });
      });
      titleDiv.appendChild(titleLink);
      titleDiv.appendChild(copyBtn);
      const ratingDiv = document.createElement("div");
      ratingDiv.className = "mobile-rating";
      if (release.average_rating !== undefined && release.rating_count !== undefined) {
        ratingDiv.innerHTML = `${generateStars(release.average_rating)} ${parseFloat(release.average_rating).toFixed(1)} (${release.rating_count})`;
      } else {
        ratingDiv.innerHTML = `<div class="text-muted">No rating</div>`;
      }
      tdMobile.innerHTML += previewContent;
      tdMobile.appendChild(titleDiv);
      tdMobile.appendChild(ratingDiv);
      const mobileWatchlistContainer = document.createElement("div");
      mobileWatchlistContainer.className = "mobile-watchlist";
      mobileWatchlistContainer.style.position = "absolute";
      mobileWatchlistContainer.style.bottom = "8px";
      mobileWatchlistContainer.style.right = "8px";
      mobileWatchlistContainer.appendChild(tdWatchlist);
      tdMobile.appendChild(mobileWatchlistContainer);
      tr.appendChild(tdMobile);
    } else {
      const tdTitle = document.createElement("td");
      const titleDiv = document.createElement("div");
      titleDiv.className = "d-flex align-items-center";
      const titleLink = document.createElement("a");
      titleLink.href = release.link;
      titleLink.target = "_blank";
      titleLink.rel = "noopener noreferrer";
      titleLink.className = "text-decoration-none text-primary fw-semibold";
      titleLink.textContent = release.title;
      titleLink.addEventListener("click", () => {
        markAsInteracted(release.id);
        tr.classList.add("greyed-out");
        trackReleaseLinkClick(release);
      });
      const copyBtn = document.createElement("button");
      copyBtn.className = "copy-btn";
      copyBtn.setAttribute("data-title", release.title);
      copyBtn.title = "Copy Title";
      copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(release.title).then(() => {
          markAsInteracted(release.id);
          tr.classList.add("greyed-out");
          const originalTitle = copyBtn.title;
          copyBtn.title = "Copied!";
          const tooltip = new bootstrap.Tooltip(copyBtn, { container: "body", trigger: "manual" });
          tooltip.show();
          setTimeout(() => {
            copyBtn.title = originalTitle;
            tooltip.hide();
            tooltip.dispose();
          }, 1500);
          trackCopyButtonClick(release);
        });
      });
      titleDiv.appendChild(titleLink);
      titleDiv.appendChild(copyBtn);
      tdTitle.appendChild(titleDiv);
      tr.appendChild(tdTitle);
      const tdLabel = document.createElement("td");
      tdLabel.textContent = release.label || "Unknown";
      tr.appendChild(tdLabel);
      const tdYear = document.createElement("td");
      tdYear.className = "text-center";
      tdYear.textContent = release.year || "N/A";
      tr.appendChild(tdYear);
      const tdGenreStyle = document.createElement("td");
      if (release.genre) {
        release.genre.split(",").forEach((g) => {
          const span = document.createElement("span");
          span.className = "badge-genre";
          span.textContent = g.trim();
          tdGenreStyle.appendChild(span);
        });
      }
      if (release.style) {
        release.style.split(",").forEach((s) => {
          const span = document.createElement("span");
          span.className = "badge-style";
          span.textContent = s.trim();
          tdGenreStyle.appendChild(span);
        });
      }
      tr.appendChild(tdGenreStyle);
      const tdRating = document.createElement("td");
      tdRating.className = "text-center";
      if (release.average_rating !== undefined && release.rating_count !== undefined) {
        tdRating.innerHTML = `${generateStars(release.average_rating)} ${parseFloat(release.average_rating).toFixed(1)} (${release.rating_count})`;
      } else {
        tdRating.innerHTML = '<div class="text-muted">No rating</div>';
      }
      tr.appendChild(tdRating);
      const tdRarity = document.createElement("td");
      tdRarity.className = "text-center";
      tdRarity.textContent = release.demand_coeff ? parseFloat(release.demand_coeff).toFixed(2) : "0.00";
      tr.appendChild(tdRarity);
      const tdGem = document.createElement("td");
      tdGem.className = "text-center";
      tdGem.textContent = release.gem_value ? parseFloat(release.gem_value).toFixed(2) : "0.00";
      tr.appendChild(tdGem);
      const tdHave = document.createElement("td");
      tdHave.className = "text-center";
      tdHave.textContent = release.have || 0;
      tr.appendChild(tdHave);
      const tdWant = document.createElement("td");
      tdWant.className = "text-center";
      tdWant.textContent = release.want || 0;
      tr.appendChild(tdWant);
      tr.appendChild(tdWatchlist);
      const tdPreview = document.createElement("td");
      tdPreview.className = "text-center";
      if (release.youtube_links) {
        const links = release.youtube_links.split(",").map((l) => l.trim()).filter((l) => l);
        if (links.length > 0) {
          const yID = extractYouTubeID(links[0]);
          if (yID) {
            const iframe = document.createElement("iframe");
            iframe.id = `youtube-player-${release.id}`;
            iframe.className = "table-iframe";
            iframe.loading = "lazy";
            iframe.title = "YouTube video player";
            iframe.setAttribute("aria-label", "YouTube video player");
            iframe.src = `https://www.youtube.com/embed/${yID}?enablejsapi=1&rel=0&modestbranding=1`;
            iframe.frameBorder = "0";
            iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
            iframe.allowFullscreen = true;
            iframe.style.width = "220px";
            iframe.style.height = "124px";
            const iframeContainer = document.createElement("div");
            iframeContainer.style.position = "relative";
            iframeContainer.style.display = "inline-block";
            iframeContainer.appendChild(iframe);
            tdPreview.appendChild(iframeContainer);
          } else {
            tdPreview.innerHTML = '<div class="text-muted">Invalid YouTube link</div>';
          }
        } else {
          tdPreview.innerHTML = '<div class="text-muted">No YouTube links</div>';
        }
      } else {
        tdPreview.innerHTML = '<div class="text-muted">No YouTube links</div>';
      }
      tr.appendChild(tdPreview);
    }
    tbody.appendChild(tr);
  });
  attachCopyHandlers();
  if (youtubeApiReady) {
    initializeYouTubePlayers();
  }
}

function markAsInteracted(releaseId) {
  let interacted = JSON.parse(localStorage.getItem("interactedReleases")) || [];
  if (!interacted.includes(releaseId)) {
    interacted.push(releaseId);
    localStorage.setItem("interactedReleases", JSON.stringify(interacted));
  }
}

function generateStars(avg) {
  const average = parseFloat(avg) || 0;
  const fullStars = Math.floor(average);
  const halfStar = average % 1 >= 0.5 ? 1 : 0;
  const emptyStars = 5 - fullStars - halfStar;
  let starsHtml = "";
  for (let i = 0; i < fullStars; i++) {
    starsHtml += '<i class="bi bi-star-fill text-warning"></i>';
  }
  if (halfStar) {
    starsHtml += '<i class="bi bi-star-half text-warning"></i>';
  }
  for (let i = 0; i < emptyStars; i++) {
    starsHtml += '<i class="bi bi-star text-warning"></i>';
  }
  return starsHtml;
}

function extractYouTubeID(url) {
  const regex = /(?:youtube\.com\/.*v=|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function attachCopyHandlers() {
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.getAttribute("data-title");
      if (text) {
        navigator.clipboard.writeText(text);
      }
    });
  });
}

// ------------------ Pagination ------------------
function renderPagination() {
  const pag = document.getElementById("pagination");
  pag.innerHTML = "";
  if (totalPages <= 1) {
    pag.style.display = "none";
    return;
  }
  pag.style.display = "block";
  const prevLi = document.createElement("li");
  prevLi.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
  const prevLink = document.createElement("a");
  prevLink.className = "page-link";
  prevLink.href = "#";
  prevLink.innerHTML = `<i class="bi bi-chevron-left"></i> Prev`;
  prevLink.addEventListener("click", async (e) => {
    e.preventDefault();
    if (currentPage > 1) {
      if (activeTab === "watchlist") {
        await loadWatchlist(currentPage - 1);
      } else {
        loadData(currentPage - 1);
      }
    }
  });
  prevLi.appendChild(prevLink);
  pag.appendChild(prevLi);
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);
  for (let p = startPage; p <= endPage; p++) {
    const pageLi = document.createElement("li");
    pageLi.className = `page-item ${p === currentPage ? "active" : ""}`;
    const pageLink = document.createElement("a");
    pageLink.className = "page-link";
    pageLink.href = "#";
    pageLink.textContent = p;
    pageLink.addEventListener("click", async (e) => {
      e.preventDefault();
      if (activeTab === "watchlist") {
        await loadWatchlist(p);
      } else {
        loadData(p);
      }
    });
    pageLi.appendChild(pageLink);
    pag.appendChild(pageLi);
  }
  const nextLi = document.createElement("li");
  nextLi.className = `page-item ${currentPage === totalPages ? "disabled" : ""}`;
  const nextLink = document.createElement("a");
  nextLink.className = "page-link";
  nextLink.href = "#";
  nextLink.innerHTML = `Next <i class="bi bi-chevron-right"></i>`;
  nextLink.addEventListener("click", async (e) => {
    e.preventDefault();
    if (currentPage < totalPages) {
      if (activeTab === "watchlist") {
        await loadWatchlist(currentPage + 1);
      } else {
        loadData(currentPage + 1);
      }
    }
  });
  nextLi.appendChild(nextLink);
  pag.appendChild(nextLi);
}

// ------------------ Make Table Columns Resizable ------------------
function makeTableResizable() {
  document.querySelectorAll("th[data-column]").forEach((th) => {
    const resizer = th.querySelector(".resizer");
    if (!resizer) return;
    let startX, startWidth;
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startX = e.pageX;
      startWidth = th.offsetWidth;
      document.body.classList.add("resizing");
      const onMouseMove = (e) => {
        const dx = e.pageX - startX;
        const newWidth = startWidth + dx;
        if (newWidth > 50) th.style.width = newWidth + "px";
      };
      const onMouseUp = () => {
        document.body.classList.remove("resizing");
        saveColumnWidths();
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });
}

function saveColumnWidths() {
  const widths = {};
  document.querySelectorAll("th[data-column]").forEach((th) => {
    widths[th.getAttribute("data-column")] = th.offsetWidth;
  });
  localStorage.setItem("tableColumnWidths", JSON.stringify(widths));
}

function applySavedColumnWidths() {
  const saved = JSON.parse(localStorage.getItem("tableColumnWidths"));
  if (saved) {
    document.querySelectorAll("th[data-column]").forEach((th) => {
      const col = th.getAttribute("data-column");
      if (saved[col]) th.style.width = saved[col] + "px";
    });
  }
}

// ------------------ Sorting ------------------
document.querySelectorAll("th[data-sort]").forEach((header) => {
  header.addEventListener("click", () => {
    const sortValue = header.getAttribute("data-sort");
    const colName = header.getAttribute("data-column");
    if (sortValue === "NO_SORT") return;
    if (sortValue === "USER_RATING") {
      if (sortConfig.key === "rating_coeff") {
        sortConfig.order = sortConfig.order === "asc" ? "desc" : "asc";
      } else {
        sortConfig.key = "rating_coeff";
        sortConfig.order = "desc";
      }
    } else {
      if (sortConfig.key === sortValue) {
        sortConfig.order = sortConfig.order === "asc" ? "desc" : "asc";
      } else {
        sortConfig.key = sortValue;
        sortConfig.order = "asc";
      }
    }
    localStorage.setItem("sortConfig", JSON.stringify(sortConfig));
    if (activeTab === "watchlist") {
      loadWatchlist(currentPage).catch(err => console.error("Sort error:", err));
    } else {
      loadData(currentPage);
    }
    updateSortIndicators();
  });
});

function updateSortIndicators() {
  document.querySelectorAll("th[data-sort]").forEach((header) => {
    const sortValue = header.getAttribute("data-sort");
    const colName = header.getAttribute("data-column");
    header.innerHTML = colName;
    if (sortValue === "NO_SORT") {
      const res = document.createElement("div");
      res.className = "resizer";
      header.appendChild(res);
      return;
    }
    if (sortConfig.key === "rating_coeff" && sortValue === "USER_RATING") {
      header.innerHTML += sortConfig.order === "asc"
        ? '<i class="bi bi-arrow-up sort-indicator" title="rating_coeff ascending"></i>'
        : '<i class="bi bi-arrow-down sort-indicator" title="rating_coeff descending"></i>';
    } else if (sortConfig.key === sortValue) {
      header.innerHTML += sortConfig.order === "asc"
        ? '<i class="bi bi-arrow-up sort-indicator"></i>'
        : '<i class="bi bi-arrow-down sort-indicator"></i>';
    }
    const res = document.createElement("div");
    res.className = "resizer";
    header.appendChild(res);
  });
}

// ------------------ Mobile Sorting Options ------------------
document.addEventListener("DOMContentLoaded", () => {
  const mobileSortSelect = document.getElementById("mobile-sort-select");
  const mobileSortToggle = document.getElementById("mobile-sort-toggle");
  if (mobileSortSelect) {
    mobileSortSelect.value = sortConfig.key;
    mobileSortSelect.addEventListener("change", () => {
      sortConfig.key = mobileSortSelect.value;
      localStorage.setItem("sortConfig", JSON.stringify(sortConfig));
      loadData(currentPage);
    });
  }
  if (mobileSortToggle) {
    mobileSortToggle.innerHTML = sortConfig.order === "asc" 
      ? '<i class="bi bi-arrow-up"></i>' 
      : '<i class="bi bi-arrow-down"></i>';
    mobileSortToggle.addEventListener("click", () => {
      sortConfig.order = sortConfig.order === "asc" ? "desc" : "asc";
      localStorage.setItem("sortConfig", JSON.stringify(sortConfig));
      mobileSortToggle.innerHTML = sortConfig.order === "asc" 
        ? '<i class="bi bi-arrow-up"></i>' 
        : '<i class="bi bi-arrow-down"></i>';
      loadData(currentPage);
    });
  }
  

  // Initialize authentication
  initializeAuth();
  
  sortConfig = JSON.parse(localStorage.getItem("sortConfig") || '{"key":"title","order":"asc"}');
  const navWatchlist = document.getElementById("tab-watchlist");
  if (navWatchlist) {
    navWatchlist.innerHTML = '<i class="bi bi-eye"></i>';
  }
  initializeFilters().then(async () => {
    if (activeTab === "search") {
      loadData(1);
    } else if (activeTab === "shuffle") {
      loadShuffleData();
    } else if (activeTab === "watchlist") {
      await loadWatchlist(1);
    }
  });
  applySavedColumnWidths();
  makeTableResizable();
  updateSortIndicators();
  updateFilterButtons();
  document.getElementById("filter-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    trackFilterApplied();
    if (activeTab === "search") {
      loadData(1);
    } else if (activeTab === "shuffle") {
      loadShuffleData();
    } else if (activeTab === "watchlist") {
      await loadWatchlist(1);
    }
  });
  // Debounced filter change handler
  let filterTimeout;
  function handleFilterChange() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(async () => {
      trackFilterApplied();
      if (activeTab === "search") {
        loadData(1);
      } else if (activeTab === "shuffle") {
        loadShuffleData();
      } else if (activeTab === "watchlist") {
        await loadWatchlist(1);
      }
    }, 600); // 600ms debounce (increased from 300ms to reduce request frequency)
  }

  document.getElementById("genre").addEventListener("change", handleFilterChange);
  document.getElementById("style").addEventListener("change", handleFilterChange);
  
  // Add debouncing to range inputs
  document.getElementById("year_range").addEventListener("input", handleFilterChange);
  document.getElementById("rating_range").addEventListener("input", handleFilterChange);
  document.getElementById("rating_count_range").addEventListener("input", handleFilterChange);
  document.getElementById("want_range").addEventListener("input", handleFilterChange);
  const darkModeToggle = document.getElementById("darkModeToggle");
  if (localStorage.getItem("darkModeEnabled") === "true" || !localStorage.getItem("darkModeEnabled")) {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }
  darkModeToggle.addEventListener("click", () => {
    if (document.body.classList.contains("dark-mode")) {
      document.body.classList.remove("dark-mode");
      localStorage.setItem("darkModeEnabled", "false");
    } else {
      document.body.classList.add("dark-mode");
      localStorage.setItem("darkModeEnabled", "true");
    }
  });
  document.getElementById("tab-search").addEventListener("click", (e) => {
    e.preventDefault();
    activeTab = "search";
    document.getElementById("tab-search").classList.add("active");
    document.getElementById("tab-shuffle").classList.remove("active");
    document.getElementById("tab-watchlist").classList.remove("active");
    updateFilterButtons();
    loadData(1);
    document.getElementById("searchInput").focus();
  });
  document.getElementById("tab-shuffle").addEventListener("click", (e) => {
    e.preventDefault();
    activeTab = "shuffle";
    document.getElementById("tab-shuffle").classList.add("active");
    document.getElementById("tab-search").classList.remove("active");
    document.getElementById("tab-watchlist").classList.remove("active");
    updateFilterButtons();
    loadShuffleData();
  });
  document.getElementById("tab-watchlist").addEventListener("click", async (e) => {
    e.preventDefault();
    activeTab = "watchlist";
    document.getElementById("tab-watchlist").classList.add("active");
    document.getElementById("tab-search").classList.remove("active");
    document.getElementById("tab-shuffle").classList.remove("active");
    updateFilterButtons();
    
    // Sync with Discogs wantlist if logged in and clear cache to force refresh
    if (oauthUser && userAccessToken) {
      try {
        await fetchUserWantlistIds();
        cachedDiscogsWantlist = null; // Clear cache to force refresh
        console.log('Synced wantlist on tab open');
      } catch (error) {
        console.error('Failed to sync wantlist:', error);
      }
    }
    
    await loadWatchlist(1);
  });
  document.getElementById("shuffle-btn").addEventListener("click", (e) => {
    e.preventDefault();
    activeTab = "shuffle";
    document.getElementById("tab-shuffle").classList.add("active");
    document.getElementById("tab-search").classList.remove("active");
    document.getElementById("tab-watchlist").classList.remove("active");
    trackFilterApplied();
    loadShuffleData();
  });

  // Debounce search input to prevent too many requests
  let searchTimeout;
  document.getElementById("searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (activeTab === "search") {
        loadData(1);
      }
    }, 800); // Wait 800ms after user stops typing (increased from 500ms)
  });

  document.getElementById("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(searchTimeout); // Clear any pending timeout
      gtag("event", "search_query", {
        query: document.getElementById("searchInput").value.trim()
      });
      if (activeTab !== "search") {
        activeTab = "search";
        document.getElementById("tab-search").classList.add("active");
        document.getElementById("tab-shuffle").classList.remove("active");
        document.getElementById("tab-watchlist").classList.remove("active");
        updateFilterButtons();
      }
      loadData(1);
    }
  });

});

/* -----------------------
   New: CSV Parser & Discogs Collection Import
------------------------- */
async function importDiscogsCollection(file) {
  try {
    const csvText = await file.text();
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data;
    const releaseIds = rows
      .map(row => row.release_id)
      .filter(id => id !== undefined && id !== "");
    const uniqueIds = [...new Set(releaseIds.map(String))];
    if (uniqueIds.length === 0) {
      alert("No release_id values found in CSV.");
      return;
    }
    const { data, error } = await supabaseClient
      .from("releases")
      .select("*")
      .in("id", uniqueIds);
    if (error) {
      alert("Error querying releases from database.");
      return;
    }
    const watchlisted = getWatchlistedReleases();
    let importedCount = 0;
    uniqueIds.forEach(rid => {
      const match = data.find(item => String(item.id) === rid);
      if (match && !watchlisted.some(b => String(b.id) === rid)) {
        match.watchlistedAt = new Date().toISOString();
        watchlisted.push(match);
        importedCount++;
      }
    });
    const failedCount = uniqueIds.length - data.length;
    saveWatchlistedReleases(watchlisted);
    if (activeTab === "watchlist") {
      await loadWatchlist(currentPage);
    }
    alert(`Discogs Collection Import Completed. Imported: ${importedCount}, Failed: ${failedCount}`);
  } catch (err) {
    alert("Error processing CSV file.");
  }
}










/* -----------------------
   Tab Toggle and Filter Button Update
------------------------- */
function updateFilterButtons() {
  if (activeTab === "watchlist") {
    document.getElementById("filter-wrapper").style.display = "block";
    document.getElementById("pagination").style.display = "block";
  } else {
    document.getElementById("filter-wrapper").style.display = "block";
  }
  
  if (activeTab === "search") {
    document.querySelector(".filter-btn").style.display = "inline-block";
    document.querySelector(".shuffle-btn").style.display = "none";
    document.getElementById("pagination").style.display = "block";
  } else if (activeTab === "shuffle") {
    document.querySelector(".filter-btn").style.display = "none";
    document.querySelector(".shuffle-btn").style.display = "inline-block";
    document.getElementById("pagination").style.display = "none";
  } else if (activeTab === "watchlist") {
    document.querySelector(".filter-btn").style.display = "inline-block";
    document.querySelector(".shuffle-btn").style.display = "none";
    document.getElementById("pagination").style.display = "block";
  }
}

/* -----------------------
   YouTube Integration
------------------------- */
function initializeYouTubePlayers() {
  if (!filteredData || filteredData.length === 0) {
    return;
  }
  
  filteredData.forEach((release) => {
    if (release.youtube_links) {
      const yID = extractYouTubeID(release.youtube_links);
      if (yID) {
        const iframe = document.getElementById(`youtube-player-${release.id}`);
        if (iframe && typeof YT !== "undefined" && YT && YT.Player) {
          new YT.Player(iframe, {
            events: {
              onStateChange: (event) => {
                if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                  markAsInteracted(release.id);
                  const tr = iframe.closest("tr");
                  if (tr) tr.classList.add("greyed-out");
                }
              },
            },
          });
        }
      }
    }
  });
}

// Make function available globally for YouTube API
window.initializeYouTubePlayers = initializeYouTubePlayers;

// ------------------ Discogs API Rate Limiting ------------------
async function waitForRateLimit() {
  const now = Date.now();
  
  // Reset counter if we're in a new minute window
  if (now - requestWindowStart >= 60000) {
    requestCount = 0;
    requestWindowStart = now;
  }
  
  // If we've hit the per-minute limit, wait until the next window
  if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
    const waitTime = 60000 - (now - requestWindowStart) + 1000;
    if (waitTime > 0) {
      console.log(`Rate limit: waiting ${Math.ceil(waitTime / 1000)}s before next request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      requestCount = 0;
      requestWindowStart = Date.now();
    }
  }
  
  // Ensure minimum interval between requests
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
  requestCount++;
}

// ------------------ Discogs Authenticated Requests ------------------
async function makeAuthenticatedRequest(url) {
  if (!userAccessToken) {
    throw new Error('Not authenticated. Please log in first.');
  }
  
  await waitForRateLimit();
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Discogs token=${userAccessToken}`,
        'User-Agent': 'Gruuvs/1.0'
      }
    });
    
    if (!response.ok) {
      // Provide more specific error messages
      if (response.status === 401) {
        throw new Error('Authentication failed. Your token may be invalid or expired. Please log in again.');
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      } else if (response.status === 404) {
        throw new Error('Wantlist not found. Please check your Discogs settings.');
      } else if (response.status >= 500) {
        throw new Error('Discogs server error. Please try again later.');
      } else {
        throw new Error(`Request failed with status ${response.status}`);
      }
    }
    
    return await response.json();
  } catch (error) {
    // Re-throw with more context if it's a network error
    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      throw new Error('Network error. Please check your internet connection and try again.');
    }
    throw error;
  }
}

// Make Discogs API request (without auth, for public data)
async function makeDiscogsRequest(url) {
  await waitForRateLimit();
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Gruuvs/1.0'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  
  return await response.json();
}

// Fetch user's wantlist IDs from Discogs
async function fetchUserWantlistIds() {
  if (!oauthUser || !userAccessToken) {
    return;
  }
  
  try {
    const username = oauthUser.username;
    const firstPageUrl = `https://api.discogs.com/users/${username}/wants?per_page=100&page=1`;
    const firstPage = await makeAuthenticatedRequest(firstPageUrl);
    
    userWantlistIds.clear();
    
    // Add IDs from first page
    if (firstPage.wants) {
      firstPage.wants.forEach(item => {
        userWantlistIds.add(item.basic_information.id);
      });
    }
    
    // Fetch remaining pages if needed
    const totalPages = firstPage.pagination?.pages || 1;
    if (totalPages > 1) {
      const pagePromises = [];
      for (let page = 2; page <= Math.min(totalPages, 10); page++) {
        const pageUrl = `https://api.discogs.com/users/${username}/wants?per_page=100&page=${page}`;
        pagePromises.push(makeAuthenticatedRequest(pageUrl));
      }
      
      const pages = await Promise.all(pagePromises);
      pages.forEach(pageData => {
        if (pageData.wants) {
          pageData.wants.forEach(item => {
            userWantlistIds.add(item.basic_information.id);
          });
        }
      });
    }
    
    console.log(`Loaded ${userWantlistIds.size} items from Discogs wantlist`);
  } catch (error) {
    console.error('Failed to fetch wantlist IDs:', error);
  }
}

// Toggle release in Discogs wantlist
async function toggleDiscogsWantlist(releaseId) {
  if (!oauthUser || !userAccessToken) {
    // If not logged in, just toggle local watchlist
    const release = filteredData.find(r => r.id === releaseId);
    if (release) {
      toggleWatchlist(release);
    }
    return;
  }
  
  const isInWantlist = userWantlistIds.has(releaseId);
  
  // Show loading on icon
  const row = document.querySelector(`tr[data-id="${releaseId}"]`);
  const watchlistIcon = row?.querySelector(".watchlist-icon");
  const originalClasses = watchlistIcon?.className;
  
  if (watchlistIcon) {
    watchlistIcon.className = "bi bi-hourglass-split watchlist-icon";
    watchlistIcon.style.opacity = "0.5";
  }
  
  try {
    const username = oauthUser.username;
    const wantlistUrl = `https://api.discogs.com/users/${username}/wants/${releaseId}`;
    
    await waitForRateLimit();
    
    if (isInWantlist) {
      // Remove from wantlist
      const response = await fetch(wantlistUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Discogs token=${userAccessToken}`,
          'User-Agent': 'Gruuvs/1.0'
        }
      });
      
      if (response.status === 204) {
        userWantlistIds.delete(releaseId);
        console.log(`Removed ${releaseId} from Discogs wantlist`);
        
        // Also remove from local watchlist
        const watchlist = getWatchlistedReleases();
        const updated = watchlist.filter(r => r.id !== releaseId);
        saveWatchlistedReleases(updated);
        
        // Update icon
        if (watchlistIcon) {
          watchlistIcon.className = "bi bi-eye watchlist-icon";
          watchlistIcon.style.opacity = "1";
        }
      } else {
        throw new Error(`Failed to remove from wantlist: ${response.status}`);
      }
    } else {
      // Add to wantlist
      const response = await fetch(wantlistUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Discogs token=${userAccessToken}`,
          'User-Agent': 'Gruuvs/1.0'
        }
      });
      
      if (response.status === 201 || response.status === 204) {
        userWantlistIds.add(releaseId);
        console.log(`Added ${releaseId} to Discogs wantlist`);
        
        // Also add to local watchlist
        const release = filteredData.find(r => r.id === releaseId);
        if (release) {
          const watchlist = getWatchlistedReleases();
          const exists = watchlist.some(r => r.id === release.id);
          if (!exists) {
            release.watchlistedAt = new Date().toISOString();
            watchlist.push(release);
            saveWatchlistedReleases(watchlist);
          }
        }
        
        // Update icon
        if (watchlistIcon) {
          watchlistIcon.className = "bi bi-eye-fill watchlisted watchlist-icon";
          watchlistIcon.style.opacity = "1";
        }
      } else {
        throw new Error(`Failed to add to wantlist: ${response.status}`);
      }
    }
    
    // Track event
    gtag("event", "discogs_wantlist_toggle", {
      action: isInWantlist ? "removed" : "added",
      release_id: releaseId
    });
    
    // Clear cache so changes are reflected
    cachedDiscogsWantlist = null;
    
    // Refresh table if on watchlist tab
    if (activeTab === "watchlist") {
      await loadWatchlist(currentPage);
    }
    
  } catch (error) {
    console.error('Failed to update Discogs wantlist:', error);
    
    // Restore original icon
    if (watchlistIcon && originalClasses) {
      watchlistIcon.className = originalClasses;
      watchlistIcon.style.opacity = "1";
    }
    
    alert('Failed to update wantlist. Please try again.');
  }
}

// Sync local watchlist with Discogs wantlist
async function syncWithDiscogsWantlist() {
  if (!oauthUser || !userAccessToken) {
    alert('Please log in with Discogs to sync your wantlist.');
    return;
  }
  
  const syncBtn = document.getElementById("syncWantlistBtn");
  const originalText = syncBtn.innerHTML;
  
  try {
    // Show loading state
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Syncing...';
    
    await fetchUserWantlistIds();
    
    // Merge Discogs wantlist with local watchlist
    const localWatchlist = getWatchlistedReleases();
    const localIds = new Set(localWatchlist.map(r => r.id));
    
    // Count how many are new from Discogs
    const newFromDiscogs = [...userWantlistIds].filter(id => !localIds.has(id));
    
    // Update wantlist count in UI
    const wantlistCountValue = document.getElementById("wantlistCountValue");
    if (wantlistCountValue) {
      wantlistCountValue.textContent = userWantlistIds.size;
    }
    
    // Success message
    syncBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Synced!';
    setTimeout(() => {
      syncBtn.innerHTML = originalText;
      syncBtn.disabled = false;
    }, 2000);
    
    const message = newFromDiscogs.length > 0
      ? `Synced ${userWantlistIds.size} items from Discogs wantlist!\n${newFromDiscogs.length} new items found.`
      : `Synced ${userWantlistIds.size} items from Discogs wantlist!\nAll items are already in your local watchlist.`;
    
    alert(message);
    
    // Refresh table if on watchlist tab
    if (activeTab === "watchlist") {
      await loadWatchlist(currentPage);
    }
    
  } catch (error) {
    console.error('Failed to sync wantlist:', error);
    syncBtn.innerHTML = '<i class="bi bi-exclamation-circle me-1"></i>Failed';
    setTimeout(() => {
      syncBtn.innerHTML = originalText;
      syncBtn.disabled = false;
    }, 2000);
    alert('Failed to sync with Discogs. Please check your connection and try again.');
  }
}

// ------------------ Profile Modal Functions ------------------
function openProfile() {
  const modal = new bootstrap.Modal(document.getElementById("profileModal"));
  updateProfileUI();
  modal.show();
}

function updateProfileUI() {
  const token = localStorage.getItem("discogsToken");
  const username = localStorage.getItem("discogsUsername");
  
  const syncBtn = document.getElementById("syncWantlistBtn");
  const loginIndicator = document.getElementById("login-indicator");
  const wantlistCountValue = document.getElementById("wantlistCountValue");
  const watchlistTab = document.getElementById("tab-watchlist");
  
  if (token && username) {
    document.getElementById("tokenLoginSection").style.display = "none";
    document.getElementById("tokenLoggedInSection").style.display = "block";
    document.getElementById("profileUsername").textContent = username;
    
    // Update wantlist count
    if (wantlistCountValue) {
      wantlistCountValue.textContent = userWantlistIds.size;
    }
    
    // Show login indicator
    if (loginIndicator) {
      loginIndicator.style.display = "block";
    }
    
    // Update watchlist tab title to show it's connected to Discogs
    if (watchlistTab) {
      watchlistTab.title = "Discogs Wantlist";
    }
    
    // Enable sync button
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.classList.remove("btn-secondary");
      syncBtn.classList.add("btn-primary");
    }
    
    // Set global variables
    userAccessToken = token;
    oauthUser = { username: username };
  } else {
    document.getElementById("tokenLoginSection").style.display = "block";
    document.getElementById("tokenLoggedInSection").style.display = "none";
    
    // Hide login indicator
    if (loginIndicator) {
      loginIndicator.style.display = "none";
    }
    
    // Update watchlist tab title to show it's local only
    if (watchlistTab) {
      watchlistTab.title = "Local Watchlist";
    }
    
    // Disable sync button
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.classList.remove("btn-primary");
      syncBtn.classList.add("btn-secondary");
    }
    
    userAccessToken = null;
    oauthUser = null;
  }
}

// Initialize authentication state on page load
function initializeAuth() {
  const token = localStorage.getItem("discogsToken");
  const username = localStorage.getItem("discogsUsername");
  const loginIndicator = document.getElementById("login-indicator");
  const watchlistTab = document.getElementById("tab-watchlist");
  
  if (token && username) {
    userAccessToken = token;
    oauthUser = { username: username };
    
    // Show login indicator
    if (loginIndicator) {
      loginIndicator.style.display = "block";
    }
    
    // Update watchlist tab title
    if (watchlistTab) {
      watchlistTab.title = "Discogs Wantlist";
    }
    
    // Fetch wantlist IDs in background
    fetchUserWantlistIds().catch(err => {
      console.error("Failed to load wantlist on init:", err);
    });
  } else {
    // Hide login indicator
    if (loginIndicator) {
      loginIndicator.style.display = "none";
    }
    
    // Set local watchlist title
    if (watchlistTab) {
      watchlistTab.title = "Local Watchlist";
    }
  }
}

async function loginWithToken() {
  const token = document.getElementById("profileTokenInput").value.trim();
  
  if (!token) {
    alert("Please enter your Discogs Personal Access Token");
    return;
  }
  
  try {
    // Verify token by fetching user identity
    const response = await fetch("https://api.discogs.com/oauth/identity", {
      headers: {
        "Authorization": `Discogs token=${token}`,
        "User-Agent": "Gruuvs/1.0"
      }
    });
    
    if (!response.ok) {
      throw new Error("Invalid token");
    }
    
    const userData = await response.json();
    
    // Save token and username
    localStorage.setItem("discogsToken", token);
    localStorage.setItem("discogsUsername", userData.username);
    
    // Set global variables
    userAccessToken = token;
    oauthUser = userData;
    
    // Fetch wantlist IDs
    await fetchUserWantlistIds();
    
    // Update UI
    updateProfileUI();
    
    alert(`Successfully logged in as ${userData.username}! Loaded ${userWantlistIds.size} items from your wantlist.`);
  } catch (error) {
    console.error("Login error:", error);
    alert("Failed to login. Please check your token and try again.");
  }
}

function logoutDiscogs() {
  localStorage.removeItem("discogsToken");
  localStorage.removeItem("discogsUsername");
  userAccessToken = null;
  oauthUser = null;
  userWantlistIds.clear();
  cachedDiscogsWantlist = null; // Clear cached wantlist on logout
  updateProfileUI();
  alert("Successfully logged out");
}

// ------------------ Export Watchlist Data ------------------
function exportUserData() {
  const watchlistedReleases = JSON.parse(localStorage.getItem("watchlistedReleases") || "[]");
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(watchlistedReleases, null, 2));
  const dlAnchorElem = document.createElement("a");
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", "gruuvs_watchlist.json");
  dlAnchorElem.click();
}

// ------------------ Import Watchlist Data ------------------
async function handleImportWatchlist(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const importedData = JSON.parse(text);
    
    if (!Array.isArray(importedData)) {
      alert("Invalid file format. Please select a valid watchlist JSON file.");
      return;
    }
    
    const currentWatchlist = getWatchlistedReleases();
    const merged = [...currentWatchlist];
    let addedCount = 0;
    
    importedData.forEach(release => {
      if (!merged.some(r => r.id === release.id)) {
        merged.push(release);
        addedCount++;
      }
    });
    
    saveWatchlistedReleases(merged);
    
    if (activeTab === "watchlist") {
      loadWatchlist(currentPage);
    }
    
    alert(`Import completed! Added ${addedCount} new releases to your watchlist.`);
  } catch (error) {
    console.error("Import error:", error);
    alert("Failed to import watchlist. Please check the file format.");
  }
}


/* -----------------------
   Event Tracking
------------------------- */
function trackFilterApplied() {
  const genre = document.getElementById("genre").value;
  const style = document.getElementById("style").value;
  const yearRange = document.getElementById("year_range").value.trim();
  const ratingRange = document.getElementById("rating_range").value.trim();
  const ratingCountRange = document.getElementById("rating_count_range").value.trim();
  gtag("event", "filter_applied", {
    genre: genre || "All",
    style: style || "All",
    year_range: yearRange || "All",
    rating_range: ratingRange || "All",
    rating_count_range: ratingCountRange || "All",
  });
}

function trackCopyButtonClick(release) {
  gtag("event", "copy_title", {
    title: release.title,
    label: release.label || "Unknown",
    release_id: release.id,
  });
}

function trackReleaseLinkClick(release) {
  gtag("event", "release_link_click", {
    title: release.title,
    label: release.label || "Unknown",
    release_id: release.id,
    url: release.link,
  });
}

/* -----------------------
   Cookie Popup Functionality
------------------------- */
document.addEventListener("DOMContentLoaded", function() {
  const cookiePopup = document.getElementById("cookie-popup");
  const cookieAcceptBtn = document.getElementById("cookie-accept-btn");
  if (!localStorage.getItem("cookieConsent")) {
    cookiePopup.style.display = "flex";
  } else {
    cookiePopup.style.display = "none";
  }
  cookieAcceptBtn.addEventListener("click", function() {
    localStorage.setItem("cookieConsent", "true");
    cookiePopup.style.display = "none";
  });
});

/* -----------------------
   Homepage Navigation
------------------------- */
function goToHomepage(event) {
  event.preventDefault();
  // Reset to search tab
  activeTab = "search";
  document.getElementById("tab-search").classList.add("active");
  document.getElementById("tab-shuffle").classList.remove("active");
  document.getElementById("tab-watchlist").classList.remove("active");
  
  // Clear search and filters
  document.getElementById("searchInput").value = "";
  document.getElementById("genre").value = "";
  document.getElementById("style").value = "";
  document.getElementById("year_range").value = "";
  document.getElementById("rating_range").value = "";
  document.getElementById("rating_count_range").value = "";
  document.getElementById("want_range").value = "";
  
  // Reset sort to default
  sortConfig = { key: "title", order: "asc" };
  localStorage.setItem("sortConfig", JSON.stringify(sortConfig));
  
  updateFilterButtons();
  updateSortIndicators();
  loadData(1);
}