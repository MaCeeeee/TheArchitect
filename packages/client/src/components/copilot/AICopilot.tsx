import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Sparkles, Send, ClipboardCheck, AlertTriangle, BookOpen, Lightbulb,
  Loader2, RotateCcw, Trash2, AlertCircle, MessageSquare,
  ShieldAlert,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useAdvisorStore } from '../../stores/advisorStore';
import AdvisorPanel from './AdvisorPanel';

// ─── Types ───

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

type Tab = 'chat' | 'advisor';

// ─── Quick Actions ───

const QUICK_ACTIONS = [
  {
    label: 'Review Architecture',
    icon: ClipboardCheck,
    prompt: 'Review my current architecture. What is well-structured and what needs improvement? Focus on the most impactful issues.',
  },
  {
    label: 'What\'s Missing?',
    icon: AlertTriangle,
    prompt: 'Analyze what is missing from my architecture. Which element types or connections should I add? Are there orphaned elements or gaps between layers?',
  },
  {
    label: 'TOGAF Guide',
    icon: BookOpen,
    prompt: 'I am new to TOGAF. Based on my current project, explain which ADM phase I am likely in and what I should focus on next. Keep it simple and practical.',
  },
  {
    label: 'Next Steps',
    icon: Lightbulb,
    prompt: 'Based on the current state of my architecture, what are the 3 most important things I should do next? Be specific about which elements to add or modify.',
  },
] as const;

