import { FileText, Trash2 } from "lucide-react";
import { deleteDocument } from "../utils/api";

export default function DocumentList({ documents, onDelete }) {
  const handleDelete = async (docId) => {
    try {
      await deleteDocument(docId);
      onDelete(docId);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  if (!documents.length) {
    return (
      <div className="text-center py-8 text-stone-400">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-xs">No documents yet</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li
          key={doc.document_id}
          className="flex items-start justify-between gap-2 bg-orange-50 border border-orange-100
            rounded-lg px-3 py-2.5 group"
        >
          <div className="flex items-start gap-2 min-w-0">
            <FileText className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-700 truncate">{doc.filename}</p>
              <p className="text-xs text-stone-400">{doc.num_chunks} chunks</p>
            </div>
          </div>
          <button
            onClick={() => handleDelete(doc.document_id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
          </button>
        </li>
      ))}
    </ul>
  );
}
