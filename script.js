// --- Existing Code ---
const supabaseUrl = "https://oghdrmtorpeqaewttckr.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9naGRybXRvcnBlcWFld3R0Y2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExNjc4OTksImV4cCI6MjA1Njc0Mzg5OX0.HW5aD19Hy__kpOLp5JHi8HXLzl7D6_Tu4UNyB3mNAHs";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Global pagination and sorting config for Search and Shuffle
let filteredData = [];
let totalRecords = 0;
let currentPage = 1;
const pageSize = 10;
let totalPages = 1;

// Global active tab state: "search", "shuffle", or "bookmark"
let activeTab = "search";

// Global personalized toggle flag (false by default)
let personalizedEnabled = false;

// Default: Sort by title ascending
let sortConfig = { key: "title", order: "asc" };

let youtubeApiReady = false;

// Global flag for cancellation
let cancelImport = false;

// ------------------ Bookmark Data ------------------
function getBookmarkedReleases() {
  return JSON.parse(localStorage.getItem("bookmarkedReleases") || "[]");
}

function saveBookmarkedReleases(bookmarks) {
  localStorage.setItem("bookmarkedReleases", JSON.stringify(bookmarks));
}

function isBookmarked(id) {
  const bookmarks = getBookmarkedReleases();
  return bookmarks.some(release => release.id === id);
}

function toggleBookmark(release) {
  let bookmarks = getBookmarkedReleases();
  let action;
  if (isBookmarked(release.id)) {
    bookmarks = bookmarks.filter(r => r.id !== release.id);
    action = "removed";
  } else {
    release.bookmarkedAt = new Date().toISOString();
    bookmarks.push(release);
    action = "added";
  }
  saveBookmarkedReleases(bookmarks);
  gtag("event", "bookmark_toggle", {
    action: action,
    release_id: release.id,
    title: release.title,
  });
  const row = document.querySelector(`tr[data-id="${release.id}"]`);
  if (row) {
    const bookmarkIcon = row.querySelector(".bookmark-star");
    if (bookmarkIcon) {
      if (isBookmarked(release.id)) {
        bookmarkIcon.classList.remove("bi-bookmark");
        bookmarkIcon.classList.add("bi-bookmark-fill", "bookmarked");
      } else {
        bookmarkIcon.classList.remove("bi-bookmark-fill", "bookmarked");
        bookmarkIcon.classList.add("bi-bookmark");
      }
    }
  }
  if (activeTab === "bookmark") {
    loadBookmarks(currentPage);
  }
}

