"""
DL Week Workshop: Building a Smart PDF ChatBot
===============================================
Extracted from DLW_Workshop_(PARTICIPANT).ipynb

Install dependencies before running:
    pip install langchain-core langchain-community langchain-text-splitters \
                pypdf sentence-transformers faiss-cpu pdfplumber \
                huggingface-hub requests
"""

# ===========================================================================
# Imports
# ===========================================================================

import json
import os
import re
import urllib.request
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from huggingface_hub import InferenceClient

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False


# ===========================================================================
# Configuration
# ===========================================================================

# Hugging Face token — set env var HF_TOKEN or you will be prompted at runtime
HF_TOKEN: str = os.getenv("HF_TOKEN") or input("Enter your Hugging Face token: ")

PDF_PATH = "SG_Budget_Statement_2026.pdf"
PDF_DRIVE_URL = "https://drive.google.com/uc?export=download&id=16-AQAFL7gzXJW39O3DOsFUiGFzX6cp4Z"

# Chunking — Small: (200, 40) | Medium: (500, 100) | Large: (1000, 200)
CHUNK_SIZE    = 500
CHUNK_OVERLAP = 100

# Retrieval
TOP_K_RESULTS = 5

# Embedding & index
EMBEDDING_MODEL  = "all-MiniLM-L6-v2"
FAISS_INDEX_PATH = "faiss_index"

# LLM
HF_MODEL_ID     = "meta-llama/Llama-3.1-8B-Instruct"
LLM_TEMPERATURE = 0.3
LLM_MAX_TOKENS  = 500

model_config = {
    "model_id":    HF_MODEL_ID,
    "temperature": LLM_TEMPERATURE,
    "max_tokens":  LLM_MAX_TOKENS,
}

SYSTEM_PROMPT = (
    "You are a helpful assistant that answers questions based on provided documents. "
    "Answer only based on the context provided. "
    "If the context does not contain the answer, say 'I don't know.'"
)


# ===========================================================================
# PDF Download
# ===========================================================================

def download_pdf(url: str, output_path: str) -> None:
    """Download the PDF from a direct URL if not already present."""
    if os.path.exists(output_path):
        print(f"PDF already exists: {output_path}")
        return
    print(f"Downloading PDF from {url} …")
    urllib.request.urlretrieve(url, output_path)
    print(f"Downloaded: {output_path}")
    print("Document: Singapore Budget Statement 2026")
    print("Source: Singapore Ministry of Finance")


# ===========================================================================
# Phase 1 — RAG Pipeline
# ===========================================================================

# --- 1. Load PDF ---

def load_pdf(file_path: str) -> List[Document]:
    """Load a PDF and extract text."""
    loader = PyPDFLoader(file_path)
    documents = loader.load()
    print(f"✅ Loaded {len(documents)} pages from {file_path}!")
    return documents


# --- 2. Chunk ---

def chunk_documents(documents: List[Document], chunk_size: int = 500, chunk_overlap: int = 100) -> List[Document]:
    """Split documents into smaller chunks."""
    print(f"Splitting into chunks (size={chunk_size}, overlap={chunk_overlap})")
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
    )
    chunks = text_splitter.split_documents(documents)
    print(f"✅ Created {len(chunks)} chunks")
    return chunks


def inspect_chunks(chunks: List[Document]) -> None:
    """Print a quick stats + preview of the first two chunks."""
    avg_len = sum(len(c.page_content) for c in chunks) // len(chunks)
    print(f"Total chunks: {len(chunks)}")
    print(f"Average chunk length: {avg_len} chars")

    print("\n" + "=" * 60)
    print("CHUNK 0:")
    print("=" * 60)
    print(chunks[0].page_content)

    print("\n" + "=" * 60)
    print("CHUNK 1 (look for overlap with the end of Chunk 0):")
    print("=" * 60)
    print(chunks[1].page_content)

    print("\n💡 The repeated text between Chunk 0 and Chunk 1 is the overlap — intentional continuity.")


# --- 3. Vector Store ---

def create_vector_store(chunks: List[Document], embedding_model_name: str = "all-MiniLM-L6-v2") -> FAISS:
    """Embed chunks and store in FAISS vector database."""
    print(f"Creating embeddings using: {embedding_model_name}")
    embeddings = HuggingFaceEmbeddings(
        model_name=embedding_model_name,
        model_kwargs={"token": HF_TOKEN},
    )
    print("Building FAISS vector store...")
    vector_store = FAISS.from_documents(chunks, embeddings)
    print("✅ Vector store created successfully")
    return vector_store


def save_vector_store(vector_store: FAISS, save_path: str = "faiss_index") -> None:
    """Save FAISS index to disk."""
    vector_store.save_local(save_path)
    print(f"✅ Vector store saved to: {save_path}")


