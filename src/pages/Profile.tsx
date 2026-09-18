import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api, type ProfileShape, type TeamMember } from "@/lib/api";
import { useAuth, signOut } from "@/context/AuthContext";
import { PageHeader, LoadingState } from "@/components/widgets";
import { SectionCard } from "@/components/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, KeyRound, LogOut, Users, Save, Pencil } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  customer: "Customer",
  customer_support_t1: "Tier-1 Agent",
  customer_support_t2: "Tier-2 Agent",
  manager: "Manager",
  admin: "Administrator",
};

function InitialsAvatar({ name, avatarUrl, size = 40 }: { name: string; avatarUrl?: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-foreground"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { staffRole, refreshIdentity } = useAuth();

  const { data, isLoading } = useQuery({ queryKey: ["profile"], queryFn: () => api.profile() });
  const profile = data?.profile as ProfileShape | undefined;

  const [form, setForm] = useState({
    display_name: "",
    avatar_url: "",
    phone: "",
    department: "",
    job_title: "",
    bio: "",
  });
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name ?? profile.name ?? "",
        avatar_url: profile.avatar_url ?? "",
        phone: profile.phone ?? "",
        department: profile.department ?? "",
        job_title: profile.job_title ?? "",
        bio: profile.bio ?? "",
      });
    }
  }, [profile]);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.display_name.trim()) {
      setFormErr("Display name is required.");
      return;
    }
    setSaving(true);
    setFormMsg(null);
    setFormErr(null);
    try {
      const res = await api.updateProfile({
        display_name: form.display_name.trim(),
        avatar_url: form.avatar_url.trim(),
        phone: form.phone.trim(),
        department: form.department.trim(),
        job_title: form.job_title.trim(),
        bio: form.bio.trim(),
      });
      await refreshIdentity();
      setFormMsg({ ok: true, text: "Profile updated successfully." });
      if (Object.keys(res.changes ?? {}).length === 0) setFormMsg({ ok: true, text: "No changes to save." });
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (pw.length < 8) {
      setPwMsg({ ok: false, text: "Password must be at least 8 characters." });
      return;
    }
    if (pw !== pw2) {
      setPwMsg({ ok: false, text: "Passwords do not match." });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setPwMsg({ ok: true, text: "Password updated successfully." });
      setPw("");
      setPw2("");
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setPwBusy(false);
    }
  };

  if (isLoading || !profile) return <LoadingState label="Loading profile…" />;

  const isStaff = Boolean(profile.is_staff);
  const canManageTeam = staffRole === "manager" || staffRole === "admin";

  return (
    <div>
      <PageHeader
        title="My Profile"
        subtitle="Customize your personal information. Your role and permissions are managed by the system and cannot be changed here."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Account summary */}
        <Card className="h-fit">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <InitialsAvatar name={form.display_name || profile.name} avatarUrl={form.avatar_url} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{form.display_name || profile.name}</div>
                <div className="truncate text-xs text-muted-foreground">{profile.email}</div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Role</span><Badge className="bg-brand-soft text-brand">{ROLE_LABEL[profile.role] ?? profile.role}</Badge></div>
              {profile.customer_code && <div className="flex justify-between"><span className="text-muted-foreground">Customer ID</span><span>{profile.customer_code}</span></div>}
              {profile.tier && <div className="flex justify-between"><span className="text-muted-foreground">Tier</span><span>{profile.tier}</span></div>}
            </div>
            <div className="mt-3 rounded bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
              Identity comes from your authenticated account. Editing your name never changes your role or login.
            </div>
          </CardContent>
        </Card>

        {/* Editable sections */}
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Personal Information" icon={<Pencil className="h-4 w-4 text-brand" />}>
            <form onSubmit={(e) => void saveProfile(e)} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Display Name *</Label>
                  <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              {isStaff && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Department</Label>
                    <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Job title</Label>
                    <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Short bio / status</Label>
                <Input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder={isStaff ? "e.g. Tier-2 billing specialist" : "Optional"} />
              </div>
              {formErr && <div className="rounded bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{formErr}</div>}
              {formMsg && (
                <div className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${formMsg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                  {formMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {formMsg.text}
                </div>
              )}
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save Changes
              </Button>
            </form>
          </SectionCard>

          <SectionCard title="Profile Appearance" icon={<Pencil className="h-4 w-4 text-brand" />}>
            <div className="flex items-center gap-3">
              <InitialsAvatar name={form.display_name || profile.name} avatarUrl={form.avatar_url} size={48} />
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Avatar image URL (optional)</Label>
                <Input value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://…" />
                <p className="text-[11px] text-muted-foreground">
                  Leave empty to use initials generated from your display name. Only public image URLs are accepted.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={(e) => void saveProfile(e as unknown as FormEvent)} disabled={saving}>
              Save Appearance
            </Button>
          </SectionCard>

          <SectionCard title="Security" icon={<KeyRound className="h-4 w-4 text-brand" />}>
            {profile.email?.endsWith(".demo") || !profile.email ? (
              <div className="text-xs text-muted-foreground">
                This demo account uses a fixed password (<code>ResolveAI@123</code>). In production, accounts can change their password here.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">New Password</Label>
                    <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Confirm New Password</Label>
                    <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
                  </div>
                </div>
                {pwMsg && (
                  <div className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs ${pwMsg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                    {pwMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {pwMsg.text}
                  </div>
                )}
                <Button size="sm" variant="outline" onClick={() => void changePassword()} disabled={pwBusy}>
                  {pwBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Change Password
                </Button>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between rounded bg-muted/40 px-2.5 py-2">
              <span className="text-xs text-muted-foreground">Signed in as {profile.email}</span>
              <Button size="sm" variant="outline" onClick={() => void signOut().then(() => navigate("/login"))}>
                <LogOut className="mr-1.5 h-4 w-4" /> Logout
              </Button>
            </div>
          </SectionCard>

          {canManageTeam && <TeamManagement />}
        </div>
      </div>
    </div>
  );
}

function TeamManagement() {
  const { refreshIdentity } = useAuth();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["team"], queryFn: () => api.team() });
  const team = (data?.team ?? []) as TeamMember[];

  const [edit, setEdit] = useState<Record<string, { display_name: string; phone: string; department: string; job_title: string; bio: string }>>({});
  const [savingFor, setSavingFor] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const saveMember = async (m: TeamMember) => {
    const f = edit[m.user_id] ?? { display_name: m.display_name ?? m.name, phone: m.phone ?? "", department: m.department ?? "", job_title: m.job_title ?? "", bio: "" };
    setSavingFor(m.user_id);
    setMsg(null);
    try {
      await api.updateProfile({ target_user_id: m.user_id, ...f });
      setMsg(`Updated ${f.display_name}. Role unchanged.`);
      await refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingFor(null);
      await refreshIdentity();
    }
  };

  if (isLoading) return <LoadingState label="Loading team…" />;
  return (
    <SectionCard title="Team Profile Management (Manager/Admin)" icon={<Users className="h-4 w-4 text-brand" />}>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Edit normal profile fields for staff. Roles and permissions are never editable here.
      </p>
      <div className="space-y-2">
        {team.map((m) => {
          const f = edit[m.user_id] ?? { display_name: m.display_name ?? m.name, phone: m.phone ?? "", department: m.department ?? "", job_title: m.job_title ?? "", bio: "" };
          return (
            <div key={m.user_id} className="rounded-md border px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <InitialsAvatar name={f.display_name} avatarUrl={m.avatar_url ?? undefined} size={28} />
                  <span className="text-[13px] font-medium">{f.display_name}</span>
                  <Badge className="bg-muted text-muted-foreground">{ROLE_LABEL[m.role] ?? m.role}</Badge>
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Input size={1} className="h-8 text-xs" value={f.display_name} onChange={(e) => setEdit({ ...edit, [m.user_id]: { ...f, display_name: e.target.value } })} placeholder="Display name" />
                <Input size={1} className="h-8 text-xs" value={f.phone} onChange={(e) => setEdit({ ...edit, [m.user_id]: { ...f, phone: e.target.value } })} placeholder="Phone" />
                <Input size={1} className="h-8 text-xs" value={f.department} onChange={(e) => setEdit({ ...edit, [m.user_id]: { ...f, department: e.target.value } })} placeholder="Department" />
              </div>
              <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => void saveMember(m)} disabled={savingFor === m.user_id}>
                {savingFor === m.user_id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          );
        })}
        {team.length === 0 && <div className="text-xs text-muted-foreground">No team members found.</div>}
        {msg && <div className="rounded bg-info-soft px-2.5 py-1.5 text-xs text-info">{msg}</div>}
      </div>
    </SectionCard>
  );
}
