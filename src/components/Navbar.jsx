import React from "react";
import "./Navbar.css";

const Navbar = () => {
  return (
    <nav className="navbar navbar-expand-lg navbar-dark">
      <div className="container MainContainer">
        <div className="d-flex justify-content-between align-items-center w-100">
          <a className="navbar-brand d-flex align-items-center" href="#">
            <img
              src="img/gruuvs-logo.svg"
              alt="Gruuvs Logo"
              className="me-2"
              style={{ height: "24px", width: "auto" }}
            />
            GRUUVS
            <span
              className="powered-by d-none d-md-inline fst-italic fw-light ms-1"
              style={{ opacity: 0.8, fontSize: "12px" }}
            >
              powered by Discogs
            </span>
          </a>
          <div className="right-toggle-group d-flex align-items-center">
            <div className="tab-toggle d-flex align-items-center">
              <span id="tab-search" className="tab-icon active">
                <input type="text" id="searchInput" placeholder="Search..." />
                <i className="bi bi-search"></i>
              </span>
              <span id="tab-shuffle" className="tab-icon">
                <i className="bi bi-shuffle"></i>
              </span>
              <span id="tab-bookmark" className="tab-icon">
                <i className="bi bi-bookmark"></i>
              </span>
            </div>
            <div className="dark-mode-toggle">
              <span id="darkModeToggle">
                <span className="moon-icon">
                  <i className="bi bi-moon"></i>
                </span>
                <span className="sun-icon">
                  <i className="bi bi-sun"></i>
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;