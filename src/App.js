import React, { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import FilterForm from "./components/FilterForm";
import BookmarkActions from "./components/BookmarkActions";
import DataTable from "./components/DataTable";
import Pagination from "./components/Pagination";
import Footer from "./components/Footer";
import CookiePopup from "./components/CookiePopup";
import "./App.css";
import "./variables.css";

/* other global styles... */

function App() {
  const [releases, setReleases] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [currentPage, setCurrentPage] = useState(1);
  // Dummy total pages – replace with your actual logic
  const totalPages = 5;

  useEffect(() => {
    // TODO: Replace with data fetching logic (e.g., from Supabase)
    setReleases([]);
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Dummy helper functions for demonstration purposes.
  const onBookmarkToggle = (release) => console.log("Toggle bookmark:", release);
  const onLinkClick = (release) => console.log("Link clicked:", release);
  const onCopyClick = (release) => console.log("Copy title:", release);
  const extractYouTubeID = (url) => {
    const regex = /(?:youtube\.com\/.*v=|youtu\.be\/)([^"&?/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };
  const generateStars = (avg) => {
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
  };

  return (
    <div className="App">
      <Navbar />
      <FilterForm />
      <BookmarkActions />
      <DataTable
        releases={releases}
        isMobile={isMobile}
        onBookmarkToggle={onBookmarkToggle}
        onLinkClick={onLinkClick}
        onCopyClick={onCopyClick}
        extractYouTubeID={extractYouTubeID}
        generateStars={generateStars}
      />
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      <Footer />
      <CookiePopup />
    </div>
  );
}

export default App;