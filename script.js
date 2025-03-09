// ------------------ Supabase Integration ------------------
const supabaseUrl = "https://oghdrmtorpeqaewttckr.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9naGRybXRvcnBlcWFld3R0Y2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExNjc4OTksImV4cCI6MjA1Njc0Mzg5OX0.HW5aD19Hy__kpOLp5JHi8HXLzl7D6_Tu4UNyB3mNAHs";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Global pagination and sorting config
let filteredData = [];
let totalRecords = 0;
let currentPage = 1;
const pageSize = 10;
let totalPages = 1;

// Global active tab state: "search" or "shuffle"
let activeTab = "search";

// Default: Sort by rating_coeff descending
let sortConfig = {
  key: "rating_coeff",
  order: "desc"
};

let youtubeApiReady = false;

// ------------------ Helper Functions ------------------
function parseYearRange() {
  const yr = document.getElementById("year_range").value.trim();
  if (!yr) return { min: -Infinity, max: Infinity };
  const match = yr.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (match) {
    return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
  } else {
    const single = parseInt(yr, 10);
    return Number.isInteger(single) ? { min: single, max: single } : { min: -Infinity, max: Infinity };
  }
}

function parseRangeInput(rangeStr) {
  if (!rangeStr) return { min: -Infinity, max: Infinity };
  const match = rangeStr.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (match) {
    return { min: parseFloat(match[1]), max: parseFloat(match[2]) };
  } else {
    const single = parseFloat(rangeStr);
    return !isNaN(single) ? { min: single, max: single } : { min: -Infinity, max: Infinity };
  }
}

// ------------------ Build & Run Query for Search ------------------
async function fetchReleases({ page = 1 } = {}) {
  const selectedGenre = document.getElementById("genre").value;
  const selectedStyle = document.getElementById("style").value;
  const { min: yearMin, max: yearMax } = parseYearRange();
  const ratingRange = parseRangeInput(document.getElementById("rating_range").value.trim());
  const ratingCountRange = parseRangeInput(document.getElementById("rating_count_range").value.trim());
  const priceRange = parseRangeInput(document.getElementById("price_range").value.trim());
  
  let query = supabaseClient
    .from('releases')
    .select('*', { count: 'exact' });
  
  // Apply search query filtering if provided
  const searchQuery = document.getElementById("searchInput").value.trim();
  if(searchQuery) {
    query = query.ilike('title', `%${searchQuery}%`);
  }
  
  if (selectedGenre) {
    query = query.ilike('genre', `%${selectedGenre}%`);
  }
  if (selectedStyle) {
    query = query.ilike('style', `%${selectedStyle}%`);
  }
  if (yearMin !== -Infinity) query = query.gte('year', yearMin);
  if (yearMax !== Infinity)  query = query.lte('year', yearMax);
  if (ratingRange.min !== -Infinity) query = query.gte('average_rating', ratingRange.min);
  if (ratingRange.max !== Infinity)  query = query.lte('average_rating', ratingRange.max);
  if (ratingCountRange.min !== -Infinity) query = query.gte('rating_count', ratingCountRange.min);
  if (ratingCountRange.max !== Infinity)  query = query.lte('rating_count', ratingCountRange.max);
  if (priceRange.min !== -Infinity) query = query.gte('lowest_price', priceRange.min);
  if (priceRange.max !== Infinity)  query = query.lte('lowest_price', priceRange.max);
  
  // Apply sorting
  if (sortConfig.key) {
    query = query.order(sortConfig.key, { ascending: sortConfig.order === 'asc' });
  }
  
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  query = query.range(start, end);
  
  const { data, count, error } = await query;
  if (error) {
    console.error("Error fetching releases data:", error);
    return { data: [], count: 0 };
  }
  return { data, count };
}

async function loadData(page = 1) {
  const { data, count } = await fetchReleases({ page });
  filteredData = data;
  totalRecords = count || 0;
  totalPages = Math.ceil(totalRecords / pageSize) || 1;
  currentPage = page;
  renderTable();
  renderPagination();
  document.getElementById("pagination").style.display = "block";
}

