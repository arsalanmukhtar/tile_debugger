# app/db_operations.py

import psycopg2
from psycopg2 import sql
from psycopg2.errors import OperationalError
from app.config import settings
import mercantile
from typing import Dict, List, Optional, Tuple

def get_db_connection():
    try:
        return psycopg2.connect(
            host=settings.DBHOST,
            database=settings.DBNAME,
            user=settings.DBUSER,
            password=settings.DBPASSWORD,
            port=settings.DBPORT
        )
    except OperationalError as e:
        raise RuntimeError(f"Database connection failed: {str(e)}")

def get_geometry_column(schema: str, table: str) -> Optional[str]:
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT f_geometry_column
                FROM geometry_columns
                WHERE f_table_schema = %s AND f_table_name = %s
            """, (schema, table))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        raise RuntimeError(f"Failed to get geometry column: {str(e)}")
    finally:
        if conn:
            conn.close()

def get_schemas_and_tables() -> Dict[str, List[str]]:
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT schema_name
                FROM information_schema.schemata
                WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY schema_name
            """)
            schemas = [row[0] for row in cursor.fetchall()]
            schema_data = {}
            for schema in schemas:
                cursor.execute(sql.SQL("""
                    SELECT DISTINCT f_table_name
                    FROM public.geometry_columns
                    WHERE f_table_schema = %s AND srid = 4326
                """), [schema])
                tables = [row[0] for row in cursor.fetchall()]
                if tables:
                    schema_data[schema] = tables
            return schema_data
    except Exception as e:
        raise RuntimeError(f"Failed to retrieve schemas and tables: {str(e)}")
    finally:
        if conn:
            conn.close()

def get_tile_bounds(z: int, x: int, y: int) -> Tuple[float, float, float, float]:
    tile = mercantile.Tile(x, y, z)
    bounds = mercantile.bounds(tile)
    return bounds.west, bounds.south, bounds.east, bounds.north

def get_geometry_type_from_db(schema: str, table: str) -> Optional[str]:
    conn = None
    try:
        geom_column = get_geometry_column(schema, table)
        if not geom_column:
            return None
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(sql.SQL("""
                SELECT DISTINCT ST_GeometryType({}) AS geom_type
                FROM {}.{}
                WHERE {} IS NOT NULL
                LIMIT 1
            """).format(
                sql.Identifier(geom_column),
                sql.Identifier(schema),
                sql.Identifier(table),
                sql.Identifier(geom_column)
            ))
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error getting geometry type: {e}")
        return None
    finally:
        if conn:
            conn.close()

def get_mvt_tile_from_db(schema: str, table: str, z: int, x: int, y: int) -> Optional[bytes]:
    conn = None
    try:
        geom_column = get_geometry_column(schema, table)
        if not geom_column:
            raise ValueError("Geometry column not found.")
        conn = get_db_connection()

        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s AND column_name != %s
            """, [schema, table, geom_column])
            attributes = [row[0] for row in cursor.fetchall()]
        attributes_sql = sql.SQL(', ').join(map(sql.Identifier, attributes)) if attributes else sql.SQL("NULL")

        query = sql.SQL("""
            WITH bounds AS (SELECT ST_TileEnvelope(%s, %s, %s) AS geom),
                features_data AS (
                    SELECT
                        ST_AsMVTGeom(
                            ST_Transform(t1.{geom}, 3857),
                            bounds.geom,
                            4096,
                            256,
                            true
                        ) AS geom,
                        {attributes}
                    FROM {schema}.{table} t1, bounds
                    WHERE ST_Intersects(ST_Transform(t1.{geom}, 3857), bounds.geom)
                ),
                labels_data AS (
                    SELECT
                        ST_AsMVTGeom(
                            ST_Transform(
                                (ST_MaximumInscribedCircle(t2.{geom})).center,
                                3857
                            ),
                            bounds.geom,
                            4096,
                            0,
                            true
                        ) AS geom,
                        {attributes}
                    FROM {schema}.{table} t2, bounds
                    WHERE ST_Intersects(ST_Transform(t2.{geom}, 3857), bounds.geom)
                )
            SELECT
                (SELECT ST_AsMVT(features_data.*, 'features') FROM features_data) ||
                (SELECT ST_AsMVT(labels_data.*, 'labels') FROM labels_data)
        """).format(
            schema=sql.Identifier(schema),
            table=sql.Identifier(table),
            geom=sql.Identifier(geom_column),
            attributes=attributes_sql
        )

        with conn.cursor() as cursor:
            cursor.execute(query, [z, x, y])
            result = cursor.fetchone()
            return result[0] if result else None
    except Exception as e:
        print(f"Error generating MVT tile: {e}")
        raise
    finally:
        if conn:
            conn.close()

def get_table_extent_from_db(schema: str, table: str) -> Optional[Dict[str, float]]:
    conn = None
    try:
        geom_column = get_geometry_column(schema, table)
        if not geom_column:
            return None
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(sql.SQL("""
                SELECT ST_XMin(ST_Extent({0})) as minx,
                       ST_YMin(ST_Extent({0})) as miny,
                       ST_XMax(ST_Extent({0})) as maxx,
                       ST_YMax(ST_Extent({0})) as maxy
                FROM {1}.{2}
                WHERE {0} IS NOT NULL
            """).format(
                sql.Identifier(geom_column),
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
    conn = None
    try:
        geom_column = get_geometry_column(schema, table)
        if not geom_column:
            return {"valid": False, "error": "No geometry column found."}
        conn = get_db_connection()
        with conn.cursor() as cursor:
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
            result = cursor.fetchone()
            if not result or result[0] is None:
                return {"valid": False, "error": "SRID not found or no geometries."}
            srid = result[0]
            if srid == 0:
                return {"valid": False, "error": "Invalid SRID (0). Please set a valid SRID."}
            if srid != 4326:
                return {"valid": False, "error": f"Table must use SRID 4326. Found: {srid}"}
            return {"valid": True, "srid": srid}
    except Exception as e:
        raise RuntimeError(f"SRID check failed: {str(e)}")
    finally:
        if conn:
            conn.close()

def get_table_fields_from_db(schema: str, table: str) -> List[Dict[str, str]]:
    conn = None
    try:
        geom_column = get_geometry_column(schema, table)
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(sql.SQL("""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s AND column_name != %s
                ORDER BY column_name
            """), (schema, table, geom_column or 'geom'))
            return [{"name": row[0]} for row in cursor.fetchall()]
    except Exception as e:
        raise RuntimeError(f"Failed to fetch table fields: {str(e)}")
    finally:
        if conn:
            conn.close()