def load_vector_store(load_path: str = "faiss_index", embedding_model_name: str = "all-MiniLM-L6-v2") -> FAISS:
    """Load a previously saved FAISS index."""
    print(f"Loading vector store from: {load_path}")
    embeddings = HuggingFaceEmbeddings(
        model_name=embedding_model_name,
        model_kwargs={"token": HF_TOKEN},
    )
    vector_store = FAISS.load_local(load_path, embeddings, allow_dangerous_deserialization=True)
    print("✅ Vector store loaded")
    return vector_store


# --- 4. Retrieval ---

def retrieval(vector_store: FAISS, query: str, k: int = 3) -> List[Document]:
    """Search the vector store for the most similar chunks to a query."""
    print(f"Retrieving top {k} chunks...\n")
    results = vector_store.similarity_search(query, k=k)
    return results


# --- 5. LLM Generation ---

def format_prompt(question: str, chunks: List[Document], system_prompt: str) -> str:
    """
    Format the prompt with system message, context chunks, and user question.

    Returns:
        Formatted prompt string with 3 parts: system | context | question
    """
    context_text = "Retrieved documents:\n"
    for i, chunk in enumerate(chunks, 1):
        context_text += f"\n[Document {i}]\n{chunk.page_content}\n"

    prompt = f"""{system_prompt}

    {context_text}

    Question: {question}

    Answer:"""
    return prompt


