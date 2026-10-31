import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import inspect
from app.database.connection import engine
from app.database.base import Base
import app.models

inspector = inspect(engine)

db_tables = set(inspector.get_table_names(schema="public")) - {"alembic_version"}
model_tables = set(Base.metadata.tables.keys())

print("\n========== TABLE COMPARISON ==========")

print("Database tables:", len(db_tables))
print("SQLAlchemy tables:", len(model_tables))

missing = model_tables - db_tables
extra = db_tables - model_tables

if missing:
    print("\nMissing from database:")
    print(missing)

if extra:
    print("\nMissing from SQLAlchemy:")
    print(extra)

print("\n========== COLUMN COMPARISON ==========")

has_column_differences = False

for table in sorted(model_tables & db_tables):
    db_columns = {
        column["name"]
        for column in inspector.get_columns(table, schema="public")
    }

    model_columns = set(Base.metadata.tables[table].columns.keys())

    missing_columns = model_columns - db_columns
    extra_columns = db_columns - model_columns

    if missing_columns or extra_columns:
        has_column_differences = True
        print(f"\nTable: {table}")

        if missing_columns:
            print("Missing in database:", missing_columns)

        if extra_columns:
            print("Missing in models:", extra_columns)

if not missing and not extra and not has_column_differences:
    print("\nSUCCESS: Table and column names match!")
else:
    print("\nFAILED: Schema differences detected!")

engine.dispose()