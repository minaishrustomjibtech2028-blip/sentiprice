import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Database, Send, Sparkles, User } from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { CopilotAnswer } from "@/types/copilot";

interface Turn {
  id: number;
  role: "user" | "assistant";
  text: string;
  answer?: CopilotAnswer;
}

async function fetchSuggestions(): Promise<string[]> {
  const { data } = await api.get<string[]>("/copilot/suggestions");
  return data;
}

export default function CopilotPage() {
  const { user } = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const seq = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: suggestions } = useQuery({ queryKey: ["copilot-suggestions"], queryFn: fetchSuggestions });

  const ask = useMutation({
    mutationFn: async (question: string) => (await api.post<CopilotAnswer>("/copilot/ask", { question })).data,
    onSuccess: (answer) => {
      setTurns((t) => [...t, { id: ++seq.current, role: "assistant", text: answer.answer, answer }]);
    },
    onError: () => {
      setTurns((t) => [...t, { id: ++seq.current, role: "assistant", text: "Sorry, something went wrong answering that. Please try again." }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, ask.isPending]);

  function send(question: string) {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setTurns((t) => [...t, { id: ++seq.current, role: "user", text: q }]);
    setInput("");
    ask.mutate(q);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-108px)] max-w-3xl flex-col px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Bot size={22} className="text-amz-link" />
        <div>
          <h1 className="text-lg font-bold">AI Copilot</h1>
          <p className="text-xs text-amz-muted">Answers are computed from your live product, review, pricing and inventory data — not a generic chatbot.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-amz-border bg-white p-4">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Sparkles size={28} className="mb-2 text-amz-orange" />
            <p className="font-semibold">Ask me anything about your catalogue</p>
            <p className="mt-1 max-w-sm text-sm text-amz-muted">
              Try a product name, or one of the suggestions below. As {user && <>a <strong>{user.role.replace("_", " ").toLowerCase()}</strong></>}, you'll see the data your role is allowed to access.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {turns.map((t) => (
            <div key={t.id} className={`flex gap-2 ${t.role === "user" ? "flex-row-reverse" : ""}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${t.role === "user" ? "bg-amz-navy3 text-white" : "bg-amz-soft text-amz-navy2"}`}>
                {t.role === "user" ? <User size={14} /> : <Bot size={14} />}
              </span>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${t.role === "user" ? "bg-amz-navy3 text-white" : "border border-amz-border bg-amz-soft"}`}>
                <p>{t.text}</p>
                {t.answer?.table && (
                  <div className="mt-2 overflow-x-auto rounded border border-amz-border bg-white">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-amz-border text-amz-muted">
                          {t.answer.table.columns.map((c) => <th key={c} className="px-2 py-1.5">{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {t.answer.table.rows.map((row, i) => (
                          <tr key={i} className="border-b border-amz-border last:border-0">
                            {row.map((cell, j) => <td key={j} className="px-2 py-1.5">{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {t.answer?.product_id && (
                  <Link to={`/products/${t.answer.product_id}`} className="amz-link mt-2 inline-block text-xs">View product →</Link>
                )}
                {!!t.answer?.sources.length && (
                  <p className="mt-2 flex items-center gap-1 text-[10px] text-amz-muted">
                    <Database size={10} /> Sources: {t.answer.sources.join(", ")}
                  </p>
                )}
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="flex gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amz-soft text-amz-navy2"><Bot size={14} /></span>
              <div className="flex items-center gap-1 rounded-lg border border-amz-border bg-amz-soft px-3 py-2">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-amz-muted" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {!!suggestions?.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} className="rounded-full border border-amz-border bg-white px-3 py-1 text-xs hover:bg-amz-soft">
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a product, sentiment, demand, price or alerts…"
          className="amz-input"
        />
        <button type="submit" disabled={ask.isPending || !input.trim()} className="btn btn-orange px-4">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
