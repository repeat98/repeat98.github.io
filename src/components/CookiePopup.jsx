import React, { useEffect, useState } from "react";
import "./CookiePopup.css";

const CookiePopup = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookieConsent");
    if (!consent) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("cookieConsent", "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div id="cookie-popup" className="cookie-popup">
      <p>
        We use cookies to improve your experience on our site. By using our site, you agree to our{" "}
        <a href="privacy.html">Privacy Policy</a>.
      </p>
      <button id="cookie-accept-btn" className="cookie-accept-btn" onClick={handleAccept}>
        Accept
      </button>
    </div>
  );
};

export default CookiePopup;