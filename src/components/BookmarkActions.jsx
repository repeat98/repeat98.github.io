import React from "react";
import "./BookmarkActions.css";

const BookmarkActions = () => {
  return (
    <div className="bookmark-actions" id="bookmark-actions">
      <div className="d-flex justify-content-end gap-2 mb-2">
        <button id="export-btn" className="btn btn-primary">
          <i className="bi bi-download"></i> Export User Data
        </button>
        <button id="import-btn" className="btn btn-secondary">
          <i className="bi bi-upload"></i> Import User Data
        </button>
        <button id="merge-btn" className="btn btn-secondary">
          <i className="bi bi-files"></i> Merge User Data
        </button>
        <button id="import-discogs-btn" className="btn btn-secondary">
          <i className="bi bi-upload"></i> Import Discogs Collection
        </button>
        <button id="import-collection-btn" className="btn btn-secondary">
          <i className="bi bi-folder-plus"></i> Import Collection
        </button>
        {/* Hidden file inputs for importing, merging, and folder selection */}
        <input type="file" id="import-file" accept=".json" style={{ display: "none" }} />
        <input type="file" id="merge-file" accept=".json" style={{ display: "none" }} />
        <input type="file" id="import-discogs-file" accept=".csv" style={{ display: "none" }} />
        <input type="file" id="import-collection-folder" style={{ display: "none" }} webkitdirectory="true" directory="true" multiple />
      </div>
    </div>
  );
};

export default BookmarkActions;