import React from "react";
import "./FilterForm.css";

const FilterForm = () => {
  return (
    <div className="filter-form-wrapper" id="filter-wrapper">
      <div className="container MainContainer">
        <form id="filter-form" className="FilterContainer">
          {/* Genre */}
          <div className="filter-group">
            <label htmlFor="genre" className="filter-label">Genre</label>
            <select id="genre" name="genre" className="filter-select" aria-label="Filter by Genre">
              <option value="">All Genres</option>
            </select>
          </div>
          {/* Style */}
          <div className="filter-group">
            <label htmlFor="style" className="filter-label">Style</label>
            <select id="style" name="style" className="filter-select" aria-label="Filter by Style">
              <option value="">All Styles</option>
            </select>
          </div>
          {/* Mobile extra filters toggle */}
          <button type="button" id="mobile-filters-toggle" className="btn btn-secondary mobile-toggle-btn">
            <i className="bi bi-chevron-down"></i>
          </button>
          {/* Extra filters */}
          <div className="mobile-extra-filters-wrapper">
            <div className="filter-group">
              <label htmlFor="year_range" className="filter-label">Year range</label>
              <input
                type="text"
                id="year_range"
                name="year_range"
                className="filter-input"
                placeholder="e.g. 2010-2015"
              />
            </div>
            <div className="filter-group">
              <label htmlFor="rating_range" className="filter-label">Rating range</label>
              <input
                type="text"
                id="rating_range"
                name="rating_range"
                className="filter-input"
                placeholder="e.g. 3-5"
              />
            </div>
            <div className="filter-group">
              <label htmlFor="rating_count_range" className="filter-label">Rating Count range</label>
              <input
                type="text"
                id="rating_count_range"
                name="rating_count_range"
                className="filter-input"
                placeholder="e.g. 10-100"
              />
            </div>
            <div className="filter-group">
              <label htmlFor="price_range" className="filter-label">Price range</label>
              <input
                type="text"
                id="price_range"
                name="price_range"
                className="filter-input"
                placeholder="e.g. 10-25"
              />
            </div>
          </div>
          {/* Personalized recommendations toggle */}
          <div className="filter-group toggle-group" id="personalized-toggle-container" style={{ display: "none" }}>
            <div className="toggle-wrapper">
              <label className="toggle-switch">
                <input type="checkbox" id="togglePersonalized" title="Toggle Personalized Recommendations" />
                <span className="slider round"></span>
              </label>
              <label htmlFor="togglePersonalized" className="toggle-label">
                <i className="bi bi-stars"></i> Personalized
              </label>
            </div>
          </div>
          {/* Filter and Shuffle buttons */}
          <div className="filter-button-group d-flex align-items-center gap-2">
            <button type="submit" className="btn btn-primary filter-btn">
              <i className="bi bi-funnel-fill"></i> Filter
            </button>
            <button
              type="button"
              className="btn btn-secondary shuffle-btn"
              id="shuffle-btn"
              style={{ display: "none" }}
            >
              <i className="bi bi-shuffle"></i> Shuffle
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FilterForm;