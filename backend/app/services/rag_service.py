import logging
import uuid
from typing import List, Optional, Any

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.schema import Document, BaseRetriever
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from pinecone import Pinecone, ServerlessSpec
from pydantic import Field

from app.core.config import settings
from app.models.schemas import SourceChunk, QueryResponse

logger = logging.getLogger(__name__)


class PineconeRetriever(BaseRetriever):
    """
    Custom LangChain retriever using the native Pinecone Python client.
    """
    index: Any = Field(exclude=True)
    embeddings: GoogleGenerativeAIEmbeddings = Field(exclude=True)
    top_k: int = 5
    filter: Optional[dict] = None

    def _get_relevant_documents(self, query: str) -> List[Document]:
        # Embed the query
        query_vector = self.embeddings.embed_query(query)

        # Query Pinecone
        results = self.index.query(
            vector=query_vector,
            top_k=self.top_k,
            include_metadata=True,
            filter=self.filter
        )

        # Convert to LangChain Documents
        docs = []
        for res in results["matches"]:
            metadata = res["metadata"]
            # Store score in metadata for later use
            metadata["score"] = res["score"]
            docs.append(Document(
                page_content=metadata.pop("text", ""),
                metadata=metadata
            ))
        return docs


class RAGService:
    """
    Core RAG service handling:
    - Document chunking and embedding
    - Pinecone vector store indexing (via native client)
    - Hybrid retrieval (dense vectors)
    - Gemini answer generation with source citations
    """

    def __init__(self):
        # Initialise embeddings
        self.embeddings = GoogleGenerativeAIEmbeddings(
            model=settings.GEMINI_EMBEDDING_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
        )

        # Initialise LLM
        self.llm = ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL,
            temperature=0,
            google_api_key=settings.GEMINI_API_KEY,
        )

        # Initialise Pinecone
        logger.info(f"Connecting to Pinecone index: {settings.PINECONE_INDEX}")
        self.pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        self._ensure_index_exists()
        self.index = self.pc.Index(settings.PINECONE_INDEX)
        
        # Verify dimension again for extra safety
        index_desc = self.pc.describe_index(settings.PINECONE_INDEX)
        logger.info(f"Connected to index '{settings.PINECONE_INDEX}' with dimension {index_desc.dimension}")

        # Text splitter for chunking
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        logger.info("RAGService initialised successfully with native Pinecone client")

    def _ensure_index_exists(self):
        """Create Pinecone index if it doesn't exist."""
        existing_indexes = self.pc.list_indexes()
        existing_names = [i.name for i in existing_indexes]
        
        if settings.PINECONE_INDEX not in existing_names:
            self.pc.create_index(
                name=settings.PINECONE_INDEX,
                dimension=3072,   # gemini-embedding-001 dimension
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region=settings.PINECONE_ENV),
            )
            logger.info(f"Created Pinecone index: {settings.PINECONE_INDEX}")
        else:
            # Check dimension of existing index
            index_desc = self.pc.describe_index(settings.PINECONE_INDEX)
            if index_desc.dimension != 3072:
                error_msg = (
                    f"CRITICAL: Index '{settings.PINECONE_INDEX}' has dimension {index_desc.dimension}, "
                    f"but Gemini requires 3072. Please delete the index in the Pinecone console "
                    f"or change the 'PINECONE_INDEX' name in your .env file."
                )
                logger.error(error_msg)
                raise RuntimeError(error_msg)

    def index_document(self, documents: List[Document], document_id: str) -> int:
        """
        Chunk documents and store embeddings in Pinecone using native client.
        """
        # Split documents into chunks
        chunks = self.text_splitter.split_documents(documents)

        # Prepare vectors for upsert
        vectors = []
        texts = [chunk.page_content for chunk in chunks]
        
        # Batch embed for efficiency
        try:
            embeddings = self.embeddings.embed_documents(texts)
        except Exception as e:
            logger.error(f"Embedding failed: {e}")
            raise e

        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            chunk_id = f"{document_id}#{i}"
            metadata = chunk.metadata.copy()
            metadata["text"] = chunk.page_content
            metadata["document_id"] = document_id

            vectors.append({
                "id": chunk_id,
                "values": embedding,
                "metadata": metadata
            })

        # Upsert in batches of 100
        batch_size = 100
        try:
            for i in range(0, len(vectors), batch_size):
                batch = vectors[i : i + batch_size]
                self.index.upsert(vectors=batch)
        except Exception as e:
            logger.error(f"Pinecone upsert failed: {e}")
            raise e

        logger.info(f"Indexed document {document_id}: {len(chunks)} chunks stored in Pinecone")
        return len(chunks)

    def query(
        self,
        question: str,
        document_ids: Optional[List[str]] = None,
        conversation_history: Optional[List[dict]] = None,
        top_k: int = 5,
    ) -> QueryResponse:
        """
        Answer a question using RAG and native Pinecone retrieval.
        """
        # Build custom retriever with optional document filter
        search_filter = None
        if document_ids:
            search_filter = {"document_id": {"$in": document_ids}}

        retriever = PineconeRetriever(
            index=self.index,
            embeddings=self.embeddings,
            top_k=top_k,
            filter=search_filter
        )

        # Build conversation memory from history
        memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True,
            output_key="answer",
        )
        if conversation_history:
            for turn in conversation_history:
                memory.chat_memory.add_user_message(turn.get("human", ""))
                memory.chat_memory.add_ai_message(turn.get("ai", ""))

        # Build RAG chain
        chain = ConversationalRetrievalChain.from_llm(
            llm=self.llm,
            retriever=retriever,
            memory=memory,
            return_source_documents=True,
            verbose=False,
        )

        result = chain.invoke({"question": question})

        # Parse source chunks
        sources = []
        seen = set()
        for doc in result.get("source_documents", []):
            key = doc.page_content[:100]
            if key not in seen:
                seen.add(key)
                sources.append(SourceChunk(
                    content=doc.page_content[:300] + "...",
                    page=doc.metadata.get("page"),
                    document_id=doc.metadata.get("document_id", ""),
                    filename=doc.metadata.get("filename", ""),
                    score=doc.metadata.get("score", 0.0),
                ))

        return QueryResponse(
            answer=result["answer"],
            sources=sources,
            question=question,
            model_used=settings.GEMINI_MODEL,
        )

    def delete_document(self, document_id: str):
        """Delete all chunks for a document from Pinecone."""
        self.index.delete(filter={"document_id": {"$eq": document_id}})
        logger.info(f"Deleted document {document_id} from Pinecone")


# Singleton instance
rag_service = RAGService()