// ------------------ Helper Functions ------------------
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
async function fetchReleases({ page = 1, retryCount = 0 } = {}) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second

  try {
    const selectedGenre = document.getElementById("genre").value;
    const selectedStyle = document.getElementById("style").value;
    const { min: yearMin, max: yearMax } = parseYearRange();
    const ratingRange = parseRangeInput(document.getElementById("rating_range").value.trim());
    const ratingCountRange = parseRangeInput(document.getElementById("rating_count_range").value.trim());
    const priceRange = parseRangeInput(document.getElementById("price_range").value.trim());
    let query = supabaseClient.from("releases").select("*", { count: "exact" });
    const searchQuery = document.getElementById("searchInput").value.trim();
    
    // Show loading state
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = `<tr><td class="no-results" colspan="12">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p>Searching${retryCount > 0 ? ` (Attempt ${retryCount + 1}/${MAX_RETRIES})` : ''}...</p>
    </td></tr>`;

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
    if (priceRange.min !== -Infinity) query = query.gte("lowest_price", priceRange.min);
    if (priceRange.max !== Infinity) query = query.lte("lowest_price", priceRange.max);
    if (sortConfig.key) {
      query = query.order(sortConfig.key, { ascending: sortConfig.order === "asc" });
    }
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    query = query.range(start, end);
    
    const { data, count, error } = await query;
    
    if (error) {
      console.error(`Error fetching releases data (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
      
      // If we haven't exceeded max retries, try again after a delay
      if (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchReleases({ page, retryCount: retryCount + 1 });
      }
      
      // If we've exceeded retries, show error message
      tbody.innerHTML = `<tr><td class="no-results" colspan="12">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <p>Failed to load results after ${MAX_RETRIES} attempts. Please try again.</p>
      </td></tr>`;
      return { data: [], count: 0 };
    }

    // If we got data but it's empty and we haven't exceeded retries, try again
    if ((!data || data.length === 0) && retryCount < MAX_RETRIES) {
      console.log(`No results found (attempt ${retryCount + 1}/${MAX_RETRIES}), retrying...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchReleases({ page, retryCount: retryCount + 1 });
    }

    return { data, count };
  } catch (error) {
    console.error(`Error in fetchReleases (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
    
    // If we haven't exceeded max retries, try again after a delay
    if (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchReleases({ page, retryCount: retryCount + 1 });
    }
    
    // If we've exceeded retries, show error message
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = `<tr><td class="no-results" colspan="12">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <p>Failed to load results after ${MAX_RETRIES} attempts. Please try again.</p>
    </td></tr>`;
    return { data: [], count: 0 };
  }
}

async function loadData(page = 1) {
  try {
    const { data, count } = await fetchReleases({ page });
    filteredData = data;
    totalRecords = count || 0;
    totalPages = Math.ceil(totalRecords / pageSize) || 1;
    currentPage = page;
    renderTable();
    renderPagination();
    document.getElementById("pagination").style.display = "block";
  } catch (error) {
    console.error("Error in loadData:", error);
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = `<tr><td class="no-results" colspan="12">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <p>An error occurred while loading results. Please try again.</p>
    </td></tr>`;
  }
}

async function fetchShuffleReleases({ retryCount = 0 } = {}) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second

  try {
    // Apply filtering logic (same as in fetchReleases)
    const selectedGenre = document.getElementById("genre").value;
    const selectedStyle = document.getElementById("style").value;
    const { min: yearMin, max: yearMax } = parseYearRange();
    const ratingRange = parseRangeInput(document.getElementById("rating_range").value.trim());
    const ratingCountRange = parseRangeInput(document.getElementById("rating_count_range").value.trim());
    const priceRange = parseRangeInput(document.getElementById("price_range").value.trim());
    
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
    if (priceRange.min !== -Infinity) query = query.gte("lowest_price", priceRange.min);
    if (priceRange.max !== Infinity) query = query.lte("lowest_price", priceRange.max);

    // Get the filtered count and data
    const { data: allData, count, error } = await query;
    if (error) {
      console.error(`Error fetching shuffle data (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
      
      // If we haven't exceeded max retries, try again after a delay
      if (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchShuffleReleases({ retryCount: retryCount + 1 });
      }
      
      return { data: [], count: 0 };
    }
    
    const shuffleSize = 10; // Increased from 5 to 10
    if (count > shuffleSize) {
      // Optimize: Instead of rebuilding the query, use the existing query with range
      const randomOffset = Math.floor(Math.random() * (count - shuffleSize + 1));
      const { data, error: err } = await query.range(randomOffset, randomOffset + shuffleSize - 1);
      
      if (err) {
        console.error(`Error fetching shuffle data with range (attempt ${retryCount + 1}/${MAX_RETRIES}):`, err);
        
        // If we haven't exceeded max retries, try again after a delay
        if (retryCount < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return fetchShuffleReleases({ retryCount: retryCount + 1 });
        }
        
        return { data: [], count: 0 };
      }
      
      // If we got data but it's empty and we haven't exceeded retries, try again
      if ((!data || data.length === 0) && retryCount < MAX_RETRIES) {
        console.log(`No shuffle results found (attempt ${retryCount + 1}/${MAX_RETRIES}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchShuffleReleases({ retryCount: retryCount + 1 });
      }
      
      return { data, count: shuffleSize };
    } else {
      // If we got data but it's empty and we haven't exceeded retries, try again
      if ((!allData || allData.length === 0) && retryCount < MAX_RETRIES) {
        console.log(`No shuffle results found (attempt ${retryCount + 1}/${MAX_RETRIES}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchShuffleReleases({ retryCount: retryCount + 1 });
      }
      
      return { data: allData, count };
    }
  } catch (error) {
    console.error(`Error in fetchShuffleReleases (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
    
    // If we haven't exceeded max retries, try again after a delay
    if (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchShuffleReleases({ retryCount: retryCount + 1 });
    }
    
    return { data: [], count: 0 };
  }
}

// ------------------ Personalized Shuffle ------------------
async function loadPersonalizedShuffleData() {
  const { data: candidateData } = await fetchShuffleReleases();
  
  // Cache bookmarked releases for performance
  const bookmarked = getBookmarkedReleases();
  const bookmarkedIds = new Set(bookmarked.map(b => String(b.id)));
  
  // Build preference sets more efficiently
  const preferredLabels = new Set();
  const preferredArtists = new Set();
  
  for (const release of bookmarked) {
    if (release.label) {
      preferredLabels.add(release.label.toLowerCase().trim());
    }
    if (release.artist) {
      preferredArtists.add(release.artist.toLowerCase().trim());
    }
  }
  
  // Filter and categorize candidates in a single pass
  const matchingCandidates = [];
  const otherCandidates = [];
  const currentSearch = document.getElementById("searchInput").value.trim().toLowerCase();
  
  for (const release of candidateData) {
    // Skip if already bookmarked
    if (bookmarkedIds.has(String(release.id))) {
      continue;
    }
    
    let hasMatch = false;
    let score = 0;
    
    // Check for label/artist matches
    if (release.label && preferredLabels.has(release.label.toLowerCase().trim())) {
      hasMatch = true;
    }
    if (release.artist && preferredArtists.has(release.artist.toLowerCase().trim())) {
      hasMatch = true;
    }
    
    // Calculate base score for non-matching candidates
    if (!hasMatch) {
      if (release.average_rating) {
        score += parseFloat(release.average_rating);
      }
      if (release.rating_count) {
        score += Math.log(release.rating_count + 1);
      }
      if (currentSearch && release.title.toLowerCase().includes(currentSearch)) {
        score += 1;
      }
    }
    
    // Add to appropriate array
    if (hasMatch) {
      matchingCandidates.push(release);
    } else {
      release.basicScore = score;
      otherCandidates.push(release);
    }
  }
  
  // Sort efficiently
  matchingCandidates.sort((a, b) => (parseFloat(b.average_rating) || 0) - (parseFloat(a.average_rating) || 0));
  otherCandidates.sort((a, b) => b.basicScore - a.basicScore);
  
  // Build final recommendation array
  const recommended = [];
  const maxResults = 10;
  
  // Add matching candidates first
  recommended.push(...matchingCandidates.slice(0, maxResults));
  
  // Fill remaining slots with other candidates
  if (recommended.length < maxResults) {
    const needed = maxResults - recommended.length;
    recommended.push(...otherCandidates.slice(0, needed));
  }
  
  filteredData = recommended;
  totalRecords = recommended.length;
  currentPage = 1;
  renderTable();
  document.getElementById("pagination").style.display = "none";
}

async function loadShuffleData() {
  try {
    // Show loading state
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = `<tr><td class="no-results" colspan="12">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p>Loading shuffle results...</p>
    </td></tr>`;

    if (personalizedEnabled) {
      await loadPersonalizedShuffleData();
    } else {
      const { data, count } = await fetchShuffleReleases();
      filteredData = data;
      totalRecords = count;
      currentPage = 1;
      renderTable();
      document.getElementById("pagination").style.display = "none";
    }
  } catch (error) {
    console.error("Error in loadShuffleData:", error);
    const tbody = document.getElementById("releases-table-body");
    tbody.innerHTML = `<tr><td class="no-results" colspan="12">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <p>An error occurred while loading shuffle results. Please try again.</p>
    </td></tr>`;
  }
}

// ------------------ Load Bookmarked Releases ------------------
function loadBookmarks(page = 1) {
  let bookmarks = getBookmarkedReleases();
   // Apply filter criteria from the filter box:
   const searchQuery = document.getElementById("searchInput").value.trim().toLowerCase();
   const selectedGenre = document.getElementById("genre").value;
   const selectedStyle = document.getElementById("style").value;
   const { min: yearMin, max: yearMax } = parseYearRange();
   const ratingRange = parseRangeInput(document.getElementById("rating_range").value.trim());
   const ratingCountRange = parseRangeInput(document.getElementById("rating_count_range").value.trim());
   const priceRange = parseRangeInput(document.getElementById("price_range").value.trim());
 
   bookmarks = bookmarks.filter(release => {
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
     if (release.lowest_price !== undefined) {
       const price = parseFloat(release.lowest_price);
       if (price < priceRange.min || price > priceRange.max) pass = false;
     }
     return pass;
   });
 
   // Sort bookmarks (default: most recent bookmarked first)
   if (!sortConfig || sortConfig.key === "title") {
     bookmarks.sort((a, b) => new Date(b.bookmarkedAt) - new Date(a.bookmarkedAt));
   } else {
     bookmarks.sort((a, b) => {
       let aVal = a[sortConfig.key];
       let bVal = b[sortConfig.key];
       if (sortConfig.key === "title" || sortConfig.key === "label") {
         aVal = aVal ? aVal.toLowerCase() : "";
         bVal = bVal ? bVal.toLowerCase() : "";
       } else if (["year", "have", "want", "lowest_price"].includes(sortConfig.key)) {
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
   // Filtering logic (omitted for brevity)
  totalRecords = bookmarks.length;
  totalPages = Math.ceil(totalRecords / pageSize) || 1;
  currentPage = page;
  filteredData = bookmarks.slice((page - 1) * pageSize, page * pageSize);
  renderTable();
  renderPagination();
  document.getElementById("pagination").style.display = "block";
}

// ------------------ Merge User Data ------------------
async function mergeUserData(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && typeof imported === 'object') {
        const currentBookmarks = getBookmarkedReleases();
        const importedBookmarks = imported.bookmarkedReleases || [];
        const mergedBookmarks = [...currentBookmarks];
        importedBookmarks.forEach(item => {
          if (!mergedBookmarks.some(b => String(b.id) === String(item.id))) {
            mergedBookmarks.push(item);
          }
        });
        localStorage.setItem("bookmarkedReleases", JSON.stringify(mergedBookmarks));
        const currentInteracted = JSON.parse(localStorage.getItem("interactedReleases") || "[]");
        const importedInteracted = imported.interactedReleases || [];
        const mergedInteracted = Array.from(new Set([...currentInteracted, ...importedInteracted]));
        localStorage.setItem("interactedReleases", JSON.stringify(mergedInteracted));
        if (activeTab === "bookmark") {
          loadBookmarks(currentPage);
        }
        alert("Merge Completed: Imported data has been merged with your current user data.");
      } else {
        alert("Invalid file format for merging.");
      }
    } catch (err) {
      alert("Error reading merge file.");
    }
  };
  reader.readAsText(file);
}

// ------------------ Initialize Filters ------------------
let filtersCache = null;

async function initializeFilters() {
  // Check if we have cached filter data
  const cachedFilters = localStorage.getItem('filtersCache');
  const cacheTimestamp = localStorage.getItem('filtersCacheTimestamp');
  const now = Date.now();
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  if (cachedFilters && cacheTimestamp && (now - parseInt(cacheTimestamp)) < CACHE_DURATION) {
    // Use cached data
    const { genres, styles } = JSON.parse(cachedFilters);
    populateFilterOptions(genres, styles);
    return;
  }

  // Fetch fresh data
  try {
    const { data, error } = await supabaseClient.from("releases").select("genre, style").limit(2000);
    if (error) {
      console.error("Error loading genres/styles:", error);
      return;
    }
    
    const genresSet = new Set();
    const stylesSet = new Set();
    data.forEach((row) => {
      if (row.genre) {
        row.genre.split(",").forEach((g) => {
          if (g.trim()) genresSet.add(g.trim());
        });
      }
      if (row.style) {
        row.style.split(",").forEach((s) => {
          if (s.trim()) stylesSet.add(s.trim());
        });
      }
    });
    
    const genres = Array.from(genresSet).sort();
    const styles = Array.from(stylesSet).sort();
    
    // Cache the results
    localStorage.setItem('filtersCache', JSON.stringify({ genres, styles }));
    localStorage.setItem('filtersCacheTimestamp', now.toString());
    
    populateFilterOptions(genres, styles);
  } catch (error) {
    console.error("Error initializing filters:", error);
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
    tbody.innerHTML = `<tr><td class="no-results" colspan="12">
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
    const tdBookmark = document.createElement("td");
    tdBookmark.className = "text-center";
    const bookmarkIcon = document.createElement("i");
    bookmarkIcon.style.fontSize = "1rem";
    bookmarkIcon.className = "bi bookmark-star " + (isBookmarked(release.id) ? "bi-bookmark-fill bookmarked" : "bi-bookmark");
    bookmarkIcon.title = "Toggle Bookmark";
    bookmarkIcon.addEventListener("click", () => {
      toggleBookmark(release);
    });
    tdBookmark.appendChild(bookmarkIcon);
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
      const mobileBookmarkContainer = document.createElement("div");
      mobileBookmarkContainer.className = "mobile-bookmark";
      mobileBookmarkContainer.style.position = "absolute";
      mobileBookmarkContainer.style.bottom = "8px";
      mobileBookmarkContainer.style.right = "8px";
      mobileBookmarkContainer.appendChild(tdBookmark);
      tdMobile.appendChild(mobileBookmarkContainer);
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
      const tdPrice = document.createElement("td");
      tdPrice.className = "text-center";
      tdPrice.textContent = release.lowest_price !== undefined ? `${parseFloat(release.lowest_price).toFixed(2)}$` : "N/A";
      tr.appendChild(tdPrice);
      tr.appendChild(tdBookmark);
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
  if (totalPages <= 1) return;
  const prevLi = document.createElement("li");
  prevLi.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
  const prevLink = document.createElement("a");
  prevLink.className = "page-link";
  prevLink.href = "#";
  prevLink.innerHTML = `<i class="bi bi-chevron-left"></i> Prev`;
  prevLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentPage > 1) {
      activeTab === "bookmark" ? loadBookmarks(currentPage - 1) : loadData(currentPage - 1);
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
    pageLink.addEventListener("click", (e) => {
      e.preventDefault();
      activeTab === "bookmark" ? loadBookmarks(p) : loadData(p);
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
  nextLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentPage < totalPages) {
      activeTab === "bookmark" ? loadBookmarks(currentPage + 1) : loadData(currentPage + 1);
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
    if (activeTab === "bookmark") {
      loadBookmarks(currentPage);
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
  
  // ------------------ New: Import Discogs Collection functionality ------------------
  document.getElementById("import-discogs-btn").addEventListener("click", () => {
    document.getElementById("import-discogs-file").click();
  });
  document.getElementById("import-discogs-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      importDiscogsCollection(file);
    }
  });

  // ------------------ New Feature: Import Collection ------------------
  // The user selects a folder (using a file input with directory selection)
  document.getElementById("import-collection-btn").addEventListener("click", () => {
    document.getElementById("import-collection-folder").click();
  });
  document.getElementById("import-collection-folder").addEventListener("change", (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      importCollection(files);
    }
  });

  sortConfig = JSON.parse(localStorage.getItem("sortConfig") || '{"key":"title","order":"asc"}');
  const navBookmark = document.getElementById("tab-bookmark");
  if (navBookmark) {
    navBookmark.innerHTML = '<i class="bi bi-bookmark"></i>';
  }
  const togglePersonalized = document.getElementById("togglePersonalized");
  togglePersonalized.addEventListener("change", () => {
    personalizedEnabled = togglePersonalized.checked;
    if (activeTab === "shuffle") {
      loadShuffleData();
    }
  });
  initializeFilters().then(() => {
    if (activeTab === "search") {
      loadData(1);
    } else if (activeTab === "shuffle") {
      loadShuffleData();
    } else if (activeTab === "bookmark") {
      loadBookmarks(1);
    }
  });
  applySavedColumnWidths();
  makeTableResizable();
  updateSortIndicators();
  updateFilterButtons();
  document.getElementById("filter-form").addEventListener("submit", (e) => {
    e.preventDefault();
    trackFilterApplied();
    if (activeTab === "search") {
      loadData(1);
    } else if (activeTab === "shuffle") {
      loadShuffleData();
    } else if (activeTab === "bookmark") {
      loadBookmarks(1);
    }
  });
  // Debounced filter change handler
  let filterTimeout;
  function handleFilterChange() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
      trackFilterApplied();
      if (activeTab === "search") {
        loadData(1);
      } else if (activeTab === "shuffle") {
        loadShuffleData();
      } else if (activeTab === "bookmark") {
        loadBookmarks(1);
      }
    }, 300); // 300ms debounce
  }

  document.getElementById("genre").addEventListener("change", handleFilterChange);
  document.getElementById("style").addEventListener("change", handleFilterChange);
  
  // Add debouncing to range inputs
  document.getElementById("year_range").addEventListener("input", handleFilterChange);
  document.getElementById("rating_range").addEventListener("input", handleFilterChange);
  document.getElementById("rating_count_range").addEventListener("input", handleFilterChange);
  document.getElementById("price_range").addEventListener("input", handleFilterChange);
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
    document.getElementById("tab-bookmark").classList.remove("active");
    updateFilterButtons();
    loadData(1);
    document.getElementById("searchInput").focus();
  });
  document.getElementById("tab-shuffle").addEventListener("click", (e) => {
    e.preventDefault();
    activeTab = "shuffle";
    document.getElementById("tab-shuffle").classList.add("active");
    document.getElementById("tab-search").classList.remove("active");
    document.getElementById("tab-bookmark").classList.remove("active");
    updateFilterButtons();
    loadShuffleData();
  });
  document.getElementById("tab-bookmark").addEventListener("click", (e) => {
    e.preventDefault();
    activeTab = "bookmark";
    document.getElementById("tab-bookmark").classList.add("active");
    document.getElementById("tab-search").classList.remove("active");
    document.getElementById("tab-shuffle").classList.remove("active");
    updateFilterButtons();
    loadBookmarks(1);
  });
  document.getElementById("shuffle-btn").addEventListener("click", (e) => {
    e.preventDefault();
    activeTab = "shuffle";
    document.getElementById("tab-shuffle").classList.add("active");
    document.getElementById("tab-search").classList.remove("active");
    document.getElementById("tab-bookmark").classList.remove("active");
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
    }, 500); // Wait 500ms after user stops typing
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
        document.getElementById("tab-bookmark").classList.remove("active");
        updateFilterButtons();
      }
      loadData(1);
    }
  });

  document.getElementById("export-btn").addEventListener("click", exportUserData);
  document.getElementById("import-btn").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      importUserData(file);
    }
  });
  document.getElementById("merge-btn").addEventListener("click", () => {
    document.getElementById("merge-file").click();
  });
  document.getElementById("merge-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      mergeUserData(file);
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
    const bookmarked = getBookmarkedReleases();
    let importedCount = 0;
    uniqueIds.forEach(rid => {
      const match = data.find(item => String(item.id) === rid);
      if (match && !bookmarked.some(b => String(b.id) === rid)) {
        match.bookmarkedAt = new Date().toISOString();
        bookmarked.push(match);
        importedCount++;
      }
    });
    const failedCount = uniqueIds.length - data.length;
    saveBookmarkedReleases(bookmarked);
    if (activeTab === "bookmark") loadBookmarks(currentPage);
    alert(`Discogs Collection Import Completed. Imported: ${importedCount}, Failed: ${failedCount}`);
  } catch (err) {
    alert("Error processing CSV file.");
  }
}

