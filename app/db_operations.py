# app/db_operations.py

import psycopg2
from psycopg2 import sql
from psycopg2.errors import OperationalError
from app.config import settings # Assuming settings is in app/config.py
import mercantile
from typing import Dict, List, Optional, Tuple

def get_db_connection():
    """Establish and return a PostgreSQL database connection."""
    try:
        conn = psycopg2.connect(
            host=settings.DBHOST,
            database=settings.DBNAME,
            user=settings.DBUSER,
            password=settings.DBPASSWORD,
            port=settings.DBPORT
        )
        return conn
    except OperationalError as e:
        # Re-raise or handle as appropriate for a helper function
        # For HTTP errors, routes will catch this.
        raise RuntimeError(f"Database connection failed: {str(e)}")

def get_schemas_and_tables() -> Dict[str, List[str]]:
    """
    Retrieve all schemas and their tables from the PostgreSQL database.
    Returns a dictionary with schema names as keys and lists of tables as values.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Get all schemas excluding system schemas
            cursor.execute("""
                SELECT schema_name
                FROM information_schema.schemata
                WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY schema_name
            """)
            schemas = [row[0] for row in cursor.fetchall()]

            schema_data = {}

            # Get tables for each schema
            for schema in schemas:
                cursor.execute(sql.SQL("""
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = %s
                    AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                """), [schema])
                tables = [row[0] for row in cursor.fetchall()]
                schema_data[schema] = tables

            return schema_data
    except Exception as e:
        raise RuntimeError(f"Database query for schemas and tables failed: {str(e)}")
    finally:
        if conn:
            conn.close()

def get_tile_bounds(z: int, x: int, y: int) -> Tuple[float, float, float, float]:
    """Convert tile coordinates to bounds in EPSG:3857"""
    tile = mercantile.Tile(x, y, z)
    bounds = mercantile.bounds(tile)
    return (bounds.west, bounds.south, bounds.east, bounds.north)

def get_geometry_type_from_db(schema: str, table: str) -> Optional[str]:
    """Get the geometry type of the specified table from the database."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(sql.SQL("""
                SELECT DISTINCT ST_GeometryType(geom) as geom_type
                FROM {}.{}
                WHERE geom IS NOT NULL
                LIMIT 1
            """).format(
                sql.Identifier(schema),
                sql.Identifier(table)
            ))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting geometry type for {schema}.{table}: {e}")
        return None
    finally:
        if conn:
            conn.close()

def get_mvt_tile_from_db(schema: str, table: str, z: int, x: int, y: int) -> Optional[bytes]:
    """Generate and retrieve an MVT tile from the database."""
    conn = None
    try:
        conn = get_db_connection()

        # Get all columns except geometry
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s
                AND column_name != 'geom'
            """, [schema, table])
            attributes = [row[0] for row in cursor.fetchall()]

        # Construct the attributes part for SQL
        attributes_sql = sql.SQL(', ').join(map(sql.Identifier, attributes)) if attributes else sql.SQL("NULL")


        # Single query that generates both layers
        query = sql.SQL("""
            WITH bounds AS (SELECT ST_TileEnvelope(%s, %s, %s) AS geom),
                -- Original features layer (polygons, lines, points)
                features_data AS (
                    SELECT
                        ST_AsMVTGeom(
                            ST_Transform(t1.geom, 3857), -- Transform to Web Mercator for MVT
                            bounds.geom,
                            4096,   -- Tile extent (e.g., 4096 units)
                            256,    -- Buffer (e.g., 256 units for rendering)
                            true    -- Clip geometries to tile boundaries
                        ) AS geom,
                        {attributes_sql} -- Pass all original attributes
                    FROM {schema}.{table} t1, bounds
                    WHERE ST_Intersects(ST_Transform(t1.geom, 3857), bounds.geom)
                ),
                -- Label positions layer (points derived from original geometries)
                labels_data AS (
                    SELECT
                        ST_AsMVTGeom(
                            ST_Transform(
                                (ST_MaximumInscribedCircle(t2.geom)).center, -- Use ST_MaximumInscribedCircle() for a robust label point
                                3857
                            ),
                            bounds.geom,
                            4096,   -- Tile extent
                            0,      -- No buffer for labels, clip precisely
                            true    -- Clip label points to tile boundaries
                        ) AS geom,
                        {attributes_sql} -- Pass all attributes for potential labels
                    FROM {schema}.{table} t2, bounds
                    WHERE ST_Intersects(ST_Transform(t2.geom, 3857), bounds.geom)
                )
            -- Combine both layers into one MVT response
            SELECT
                (SELECT ST_AsMVT(features_data.*, 'features') FROM features_data) ||
                (SELECT ST_AsMVT(labels_data.*, 'labels') FROM labels_data)
        """).format(
            schema=sql.Identifier(schema),
            table=sql.Identifier(table),
            attributes_sql=attributes_sql
        )

        with conn.cursor() as cursor:
            cursor.execute(query, [z, x, y])
            tile_data = cursor.fetchone()
            if tile_data:
                return tile_data[0] # Get the bytea result
            return None

    except Exception as e:
        print(f"MVT generation error for {schema}.{table} tile {z}/{x}/{y}: {str(e)}")
        raise # Re-raise for the route to catch
    finally:
        if conn: conn.close()