def generate_answer(
    prompt: str,
    model_id: str,
    api_key: str,
    temperature: float = 0.3,
    max_tokens: int = 500,
) -> str:
    """Call HuggingFace Inference API to generate an answer using InferenceClient."""
    client = InferenceClient(api_key=api_key)
    completion = client.chat.completions.create(
        model=model_id,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return completion.choices[0].message.content


# --- 6. Full Phase 1 Pipeline ---

def rag_pipeline(vector_store: FAISS, user_question: str, system_prompt: str, model_config: dict) -> dict:
    """
    Complete RAG pipeline: Retrieve → Format → Generate

    Returns:
        Dictionary with answer, sources, and metadata
    """
    print("\n" + "=" * 60)
    print("RAG PIPELINE EXECUTION")
    print("=" * 60)

    try:
        print("\n[Step 1/3] Retrieving relevant chunks...")
        retrieved_chunks = retrieval(vector_store, user_question, k=TOP_K_RESULTS)
        print(f"✅ Retrieved {len(retrieved_chunks)} chunks")

        print("\n[Step 2/3] Formatting prompt...")
        prompt = format_prompt(user_question, retrieved_chunks, system_prompt)
        print("✅ Prompt formatted")

        print("\n[Step 3/3] Calling LLM API for answer generation...")
        answer = generate_answer(
            prompt=prompt,
            model_id=model_config["model_id"],
            api_key=HF_TOKEN,
            temperature=model_config["temperature"],
            max_tokens=model_config["max_tokens"],
        )
        print("✅ Answer generated successfully")

        return {
            "question":     user_question,
            "answer":       answer,
            "sources":      retrieved_chunks,
            "source_count": len(retrieved_chunks),
        }
    except Exception as e:
        print(f"\n❌ Error in RAG pipeline: {e}")
        raise


def display_result(result: dict) -> None:
    """Display the RAG pipeline result in a readable format."""
    print("CHATBOT RESPONSE")
    print(f"\n Question: {result['question']}")
    print(f"\n Answer:\n")
    print(result["answer"])
    print(f"\n Sources ({result['source_count']} retrieved chunks):")
    print("-" * 60)
    for i, source in enumerate(result["sources"], 1):
        print(f"\n[Source {i}] (Page {source.metadata.get('page', 'N/A')})")
        content_preview = source.page_content[:250] + "..." if len(source.page_content) > 250 else source.page_content
        print(content_preview)


# ===========================================================================
# Phase 2 — Source Attribution
# ===========================================================================

# --- Data Structures ---

@dataclass
class BoundingBox:
    """Represents spatial coordinates of text in a document."""
    x0: float
    y0: float
    x1: float
    y1: float

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class Citation:
    """Represents a single citation location in a document."""
    citation_id: str
    page_number: int
    paragraph_id: str
    section_title: Optional[str] = None
    bbox: Optional[BoundingBox] = None
    text_preview: str = ""

    def to_dict(self) -> Dict:
        return {
            "citation_id":    self.citation_id,
            "page_number":    self.page_number,
            "paragraph_id":   self.paragraph_id,
            "section_title":  self.section_title,
            "bbox":           self.bbox.to_dict() if self.bbox else None,
            "text_preview":   self.text_preview,
        }


# --- CitationExtractor ---

class CitationExtractor:
    """
    Extracts and enriches document chunks with citation metadata.
    Converts standard Document objects into citation-aware chunks.
    """

    def __init__(self, pdf_path: Optional[str] = None):
        self.citation_counter = 0
        self.pdf_path = pdf_path
        self.pdf = None
        if pdf_path and PDFPLUMBER_AVAILABLE:
            try:
                self.pdf = pdfplumber.open(pdf_path)
            except Exception as e:
                print(f"⚠️  Could not open PDF with pdfplumber: {e}")
                self.pdf = None

    def _generate_citation_id(self, page: int, para_idx: int, section_idx: int = 0) -> str:
        return f"c{page}.{section_idx}.{para_idx}"

    def _extract_page_number(self, document: Document) -> int:
        if hasattr(document, "metadata") and document.metadata:
            return document.metadata.get("page", 0)
        return 0

    def _extract_section_title(self, text: str, max_chars: int = 100) -> str:
        lines = text.split("\n")
        for line in lines[:3]:
            stripped = line.strip()
            if 3 < len(stripped) < max_chars and not stripped.startswith("#"):
                return stripped
        return ""

    def _estimate_bbox(self, text_length: int, page: int) -> BoundingBox:
        """
        Estimate bounding box based on text length.
        Uses pdfplumber for actual coordinates if PDF is available,
        otherwise falls back to estimation.
        """
        if self.pdf and page > 0 and page <= len(self.pdf.pages):
            try:
                pdf_page = self.pdf.pages[page - 1]
                text_objects = pdf_page.chars
                if text_objects:
                    char_count = 0
                    bbox_info = []
                    for char in text_objects:
                        bbox_info.append({"x0": char["x0"], "y0": char["y0"],
                                          "x1": char["x1"], "y1": char["y1"]})
                        char_count += 1
                        if char_count >= text_length:
                            break
                    if bbox_info:
                        return BoundingBox(
                            x0=min(b["x0"] for b in bbox_info),
                            y0=min(b["y0"] for b in bbox_info),
                            x1=max(b["x1"] for b in bbox_info),
                            y1=max(b["y1"] for b in bbox_info),
                        )
            except Exception:
                pass

        # Fallback estimation
        avg_chars_per_line = 80
        line_height = 12
        lines = max(1, text_length // avg_chars_per_line)
        y_pos = 50 + ((page % 5) * 150)
        return BoundingBox(x0=50, y0=y_pos, x1=562, y1=y_pos + (lines * line_height))

    def enrich_chunk(
        self,
        document: Document,
        chunk_index: int,
        section_title: Optional[str] = None,
    ) -> Document:
        """Enrich a document chunk with citation metadata."""
        page_num = self._extract_page_number(document)
        citation_id = self._generate_citation_id(page_num, chunk_index)
        section = section_title or self._extract_section_title(document.page_content)
        bbox = self._estimate_bbox(len(document.page_content), page_num)
        citation = Citation(
            citation_id=citation_id,
            page_number=page_num,
            paragraph_id=f"P{page_num}-Para{chunk_index}",
            section_title=section,
            bbox=bbox,
            text_preview=document.page_content[:100],
        )
        if not document.metadata:
            document.metadata = {}
        document.metadata.update({
            "citation_id":    citation_id,
            "page_number":    page_num,
            "paragraph_id":   citation.paragraph_id,
            "section_title":  section,
            "citation_bbox":  bbox.to_dict(),
            "citation_data":  citation.to_dict(),
        })
        return document


# --- Citation-aware helpers ---

def create_citation_aware_chunks(
    documents: List[Document],
    pdf_path: Optional[str] = None,
    enrich: bool = True,
) -> List[Document]:
    """Convert a list of documents into citation-aware chunks."""
    extractor = CitationExtractor(pdf_path)
    citation_docs = []
    for chunk_idx, doc in enumerate(documents):
        if enrich:
            doc = extractor.enrich_chunk(doc, chunk_idx)
        citation_docs.append(doc)
    return citation_docs


def chunk_documents_citation(
    documents: List[Document],
    chunk_size: int = 500,
    chunk_overlap: int = 100,
    pdf_path: Optional[str] = None,
) -> List[Document]:
    """Split documents into smaller chunks with optional citation metadata."""
    print(f"Splitting into chunks (size={chunk_size}, overlap={chunk_overlap})")
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size, chunk_overlap=chunk_overlap, length_function=len
    )
    chunks = text_splitter.split_documents(documents)
    print(f"✅ Created {len(chunks)} chunks")
    print("Adding citation metadata to chunks...")
    chunks = create_citation_aware_chunks(chunks, pdf_path=pdf_path, enrich=True)
    print(f"✅ Enhanced {len(chunks)} chunks with citations")
    return chunks


def get_chunk_citations(chunk: Document) -> dict:
    """Extract and print citation information from an enriched chunk."""
    metadata = {
        "citation_id":  chunk.metadata.get("citation_id", "unknown"),
        "page":         chunk.metadata.get("page_number", 0),
        "paragraph_id": chunk.metadata.get("paragraph_id", ""),
        "section":      chunk.metadata.get("section_title", ""),
        "bbox":         chunk.metadata.get("citation_bbox"),
        "preview":      chunk.page_content[:150],
    }
    print("=" * 60)
    print(f"Citation ID: {metadata['citation_id']}")
    print(f"Page: {metadata['page']}")
    print(f"Paragraph ID: {metadata['paragraph_id']}")
    print(f"Section: {metadata['section']}")
    print(f"Preview: {metadata['preview']}\n")
    print(f"Bounding Box: {metadata['bbox']}")
    print("=" * 60)
    return metadata


def retrieval_with_citations(vector_store: FAISS, query: str, k: int = 3) -> List[Document]:
    """Advanced retrieval that returns citation-aware chunks."""
    print("\n[CITATION-AWARE RETRIEVAL]")
    print(f"Query: '{query}'")
    print(f"Retrieving top {k} chunks with citations...\n")

    results = vector_store.similarity_search(query, k=k)
    extractor = CitationExtractor()
    citation_chunks = []
    for idx, chunk in enumerate(results):
        if "citation_id" not in chunk.metadata:
            chunk = extractor.enrich_chunk(chunk, idx)
        citation_chunks.append(chunk)

    print(f"✅ Retrieved {len(citation_chunks)} citations\n")
    return citation_chunks


def format_citation_aware_prompt(
    question: str,
    chunks: List[Document],
    system_prompt: str,
    include_instructions: bool = True,
) -> str:
    """Format a prompt that encourages the LLM to reference source citations."""
    enhanced_system = system_prompt
    if include_instructions:
        enhanced_system += """

Use citations in your answer to reference the sources used to answer the question.

IMPORTANT - Citation Guidelines:
- When making a claim, immediately cite the source using its Citation ID in square brackets
- Place citations inline right after the relevant text: e.g. "Government will support workers through skill acquisition and role adaptation [c28.0.79]."
- If a claim uses multiple sources, list all citation IDs: e.g. "PM Wong views AI as a strategic asset to overcome structural constraints [c22.0.60, c22.0.61]."

"""

    context_text = "Retrieved documents with citations:\n"
    for i, chunk in enumerate(chunks, 1):
        citation_id  = chunk.metadata.get("citation_id", f"Doc{i}")
        page         = chunk.metadata.get("page_number", "?")
        section      = chunk.metadata.get("section_title", "Untitled")
        paragraph_id = chunk.metadata.get("paragraph_id", "")
        context_text += f"\n{'=' * 60}\n"
        context_text += f"[Document {i}]\n"
        context_text += f"Citation ID: {citation_id}\n"
        context_text += f"Page: {page}\n"
        context_text += f"Section: {section}\n"
        context_text += f"Paragraph ID: {paragraph_id}\n"
        context_text += f"{'=' * 60}\n"
        context_text += f"{chunk.page_content}\n"

    prompt = f"""{enhanced_system}

{context_text}

Question: {question}

Provide a comprehensive answer that includes specific citations to the documents above.
Answer:"""
    return prompt


def citation_formatter(response: str, citations: List[Dict], citation_lookup: Dict) -> str:
    """Convert to plain text with numbered citations."""
    text = f"{response}\n\n"
    text += "=" * 60 + "\n"
    text += f"SOURCES ({len(citations)} cited):\n"
    text += "=" * 60 + "\n\n"
    for i, citation in enumerate(citations, 1):
        cite_id = citation["id"]
        source  = citation["source"]
        text += f"[{i}] Page {source['page']} | {source.get('section', 'Untitled')}\n"
        text += f"    ID: {cite_id}\n"
        text += f"    Content: {source.get('full_content', source['preview'])}\n\n"
    return text


class CitationLinker:
    """
    Post-processes LLM responses to convert citation markers into clickable links.
    Creates structured output with citation metadata.
    """

    def __init__(self):
        self.citation_pattern = re.compile(r"\[(c\d+\.\d+\.\d+(?:,\s*c\d+\.\d+\.\d+)*)\]")

    def extract_citations_from_response(self, text: str) -> List[str]:
        """Extract all citation IDs from response text."""
        matches = self.citation_pattern.findall(text)
        citation_ids = []
        for match in matches:
            ids = [cid.strip() for cid in match.split(",")]
            citation_ids.extend(ids)
        return list(set(citation_ids))

    def link_citations(self, response: str, retrieved_chunks: List[Document]) -> Dict[str, Any]:
        """Post-process response to link citations with source documents."""
        citation_lookup: Dict[str, Dict] = {}
        for chunk in retrieved_chunks:
            citation_id = chunk.metadata.get("citation_id")
            if citation_id:
                citation_lookup[citation_id] = {
                    "page":         chunk.metadata.get("page_number"),
                    "paragraph_id": chunk.metadata.get("paragraph_id"),
                    "section":      chunk.metadata.get("section_title"),
                    "bbox":         chunk.metadata.get("citation_bbox"),
                    "preview":      chunk.page_content[:200],
                    "full_content": chunk.page_content,
                }

        cited_ids = self.extract_citations_from_response(response)
        citations = [
            {"id": cid, "source": citation_lookup[cid]}
            for cid in cited_ids
            if cid in citation_lookup
        ]

        return {
            "response":       response,
            "citations":      citations,
            "citation_count": len(citations),
            "sources":        citation_lookup,
        }


def generate_answer_with_citations(
    prompt: str,
    model_id: str,
    api_key: str,
    retrieved_chunks: List[Document],
    temperature: float = 0.3,
    max_tokens: int = 500,
) -> dict:
    """Generate an answer and post-process it with citation links."""
    response = generate_answer(
        prompt=prompt,
        model_id=model_id,
        api_key=api_key,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    linker = CitationLinker()
    linked_response = linker.link_citations(response, retrieved_chunks)
    formatted = citation_formatter(
        linked_response["response"],
        linked_response["citations"],
        linked_response["sources"],
    )
    return {
        "raw_response":    response,
        "linked_response": linked_response,
        "formatted":       formatted,
    }


def rag_pipeline_citation(vector_store: FAISS, user_question: str, system_prompt: str) -> dict:
    """Complete Phase 2 RAG pipeline: Retrieve → Format → Generate (with citations)."""
    print("\n" + "=" * 60)
    print("RAG PIPELINE EXECUTION")
    print("=" * 60)

    try:
        print("\n[Step 1/3] Retrieving relevant chunks...")
        retrieved_chunks = retrieval_with_citations(vector_store, user_question, k=TOP_K_RESULTS)
        print(f"✅ Retrieved {len(retrieved_chunks)} chunks")

        print("\n[Step 2/3] Formatting prompt...")
        prompt = format_citation_aware_prompt(user_question, retrieved_chunks, system_prompt)
        print("✅ Prompt formatted")

        print("\n[Step 3/3] Calling LLM API for answer generation...")
        result = generate_answer_with_citations(
            prompt=prompt,
            model_id=HF_MODEL_ID,
            api_key=HF_TOKEN,
            retrieved_chunks=retrieved_chunks,
            temperature=LLM_TEMPERATURE,
            max_tokens=LLM_MAX_TOKENS,
        )
        print("✅ Answer generated successfully")

        return {
            "question":     user_question,
            "answer":       result["linked_response"]["response"],
            "citations":    result["linked_response"]["citations"],
            "sources":      retrieved_chunks,
            "formatted":    result["formatted"],
            "source_count": len(retrieved_chunks),
        }
    except Exception as e:
        print(f"\n❌ Error in RAG pipeline: {e}")
        raise


# ===========================================================================
# Phase 3 — LLM-as-a-Judge
# ===========================================================================

# --- Data Structures ---

@dataclass
class ClaimEvaluation:
    """Result of evaluating a single claim against its cited source."""
    claim_text:    str
    citation_ids:  List[str]
    support_level: str    # "supported" | "partial" | "unsupported" | "contradicted" | "uncited"
    confidence:    float  # 0.0–1.0
    reasoning:     str


@dataclass
class EvaluationResult:
    """Complete evaluation of an LLM response."""
    overall_confidence:  float
    claim_evaluations:   List[ClaimEvaluation]
    total_claims:        int
    supported_count:     int
    partial_count:       int
    unsupported_count:   int
    contradicted_count:  int
    uncited_count:       int
    evaluator_model:     str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "overall_confidence": self.overall_confidence,
            "total_claims":       self.total_claims,
            "supported":          self.supported_count,
            "partial":            self.partial_count,
            "unsupported":        self.unsupported_count,
            "contradicted":       self.contradicted_count,
            "uncited":            self.uncited_count,
            "evaluator_model":    self.evaluator_model,
            "claims":             [asdict(c) for c in self.claim_evaluations],
        }


# --- Claim Extraction ---

CITATION_PATTERN = re.compile(r"\[(c\d+\.\d+\.\d+(?:,\s*c\d+\.\d+\.\d+)*)\]")


def _extract_citation_ids(text: str) -> List[str]:
    """Extract all citation IDs from a text string, preserving order and deduplicating."""
    matches = CITATION_PATTERN.findall(text)
    citation_ids = []
    for match in matches:
        ids = [cid.strip() for cid in match.split(",")]
        citation_ids.extend(ids)
    seen: set = set()
    unique = []
    for cid in citation_ids:
        if cid not in seen:
            seen.add(cid)
            unique.append(cid)
    return unique


def extract_claims(response_text: str) -> List[Dict[str, Any]]:
    """
    Split an LLM response into individual claims with associated citation IDs.

    Returns:
        List of dicts: [{"text": str, "citation_ids": List[str]}, ...]
    """
    sentences = re.split(r"(?<=[.!?])\s+", response_text.strip())
    claims: List[Dict[str, Any]] = []
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) < 10 and claims:
            claims[-1]["text"] += " " + sentence
            merged_ids = _extract_citation_ids(claims[-1]["text"])
            claims[-1]["citation_ids"] = merged_ids
            claims[-1]["text"] = CITATION_PATTERN.sub("", claims[-1]["text"]).strip()
            continue
        citation_ids = _extract_citation_ids(sentence)
        clean_text = CITATION_PATTERN.sub("", sentence).strip()
        clean_text = re.sub(r"\s+([.!?,;:])", r"\1", clean_text)
        if clean_text:
            claims.append({"text": clean_text, "citation_ids": citation_ids})
    return claims


