import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, Loader2, ShieldCheck, User, Wrench, BarChart3, Crown, Chrome, UserPlus, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { Separator } from "@/components/ui/separator";

const DEMO_ACCOUNTS = [
  { email: "customer@resolveai.demo", label: "Customer", desc: "Send complaints — watch autonomous resolution", icon: User, home: "/chat" },
  { email: "tier1@resolveai.demo", label: "Tier-1 Agent", desc: "Queue, console, limited authority", icon: ShieldCheck, home: "/queue" },
  { email: "tier2@resolveai.demo", label: "Tier-2 Agent", desc: "Billing/order investigations", icon: Wrench, home: "/queue" },
  { email: "manager@resolveai.demo", label: "Manager", desc: "Full ops + analytics + self-check", icon: BarChart3, home: "/queue" },
  { email: "admin@resolveai.demo", label: "Administrator", desc: "Everything + audit trail", icon: Crown, home: "/queue" },
];

const STAFF_EMAILS = new Set(["tier1@resolveai.demo", "tier2@resolveai.demo", "manager@resolveai.demo", "admin@resolveai.demo"]);

type Mode = "login" | "signup" | "forgot";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("manager@resolveai.demo");
  const [password, setPassword] = useState("ResolveAI@123");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const homeFor = (em: string) => (STAFF_EMAILS.has(em) ? "/queue" : "/chat");

  const doLogin = async (em: string, pw: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      if (signInErr) {
        // Demo accounts may not exist yet — try bootstrap once.
        setNotice("Demo account not found — provisioning demo accounts…");
        await api.bootstrap();
        const retry = await supabase.auth.signInWithPassword({ email: em, password: pw });
        if (retry.error) throw retry.error;
      }
      navigate(homeFor(em));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
      // OAuth redirects away; session + account linking resolve on return.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const validateSignup = (): string | null => {
    if (!signupName.trim()) return "Full name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";
    return null;
  };

  const doSignup = async () => {
    const v = validateSignup();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: signupName.trim(), phone: phone.trim() || undefined },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error) {
        if (error.message.toLowerCase().includes("already registered") || error.code === "user_already_exists") {
          setError("An account with this email already exists. Please sign in.");
        } else {
          setError(error.message);
        }
        return;
      }
      // signUp with auto-confirm returns a session; otherwise verification is required.
      if (data.session) {
        setNotice("Account created — you are signed in as a Customer (least privilege).");
        navigate("/chat");
      } else {
        setNotice("Account created. Please check your email to verify your address, then sign in.");
        setMode("login");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doForgot = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setNotice("If an account exists for this email, a secure reset link has been sent.");
      setMode("login");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
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
          <h2 className="text-base font-semibold">
            {mode === "signup" ? "Create Account" : mode === "forgot" ? "Reset Password" : "Sign in"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === "signup"
              ? "New accounts are created as Customers (least privilege)."
              : mode === "forgot"
                ? "Enter your email and we will send a secure reset link."
                : "All demo accounts use password ResolveAI@123."}
          </p>

          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void (mode === "signup" ? doSignup() : mode === "forgot" ? doForgot() : doLogin(email, password));
            }}
          >
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs">Full Name *</Label>
                  <Input id="name" value={signupName} onChange={(e) => setSignupName(e.target.value)} autoComplete="name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs">Phone (optional)</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Email *</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">Password *</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
              </div>
            )}
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-xs">Confirm Password *</Label>
                <Input id="confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              </div>
            )}
            {error && <div className="rounded bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{error}</div>}
            {notice && <div className="rounded bg-info-soft px-2.5 py-1.5 text-xs text-info">{notice}</div>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {mode === "signup" ? "Create Account" : mode === "forgot" ? "Send Reset Link" : "Sign In"}
            </Button>
          </form>

          {mode === "login" && (
            <>
              <button
                onClick={() => { setMode("forgot"); setError(null); setNotice(null); }}
                className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <KeyRound className="h-3.5 w-3.5" /> Forgot Password
              </button>
              <div className="my-3 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">or</span>
                <Separator className="flex-1" />
              </div>
              <Button variant="outline" className="w-full" onClick={() => void doGoogle()} disabled={busy}>
                <Chrome className="mr-2 h-4 w-4" /> Continue with Google
              </Button>
              <button
                onClick={() => switchMode("signup")}
                className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <UserPlus className="h-3.5 w-3.5" /> Create Account
              </button>
            </>
          )}
          {mode !== "login" && (
            <button
              onClick={() => switchMode("login")}
              className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back to sign in
            </button>
          )}
        </div>

        {mode === "login" && (
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
        )}
      </div>
    </div>
  );
}
