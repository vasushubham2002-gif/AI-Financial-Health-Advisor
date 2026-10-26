import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '../api.ts';
import type { ChatMessage, UserProfile } from '../types.ts';
import { Card, ErrorBox, Spinner, inputClass, primaryButton } from './ui.tsx';

const SUGGESTIONS = [
  'How do I get my CIBIL score above 750?',
  'Should I close my personal loan early?',
  'What is the difference between closed and settled?',
];

const greeting = (name: string): ChatMessage => ({
  role: 'model',
  content: `Hello ${name.split(' ')[0]}! I'm Shubham Vasu, your credit advisor. Ask me anything about your CIBIL score, EMIs or loans.`,
});

export default function ChatBot({ profile }: { profile: UserProfile }) {
  const [messages, setMessages] = useState<ChatMessage[]>([greeting(profile.name)]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Start a fresh conversation when the user switches profile.
  useEffect(() => {
    setMessages([greeting(profile.name)]);
    setError(null);
  }, [profile.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || loading) return;
    const history = messages;
    setMessages([...history, { role: 'user', content: message }]);
    setInput('');
    setLoading(true);
    setError(null);
    try {
      const reply = await api.chat(message, profile.id, history);
      setMessages((m) => [...m, { role: 'model', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the advisor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Chat with Shubham Vasu (AI credit advisor)">
      <div className="h-96 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-800 shadow-sm'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && <Spinner label="Shubham is typing…" />}
        <div ref={endRef} />
      </div>

      {error && <div className="mt-3"><ErrorBox message={error} /></div>}

      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
            {s}
          </button>
        ))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input className={inputClass} placeholder="Type your question…" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className={primaryButton} type="submit" disabled={loading || !input.trim()} aria-label="Send">
          <Send className="h-4 w-4" />
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-400">AI-generated guidance for education only, not financial advice.</p>
    </Card>
  );
}
