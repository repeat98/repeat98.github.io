import React from "react";
import "./DataTable.css";

const DataTable = ({
  releases,
  isMobile,
  onBookmarkToggle,
  onLinkClick,
  onCopyClick,
  extractYouTubeID,
  generateStars,
}) => {
  return (
    <div className="table-container">
      <table className="table table-hover table-bordered mb-0">
        <thead>
          <tr>
            <th scope="col" data-column="Title" data-sort="title" style={{ minWidth: "160px" }}>
              Title
              <div className="resizer"></div>
            </th>
            <th scope="col" data-column="Label" data-sort="label" style={{ minWidth: "120px" }}>
              Label
              <div className="resizer"></div>
            </th>
            <th
              scope="col"
              data-column="Year"
              data-sort="year"
              style={{ width: "70px" }}
              className="text-center"
            >
              Year
              <div className="resizer"></div>
            </th>
            <th scope="col" data-column="Genre / Style" data-sort="NO_SORT" style={{ minWidth: "150px" }}>
              Genre / Style
              <div className="resizer"></div>
            </th>
            <th
              scope="col"
              className="text-center"
              data-sort="USER_RATING"
              data-column="User Rating"
              title="Click to sort rating_coeff ascending/descending."
              data-bs-toggle="tooltip"
              data-bs-placement="top"
              data-bs-delay='{"show":1000, "hide":100}'
              style={{ width: "140px" }}
            >
              User Rating
              <div className="resizer"></div>
            </th>
            <th
              scope="col"
              className="text-center"
              data-sort="demand_coeff"
              data-column="Rarity"
              title="Click to sort by Rarity (want/have ratio)."
              data-bs-toggle="tooltip"
              data-bs-placement="top"
              data-bs-delay='{"show":1000, "hide":100}'
              style={{ width: "90px" }}
            >
              Rarity
              <div className="resizer"></div>
            </th>
            <th
              scope="col"
              className="text-center"
              data-sort="gem_value"
              data-column="Gem ⟡"
              title="Click to sort by Gem (combines rating & rarity)."
              data-bs-toggle="tooltip"
              data-bs-placement="top"
              data-bs-delay='{"show":1000, "hide":100}'
              style={{ width: "90px" }}
            >
              Gem⟡
              <div className="resizer"></div>
            </th>
            <th scope="col" className="text-center" data-sort="have" data-column="Have" style={{ width: "70px" }}>
              Have
              <div className="resizer"></div>
            </th>
            <th scope="col" className="text-center" data-sort="want" data-column="Want" style={{ width: "70px" }}>
              Want
              <div className="resizer"></div>
            </th>
            <th
              scope="col"
              className="text-center"
              data-sort="lowest_price"
              data-column="Price"
              style={{ width: "80px" }}
            >
              Price
              <div className="resizer"></div>
            </th>
            <th style={{ width: "40px" }}></th>
            <th
              scope="col"
              className="text-center"
              data-column="Preview"
              style={{ width: "220px" }}
            >
              Preview
              <div className="resizer"></div>
            </th>
          </tr>
        </thead>
        <tbody>
          {releases.length === 0 ? (
            <tr>
              <td className="no-results" colSpan="12">
                <i className="bi bi-exclamation-triangle-fill"></i>
                <p>No results found.</p>
              </td>
            </tr>
          ) : (
            releases.map((release) =>
              isMobile ? (
                <tr key={release.id} data-id={release.id}>
                  <td className="mobile-cell" style={{ position: "relative" }}>
                    <div
                      className="mobile-preview"
                      dangerouslySetInnerHTML={{
                        __html: release.youtube_links
                          ? (() => {
                              const links = release.youtube_links
                                .split(",")
                                .map((l) => l.trim())
                                .filter((l) => l);
                              if (links.length > 0) {
                                const yID = extractYouTubeID(links[0]);
                                return yID
                                  ? `<iframe id="youtube-player-${release.id}" class="table-iframe" loading="lazy" title="YouTube video player" aria-label="YouTube video player" src="https://www.youtube.com/embed/${yID}?enablejsapi=1&rel=0&modestbranding=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
                                  : `<div class="mobile-preview text-muted">Invalid YouTube link</div>`;
                              }
                              return `<div class="mobile-preview text-muted">No YouTube links</div>`;
                            })()
                          : `<div class="mobile-preview text-muted">No YouTube links</div>`,
                      }}
                    />
                    <div className="mobile-title">
                      <a
                        href={release.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-decoration-none text-primary fw-semibold"
                        onClick={() => onLinkClick(release)}
                      >
                        {release.title}
                      </a>
                      <button
                        className="copy-btn"
                        data-title={release.title}
                        title="Copy Title"
                        onClick={() => onCopyClick(release)}
                      >
                        <i className="bi bi-clipboard"></i>
                      </button>
                    </div>
                    <div className="mobile-rating">
                      {release.average_rating !== undefined &&
                      release.rating_count !== undefined ? (
                        <span
                          dangerouslySetInnerHTML={{
                            __html: `${generateStars(release.average_rating)} ${parseFloat(
                              release.average_rating
                            ).toFixed(1)} (${release.rating_count})`,
                          }}
                        />
                      ) : (
                        <div className="text-muted">No rating</div>
                      )}
                    </div>
                    <div
                      className="mobile-bookmark"
                      style={{ position: "absolute", bottom: "8px", right: "8px" }}
                    >
                      <i
                        style={{ fontSize: "1rem" }}
                        className={`bi bookmark-star ${
                          release.bookmarked ? "bi-bookmark-fill bookmarked" : "bi-bookmark"
                        }`}
                        title="Toggle Bookmark"
                        onClick={() => onBookmarkToggle(release)}
                      ></i>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={release.id} data-id={release.id}>
                  <td>
                    <div className="d-flex align-items-center">
                      <a
                        href={release.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-decoration-none text-primary fw-semibold"
                        onClick={() => onLinkClick(release)}
                      >
                        {release.title}
                      </a>
                      <button
                        className="copy-btn"
                        data-title={release.title}
                        title="Copy Title"
                        onClick={() => onCopyClick(release)}
                      >
                        <i className="bi bi-clipboard"></i>
                      </button>
                    </div>
                  </td>
                  <td>{release.label || "Unknown"}</td>
                  <td className="text-center">{release.year || "N/A"}</td>
                  <td>
                    {release.genre &&
                      release.genre.split(",").map((g, index) => (
                        <span key={index} className="badge-genre">
                          {g.trim()}
                        </span>
                      ))}
                    {release.style &&
                      release.style.split(",").map((s, index) => (
                        <span key={index} className="badge-style">
                          {s.trim()}
                        </span>
                      ))}
                  </td>
                  <td className="text-center">
                    {release.average_rating !== undefined &&
                    release.rating_count !== undefined ? (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: `${generateStars(release.average_rating)} ${parseFloat(
                            release.average_rating
                          ).toFixed(1)} (${release.rating_count})`,
                        }}
                      />
                    ) : (
                      <div className="text-muted">No rating</div>
                    )}
                  </td>
                  <td className="text-center">
                    {release.demand_coeff ? parseFloat(release.demand_coeff).toFixed(2) : "0.00"}
                  </td>
                  <td className="text-center">
                    {release.gem_value ? parseFloat(release.gem_value).toFixed(2) : "0.00"}
                  </td>
                  <td className="text-center">{release.have || 0}</td>
                  <td className="text-center">{release.want || 0}</td>
                  <td className="text-center">
                    {release.lowest_price !== undefined
                      ? `${parseFloat(release.lowest_price).toFixed(2)}$`
                      : "N/A"}
                  </td>
                  <td className="text-center">
                    <i
                      style={{ fontSize: "1rem" }}
                      className={`bi bookmark-star ${
                        release.bookmarked ? "bi-bookmark-fill bookmarked" : "bi-bookmark"
                      }`}
                      title="Toggle Bookmark"
                      onClick={() => onBookmarkToggle(release)}
                    ></i>
                  </td>
                  <td className="text-center">
                    {release.youtube_links ? (
                      (() => {
                        const links = release.youtube_links
                          .split(",")
                          .map((l) => l.trim())
                          .filter((l) => l);
                        if (links.length > 0) {
                          const yID = extractYouTubeID(links[0]);
                          return yID ? (
                            <div style={{ position: "relative", display: "inline-block" }}>
                              <iframe
                                id={`youtube-player-${release.id}`}
                                className="table-iframe"
                                loading="lazy"
                                title="YouTube video player"
                                aria-label="YouTube video player"
                                src={`https://www.youtube.com/embed/${yID}?enablejsapi=1&rel=0&modestbranding=1`}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                style={{ width: "220px", height: "124px" }}
                              ></iframe>
                            </div>
                          ) : (
                            <div className="text-muted">Invalid YouTube link</div>
                          );
                        }
                        return <div className="text-muted">No YouTube links</div>;
                      })()
                    ) : (
                      <div className="text-muted">No YouTube links</div>
                    )}
                  </td>
                </tr>
              )
            )
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;