/* -----------------------
   New Feature: Import Collection from Folder
------------------------- */
// This function uses jsmediatags to read metadata from audio files.
// It then groups by album (release) and tries to match with a release in the database.
// Any matching release is then added to the bookmarks.

// NEW: Show Progress Modal
/* -----------------------
   Updated: Show Progress Modal with Cancel Button and Estimated Time
------------------------- */
function showProgressModal(message, progress) {
  let modal = document.getElementById("progressModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "progressModal";
    modal.className = "modal fade";
    modal.tabIndex = -1;
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Processing Import</h5>
            <button type="button" class="btn-close" id="progressModalCancelBtn" aria-label="Cancel"></button>
          </div>
          <div class="modal-body">
            <p id="progressModalMessage">${message}</p>
            <p id="estimatedTime"></p>
            <div class="progress">
              <div id="progressModalBar" class="progress-bar" role="progressbar" style="width: ${progress}%;" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  } else {
    document.getElementById("progressModalMessage").textContent = message;
    const bar = document.getElementById("progressModalBar");
    bar.style.width = `${progress}%`;
    bar.setAttribute("aria-valuenow", progress);
  }
  // Attach cancel event listener
  const cancelBtn = document.getElementById("progressModalCancelBtn");
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      cancelImport = true;
    };
  }
  const bsModal = new bootstrap.Modal(modal, { backdrop: "static", keyboard: false });
  bsModal.show();
  modal.bsModal = bsModal;
}


