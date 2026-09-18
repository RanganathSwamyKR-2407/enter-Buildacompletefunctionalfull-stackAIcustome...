import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, Loader2, ShieldCheck, User, Wrench, BarChart3, Crown } from "lucide-react";
import { api } from "@/lib/api";

const DEMO_ACCOUNTS = [
  { email: "customer@resolveai.demo", label: "Customer", desc: "Send complaints — watch autonomous resolution", icon: User },
  { email: "tier1@resolveai.demo", label: "Tier-1 Agent", desc: "Queue, console, limited authority", icon: ShieldCheck },
  { email: "tier2@resolveai.demo", label: "Tier-2 Agent", desc: "Billing/order investigations", icon: Wrench },
  { email: "manager@resolveai.demo", label: "Manager", desc: "Full ops + analytics + self-check", icon: BarChart3 },
  { email: "admin@resolveai.demo", label: "Administrator", desc: "Everything + audit trail", icon: Crown },
];

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("manager@resolveai.demo");
  const [password, setPassword] = useState("ResolveAI@123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const doLogin = async (em: string, pw: string) => {
    setBusy(true);
    setError(null);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      if (signInErr) {
        // Demo accounts may not exist yet — try bootstrap once.
        setNotice("Demo account not found — provisioning demo accounts…");
        await api.bootstrap();
        const retry = await supabase.auth.signInWithPassword({ email: em, password: pw });
        if (retry.error) throw retry.error;
      }
      navigate("/queue");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <Radio className="h-5 w-5" />
          </span>
          <div>
            <div className="text-lg font-semibold tracking-tight">ResolveAI</div>
            <div className="text-xs text-muted-foreground">Autonomous Customer Support & Resolution Platform</div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <h2 className="text-base font-semibold">Sign in</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">All demo accounts use password ResolveAI@123.</p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void doLogin(email, password);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {error && <div className="rounded bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{error}</div>}
            {notice && <div className="rounded bg-info-soft px-2.5 py-1.5 text-xs text-info">{notice}</div>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              onClick={() => {
                setEmail(a.email);
                setPassword("ResolveAI@123");
                void doLogin(a.email, "ResolveAI@123");
              }}
              disabled={busy}
              className="rounded-lg border bg-card p-3 text-left transition-colors hover:border-brand disabled:opacity-60"
            >
              <div className="flex items-center gap-2">
                <a.icon className="h-4 w-4 text-brand" />
                <span className="text-[13px] font-semibold">{a.label}</span>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{a.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