// ------------------ Build & Run Query for Shuffle ------------------
async function fetchShuffleReleases() {
  const selectedGenre = document.getElementById("genre").value;
  const selectedStyle = document.getElementById("style").value;
  const { min: yearMin, max: yearMax } = parseYearRange();
  const ratingRange = parseRangeInput(document.getElementById("rating_range").value.trim());
  const ratingCountRange = parseRangeInput(document.getElementById("rating_count_range").value.trim());
  const priceRange = parseRangeInput(document.getElementById("price_range").value.trim());
  
  let query = supabaseClient
    .from('releases')
    .select('*', { count: 'exact' });
  
  // Apply search query filtering if provided
  const searchQuery = document.getElementById("searchInput").value.trim();
  if(searchQuery) {
    query = query.ilike('title', `%${searchQuery}%`);
  }
  
  if (selectedGenre) {
    query = query.ilike('genre', `%${selectedGenre}%`);
  }
  if (selectedStyle) {
    query = query.ilike('style', `%${selectedStyle}%`);
  }
  if (yearMin !== -Infinity) query = query.gte('year', yearMin);
  if (yearMax !== Infinity)  query = query.lte('year', yearMax);
  if (ratingRange.min !== -Infinity) query = query.gte('average_rating', ratingRange.min);
  if (ratingRange.max !== Infinity)  query = query.lte('average_rating', ratingRange.max);
  if (ratingCountRange.min !== -Infinity) query = query.gte('rating_count', ratingCountRange.min);
  if (ratingCountRange.max !== Infinity)  query = query.lte('rating_count', ratingCountRange.max);
  if (priceRange.min !== -Infinity) query = query.gte('lowest_price', priceRange.min);
  if (priceRange.max !== Infinity)  query = query.lte('lowest_price', priceRange.max);
  
  const { data: allData, count, error } = await query;
  if (error) {
    console.error("Error fetching shuffle data:", error);
    return { data: [], count: 0 };
  }
  const shuffleSize = 5;
  if (count > shuffleSize) {
    const randomOffset = Math.floor(Math.random() * (count - shuffleSize + 1));
    let rangeQuery = supabaseClient
      .from('releases')
      .select('*')
      .range(randomOffset, randomOffset + shuffleSize - 1);
      
    if(searchQuery) {
      rangeQuery = rangeQuery.ilike('title', `%${searchQuery}%`);
    }
      
    if (selectedGenre) {
      rangeQuery = rangeQuery.ilike('genre', `%${selectedGenre}%`);
    }
    if (selectedStyle) {
      rangeQuery = rangeQuery.ilike('style', `%${selectedStyle}%`);
    }
    if (yearMin !== -Infinity) rangeQuery = rangeQuery.gte('year', yearMin);
    if (yearMax !== Infinity)  rangeQuery = rangeQuery.lte('year', yearMax);
    if (ratingRange.min !== -Infinity) rangeQuery = rangeQuery.gte('average_rating', ratingRange.min);
    if (ratingRange.max !== Infinity)  rangeQuery = rangeQuery.lte('average_rating', ratingRange.max);
    if (ratingCountRange.min !== -Infinity) rangeQuery = rangeQuery.gte('rating_count', ratingCountRange.min);
    if (ratingCountRange.max !== Infinity)  rangeQuery = rangeQuery.lte('rating_count', ratingCountRange.max);
    if (priceRange.min !== -Infinity) rangeQuery = rangeQuery.gte('lowest_price', priceRange.min);
    if (priceRange.max !== Infinity)  rangeQuery = rangeQuery.lte('lowest_price', priceRange.max);
    
    const { data, error: err } = await rangeQuery;
    if (err) {
      console.error("Error fetching shuffle data with range:", err);
      return { data: [], count: 0 };
    }
    return { data, count: shuffleSize };
  } else {
    return { data: allData, count };
  }
}

async function loadShuffleData() {
  const { data, count } = await fetchShuffleReleases();
  filteredData = data;
  totalRecords = count;
  currentPage = 1;
  renderTable();
  document.getElementById("pagination").style.display = "none";
}

