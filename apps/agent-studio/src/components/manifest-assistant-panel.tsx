"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, Sparkles, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { systemAgentsApi } from "@/lib/api";

// Types
interface ChatEvent {
  type: "thinking" | "tool_call" | "tool_result" | "text" | "error" | "done";
  content?: string;
  tool_name?: string;
  tool_args?: unknown;
  tool_result?: unknown;
  timestamp?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  events?: ChatEvent[];
  streaming?: boolean;
}

interface Skill {
  id: string;
  name: string;
  version: string;
  description?: string;
}

interface Tool {
  id: string;
  name: string;
  version: string;
  description?: string;
}

export interface AssistantDraft {
  system_prompt?: string;
  skills?: Array<{ name: string; version: string }>;
  proposed_skills?: unknown[];
  model?: string;
  max_iterations?: number;
}

interface ManifestAssistantPanelProps {
  availableSkills: Skill[];
  availableTools: Tool[];
  onApply: (draft: AssistantDraft) => void;
}

// Components
const ThinkingBlock: React.FC<{ content?: string }> = ({ content }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="mb-3 border border-muted-foreground/20 rounded bg-muted/50 p-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full"
      >
        <ChevronDown
          size={14}
          className={cn("transition-transform", isOpen && "rotate-180")}
        />
        <span className="italic">thinking…</span>
      </button>
      {isOpen && content && (
        <div className="mt-2 text-xs font-mono text-muted-foreground bg-background/50 p-2 rounded overflow-auto max-h-48">
          {content}
        </div>
      )}
    </div>
  );
};

