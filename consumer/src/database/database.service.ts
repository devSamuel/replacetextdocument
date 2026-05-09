import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS documents (
    job_id        TEXT PRIMARY KEY,
    type          TEXT NOT NULL,
    redacted_text TEXT,
    keywords      TEXT[],
    created_at    TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_documents_keywords ON documents USING GIN(keywords);
`;

interface InsertDocumentParams {
  jobId: string;
  type: string;
  redactedText?: string;
  keywords: string[];
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.pool = new Pool({
      connectionString: this.config.get<string>('POSTGRES_DSN'),
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    await this.pool.query(INIT_SQL);
    this.logger.log('PostgreSQL schema ready');
  }

  async onModuleDestroy(): Promise<void> {
    // Drains any in-flight fire-and-forget inserts before closing
    await this.pool.end();
    this.logger.log('PostgreSQL pool closed');
  }

  async insertDocument(params: InsertDocumentParams): Promise<void> {
    await this.pool.query(
      `INSERT INTO documents (job_id, type, redacted_text, keywords)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (job_id) DO NOTHING`,
      [params.jobId, params.type, params.redactedText ?? null, params.keywords],
    );
  }
}
