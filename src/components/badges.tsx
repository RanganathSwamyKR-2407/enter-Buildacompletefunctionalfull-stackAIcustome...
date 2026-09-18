import { Badge } from "@/components/ui/badge";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  CircleAlert,
  CheckCircle2,
  Clock,
  XCircle,
  PlayCircle,
  PauseCircle,
  ArrowUpRight,
  ArrowRight,
} from "lucide-react";
import { classNames } from "@/lib/format";

type Tone = "default" | "success" | "warning" | "danger" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
};

function toneBadge(tone: Tone, label: string, icon?: React.ReactNode) {
  return (
    <Badge className={classNames(TONE_CLASSES[tone], "gap-1 font-medium")}>
      {icon}
      {label}
    </Badge>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  new: "info",
  investigating: "info",
  action_required: "warning",
  action_failed: "danger",
  verifying: "warning",
  resolved: "success",
  escalated: "danger",
  closed: "default",
  automation_paused: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  investigating: "Investigating",
  action_required: "Action Required",
  action_failed: "Action Failed",
  verifying: "Verifying",
  resolved: "Resolved",
  escalated: "Escalated",
  closed: "Closed",
  automation_paused: "Automation Paused",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "default";
  const icon =
    status === "resolved" ? (
      <CheckCircle2 className="h-3 w-3" />
    ) : status === "escalated" || status === "automation_paused" ? (
      <XCircle className="h-3 w-3" />
    ) : status === "investigating" || status === "verifying" ? (
      <Clock className="h-3 w-3" />
    ) : status === "action_required" ? (
      <CircleAlert className="h-3 w-3" />
    ) : (
      <PlayCircle className="h-3 w-3" />
    );
  return toneBadge(tone, STATUS_LABEL[status] ?? status, icon);
}

const PRIORITY_TONE: Record<string, Tone> = { P1: "danger", P2: "warning", P3: "info", P4: "default" };

export function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return toneBadge("default", "—");
  return toneBadge(PRIORITY_TONE[priority] ?? "default", priority);
}

const INTENT_LABEL: Record<string, string> = {
  billing: "Billing",
  order: "Order",
  technical: "Technical",
  account: "Account",
};

export function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return toneBadge("default", "—");
  return toneBadge("info", INTENT_LABEL[intent] ?? intent);
}

export function SentimentIndicator({ sentiment, score }: { sentiment: string | null; score?: number | null }) {
  if (!sentiment) return toneBadge("default", "—", <Minus className="h-3 w-3" />);
  if (sentiment === "positive")
    return toneBadge("success", "Positive", <TrendingUp className="h-3 w-3" />);
  if (sentiment === "negative")
    return toneBadge("danger", "Negative", <TrendingDown className="h-3 w-3" />);
  return toneBadge("default", "Neutral", <Minus className="h-3 w-3" />);
}

export function GateBadge({ status }: { status: string }) {
  const tone: Tone = status === "PASS" ? "success" : status === "REVIEW" ? "warning" : status === "BLOCK" || status === "FAIL" ? "danger" : "default";
  const icon =
    status === "PASS" ? (
      <CheckCircle2 className="h-3 w-3" />
    ) : status === "REVIEW" ? (
      <ArrowRight className="h-3 w-3" />
    ) : (
      <XCircle className="h-3 w-3" />
    );
  return toneBadge(tone, status, icon);
}

export function EscalationBadge({ score }: { score: number | null }) {
  if (score == null) return toneBadge("default", "—");
  const tone: Tone = score >= 80 ? "danger" : score >= 55 ? "warning" : "default";
  return toneBadge(tone, `${score}/100`, <ArrowUpRight className="h-3 w-3" />);
}

export function PauseBadge() {
  return toneBadge("danger", "Automation Paused", <PauseCircle className="h-3 w-3" />);
}