const ToolCallBlock: React.FC<{
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
}> = ({ toolName, toolArgs, toolResult }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="mb-3 border border-yellow-600/30 rounded bg-yellow-50/20 dark:bg-yellow-900/10 p-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-600 hover:text-yellow-800 dark:hover:text-yellow-500 w-full"
      >
        <ChevronDown
          size={14}
          className={cn("transition-transform", isOpen && "rotate-180")}
        />
        <span>Tool: {toolName}</span>
      </button>
      {isOpen && (
        <div className="mt-2 space-y-1">
          {toolArgs && (
            <div>
              <div className="text-[10px] text-muted-foreground">Args:</div>
              <div className="text-xs font-mono bg-background/50 p-1 rounded overflow-auto max-h-32">
                {JSON.stringify(toolArgs, null, 2)}
              </div>
            </div>
          )}
          {toolResult && (
            <div>
              <div className="text-[10px] text-green-700 dark:text-green-600">
                Result:
              </div>
              <div className="text-xs font-mono bg-background/50 p-1 rounded overflow-auto max-h-32">
                {typeof toolResult === "string"
                  ? toolResult
                  : JSON.stringify(toolResult, null, 2)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const UserMessage: React.FC<{ content: string }> = ({ content }) => (
  <div className="mb-4 flex justify-end">
    <div className="max-w-[80%] bg-primary text-primary-foreground rounded-lg p-3 text-sm">
      {content}
    </div>
  </div>
);

const AssistantMessage: React.FC<{ message: Message }> = ({ message }) => (
  <div className="mb-4 flex justify-start">
    <div className="max-w-[80%]">
      {message.events?.map((evt, idx) => {
        if (evt.type === "thinking")
          return (
            <ThinkingBlock key={`evt-${idx}`} content={evt.content} />
          );
        if (evt.type === "tool_call")
          return (
            <ToolCallBlock
              key={`evt-${idx}`}
              toolName={evt.tool_name}
              toolArgs={evt.tool_args}
              toolResult={evt.tool_result}
            />
          );
        return null;
      })}
      <div className="text-sm text-foreground whitespace-pre-wrap break-words bg-muted/30 rounded p-3">
        {message.content}
        {message.streaming && (
          <span className="animate-pulse ml-1">▌</span>
        )}
      </div>
    </div>
  </div>
);

// Utilities
function buildCatalogBlock(skills: Skill[], tools: Tool[]): string {
  const skillLines = skills.map(
    (s) => `  - name: "${s.name}", version: "${s.version}", description: "${s.description || ""}"`
  );
  const toolLines = tools.map(
    (t) => `  - name: "${t.name}", version: "${t.version}", auth_level: "unknown"`
  );

  return `<catalog>
skills:
${skillLines.join("\n")}
tools:
${toolLines.join("\n")}
</catalog>`;
}

function extractAssistantDraft(text: string): AssistantDraft {
  const draft: AssistantDraft = {};

  // Extract system prompt
  const systemPromptMatch = text.match(
    /##\s*System Prompt Draft\s*\n([\s\S]*?)(?=##|\Z)/i
  );
  if (systemPromptMatch) {
    draft.system_prompt = systemPromptMatch[1]
      .trim()
      .split("\n")
      .filter((line) => line.trim())
      .join("\n");
  }

  // Extract recommended skills
  const skillsMatch = text.match(
    /##\s*Recommended Skills\s*\n([\s\S]*?)(?=##|\Z)/i
  );
  if (skillsMatch) {
    const skillsText = skillsMatch[1];
    const skillLines = skillsText
      .split("\n")
      .filter((line) => line.includes("-") || line.includes("•"));

    draft.skills = skillLines
      .map((line) => {
        const nameMatch = line.match(/["`]([^"`]+)["`]|([^\s,]+)/);
        const versionMatch = line.match(/v?(\d+\.\d+\.\d+)/);
        if (nameMatch && versionMatch) {
          return {
            name: (nameMatch[1] || nameMatch[2] || "").toLowerCase(),
            version: versionMatch[1],
          };
        }
        return null;
      })
      .filter(
        (s): s is { name: string; version: string } => s !== null
      );
  }

  return draft;
}

// Main Component
export const ManifestAssistantPanel: React.FC<ManifestAssistantPanelProps> = ({
  availableSkills,
  availableTools,
  onApply,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [applyable, setApplyable] = useState<AssistantDraft | null>(null);
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send message with catalog context
  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input,
    };

    const assistantMessage: Message = {
      id: `msg-${Date.now()}-a`,
      role: "assistant",
      content: "",
      streaming: true,
      events: [],
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setStreaming(true);
    setApplyable(null);

    // Build enriched message with catalog context
    const catalogBlock = buildCatalogBlock(availableSkills, availableTools);
    const enrichedMessage = `${catalogBlock}\n\nUser request: ${input}`;

    try {
      const response = await systemAgentsApi.chat(enrichedMessage);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            try {
              const eventStr = line.slice(5).trim();
              if (!eventStr) continue;

              const event = JSON.parse(eventStr) as ChatEvent;

              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg?.role !== "assistant") return prev;

                const updated = [...prev];
                if (event.type === "thinking") {
                  updated[updated.length - 1] = {
                    ...lastMsg,
                    events: [...(lastMsg.events || []), event],
                  };
                } else if (event.type === "tool_call") {
                  updated[updated.length - 1] = {
                    ...lastMsg,
                    events: [...(lastMsg.events || []), event],
                  };
                } else if (event.type === "text") {
                  updated[updated.length - 1] = {
                    ...lastMsg,
                    content: (lastMsg.content || "") + (event.content || ""),
                  };
                } else if (event.type === "done") {
                  updated[updated.length - 1] = {
                    ...lastMsg,
                    streaming: false,
                  };
                  // Extract draft on completion
                  const draft = extractAssistantDraft(lastMsg.content || "");
                  setApplyable(draft);
                }

                return updated;
              });
            } catch (e) {
              // Silently ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          ...prev[prev.length - 1]!,
          content: "Error communicating with assistant",
          streaming: false,
        },
      ]);
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, availableSkills, availableTools]);

  const handleApply = useCallback(() => {
    if (!applyable) return;
    setApplying(true);
    setTimeout(() => {
      onApply(applyable);
      setApplying(false);
    }, 100);
  }, [applyable, onApply]);

  const handleCopyProposedSkills = useCallback(() => {
    const text = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .join("\n");
    const match = text.match(/##\s*Skills\/Tools to Create([\s\S]*?)(?=##|\Z)/i);
    if (match) {
      navigator.clipboard.writeText(match[1].trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full gap-0 border-l border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Sparkles size={16} className="text-primary" />
        <h3 className="text-sm font-semibold">Manifest Assistant</h3>
      </div>

      {/* Messages Area */}
      <ScrollArea
        ref={scrollRef}
        className="flex-1 px-4 py-3 overflow-y-auto"
      >
        {messages.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <p className="mb-2">👋 Tell me what your agent should do.</p>
            <p className="text-xs">I'll draft a system prompt and recommend skills from your catalog.</p>
          </div>
        )}
        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserMessage key={msg.id} content={msg.content} />
          ) : (
            <AssistantMessage key={msg.id} message={msg} />
          )
        )}
      </ScrollArea>

      {/* Apply Section */}
      {applyable && (
        <div className="px-4 py-3 border-t border-border bg-muted/30 space-y-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleApply}
              disabled={applying}
              className="flex-1"
            >
              {applying ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1" />
                  Applying…
                </>
              ) : (
                "Apply to Form"
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyProposedSkills}
              className="px-2"
            >
              {copied ? (
                <Check size={14} />
              ) : (
                <Copy size={14} />
              )}
            </Button>
          </div>
          {applyable.skills && applyable.skills.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <p>Recommended skills:</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {applyable.skills.map((s) => (
                  <Badge key={`${s.name}-${s.version}`} variant="secondary" className="text-xs">
                    {s.name} v{s.version}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="px-4 py-3 border-t border-border gap-2 flex flex-col">
        <Textarea
          placeholder="Describe what this agent should do…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          disabled={streaming}
          className="text-sm resize-none"
          rows={3}
        />
        <Button
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
          size="sm"
          className="w-full"
        >
          {streaming ? (
            <>
              <Loader2 size={14} className="animate-spin mr-2" />
              Thinking…
            </>
          ) : (
            "Send"
          )}
        </Button>
      </div>
    </div>
  );
};