# --- Evaluation ---

EVALUATION_SYSTEM_PROMPT = """You are a fact-checking assistant. Your job is to evaluate whether claims are supported by provided source texts.

For each claim you receive, output a JSON object with these exact fields:
- "claim_index": the integer index of the claim (as given)
- "support_level": one of exactly "supported", "partial", "unsupported", or "contradicted"
- "confidence": a float between 0.0 and 1.0
- "reasoning": one or two sentences explaining your decision

Output ONLY a valid JSON array of these objects. Do not include any explanation, markdown, or other text outside the JSON array."""


def build_evaluation_prompt(claims: List[Dict[str, Any]], citation_lookup: Dict[str, Dict]) -> str:
    """Build the user-turn prompt for the evaluator LLM."""
    prompt = "Evaluate the following claims against their sources:\n"
    claim_index = 0
    for claim in claims:
        if not claim["citation_ids"]:
            continue
        claim_index += 1
        prompt += f"\n---\nClaim {claim_index}: {claim['text']}\n"
        for cid in claim["citation_ids"]:
            if cid in citation_lookup:
                source  = citation_lookup[cid]
                content = source.get("full_content", source.get("preview", ""))
                if len(content) > 500:
                    content = content[:500] + "..."
                prompt += f"Source ({cid}): {content}\n"
    prompt += f"\nReturn a JSON array with {claim_index} objects, one per claim."
    return prompt


