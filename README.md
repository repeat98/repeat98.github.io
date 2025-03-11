# Gruuvs - A Discogs Interface

## About the Project
Gruuvs is an independent project built for vinyl enthusiasts who love discovering and browsing records in a more streamlined way. This project provides an alternative interface to Discogs, allowing users to search, shuffle, and bookmark records with an enhanced UI.

This tool is **not a replacement** for Discogs but serves as a complementary platform to explore records more efficiently.

- The service is **completely free** and does not duplicate Discogs' full functionality.
- It focuses on offering **a simple, efficient browsing experience**.
- Not all tracks or videos are linked to maintain a **minimalistic approach**.
- The project is made purely out of **passion for music and vinyl collecting**.

If Discogs or its representatives request removal of this tool, please contact:
📩 **[jannik.assfalg@gmail.com](mailto:jannik.assfalg@gmail.com)**

---

## Features
### 🌎 Search
- Search records by **title, genre, style, year, rating, price**, and more.
- Auto-updating **pagination** for large collections.
- Sorting by **popularity, rating, rarity, price**, etc.

### 🔀 Shuffle
- Randomly discover records **based on filters**.
- "Personalized" mode recommends records based on **past interactions and bookmarks**.

### 🔖 Bookmarks
- Save records for **future reference**.
- Export and import bookmarks to keep track of **your collection**.
- **Import your Discogs collection** using a CSV file.

### 📺 Preview & Data
- Embedded **YouTube previews** (if available).
- Data sourced directly from **Supabase** and **Discogs API**.

---

## Database Schema
The application uses the following database schema to store records data:

```sql
CREATE TABLE releases(
  id INT,
  title TEXT,
  year TEXT,
  genre TEXT,
  style TEXT,
  label TEXT,
  country TEXT,
  average_rating REAL,
  rating_count INT,
  have INT,
  want INT,
  rating_coeff REAL,
  link TEXT,
  youtube_links TEXT,
  demand_coeff REAL,
  gem_value REAL,
  lowest_price REAL,
  format TEXT
);
```

---

## Setup & Usage
### 🚀 Getting Started
1. Clone the repository:
   ```sh
   git clone https://github.com/repeat98/gruuvs.git
   cd gruuvs
   ```
2. Open `index.html` in your browser.

### 📁 Project Structure
```
.
├── index.html        # Main page
├── discogs.html      # About page
├── script.js         # Core functionality
├── style.css         # Styling
├── img/              # Icons & assets
│   ├── favicons, logo, screen.jpg, etc.
└── README.md         # This file
```

### 📡 Technologies Used
- **HTML, CSS, JS**
- **Bootstrap** (UI components)
- **Supabase** (Database & API integration)
- **PapaParse** (CSV parsing)
- **Google Analytics** (User tracking)
- **YouTube iFrame API** (Embedded previews)

---

## Discogs.html
The `discogs.html` page contains an **about section** explaining the project's intent and its non-competitive relationship with Discogs. It emphasizes the **respect for Discogs' work** and offers contact information in case of concerns.

The page also provides a **disclaimer** clarifying that Gruuvs exists solely to enhance user experience and is not affiliated with Discogs.

---

## License
This project is released under the **MIT License**. You are free to use, modify, and distribute it with proper attribution.

---

## Contact
Made by **Jannik Aßfalg**  
📩 **[jannik.assfalg@gmail.com](mailto:jannik.assfalg@gmail.com)**

