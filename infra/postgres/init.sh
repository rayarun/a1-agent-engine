#!/bin/bash
set -e

# Create secondary databases for Temporal
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE temporal;
    CREATE DATABASE temporal_visibility;
EOSQL

# Enable pgvector on the main agent database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS vector;
EOSQL
