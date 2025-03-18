import React from "react";
import "./Pagination.css";

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const pages = [];
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);
  for (let p = startPage; p <= endPage; p++) {
    pages.push(p);
  }

  const handlePrev = (e) => {
    e.preventDefault();
    if (currentPage > 1) onPageChange(currentPage - 1);
  };

  const handleNext = (e) => {
    e.preventDefault();
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  };

  return (
    <div className="pagination-container">
      <ul className="pagination">
        <li className={`page-item ${currentPage === 1 ? "disabled" : ""}`}>
          <a
            className="page-link"
            href="#"
            onClick={handlePrev}
            tabIndex={currentPage === 1 ? "-1" : "0"}
            aria-disabled={currentPage === 1}
          >
            <i className="bi bi-chevron-left"></i> Prev
          </a>
        </li>
        {pages.map((p) => (
          <li key={p} className={`page-item ${p === currentPage ? "active" : ""}`} aria-current={p === currentPage ? "page" : undefined}>
            <a
              className="page-link"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onPageChange(p);
              }}
            >
              {p}
            </a>
          </li>
        ))}
        <li className={`page-item ${currentPage === totalPages ? "disabled" : ""}`}>
          <a className="page-link" href="#" onClick={handleNext}>
            Next <i className="bi bi-chevron-right"></i>
          </a>
        </li>
      </ul>
    </div>
  );
};

export default Pagination;