// ------------------ Initialize Filters Dropdowns ------------------
async function initializeFilters() {
  const { data, error } = await supabaseClient
    .from('releases')
    .select('genre, style')
    .limit(2000);
  if (error) {
    console.error("Error loading genres/styles:", error);
    return;
  }
  const genresSet = new Set();
  const stylesSet = new Set();
  data.forEach(row => {
    if (row.genre) {
      row.genre.split(",").forEach(g => {
        if (g.trim()) genresSet.add(g.trim());
      });
    }
    if (row.style) {
      row.style.split(",").forEach(s => {
        if (s.trim()) stylesSet.add(s.trim());
      });
    }
  });
  const genresArray = Array.from(genresSet).sort();
  const stylesArray = Array.from(stylesSet).sort();

  const genreSelect = document.getElementById("genre");
  genreSelect.innerHTML = '<option value="">All Genres</option>';
  genresArray.forEach(genre => {
    const option = document.createElement("option");
    option.value = genre;
    option.textContent = genre;
    genreSelect.appendChild(option);
  });

  const styleSelect = document.getElementById("style");
  styleSelect.innerHTML = '<option value="">All Styles</option>';
  stylesArray.forEach(style => {
    const option = document.createElement("option");
    option.value = style;
    option.textContent = style;
    styleSelect.appendChild(option);
  });
}