def _parse_evaluation_response(raw: str) -> List[Dict]:
    """Parse evaluator LLM response as JSON with fallbacks."""
    try:
        parsed = json.loads(raw.strip())
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            for v in parsed.values():
                if isinstance(v, list):
                    return v
    except (json.JSONDecodeError, ValueError):
        pass

    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group())
            if isinstance(parsed, list):
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass

    print("  ⚠️  Could not parse evaluator response as JSON. Using default scores.")
    return []


def _build_result(evaluations: List[ClaimEvaluation], model_id: str) -> EvaluationResult:
    """Build an EvaluationResult from a list of ClaimEvaluations."""
    supported    = sum(1 for e in evaluations if e.support_level == "supported")
    partial      = sum(1 for e in evaluations if e.support_level == "partial")
    unsupported  = sum(1 for e in evaluations if e.support_level == "unsupported")
    contradicted = sum(1 for e in evaluations if e.support_level == "contradicted")
    uncited      = sum(1 for e in evaluations if e.support_level == "uncited")
    cited_evals  = [e for e in evaluations if e.support_level != "uncited"]
    overall      = sum(e.confidence for e in cited_evals) / len(cited_evals) if cited_evals else 0.0
    return EvaluationResult(
        overall_confidence=round(overall, 2),
        claim_evaluations=evaluations,
        total_claims=len(evaluations),
        supported_count=supported,
        partial_count=partial,
        unsupported_count=unsupported,
        contradicted_count=contradicted,
        uncited_count=uncited,
        evaluator_model=model_id,
    )