def get_table_extent_from_db(schema: str, table: str) -> Optional[Dict[str, float]]:
    """Get the bounding box of a table's geometry from the database."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(sql.SQL("""
                SELECT ST_XMin(ST_Extent(geom)) as minx,
                       ST_YMin(ST_Extent(geom)) as miny,
                       ST_XMax(ST_Extent(geom)) as maxx,
                       ST_YMax(ST_Extent(geom)) as maxy
                FROM {}.{}
                WHERE geom IS NOT NULL
            """).format(
                sql.Identifier(schema),
                sql.Identifier(table)
            ))
            result = cursor.fetchone()
            if not result or None in result:
                return None
            
            return {
                "west": float(result[0]),
                "south": float(result[1]),
                "east": float(result[2]),
                "north": float(result[3])
            }
    except Exception as e:
        raise RuntimeError(f"Error getting table extent: {str(e)}")
    finally:
        if conn:
            conn.close()

def check_srid_from_db(schema: str, table: str) -> Dict[str, any]:
    """Check if the geometry column has a valid SRID and is 4326."""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Get the geometry column name first
            cursor.execute(sql.SQL("""
                SELECT f_geometry_column
                FROM geometry_columns
                WHERE f_table_schema = %s AND f_table_name = %s
            """), [schema, table])

            result = cursor.fetchone()
            if not result:
                return {"valid": False, "error": "No geometry column found in geometry_columns view for this table."}

            geom_column = result[0]

            # Check SRID for the first geometry in the table
            cursor.execute(sql.SQL("""
                SELECT ST_SRID({}) AS srid
                FROM {}.{}
                WHERE {} IS NOT NULL
                LIMIT 1
            """).format(
                sql.Identifier(geom_column),
                sql.Identifier(schema),
                sql.Identifier(table),
                sql.Identifier(geom_column)
            ))

            srid_result = cursor.fetchone()
            if not srid_result or srid_result[0] is None:
                return {"valid": False, "error": "No geometries found in table or SRID is NULL."}

            srid = srid_result[0]
            if srid == 0:
                return {"valid": False, "error": "Invalid SRID (0) found in geometry. Please set a valid SRID."}

            if srid != 4326:
                return {"valid": False, "error": f"Table must use SRID 4326 (WGS84) for initial load. Current SRID: {srid}. Please transform your data to EPSG:4326."}

            return {"valid": True, "srid": srid}

    except Exception as e:
        raise RuntimeError(f"SRID check failed: {str(e)}")
    finally:
        if conn:
            conn.close()

def get_table_fields_from_db(schema: str, table: str) -> List[Dict[str, str]]:
    """
    Retrieve all non-geometry column names from a specific table in a schema.
    Returns a list of field names suitable for labeling.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(sql.SQL("""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = %s
                AND table_name = %s
                AND column_name != 'geom'
                ORDER BY column_name
            """), [schema, table])
            fields = [{"name": row[0]} for row in cursor.fetchall()]
            return fields
    except Exception as e:
        raise RuntimeError(f"Failed to fetch table fields: {str(e)}")
    finally:
        if conn:
            conn.close()