// ------------------ Render Table ------------------
function renderTable() {
  const tbody = document.getElementById("releases-table-body");
  tbody.innerHTML = "";
  document.getElementById("results-count").textContent = `Showing ${totalRecords} result(s)`;

  if (filteredData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="no-results">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <p>No results found.</p>
        </td>
      </tr>
    `;
    return;
  }

  filteredData.forEach(release => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-id", release.id);

    const interactedReleases = JSON.parse(localStorage.getItem("interactedReleases")) || [];
    if (interactedReleases.includes(release.id)) {
      tr.classList.add("greyed-out");
    }

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
        const tooltip = new bootstrap.Tooltip(copyBtn, { container: 'body', trigger: 'manual' });
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
      release.genre.split(",").forEach(g => {
        const span = document.createElement("span");
        span.className = "badge-genre";
        span.textContent = g.trim();
        tdGenreStyle.appendChild(span);
      });
    }
    if (release.style) {
      release.style.split(",").forEach(s => {
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

    const tdPreview = document.createElement("td");
    tdPreview.className = "text-center";
    if (release.youtube_links) {
      const links = release.youtube_links.split(",").map(l => l.trim()).filter(l => l);
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
  document.querySelectorAll(".copy-btn").forEach(btn => {
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

  // Previous button
  const prevLi = document.createElement("li");
  prevLi.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
  const prevLink = document.createElement("a");
  prevLink.className = "page-link";
  prevLink.href = "#";
  prevLink.innerHTML = `<i class="bi bi-chevron-left"></i> Prev`;
  prevLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentPage > 1) loadData(currentPage - 1);
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
      loadData(p);
    });
    pageLi.appendChild(pageLink);
    pag.appendChild(pageLi);
  }

  // Next button
  const nextLi = document.createElement("li");
  nextLi.className = `page-item ${currentPage === totalPages ? "disabled" : ""}`;
  const nextLink = document.createElement("a");
  nextLink.className = "page-link";
  nextLink.href = "#";
  nextLink.innerHTML = `Next <i class="bi bi-chevron-right"></i>`;
  nextLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentPage < totalPages) loadData(currentPage + 1);
  });
  nextLi.appendChild(nextLink);
  pag.appendChild(nextLi);
}

// ------------------ Make Table Columns Resizable ------------------
function makeTableResizable() {
  document.querySelectorAll("th[data-column]").forEach(th => {
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
  document.querySelectorAll("th[data-column]").forEach(th => {
    widths[th.getAttribute("data-column")] = th.offsetWidth;
  });
  localStorage.setItem("tableColumnWidths", JSON.stringify(widths));
}

function applySavedColumnWidths() {
  const saved = JSON.parse(localStorage.getItem("tableColumnWidths"));
  if (saved) {
    document.querySelectorAll("th[data-column]").forEach(th => {
      const col = th.getAttribute("data-column");
      if (saved[col]) th.style.width = saved[col] + "px";
    });
  }
}

// ------------------ Sorting ------------------
document.querySelectorAll("th[data-sort]").forEach(header => {
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

    loadData(currentPage);
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

// ------------------ YouTube Integration ------------------
function initializeYouTubePlayers() {
  filteredData.forEach((release) => {
    if (release.youtube_links) {
      const yID = extractYouTubeID(release.youtube_links);
      if (yID) {
        const iframe = document.getElementById(`youtube-player-${release.id}`);
        if (iframe && YT && YT.Player) {
          new YT.Player(iframe, {
            events: {
              onStateChange: (event) => {
                if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                  markAsInteracted(release.id);
                  const tr = iframe.closest('tr');
                  if (tr) tr.classList.add("greyed-out");
                }
              }
            }
          });
        }
      }
    }
  });
}

// ------------------ Event Tracking ------------------
function trackFilterApplied() {
  const genre = document.getElementById("genre").value;
  const style = document.getElementById("style").value;
  const yearRange = document.getElementById("year_range").value.trim();
  const ratingRange = document.getElementById("rating_range").value.trim();
  const ratingCountRange = document.getElementById("rating_count_range").value.trim();
  const priceRange = document.getElementById("price_range").value.trim();

  gtag('event', 'filter_applied', {
    'genre': genre || 'All',
    'style': style || 'All',
    'year_range': yearRange || 'All',
    'rating_range': ratingRange || 'All',
    'rating_count_range': ratingCountRange || 'All',
    'price_range': priceRange || 'All'
  });
}

function trackCopyButtonClick(release) {
  gtag('event', 'copy_title', {
    'title': release.title,
    'label': release.label || 'Unknown',
    'release_id': release.id
  });
}

function trackReleaseLinkClick(release) {
  gtag('event', 'release_link_click', {
    'title': release.title,
    'label': release.label || 'Unknown',
    'release_id': release.id,
    'url': release.link
  });
}

// ------------------ Tab Toggle and Filter Button Update ------------------
function updateFilterButtons() {
  if (activeTab === "search") {
    document.querySelector(".filter-btn").style.display = "inline-block";
    document.querySelector(".shuffle-btn").style.display = "none";
  } else {
    document.querySelector(".filter-btn").style.display = "none";
    document.querySelector(".shuffle-btn").style.display = "inline-block";
  }
}

// ------------------ DOMContentLoaded ------------------
document.addEventListener("DOMContentLoaded", async () => {
  await initializeFilters();
  if (activeTab === "search") {
    loadData(1);
  } else {
    loadShuffleData();
  }
  applySavedColumnWidths();
  makeTableResizable();
  updateSortIndicators();
  updateFilterButtons();

  // Submit filter form
  document.getElementById("filter-form").addEventListener("submit", (e) => {
    e.preventDefault();
    trackFilterApplied();
    if (activeTab === "search") {
      loadData(1);
    } else {
      loadShuffleData();
    }
  });

  // Update filters on change
  document.getElementById("genre").addEventListener("change", () => {
    trackFilterApplied();
    if (activeTab === "search") {
      loadData(1);
    } else {
      loadShuffleData();
    }
  });
  document.getElementById("style").addEventListener("change", () => {
    trackFilterApplied();
    if (activeTab === "search") {
      loadData(1);
    } else {
      loadShuffleData();
    }
  });

  // Dark Mode Toggle
  const darkModeToggle = document.getElementById("darkModeToggle");
  if (localStorage.getItem("darkModeEnabled") === "true") {
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

  // Tab Toggle Event Listeners
  document.getElementById("tab-search").addEventListener("click", (e) => {
    e.preventDefault();
    activeTab = "search";
    document.getElementById("tab-search").classList.add("active");
    document.getElementById("tab-shuffle").classList.remove("active");
    updateFilterButtons();
    loadData(1);
    document.getElementById("searchInput").focus();
  });

  document.getElementById("tab-shuffle").addEventListener("click", (e) => {
    e.preventDefault();
    activeTab = "shuffle";
    document.getElementById("tab-shuffle").classList.add("active");
    document.getElementById("tab-search").classList.remove("active");
    updateFilterButtons();
    loadShuffleData();
  });

  document.getElementById("shuffle-btn").addEventListener("click", (e) => {
    e.preventDefault();
    activeTab = "shuffle";
    document.getElementById("tab-shuffle").classList.add("active");
    document.getElementById("tab-search").classList.remove("active");
    trackFilterApplied();
    loadShuffleData();
  });

  // Listen for Enter key on search input
  document.getElementById("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeTab !== "search") {
        activeTab = "search";
        document.getElementById("tab-search").classList.add("active");
        document.getElementById("tab-shuffle").classList.remove("active");
        updateFilterButtons();
      }
      // Trigger a new search
      loadData(1);
    }
  });
});