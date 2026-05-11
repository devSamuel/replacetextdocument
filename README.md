# Redact / Unredact Service

A distributed document redaction system. Upload a file, specify keywords to hide, get back a redacted version. Later, upload the redacted file with its original job ID and restore the original text.

Supports plain text, PDF, DOCX, ODT, and RTF. Handles files up to 200 MB without buffering the full content in memory.

---

## Table of Contents

- [Architecture](#architecture)
- [Request Flow](#request-flow)
- [Technologies](#technologies)
- [Running Locally](#running-locally)
- [API Reference](#api-reference)
- [Key Design Decisions](#key-design-decisions)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Producer                                │
│   NestJS + Fastify  ·  HTTP :3000  ·  512 MB container limit    │
│                                                                  │
│  POST /redact                                                    │
│    │ peek 8 bytes → format detect                               │
│    ├─ text  → TextChunker (streaming, 2 MB chunks)              │
│    └─ binary → temp file → extract text → split chunks          │
│                                                                  │
│  GET /result/:jobId          Redis ──► return JSON or file      │
└──────────────┬───────────────────────────────────────────────────┘
               │ Kafka topic: incoming-orders (GZIP, key=jobId)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                          Consumer                                │
│   NestJS Kafka Microservice  ·  4 partitions concurrent         │
│                                                                  │
│  type: redact        → redact text → storeJobData (pipeline)    │
│  type: redact-chunk  → APPEND to text:{jobId}                   │
│                        on isLast: assembleChunks                │
│  type: unredact      → getReplacements → unredact → storeResult │
└──────────────┬───────────────────────────────────────────────────┘
               │
      ┌────────┴─────────┐
      ▼                  ▼
   Redis              PostgreSQL
   (results,          (audit log,
   TTL cache)         async only)
```

### Services

| Service | Role |
|---|---|
| **producer** | HTTP API, format detection, text extraction, Kafka publisher |
| **consumer** | Kafka subscriber, redaction engine, Redis writer |
| **redis** | Authoritative result store (pure cache, `allkeys-lru`) |
| **postgres** | Append-only audit log — never on the critical path |
| **kafka** | Durable job queue, partition ordering per `jobId` |

---

## Request Flow

### Redact

```
1. POST /redact
   Headers: Content-Type: application/octet-stream
            X-Keywords: beer "Boston Red Sox" confidential

2. Producer: peek first 8 bytes → detect format
   ┌─ plain text ──► TextChunker streams HTTP body into 2 MB chunks
   └─ PDF/DOCX/ODT/RTF ──► write to /tmp, extract text, split into chunks

3. Each chunk published to Kafka as:
   { type: "redact",       jobId, text, keywords }          ← 1 chunk
   { type: "redact-chunk", jobId, chunkIndex, text,
     keywords, isLast }                                      ← N chunks

4. Consumer receives messages (ordered per jobId, same partition):
   - Regex-match each keyword in chunk text
   - Replace matches with XXXX, record original words
   - APPEND redacted text to Redis key  text:{jobId}
   - RPUSH original words to           replacements:{jobId}
   - On isLast: write result metadata  result:{jobId}

5. GET /result/:jobId  →  { status: "done", type: "redact", ... }
6. GET /result/:jobId?format=txt|pdf|docx|odt|rtf  →  file download
```

### Unredact

```
1. POST /unredact
   Headers: Content-Type: application/octet-stream
            X-Key: <original-jobId>
   Body: redacted document (plain text, PDF, DOCX, ODT, or RTF)

2. Producer publishes:
   { type: "unredact", jobId, text, key }

3. Consumer:
   - LRANGE replacements:{key}  →  original word list
   - Replace XXXX tokens in order with original words

4. GET /result/:jobId  →  { status: "done", type: "unredact", originalText: "..." }
```

### Redis Key Schema

| Key | Type | TTL | Content |
|---|---|---|---|
| `result:{jobId}` | string | 1 h | JSON result metadata |
| `text:{jobId}` | string | 1 h | Full redacted/original text (multi-chunk jobs) |
| `replacements:{jobId}` | list | 24 h | Original words in replacement order |
| `format:{jobId}` | string | 1 h | Detected file format (`text`, `pdf`, `docx`, `odt`, `rtf`) |

---

## Technologies

| Layer | Technology | Why |
|---|---|---|
| HTTP server | **NestJS + Fastify** | Raw stream body support; Fastify passes `IncomingMessage` directly without buffering |
| Message broker | **Apache Kafka 4** | Ordered delivery within a partition; `jobId` as partition key guarantees chunk ordering |
| Cache / result store | **Redis 7** (ioredis) | Pipeline batching; APPEND for incremental text assembly; `allkeys-lru` eviction |
| Audit log | **PostgreSQL 16** | Append-only; `synchronous_commit=off` since Redis is authoritative |
| PDF extraction | **pdfjs-dist** | Accepts `file://` URL — reads pages from disk, never loads full PDF into JS heap |
| DOCX extraction | **mammoth** | Accepts `{ path }` — streams `word/document.xml` without loading embedded images |
| ODT / ZIP detection | **unzipper** | Streams individual zip entries without extracting the full archive |
| Text chunking | Custom `TextChunker` | AsyncIterable with one-chunk lookahead for correct `isLast` flag; keyword-safe split points |
| Containerization | **Docker + Compose** | All builds inside containers; never run `npm` locally |
| Language | **TypeScript / Node.js** | Both services; strict mode |

---

## Running Locally

**Requirement:** Docker with Compose v2.20+. No local Node.js needed.

### Start everything

```bash
docker compose -f compose.dev.yml build
docker compose -f compose.dev.yml up -d
```

Producer is available at `http://localhost:3000`.

### Rebuild after code changes

```bash
# Rebuild a single service (e.g. producer)
docker compose -f compose.dev.yml build producer
docker compose -f compose.dev.yml up -d producer

# Tail logs
docker logs encriptdecriptfiles-producer-1 -f
docker logs encriptdecriptfiles-consumer-1 -f
```

### Smoke tests

```bash
# Health check
curl http://localhost:3000/health

# Redact a text file
JOB=$(curl -s -X POST http://localhost:3000/redact \
  -H "Content-Type: application/octet-stream" \
  -H 'X-Keywords: beer world "Boston Red Sox"' \
  --data-binary @/path/to/file.txt | jq -r .jobId)

# Poll until done (status: pending → done)
curl http://localhost:3000/result/$JOB

# Download as plain text
curl "http://localhost:3000/result/$JOB?format=txt" -o redacted.txt

# Download in original format
curl "http://localhost:3000/result/$JOB?format=original" -o redacted_original

# Unredact (plain text or any supported file format)
UNJOB=$(curl -s -X POST http://localhost:3000/unredact \
  -H "Content-Type: application/octet-stream" \
  -H "X-Key: $JOB" \
  --data-binary @redacted.txt | jq -r .jobId)
curl http://localhost:3000/result/$UNJOB
```

### Production Swarm

```bash
docker build -t my-producer:latest ./producer
docker build -t my-consumer:latest ./consumer

export BROKER_HEAP_OPTS="-Xmx4G -Xms4G"
docker stack deploy -c compose.yml <stack-name>
```

The `my-app-redis` overlay network must exist before deploying (Redis lives in a separate stack).
Production topology: 3 KRaft controllers + 4 Kafka brokers, nginx load balancer on port 80.

---

## API Reference

### `POST /redact`

Upload a file for keyword redaction.

| Header | Required | Description |
|---|---|---|
| `Content-Type` | yes | `application/octet-stream` |
| `X-Keywords` | yes | Space/comma-separated keywords. Wrap phrases in quotes: `beer "Boston Red Sox"` |

**Response:** `{ "jobId": "uuid" }`

---

### `GET /result/:jobId`

Poll job status.

**Response (pending):** `{ "status": "pending" }`  
**Response (done):** `{ "status": "done", "type": "redact" | "unredact" }`

---

### `GET /result/:jobId?format=<fmt>`

Download the result as a file.

| Format value | Output |
|---|---|
| `txt` / `text` | Plain text |
| `pdf` | PDF |
| `docx` | Word document |
| `odt` | OpenDocument Text |
| `rtf` | Rich Text Format |
| `original` | Same format as the uploaded file |

---

### `POST /unredact`

Restore original text from a redacted document.

| Header | Required | Description |
|---|---|---|
| `Content-Type` | yes | `application/octet-stream` |
| `X-Key` | yes | The `jobId` returned by the original `/redact` call |

Body: the redacted document — plain text, PDF, DOCX, ODT, or RTF.

**Response:** `{ "jobId": "uuid" }`

---

## Key Design Decisions

**Kafka partition key = jobId**  
All chunks for a job are published to the same partition using `jobId` as the message key. Kafka guarantees ordering within a partition, so chunk 0 is always processed before chunk 1 — no out-of-order assembly logic needed.

**Redis APPEND instead of per-chunk keys**  
Redacted text is accumulated server-side using Redis `APPEND`. Each 2 MB chunk adds to `text:{jobId}` without the consumer ever holding the full assembled text in the JS heap. This keeps consumer memory usage flat regardless of file size.

**TTL sync at assembly time**  
`text:{jobId}` and `result:{jobId}` have their TTLs reset together in the same pipeline when the last chunk is assembled. This ensures both keys expire at the same moment — a client that can read `status: done` can always download the text.

**Phrase-safe chunk boundaries**  
`findSafeSplit` scans backward from the 2 MB mark for whitespace where no keyword phrase straddles the boundary. A phrase like `"Ecommerce home page load"` can never be split across two Kafka messages.

**Fire-and-forget PostgreSQL writes**  
DB inserts are dispatched with `setImmediate` after the Redis write completes. Postgres latency never delays the Kafka offset commit. If the insert fails, only the audit log is affected — the result in Redis is authoritative.

**Single-chunk backward compatibility**  
When a file produces exactly one chunk, the producer publishes `type: "redact"` (not `type: "redact-chunk"`). The consumer's original single-message path handles it unchanged, with no chunk assembly overhead.
