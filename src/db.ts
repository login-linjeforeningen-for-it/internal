import pg, { type PoolClient, type QueryResultRow } from 'pg'

const { Pool } = pg

const pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB || process.env.DB_NAME || 'internal',
    user: process.env.DB_USER || 'internal',
    password: process.env.DB_PASSWORD || '',
    max: Number(process.env.DB_MAX_CONN || 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DB_TIMEOUT_MS || 5000),
})

let schemaReady: Promise<void> | null = null

export function query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    return pool.query<T>(text, values)
}

export function getDbClient(): Promise<PoolClient> {
    return pool.connect()
}

export function ensureInternalSchema() {
    if (!schemaReady) {
        schemaReady = createInternalSchema()
    }

    return schemaReady
}

async function createInternalSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS vulnerability_reports (
            id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            generated_at timestamptz,
            image_count integer NOT NULL DEFAULT 0,
            updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS vulnerability_report_images (
            image text PRIMARY KEY,
            scanned_at timestamptz NOT NULL,
            total_vulnerabilities integer NOT NULL DEFAULT 0,
            severity jsonb NOT NULL DEFAULT '{}'::jsonb,
            groups jsonb NOT NULL DEFAULT '[]'::jsonb,
            vulnerabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
            scanner_results jsonb NOT NULL DEFAULT '[]'::jsonb,
            scan_error text
        );

        CREATE TABLE IF NOT EXISTS vulnerability_scan_status (
            id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            is_running boolean NOT NULL DEFAULT false,
            started_at timestamptz,
            finished_at timestamptz,
            last_success_at timestamptz,
            last_error text,
            total_images integer,
            completed_images integer NOT NULL DEFAULT 0,
            current_image text,
            estimated_completion_at timestamptz,
            updated_at timestamptz NOT NULL DEFAULT now()
        );

        ALTER TABLE vulnerability_report_images
        ADD COLUMN IF NOT EXISTS scanner_results jsonb NOT NULL DEFAULT '[]'::jsonb;
    `)
}