def evaluate_claims(
    claims: List[Dict[str, Any]],
    citation_lookup: Dict[str, Dict],
    model_id: str,
    api_key: str,
    temperature: float = 0.1,
    max_tokens: int = 1000,
) -> EvaluationResult:
    """Send claims to the evaluator LLM and parse structured results."""
    cited_claims   = [c for c in claims if c["citation_ids"]]
    uncited_claims = [c for c in claims if not c["citation_ids"]]

    evaluations: List[ClaimEvaluation] = []
    for claim in uncited_claims:
        evaluations.append(ClaimEvaluation(
            claim_text=claim["text"],
            citation_ids=[],
            support_level="uncited",
            confidence=0.0,
            reasoning="No citation provided for this claim.",
        ))

    if not cited_claims:
        return _build_result(evaluations, model_id)

    user_prompt = build_evaluation_prompt(cited_claims, citation_lookup)
    client = InferenceClient(api_key=api_key)
    completion = client.chat.completions.create(
        model=model_id,
        messages=[
            {"role": "system", "content": EVALUATION_SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    raw_response = completion.choices[0].message.content
    eval_data = _parse_evaluation_response(raw_response)

    for i, claim in enumerate(cited_claims):
        claim_idx = i + 1
        match = next((item for item in eval_data if item.get("claim_index") == claim_idx), None)
        if match is None:
            match = next((item for item in eval_data if item.get("claim_index") == i), None)
        if match is None and i < len(eval_data):
            match = eval_data[i]

        if match:
            support = match.get("support_level", "partial")
            if support not in ("supported", "partial", "unsupported", "contradicted"):
                support = "partial"
            conf = max(0.0, min(1.0, float(match.get("confidence", 0.5))))
            evaluations.append(ClaimEvaluation(
                claim_text=claim["text"],
                citation_ids=claim["citation_ids"],
                support_level=support,
                confidence=conf,
                reasoning=match.get("reasoning", "No reasoning provided."),
            ))
        else:
            evaluations.append(ClaimEvaluation(
                claim_text=claim["text"],
                citation_ids=claim["citation_ids"],
                support_level="partial",
                confidence=0.5,
                reasoning="Evaluator did not return a result for this claim.",
            ))

    return _build_result(evaluations, model_id)


def run_evaluation(
    response_text: str,
    citation_lookup: Dict[str, Dict],
    model_id: str,
    api_key: str,
    temperature: float = 0.1,
    max_tokens: int = 1000,
) -> Optional[EvaluationResult]:
    """Top-level entry point: extract claims, evaluate, return results. Never crashes."""
    try:
        claims = extract_claims(response_text)
        if not claims:
            print("  ⚠️  No claims extracted from response. Skipping evaluation.")
            return None
        cited_count   = sum(1 for c in claims if c["citation_ids"])
        uncited_count = sum(1 for c in claims if not c["citation_ids"])
        print(f"  Extracted {len(claims)} claims ({cited_count} cited, {uncited_count} uncited)")
        return evaluate_claims(
            claims=claims,
            citation_lookup=citation_lookup,
            model_id=model_id,
            api_key=api_key,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as e:
        print(f"  ⚠️  Evaluation failed: {e}")
        return None


def format_evaluation(evaluation: EvaluationResult) -> str:
    """Format an EvaluationResult as a plain-text confidence report."""
    LEVEL_LABELS = {
        "supported":    "SUPPORTED",
        "partial":      "PARTIAL",
        "unsupported":  "UNSUPPORTED",
        "contradicted": "CONTRADICTED",
        "uncited":      "UNCITED",
    }
    text  = "=" * 60 + "\n"
    text += f"CONFIDENCE EVALUATION (Overall: {evaluation.overall_confidence:.2f})\n"
    text += "=" * 60 + "\n\n"
    for i, claim in enumerate(evaluation.claim_evaluations, 1):
        label    = LEVEL_LABELS.get(claim.support_level, claim.support_level.upper())
        conf_str = f"{claim.confidence:.2f}" if claim.support_level != "uncited" else "N/A"
        text += f"[{i}] {label} ({conf_str})\n"
        text += f"    Claim: {claim.claim_text[:120]}\n"
        text += f"    Reason: {claim.reasoning}\n\n"
    return text


def generate_answer_with_citations_phase3(
    prompt: str,
    model_id: str,
    api_key: str,
    retrieved_chunks: List[Document],
    temperature: float = 0.3,
    max_tokens: int = 500,
    enable_evaluation: bool = True,
) -> dict:
    """Generate an answer with citations and optional LLM-as-a-judge evaluation."""
    response = generate_answer(
        prompt=prompt, model_id=model_id, api_key=api_key,
        temperature=temperature, max_tokens=max_tokens,
    )
    linker = CitationLinker()
    linked_response = linker.link_citations(response, retrieved_chunks)

    evaluation = None
    if enable_evaluation:
        print("\n  [Phase 3] Running uncertainty evaluation...")
        evaluation = run_evaluation(
            response_text=linked_response["response"],
            citation_lookup=linked_response["sources"],
            model_id=model_id,
            api_key=api_key,
        )
        if evaluation:
            print(f"  [Phase 3] Overall confidence: {evaluation.overall_confidence:.2f}")

    formatted = citation_formatter(
        linked_response["response"],
        linked_response["citations"],
        linked_response["sources"],
    )
    if evaluation:
        formatted += "\n" + format_evaluation(evaluation)

    return {
        "raw_response":    response,
        "linked_response": linked_response,
        "formatted":       formatted,
        "evaluation":      evaluation.to_dict() if evaluation else None,
    }


def rag_pipeline_phase3(vector_store: FAISS, user_question: str, system_prompt: str) -> dict:
    """Complete Phase 3 RAG pipeline: Retrieve → Format → Generate + Cite + Evaluate."""
    print("\n" + "=" * 60)
    print("PHASE 3 RAG PIPELINE EXECUTION")
    print("=" * 60)

    try:
        print("\n[Step 1/3] Retrieving relevant chunks with citation metadata...")
        retrieved_chunks = retrieval_with_citations(vector_store, user_question, k=TOP_K_RESULTS)
        print(f"✅ Retrieved {len(retrieved_chunks)} chunks")

        print("\n[Step 2/3] Formatting citation-aware prompt...")
        prompt = format_citation_aware_prompt(user_question, retrieved_chunks, system_prompt)
        print("✅ Prompt formatted")

        print("\n[Step 3/3] Generating answer and running evaluation...")
        result = generate_answer_with_citations_phase3(
            prompt=prompt,
            model_id=HF_MODEL_ID,
            api_key=HF_TOKEN,
            retrieved_chunks=retrieved_chunks,
            temperature=LLM_TEMPERATURE,
            max_tokens=LLM_MAX_TOKENS,
            enable_evaluation=True,
        )
        print("✅ Answer generated and evaluated")

        return {
            "question":     user_question,
            "answer":       result["linked_response"]["response"],
            "citations":    result["linked_response"]["citations"],
            "sources":      retrieved_chunks,
            "formatted":    result["formatted"],
            "evaluation":   result["evaluation"],
            "source_count": len(retrieved_chunks),
        }
    except Exception as e:
        print(f"\n❌ Error in Phase 3 pipeline: {e}")
        raise


# ===========================================================================
# Main — Demo run through all three phases
# ===========================================================================

if __name__ == "__main__":
    # 1. Download PDF
    download_pdf(PDF_DRIVE_URL, PDF_PATH)

    # 2. Load & chunk (Phase 1 — plain chunks)
    documents = load_pdf(PDF_PATH)
    chunks    = chunk_documents(documents, chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    inspect_chunks(chunks)

    # 3. Build vector store
    vector_store = create_vector_store(chunks, EMBEDDING_MODEL)
    save_vector_store(vector_store, FAISS_INDEX_PATH)

    # ── Phase 1 demo ────────────────────────────────────────────────────────
    q1     = "What are the key takeaways of the 2026 Budget?"
    result = rag_pipeline(vector_store, q1, SYSTEM_PROMPT, model_config)
    display_result(result)

    # ── Phase 2 demo — citation-aware chunks ────────────────────────────────
    documents = load_pdf(PDF_PATH)
    chunks    = chunk_documents_citation(
        documents, chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP, pdf_path=PDF_PATH
    )
    vector_store = create_vector_store(chunks, EMBEDDING_MODEL)
    save_vector_store(vector_store, FAISS_INDEX_PATH)

    q2     = "What is the budget allocation for 2026?"
    result = rag_pipeline_citation(vector_store, q2, SYSTEM_PROMPT)
    print("CHATBOT RESPONSE")
    print(f"Question: \n {result['question']}\n")
    print(f"Answer: \n")
    print(result["formatted"])

    # ── Phase 3 demo — LLM-as-a-Judge ───────────────────────────────────────
    q3     = "What did Prime Minister Wong say about AI with regards to Singapore?"
    result = rag_pipeline_phase3(vector_store, q3, SYSTEM_PROMPT)

    print("\n" + "=" * 60)
    print("CHATBOT RESPONSE")
    print("=" * 60)
    print(f"\nQuestion: {result['question']}\n")
    print(result["formatted"])

    if result.get("evaluation"):
        ev = result["evaluation"]
        print("=" * 60)
        print("CONFIDENCE SUMMARY")
        print("=" * 60)
        print(f"Overall Confidence : {ev['overall_confidence']:.2f}")
        print(
            f"Claims             : {ev['total_claims']} total  |  "
            f"{ev['supported']} supported  |  "
            f"{ev['partial']} partial  |  "
            f"{ev['unsupported']} unsupported  |  "
            f"{ev['uncited']} uncited"
        )
