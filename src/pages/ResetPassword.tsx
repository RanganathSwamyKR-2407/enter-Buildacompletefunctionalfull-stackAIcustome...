import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, Loader2, KeyRound } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState<null | boolean>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");
    if (accessToken && refreshToken && type === "recovery") {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) {
            setError("The reset link is invalid or has expired. Please request a new one.");
            setSessionReady(false);
          } else {
            setSessionReady(true);
          }
        });
    } else {
      setSessionReady(false);
      setError("This reset link is missing or expired. Please request a new password reset from the sign-in page.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
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
            <div className="text-xs text-muted-foreground">Secure password reset</div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <KeyRound className="h-4 w-4 text-brand" /> {done ? "Password Updated" : "Set a New Password"}
          </h2>
          {sessionReady === null && !done && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validating reset link…
            </div>
          )}
          {done && (
            <div className="mt-4 space-y-3">
              <div className="rounded bg-success-soft px-2.5 py-1.5 text-xs text-success">Your password has been updated successfully.</div>
              <Button className="w-full" onClick={() => navigate("/login")}>Back to Sign In</Button>
            </div>
          )}
          {sessionReady === true && !done && (
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pw" className="text-xs">New Password</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw2" className="text-xs">Confirm New Password</Label>
                <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              {error && <div className="rounded bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{error}</div>}
              <Button className="w-full" onClick={() => void submit()} disabled={busy}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
            </div>
          )}
          {sessionReady === false && !done && (
            <div className="mt-4 space-y-3">
              {error && <div className="rounded bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{error}</div>}
              <Link to="/login" className="block text-center text-xs text-brand hover:underline">Request a new reset link</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
