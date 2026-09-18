import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { classNames } from "@/lib/format";
import type { ChatResult } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export interface ChatBubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: string;
  caseId?: string;
  caseUuid?: string;
}

export function ChatWindow({
  bubbles,
  sending,
  onSend,
  disabled,
  placeholder = "Describe your issue…",
  suggested,
  compact,
}: {
  bubbles: ChatBubble[];
  sending: boolean;
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  suggested?: string[];
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles.length, sending]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setText("");
    onSend(t);
  };

  return (
    <div className={classNames("flex h-full flex-col", compact ? "" : "min-h-[420px]")}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {bubbles.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft">
              <Sparkles className="h-5 w-5 text-brand" />
            </div>
            <div className="text-sm font-medium text-muted-foreground">
              Describe the issue. The autonomous engine will investigate, reason and resolve.
            </div>
            {suggested && suggested.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {suggested.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSend(s)}
                    className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:border-brand hover:text-brand"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {bubbles.map((b) => (
          <div key={b.id} className={classNames("flex gap-2.5", b.role === "user" ? "flex-row-reverse" : "")}>
            <Avatar className="h-7 w-7">
              <AvatarFallback className={classNames("text-[11px]", b.role === "user" ? "bg-primary text-primary-foreground" : "bg-brand text-brand-foreground")}>
                {b.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </AvatarFallback>
            </Avatar>
            <div className={classNames("max-w-[80%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed", b.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card")}>
              {b.content}
              {b.status && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="h-4 gap-1 px-1 text-[10px]">
                    {b.caseId}
                  </Badge>
                  {b.status}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Running investigation pipeline…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            disabled={disabled || sending}
            rows={1}
            className="max-h-28 min-h-[40px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          <Button type="submit" size="icon" disabled={disabled || sending || !text.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

export type { ChatResult };
