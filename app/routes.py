# app/routes.py

from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Dict, List, Optional, Tuple

from app.config import settings # Assuming settings is in app/config.py
import app.db_operations as db_ops # Import our new db_operations module

app = FastAPI(title="Tiles Debugger",
              description="Interactive dashboard for debugging on-the-fly ST_AsMVT tiles")

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

@app.get("/", include_in_schema=True)
async def root(request: Request):
    """
    Main endpoint serving the dashboard page.
    Returns the template with schema data and Mapbox token.
    """
    try:
        schema_data = db_ops.get_schemas_and_tables()
        return templates.TemplateResponse("index.html", {
            "request": request,
            "schema_data": schema_data,
            "mapbox_token": settings.MAPBOX_ACCESS_TOKEN
        })
    except RuntimeError as e: # Catch RuntimeError from db_operations
        raise HTTPException(
            status_code=500,
            detail=f"Failed to render dashboard: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

class LayerState(BaseModel):
    schema_name: str
    table: str
    z: int
    x: int
    y: int

@app.post("/api/layer-state")
async def update_layer_state(state: LayerState):
    """Update and return the current layer state (for backend logging/display)"""
    print(f"Backend received layer state: Schema={state.schema_name}, Table={state.table}, Tile={state.z}/{state.x}/{state.y}")
    return {
        "schema": state.schema_name,
        "table": state.table,
        "tile": {
            "z": state.z,
            "x": state.x,
            "y": state.y,
            "url": f"/api/mvt/{state.schema_name}/{state.table}/{state.z}/{state.x}/{state.y}.pbf"
        },
        "message": "Layer state received and logged."
    }

@app.get("/api/mvt/{schema}/{table}/{z}/{x}/{y}.pbf")
async def get_mvt_tile(schema: str, table: str, z: int, x: int, y: int):
    try:
        tile_data = db_ops.get_mvt_tile_from_db(schema, table, z, x, y)
        
        if not tile_data:
            print(f"Server debug: No MVT data generated for {schema}.{table} tile {z}/{x}/{y}.")
            return Response(b'', media_type="application/x-protobuf")

        return Response(
            content=bytes(tile_data),
            media_type="application/x-protobuf",
            headers={
                "X-MVT-Layers": "features,labels",
                "Cache-Control": "public, max-age=3600"
            }
        )
    except RuntimeError as e:
        raise HTTPException(500, detail=f"Failed to generate MVT tile: {str(e)}")
    except Exception as e:
        raise HTTPException(500, detail=f"An unexpected error occurred during tile generation: {str(e)}")


@app.get("/api/geometry-type/{schema}/{table}")
async def get_table_geometry_type(schema: str, table: str):
    """Get the geometry type for a table"""
    try:
        geom_type = db_ops.get_geometry_type_from_db(schema, table)

        if not geom_type:
            raise HTTPException(status_code=400, detail="No valid geometry found or table is empty")

        return {
            "geometryType": geom_type
        }
    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error getting geometry type: {str(e)}"
        )
    except HTTPException:
        raise # Re-raise explicit HTTPException
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

@app.get("/api/extent/{schema}/{table}")
async def get_table_extent(schema: str, table: str):
    """Get the bounding box of a table's geometry"""
    try:
        bounds = db_ops.get_table_extent_from_db(schema, table)
        if not bounds:
            raise HTTPException(status_code=404, detail="No geometry data found or extent is null.")
            
        return {
            "bounds": bounds
        }
    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error getting table extent: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

@app.get("/api/check-srid/{schema}/{table}")
async def check_srid(schema: str, table: str):
    """Check if the geometry column has a valid SRID and is 4326."""
    try:
        srid_check_result = db_ops.check_srid_from_db(schema, table)
        return srid_check_result
    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"SRID check failed: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

@app.get("/api/fields/{schema}/{table}")
async def get_table_fields(schema: str, table: str):
    """
    Retrieve all column names from a specific table in a schema.
    Returns a list of field names suitable for labeling.
    """
    try:
        fields = db_ops.get_table_fields_from_db(schema, table)
        if not fields:
            raise HTTPException(status_code=404, detail="No non-geometry fields found in table.")
        return {"fields": fields}
    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch table fields: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )