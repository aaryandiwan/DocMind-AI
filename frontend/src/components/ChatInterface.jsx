import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User, BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { queryDocuments } from "../utils/api";

export default function ChatInterface({ documents }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const conversationHistory = messages
    .filter((m) => m.role !== "system")
    .reduce((acc, msg, idx, arr) => {
      if (msg.role === "user" && arr[idx + 1]?.role === "assistant") {
        acc.push({ human: msg.content, ai: arr[idx + 1].content });
      }
      return acc;
    }, []);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;
    if (!documents.length) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const result = await queryDocuments({
        question,
        documentIds: documents.map((d) => d.document_id),
        conversationHistory,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.answer,
          sources: result.sources,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again.", sources: [] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.length === 0 && (
          <div className="text-center text-stone-400 mt-12 space-y-2">
            <Bot className="w-10 h-10 mx-auto opacity-40" />
            <p className="text-sm">Ask anything about your uploaded documents</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-4 h-4 text-orange-600" />
              </div>
            )}

            <div className={`max-w-[80%] space-y-2 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
              <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed
                ${msg.role === "user"
                  ? "bg-orange-600 text-white rounded-tr-sm"
                  : "bg-stone-100 text-stone-800 rounded-tl-sm"
                }`}
              >
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>

              {/* Source citations */}
              {msg.sources?.length > 0 && (
                <div className="space-y-1 w-full">
                  <p className="text-xs text-stone-400 flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> Sources
                  </p>
                  {msg.sources.map((src, si) => (
                    <div key={si} className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="font-medium text-amber-800">{src.filename}</span>
                      {src.page && <span className="text-amber-600"> · p.{src.page}</span>}
                      <p className="text-stone-500 mt-0.5 line-clamp-2">{src.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center shrink-0 mt-1">
                <User className="w-4 h-4 text-stone-600" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-orange-600" />
            </div>
            <div className="bg-stone-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-stone-200">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={documents.length ? "Ask a question about your documents..." : "Upload a document first"}
            disabled={!documents.length || loading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-stone-300 px-4 py-2.5 text-sm
              focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !documents.length || loading}
            className="w-10 h-10 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-40
              disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
        <p className="text-xs text-stone-400 mt-1.5 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