/* -----------------------
   Updated: Update Progress Modal with Estimated Time (formatted as hours, minutes, seconds)
------------------------- */
function updateProgressModal(message, progress, startTime) {
  const modal = document.getElementById("progressModal");
  if (modal) {
    document.getElementById("progressModalMessage").textContent = message;
    const bar = document.getElementById("progressModalBar");
    bar.style.width = `${progress}%`;
    bar.setAttribute("aria-valuenow", progress);
    
    // Calculate estimated time remaining based on elapsed time
    const elapsed = (Date.now() - startTime) / 1000; // seconds
    const estimatedTotal = progress > 0 ? (elapsed / progress) * 100 : 0;
    const remaining = Math.max(estimatedTotal - elapsed, 0);

    // Convert remaining seconds to hours, minutes, seconds
    const hrs = Math.floor(remaining / 3600);
    const mins = Math.floor((remaining % 3600) / 60);
    const secs = Math.floor(remaining % 60);

    // Format the estimated time string
    let timeStr = "";
    if (hrs > 0) {
      timeStr += `${hrs} hour${hrs === 1 ? "" : "s"}, `;
    }
    if (mins > 0 || hrs > 0) {
      timeStr += `${mins} minute${mins === 1 ? "" : "s"}, `;
    }
    timeStr += `${secs} second${secs === 1 ? "" : "s"}`;

    document.getElementById("estimatedTime").textContent = `Estimated time remaining: ${timeStr}`;
  }
}