// ─── Lightweight Markdown Renderer ───

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const result: JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      result.push(
        <ul key={`ul-${result.length}`} className="list-disc list-inside space-y-0.5 my-1">
          {listItems.map((item, i) => (
            <li key={i} className="text-[11px] leading-relaxed">{formatInline(item)}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      flushList();
      result.push(<h4 key={i} className="text-[11px] font-bold text-white mt-2 mb-0.5">{formatInline(line.slice(4))}</h4>);
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      result.push(<h3 key={i} className="text-xs font-bold text-white mt-2 mb-0.5">{formatInline(line.slice(3))}</h3>);
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      listItems.push(line.replace(/^[-*]\s/, ''));
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      listItems.push(line.replace(/^\d+\.\s/, ''));
      continue;
    }

    flushList();

    if (line.trim() === '') {
      result.push(<div key={i} className="h-1" />);
      continue;
    }

    result.push(<p key={i} className="text-[11px] leading-relaxed my-0.5">{formatInline(line)}</p>);
  }
  flushList();

  return result;
}

function formatInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-white">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<code key={match.index} className="bg-[#1a2a1a] text-[#d0d0d0] px-1 rounded text-[10px]">{match[3]}</code>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

// ─── Main Component ───

export default function AICopilot() {
  const { projectId } = useParams();
  const token = useAuthStore((s) => s.token);
  const [activeTab, setActiveTab] = useState<Tab>('advisor');
  const advisorInsights = useAdvisorStore((s) => s.insights);
  const advisorBadge = advisorInsights.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Active standard context for chat
  const [chatStandardId, setChatStandardId] = useState<string | undefined>();
  const [chatSectionIds, setChatSectionIds] = useState<string[]>([]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async (content: string, standardId?: string, sectionIds?: string[]) => {
    if (!projectId || !content.trim() || isStreaming) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: content.trim() };
    const assistantMsg: Message = { id: `a-${Date.now()}`, role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setError(null);
    setIsStreaming(true);

    // Track what standard context is being used
    if (standardId) {
      setChatStandardId(standardId);
      setChatSectionIds(sectionIds || []);
    }

    const allMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const body: Record<string, unknown> = { messages: allMessages };
      if (standardId || chatStandardId) {
        body.standardId = standardId || chatStandardId;
        body.sectionIds = sectionIds || chatSectionIds;
      }

      const response = await fetch(`${apiBase}/projects/${projectId}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || err.error || `Error ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: last.content + parsed.text };
                }
                return updated;
              });
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
              throw e;
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const errMsg = (err as Error).message || 'Request failed';
      setError(errMsg);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [projectId, token, messages, isStreaming, chatStandardId, chatSectionIds]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const clearChat = () => {
    if (isStreaming) {
      abortRef.current?.abort();
    }
    setMessages([]);
    setError(null);
    setIsStreaming(false);
    setChatStandardId(undefined);
    setChatSectionIds([]);
  };

  // Standards → Chat: AI Abgleich
  if (!projectId) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6">
        <Sparkles size={24} className="text-[var(--text-disabled)] mb-2" />
        <p className="text-xs text-[var(--text-tertiary)] text-center">Open a project first to use the AI Copilot.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div className="flex border-b border-[var(--border-subtle)]">
        {([
          { id: 'advisor' as Tab, icon: ShieldAlert, label: 'Advisor', badge: advisorBadge },
          { id: 'chat' as Tab, icon: MessageSquare, label: 'Chat', badge: 0 },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] transition border-b-2 relative ${
              activeTab === tab.id
                ? 'text-white border-[#00ff41]'
                : 'text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)]'
            }`}
          >
            <tab.icon size={12} />
            {tab.label}
            {tab.badge > 0 && (
              <span className="absolute -top-0.5 right-1 bg-red-500 text-white text-[7px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'advisor' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <AdvisorPanel />
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Standard Context Indicator */}
          {chatStandardId && (
            <div className="px-3 py-1.5 bg-[#38bdf8]/5 border-b border-[#38bdf8]/20 flex items-center justify-between">
              <span className="text-[9px] text-[#38bdf8]">
                ISO context active ({chatSectionIds.length} sections)
              </span>
              <button
                onClick={() => { setChatStandardId(undefined); setChatSectionIds([]); }}
                className="text-[9px] text-[var(--text-disabled)] hover:text-white transition"
              >
                Entfernen
              </button>
            </div>
          )}

          {/* Chat Header */}
          <div className="px-3 py-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-white flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#00ff41]" />
              AI Copilot
            </h3>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition p-0.5"
                title="Clear Chat"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {/* Messages / Quick Actions */}
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="p-3 space-y-3">
                <div className="text-center py-3">
                  <Sparkles size={24} className="text-[#00ff41] mx-auto mb-2" />
                  <p className="text-xs text-[var(--text-secondary)]">Wie kann ich dir helfen?</p>
                  <p className="text-[10px] text-[var(--text-disabled)] mt-1">Choose an action or ask a question</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => sendMessage(action.prompt)}
                      disabled={isStreaming}
                      className="flex flex-col items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2.5 text-center hover:border-[#00ff41] hover:bg-[var(--surface-raised)] transition disabled:opacity-50"
                    >
                      <action.icon size={16} className="text-[#00ff41]" />
                      <span className="text-[10px] text-[var(--text-secondary)] leading-tight">{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[90%] rounded-lg px-2.5 py-1.5 ${
                        msg.role === 'user'
                          ? 'bg-[#00ff41] text-black'
                          : 'bg-[var(--surface-base)] text-[#cbd5e1] border border-[var(--border-subtle)]'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <p className="text-[11px] leading-relaxed">{msg.content}</p>
                      ) : msg.content === '' ? (
                        <div className="flex items-center gap-1.5 py-1">
                          <Loader2 size={10} className="animate-spin text-[#00ff41]" />
                          <span className="text-[10px] text-[var(--text-tertiary)]">Thinking...</span>
                        </div>
                      ) : (
                        <div>{renderMarkdown(msg.content)}</div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border-t border-red-500/20 flex items-center gap-2">
              <AlertCircle size={10} className="text-red-400 shrink-0" />
              <span className="text-[10px] text-red-300 flex-1">{error}</span>
              <button
                onClick={() => {
                  setError(null);
                  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                  if (lastUser) sendMessage(lastUser.content);
                }}
                className="text-[10px] text-red-300 hover:text-white underline shrink-0"
              >
                <RotateCcw size={10} />
              </button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border-subtle)] px-2.5 py-1.5 focus-within:border-[#00ff41] transition">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                disabled={isStreaming}
                className="flex-1 bg-transparent text-[11px] text-white placeholder:text-[var(--text-disabled)] outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="text-[#00ff41] hover:text-[#00ff41] disabled:text-[#1a2a1a] transition"
              >
                {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
