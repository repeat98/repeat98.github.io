import React from "react";
import "./Footer.css";

const Footer = () => {
  return (
    <footer className="footer text-center py-3">
      <small>
        <a href="discogs.html" style={{ color: "inherit", textDecoration: "none" }}>
          &copy; 2025 - Jannik Aßfalg
        </a>
        <br />
        <a href="imprint.html" style={{ color: "inherit", textDecoration: "none", opacity: 0.7 }}>
          Impressum
        </a>
        {" | "}
        <a href="privacy.html" style={{ color: "inherit", textDecoration: "none", opacity: 0.7 }}>
          Datenschutzerklärung
        </a>
      </small>
    </footer>
  );
};

export default Footer;