// NEW: Hide Progress Modal
function hideProgressModal() {
  const modal = document.getElementById("progressModal");
  if (modal && modal.bsModal) {
    modal.bsModal.hide();
  }
}



/* -----------------------
   Helper: Parse File Name for Artist and Album
------------------------- */
function parseFileName(fileName) {
  // Remove file extension (e.g., .mp3, .flac)
  const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, "");
  // Expect pattern "Artist - Album" (or more parts)
  const parts = nameWithoutExtension.split(" - ");
  if (parts.length >= 2) {
    return {
      artist: parts[0].toLowerCase().trim(),
      album: parts.slice(1).join(" - ").toLowerCase().trim()
    };
  }
  return {};
}

/* -----------------------
   Updated: Import Collection from Folder (Improved Matching with Cancellation, Estimated Time, and One Track per Release)
------------------------- */
// This function uses jsmediatags to read metadata from audio files.
// Files are grouped by a composite key of artist and album. If metadata is missing,
// it will attempt to extract the information from the file name (expecting "Artist - Album").
// Only one matching query is sent per group (release), and the user can cancel the process.
// A detailed log of the scanning and matching process is generated and downloaded.
async function importCollection(files) {
  if (typeof jsmediatags === "undefined") {
    alert("jsmediatags library is required for metadata extraction.");
    return;
  }
  
  // Reset cancellation flag at start
  cancelImport = false;
  
  // Initialize log array to capture the scanning and matching process
  const logMessages = [];
  logMessages.push(`Import started at: ${new Date().toISOString()}`);
  
  // Show the progress modal and record start time
  const startTime = Date.now();
  showProgressModal("Processing files...", 0);
  
  // Group audio files by composite key (artist|album)
  const albumArtistMap = new Map();
  let processedFiles = 0;
  let totalAudioFiles = 0;
  
  // Count only audio files
  for (const file of files) {
    if (file.type.startsWith("audio/")) {
      totalAudioFiles++;
    }
  }
  logMessages.push(`Total audio files detected: ${totalAudioFiles}`);
  
  // Process each file
  for (const file of files) {
    if (cancelImport) {
      logMessages.push("Import cancelled by user during file processing.");
      break;
    }
    if (!file.type.startsWith("audio/")) continue;
    await new Promise((resolve) => {
      jsmediatags.read(file, {
        onSuccess: function(tag) {
          // Read metadata from tags
          let albumRaw = tag.tags.album;
          let artistRaw = tag.tags.artist;
          let album = albumRaw ? albumRaw.toLowerCase().trim() : null;
          let artist = artistRaw ? artistRaw.toLowerCase().trim() : null;
          
          // If either field is missing, try to parse from the file name
          if (!artist || !album) {
            const parsed = parseFileName(file.name);
            if (!artist && parsed.artist) {
              artist = parsed.artist;
              logMessages.push(`Artist parsed from filename for "${file.name}": ${artist}`);
            }
            if (!album && parsed.album) {
              album = parsed.album;
              logMessages.push(`Album parsed from filename for "${file.name}": ${album}`);
            }
          }
          
          logMessages.push(`File "${file.name}" processed. Artist: ${artist || "N/A"}, Album: ${album || "N/A"}`);
          
          if (artist && album) {
            // Create a composite key for grouping
            const key = `${artist}|${album}`;
            if (!albumArtistMap.has(key)) {
              albumArtistMap.set(key, { artist, album, files: [] });
              logMessages.push(`New group created for key: "${key}"`);
            }
            albumArtistMap.get(key).files.push(file);
          } else {
            logMessages.push(`File "${file.name}" skipped due to insufficient metadata (even after filename parsing).`);
          }
          
          processedFiles++;
          updateProgressModal(`Processing files... (${processedFiles}/${totalAudioFiles})`, Math.round((processedFiles / totalAudioFiles) * 100), startTime);
          resolve();
        },
        onError: function(error) {
          logMessages.push(`Error reading file "${file.name}": ${error.type}`);
          processedFiles++;
          updateProgressModal(`Processing files... (${processedFiles}/${totalAudioFiles})`, Math.round((processedFiles / totalAudioFiles) * 100), startTime);
          resolve();
        }
      });
    });
  }
  
  if (cancelImport) {
    hideProgressModal();
    logMessages.push("Import cancelled by user. Matched releases up to this point have been retained.");
    downloadLog(logMessages);
    alert("Import cancelled. Releases matched so far have been added.");
    return;
  }
  
  // Process each album-artist group (one matching query per group)
  let importedCount = 0;
  const groupEntries = Array.from(albumArtistMap.entries());
  logMessages.push(`Total album-artist groups to process: ${groupEntries.length}`);
  
  for (let i = 0; i < groupEntries.length; i++) {
    if (cancelImport) {
      logMessages.push("Import cancelled by user during matching process.");
      break;
    }
    const [key, group] = groupEntries[i];
    const { artist, album } = group;
    logMessages.push(`Matching group "${key}" (${i + 1}/${groupEntries.length}), containing ${group.files.length} file(s).`);
    updateProgressModal(`Matching group "${key}" (${i + 1}/${groupEntries.length})`, Math.round(((i + 1) / groupEntries.length) * 100), startTime);
    
    // Query for a release that matches the expected format: "Artist - release title"
    // and that contains the album name within the release title.
    const { data, error } = await supabaseClient
      .from("releases")
      .select("*")
      .ilike("title", `%${artist}% - %${album}%`)
      .limit(1);
      
    if (error) {
      logMessages.push(`Error querying group "${key}": ${error.message}`);
      continue;
    }
    
    if (data && data.length > 0) {
      const release = data[0];
      // Extract expected artist and album parts from the release title
      const titleParts = release.title.split(" - ");
      const releaseArtist = titleParts.length > 0 ? titleParts[0].toLowerCase().trim() : "";
      const releaseAlbum = titleParts.length > 1 ? titleParts.slice(1).join(" - ").toLowerCase().trim() : "";
      
      // Check if both artist and album match (exact match required)
      if (releaseArtist === artist && releaseAlbum === album) {
        logMessages.push(`Exact match found for group "${key}": Release ID ${release.id} ("${release.title}")`);
      } else {
        logMessages.push(`Partial match for group "${key}" found: Release ID ${release.id} ("${release.title}"). ` +
                         `Extracted artist: "${releaseArtist}", album: "${releaseAlbum}" vs. expected artist: "${artist}", album: "${album}"`);
      }
      
      if (!isBookmarked(release.id)) {
        release.bookmarkedAt = new Date().toISOString();
        const bookmarks = getBookmarkedReleases();
        bookmarks.push(release);
        saveBookmarkedReleases(bookmarks);
        importedCount++;
        logMessages.push(`Release ID ${release.id} added to bookmarks.`);
      } else {
        logMessages.push(`Release ID ${release.id} already bookmarked.`);
      }
    } else {
      logMessages.push(`No matching release found for group "${key}" (Artist: "${artist}", Album: "${album}").`);
    }
  }
  
  hideProgressModal();
  logMessages.push(`Import completed at: ${new Date().toISOString()}`);
  logMessages.push(`Total releases imported: ${importedCount}`);
  
  // Trigger download of the log file
  downloadLog(logMessages);
  
  alert(`Import Collection Completed. Imported ${importedCount} album release(s) into bookmarks.`);
}


