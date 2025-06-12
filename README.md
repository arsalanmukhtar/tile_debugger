#**Tile Debugger**<br>
Your Interactive PostGIS Vector Tile Explorer
Welcome to the Tile Debugger! This project is an interactive web dashboard built to help you visualize, inspect, and customize vector tiles generated directly from your PostGIS database. Say goodbye to messy, duplicate labels on your maps!

**✨ Features**<br>
* Database Schema & Table Browsing: Easily navigate schemas and tables from your PostgreSQL database.<br>
* On-the-Fly Vector Tile Generation: Visualizes your spatial data using ST_AsMVT from PostGIS.<br>
* Dynamic Layer Styling: Adjust colors, borders, and label properties of your map layers in real-time.<br>
* Intelligent Labeling: Leverages ST_MaximumInscribedCircle in PostGIS for optimal polygon label placement.<br>
* Tile URL Inspection: View the exact tile URLs being requested from the backend.<br>
* Basemap Switching: Seamlessly change between different Mapbox basemaps.<br>

**🛠️ Technologies Used**<br>
* Backend: Python (FastAPI)<br>
* Database: PostgreSQL with PostGIS extension<br>
* Frontend: HTML, CSS, JavaScript (Mapbox GL JS)<br>

--

### 🚀 Getting Started
Follow these steps to get the Tile Debugger running.

#### Prerequisites
Before you begin, ensure you have:<br>
Git: For cloning the repository.<br>
Python 3.8+: With pip installed.<br>
A running PostgreSQL database with the PostGIS extension enabled, and your spatial data already loaded into it (with SRID 4326 for geometries).<br>

**Step 1:** Clone the Repository<br>
Open your terminal or command prompt and clone the project:<br>
git clone *https://github.com/arsalanmukhtar/tile_debugger.git*<br>
cd tile_debugger # Navigate into your project folder

**Step 2:** Configure Your Environment<br>
Create and activate a Python Virtual Environment (recommended):<br>
python -m venv .venv

**On Windows:** .venv\Scripts\activate<br>
**On macOS/Linux:** source .venv/bin/activate

Install Python Dependencies:

pip install -r requirements.txt

**Create the .env file:**<br>
In the root directory of your project, create a new file named .env. This file will hold your database connection details and Mapbox access token.

**.env**<br>
DBHOST=your_db_host # e.g., localhost, your_docker_ip<br>
DBNAME=your_database_name # The name of your PostGIS database<br>
DBUSER=your_db_user<br>
DBPASSWORD=your_db_password<br>
DBPORT=5432 # Your database port, often 5432<br>
MAPBOX_ACCESS_TOKEN=YOUR_MAPBOX_PUBLIC_ACCESS_TOKEN # Get this from Mapbox

**Crucial:** Fill in your specific database credentials and your public Mapbox Access Token.

**Step 3:** Run the Application

With your environment configured, start the FastAPI application:

Ensure your virtual environment is active.

Run the application:

*uvicorn main:app --reload*

Access the Dashboard:
Open your web browser and go to:

[http://localhost:8000/](http://127.0.0.1:8000/)

--

### **🗺️ Using the Tile Debugger**
Once the application is running:

**Sidebar (Left):** Browse and click on tables from your PostGIS database to load their data onto the map.

**Map:** Your spatial data will appear as vector tiles.

**Label Dropdown (Top Right):** Select a column to use as labels for features.

**Basemap Selector (Bottom Right):** Hover to switch basemap styles.

**Tile URL Display (Bottom Left):** See the exact vector tile URL for the map's current center.

--

### **⚠️ Troubleshooting**
"Database connection failed": Double-check your .env file's database credentials. Ensure your PostgreSQL/PostGIS database is running and accessible.

Empty map after loading table: Confirm your data is loaded into the specified table and its geometry column has SRID 4326. Check your browser's developer console for errors.

Display issues: Perform a hard refresh of your browser (Ctrl+Shift+R or Cmd+Shift+R) and restart the FastAPI server to clear old cached files.

Feel free to explore and debug your geospatial data visualization!!!