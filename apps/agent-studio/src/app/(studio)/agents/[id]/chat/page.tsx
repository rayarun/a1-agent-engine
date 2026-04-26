"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  Send,
  Loader2,
  ChevronDown,
  ChevronRight,
  Wrench,
  Bot,
  Terminal,
  AlertCircle,
} from "lucide-react";
import { agentsApi } from "@/lib/api";
import { ChatEvent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const API_GATEWAY = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:8080";
const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "default-tenant";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  events?: ChatEvent[];
  streaming?: boolean;
}

function ToolCallBlock({ event }: { event: ChatEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-1 rounded border border-border/50 bg-muted/30 text-xs font-mono overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <Wrench className="h-3 w-3 text-yellow-400 shrink-0" />
        <span className="text-yellow-400">{event.tool_name}</span>
        <span className="text-muted-foreground ml-auto">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/50 px-3 py-2 space-y-2">
          {event.tool_args !== undefined && (
            <div>
              <div className="text-muted-foreground mb-1">args</div>
              <pre className="text-foreground/80 whitespace-pre-wrap">
                {JSON.stringify(event.tool_args, null, 2)}
              </pre>
            </div>
          )}
          {event.tool_result !== undefined && (
            <div>
              <div className="text-green-400 mb-1">result</div>
              <pre className="text-foreground/80 whitespace-pre-wrap">
                {typeof event.tool_result === "string"
                  ? event.tool_result
                  : JSON.stringify(event.tool_result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="my-1 rounded border border-border/30 bg-muted/20 text-xs overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        <Terminal className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground italic">thinking…</span>
        <span className="ml-auto text-muted-foreground/60">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/30 px-3 py-2 font-mono text-muted-foreground whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ message }: { message: Message }) {
  return (
    <div className="group py-4 border-b border-border/20 last:border-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded bg-primary/10 shrink-0">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0 text-sm leading-relaxed">
          {message.events?.map((ev, i) => {
            if (ev.type === "thinking" && ev.content) {
              return <ThinkingBlock key={i} content={ev.content} />;
            }
            if (ev.type === "tool_call") {
              return <ToolCallBlock key={i} event={ev} />;
            }
            return null;
          })}
          {message.content && (
            <div className="whitespace-pre-wrap text-foreground">
              {message.content}
              {message.streaming && (
                <span className="inline-block h-4 w-0.5 bg-primary ml-0.5 animate-pulse" />
              )}
            </div>
          )}
          {message.streaming && !message.content && (
            <span className="inline-block h-4 w-0.5 bg-primary animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="py-4 border-b border-border/20 last:border-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded bg-muted shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">U</span>
        </div>
        <p className="flex-1 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
          {message.content}
        </p>
      </div>
    </div>
  );
}

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: agent } = useQuery({
    queryKey: ["agents", id],
    queryFn: () => agentsApi.get(id),
  });

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const tryWebSocket = useCallback(
    (text: string, assistantId: string, onFallback: () => void) => {
      const wsURL = API_GATEWAY.replace(/^http/, "ws") + `/api/v1/agents/${id}/ws`;
      const ws = new WebSocket(wsURL);
      wsRef.current = ws;

      const timeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.log("WebSocket timeout, falling back to SSE");
          ws.close();
          onFallback();
        }
      }, 2000);

      ws.onopen = () => {
        clearTimeout(timeout);
        console.log("WebSocket connected");
        ws.send(JSON.stringify({ message: text, tenant_id: TENANT_ID }));
      };

      ws.onmessage = (e) => {
        try {
          const event: ChatEvent = JSON.parse(e.data);
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              if (event.type === "text" && event.content) {
                return { ...m, content: m.content + event.content };
              }
              if (event.type === "thinking" || event.type === "tool_call") {
                return { ...m, events: [...(m.events ?? []), event] };
              }
              if (event.type === "done") {
                return { ...m, streaming: false };
              }
              if (event.type === "error") {
                return {
                  ...m,
                  content: m.content || `Error: ${event.content}`,
                  streaming: false,
                };
              }
              return m;
            })
          );

          if (event.type === "done" || event.type === "error") {
            ws.close();
            setStreaming(false);
          }
        } catch {
          // malformed JSON data — ignore
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        console.log("WebSocket error, falling back to SSE");
        ws.close();
        onFallback();
      };
    },
    [id]
  );

  const useSSEFallback = useCallback(
    (text: string, assistantId: string) => {
      console.log("Using SSE fallback");
      const sseURL = `${API_GATEWAY}/api/v1/agents/${id}/chat`;

      // Send initial message via POST to start streaming
      fetch(sseURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT_ID,
        },
        body: JSON.stringify({ message: text, tenant_id: TENANT_ID }),
      })
        .then((resp) => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const reader = resp.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          const processStream = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                const lines = text.split("\n");

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    try {
                      const event: ChatEvent = JSON.parse(line.slice(6));
                      setMessages((prev) =>
                        prev.map((m) => {
                          if (m.id !== assistantId) return m;
                          if (event.type === "text" && event.content) {
                            return { ...m, content: m.content + event.content };
                          }
                          if (event.type === "thinking" || event.type === "tool_call") {
                            return { ...m, events: [...(m.events ?? []), event] };
                          }
                          if (event.type === "done") {
                            return { ...m, streaming: false };
                          }
                          if (event.type === "error") {
                            return {
                              ...m,
                              content: m.content || `Error: ${event.content}`,
                              streaming: false,
                            };
                          }
                          return m;
                        })
                      );

                      if (event.type === "done" || event.type === "error") {
                        setStreaming(false);
                        return;
                      }
                    } catch {
                      // malformed JSON — ignore
                    }
                  }
                }
              }
            } catch (err) {
              console.error("SSE stream error:", err);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: m.content || "Connection error during streaming",
                        streaming: false,
                      }
                    : m
                )
              );
              setStreaming(false);
            }
          };

          processStream();
        })
        .catch((err) => {
          console.error("SSE setup error:", err);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: m.content || "Connection error. Is the API gateway running on :8080?",
                    streaming: false,
                  }
                : m
            )
          );
          setStreaming(false);
        });
    },
    [id]
  );

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      events: [],
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    // Try WebSocket first, fall back to SSE
    tryWebSocket(text, assistantId, () => useSSEFallback(text, assistantId));
  }, [id, input, streaming, tryWebSocket, useSSEFallback]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  return (
    <div className="flex flex-col h-full font-mono">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Link href={`/agents/${id}`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-7 px-2">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{agent?.name ?? id}</span>
          {agent?.status === "active" && (
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
          )}
        </div>
        {agent && (
          <span className="text-xs text-muted-foreground ml-1">
            {agent.model}
          </span>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-8 py-2"
      >
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
              <Bot className="h-10 w-10 mb-4 opacity-20" />
              <p className="text-sm font-sans">
                Start a conversation with <strong className="text-foreground">{agent?.name ?? "this agent"}</strong>
              </p>
              {agent?.system_prompt && (
                <p className="text-xs mt-2 max-w-sm opacity-60 font-sans">
                  {agent.system_prompt.slice(0, 120)}
                  {agent.system_prompt.length > 120 ? "…" : ""}
                </p>
              )}
            </div>
          )}

          {messages.map((msg) =>
            msg.role === "user" ? (
              <UserMessage key={msg.id} message={msg} />
            ) : (
              <AssistantMessage key={msg.id} message={msg} />
            )
          )}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border/50 px-4 md:px-8 py-4">
        <div className="max-w-3xl mx-auto">
          {agent?.status !== "active" && (
            <div className="flex items-center gap-2 text-xs text-yellow-400 mb-3">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="font-sans">Agent is not active. Deploy it first.</span>
            </div>
          )}
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message agent… (Enter to send, Shift+Enter for newline)"
              rows={3}
              disabled={streaming || agent?.status !== "active"}
              className={cn(
                "resize-none pr-12 font-mono text-sm leading-relaxed",
                "bg-card border-border/60 focus-visible:ring-1 focus-visible:ring-primary/50",
                "placeholder:text-muted-foreground/40 placeholder:font-sans"
              )}
            />
            <Button
              size="sm"
              onClick={sendMessage}
              disabled={!input.trim() || streaming || agent?.status !== "active"}
              className="absolute bottom-3 right-3 h-7 w-7 p-0"
            >
              {streaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/40 mt-2 font-sans">
            ↵ send · ⇧↵ newline
          </p>
        </div>
      </div>
    </div>
  );
}