/* -----------------------
   Utility: Download Log File
------------------------- */
function downloadLog(logMessages) {
  const logContent = logMessages.join("\n");
  const blob = new Blob([logContent], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `import_log_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* -----------------------
   Tab Toggle and Filter Button Update
------------------------- */
function updateFilterButtons() {
  if (activeTab === "bookmark") {
    document.getElementById("filter-wrapper").style.display = "block";
    document.getElementById("bookmark-actions").style.display = "block";
    document.getElementById("pagination").style.display = "block";
  } else {
    document.getElementById("filter-wrapper").style.display = "block";
    document.getElementById("bookmark-actions").style.display = "none";
  }
  
  if (activeTab === "search") {
    document.querySelector(".filter-btn").style.display = "inline-block";
    document.querySelector(".shuffle-btn").style.display = "none";
    document.getElementById("personalized-toggle-container").style.display = "none";
    document.getElementById("pagination").style.display = "block";
  } else if (activeTab === "shuffle") {
    document.querySelector(".filter-btn").style.display = "none";
    document.querySelector(".shuffle-btn").style.display = "inline-block";
    document.getElementById("personalized-toggle-container").style.display = "flex";
    document.getElementById("pagination").style.display = "none";
  } else if (activeTab === "bookmark") {
    document.querySelector(".filter-btn").style.display = "inline-block";
    document.querySelector(".shuffle-btn").style.display = "none";
    document.getElementById("personalized-toggle-container").style.display = "none";
    document.getElementById("pagination").style.display = "block";
  }
}

/* -----------------------
   YouTube Integration
------------------------- */
function initializeYouTubePlayers() {
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

// ------------------ Export / Import User Data ------------------
function exportUserData() {
  const userData = {
    bookmarkedReleases: JSON.parse(localStorage.getItem("bookmarkedReleases") || "[]"),
    interactedReleases: JSON.parse(localStorage.getItem("interactedReleases") || "[]"),
    tableColumnWidths: JSON.parse(localStorage.getItem("tableColumnWidths") || "{}"),
    darkModeEnabled: localStorage.getItem("darkModeEnabled") || "true",
    sortConfig: JSON.parse(localStorage.getItem("sortConfig") || '{"key":"title","order":"asc"}')
  };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userData, null, 2));
  const dlAnchorElem = document.createElement("a");
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", "userData.json");
  dlAnchorElem.click();
}

function importUserData(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && typeof imported === 'object') {
        if(imported.bookmarkedReleases) localStorage.setItem("bookmarkedReleases", JSON.stringify(imported.bookmarkedReleases));
        if(imported.interactedReleases) localStorage.setItem("interactedReleases", JSON.stringify(imported.interactedReleases));
        if(imported.tableColumnWidths) localStorage.setItem("tableColumnWidths", JSON.stringify(imported.tableColumnWidths));
        if(imported.darkModeEnabled) localStorage.setItem("darkModeEnabled", imported.darkModeEnabled);
        if(imported.sortConfig) localStorage.setItem("sortConfig", JSON.stringify(imported.sortConfig));
        if (activeTab === "bookmark") {
          loadBookmarks(currentPage);
        }
        applySavedColumnWidths();
        updateSortIndicators();
      } else {
        alert("Invalid file format.");
      }
    } catch (err) {
      alert("Error reading file.");
    }
  };
  reader.readAsText(file);
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
  const priceRange = document.getElementById("price_range").value.trim();
  gtag("event", "filter_applied", {
    genre: genre || "All",
    style: style || "All",
    year_range: yearRange || "All",
    rating_range: ratingRange || "All",
    rating_count_range: ratingCountRange || "All",
    price_range: priceRange || "All",
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