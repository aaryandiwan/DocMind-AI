# Architecture & AWS Deployment Guide

## System Architecture

```
                    ┌─────────────────────────────────────────┐
                    │             React Frontend               │
                    │  (Vite + Tailwind + React Dropzone)     │
                    └──────────────────┬──────────────────────┘
                                       │ HTTP / REST
                    ┌──────────────────▼──────────────────────┐
                    │           FastAPI Backend                │
                    │                                         │
                    │  ┌──────────────┐  ┌─────────────────┐  │
                    │  │  /documents  │  │    /query        │  │
                    │  │  (upload,    │  │  (RAG pipeline)  │  │
                    │  │   delete)    │  │                  │  │
                    │  └──────┬───────┘  └────────┬────────┘  │
                    │         │                   │           │
                    │  ┌──────▼───────────────────▼────────┐  │
                    │  │          RAGService                │  │
                    │  │  - Chunking (RecursiveTextSplitter)│  │
                    │  │  - Embedding (OpenAI text-emb-3)   │  │
                    │  │  - Retrieval (Pinecone top-K)      │  │
                    │  │  - Generation (GPT-4o)             │  │
                    │  └──────────┬────────────────────────┘  │
                    └─────────────┼──────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
    ┌─────────▼────────┐  ┌───────▼────────┐  ┌──────▼──────┐
    │   Pinecone DB     │  │  OpenAI API    │  │   AWS S3    │
    │ (Vector Storage)  │  │ (Embed + Chat) │  │ (Doc Store) │
    └──────────────────┘  └────────────────┘  └─────────────┘
```

## RAG Pipeline Detail

### Step 1: Document Indexing
```
File Upload
    │
    ▼
parse_document()          ← Extracts text per page (PDF) or full doc (DOCX/TXT)
    │
    ▼
RecursiveCharacterTextSplitter  ← chunk_size=500, overlap=50
    │
    ▼
OpenAI text-embedding-3-small   ← 1536-dim vector per chunk
    │
    ▼
Pinecone upsert                 ← stored with metadata: {document_id, filename, page}
```

### Step 2: Query Answering
```
User Question
    │
    ▼
OpenAI text-embedding-3-small   ← embed the question
    │
    ▼
Pinecone similarity search      ← top-K=5 most similar chunks (cosine)
    │
    ▼
ConversationalRetrievalChain    ← chunks + question + history → GPT-4o
    │
    ▼
Answer + Source Citations       ← returned to frontend
```

---

## AWS Deployment

### Prerequisites
- AWS CLI configured
- Docker installed
- ECR, ECS, and S3 permissions

### 1. Push images to ECR

```bash
# Authenticate
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build and push backend
docker build -f docker/Dockerfile.backend -t rag-qa-backend ./backend
docker tag rag-qa-backend:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/rag-qa-backend:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/rag-qa-backend:latest

# Build and push frontend
docker build -f docker/Dockerfile.frontend -t rag-qa-frontend .
docker tag rag-qa-frontend:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/rag-qa-frontend:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/rag-qa-frontend:latest
```

### 2. ECS Fargate Setup
- Create an ECS cluster
- Create task definitions for backend and frontend using the ECR images
- Set environment variables (OPENAI_API_KEY, PINECONE_API_KEY etc.) via AWS Secrets Manager
- Create services with desired count = 1 (scale up as needed)
- Attach an Application Load Balancer

### 3. Cheapest Free Tier Alternative (for students)
Instead of ECS, use:
- **Backend**: [Render.com](https://render.com) free tier — deploy as a web service
- **Frontend**: [Vercel](https://vercel.com) free tier — `npm run build` + deploy
- **Pinecone**: Free starter plan (1 index, 100K vectors)
- **OpenAI**: Pay per use (~$0.01 per query)

---

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `PINECONE_API_KEY` | Pinecone API key | `abc123...` |
| `PINECONE_ENV` | Pinecone region | `us-east-1` |
| `PINECONE_INDEX` | Index name | `rag-qa-index` |
| `CHUNK_SIZE` | Characters per chunk | `500` |
| `CHUNK_OVERLAP` | Overlap between chunks | `50` |
| `MAX_FILE_SIZE_MB` | Max upload size | `20` |
