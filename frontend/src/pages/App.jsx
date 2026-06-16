import React, { useState } from "react";
import FileUpload from "../components/FileUpload";
import ChatInterface from "../components/ChatInterface";
import DocumentList from "../components/DocumentList";
import { BookOpen } from "lucide-react";

export default function App() {
  const [documents, setDocuments] = useState([]);

  const handleUploadSuccess = (doc) => {
    setDocuments((prev) => [...prev, doc]);
  };

  const handleDelete = (docId) => {
    setDocuments((prev) => prev.filter((d) => d.document_id !== docId));
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-stone-800">DocChat</h1>
          <p className="text-xs text-stone-400">RAG-powered document Q&A</p>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-white border-r border-stone-200 flex flex-col p-4 gap-5 overflow-y-auto shrink-0">
          <section>
            <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
              Upload Document
            </h2>
            <FileUpload onUploadSuccess={handleUploadSuccess} />
          </section>

          <section>
            <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
              Indexed Documents ({documents.length})
            </h2>
            <DocumentList documents={documents} onDelete={handleDelete} />
          </section>
        </aside>

        {/* Chat */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <ChatInterface documents={documents} />
        </main>
      </div>
    </div>
  );
}
