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

print("\n========== CONSTRAINT AND RELATIONSHIP COMPARISON ==========")
has_constraint_differences = False

for table in sorted(model_tables & db_tables):
    metadata = Base.metadata.tables[table]
    actual_fks = {
        (tuple(fk["constrained_columns"]), fk["referred_table"], tuple(fk["referred_columns"]))
        for fk in inspector.get_foreign_keys(table, schema="public")
    }
    expected_fks = {
        (tuple(constraint.columns.keys()), next(iter(constraint.elements)).column.table.name,
         tuple(element.column.name for element in constraint.elements))
        for constraint in metadata.foreign_key_constraints
    }
    missing_fks = expected_fks - actual_fks
    if missing_fks:
        has_constraint_differences = True
        print(f"\nTable: {table} — missing foreign keys: {missing_fks}")

    actual_unique = {tuple(item["column_names"]) for item in inspector.get_unique_constraints(table, schema="public")}
    actual_unique.update(tuple(item["column_names"]) for item in inspector.get_indexes(table, schema="public") if item.get("unique"))
    expected_unique = {tuple(constraint.columns.keys()) for constraint in metadata.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"}
    expected_unique.update(tuple(index.columns.keys()) for index in metadata.indexes if index.unique)
    missing_unique = expected_unique - actual_unique
    if missing_unique:
        has_constraint_differences = True
        print(f"\nTable: {table} — missing unique constraints/indexes: {missing_unique}")

if not missing and not extra and not has_column_differences and not has_constraint_differences:
    print("\nSUCCESS: Table and column names match!")
else:
    print("\nFAILED: Schema differences detected!")
    sys.exit(1)

engine.dispose()
