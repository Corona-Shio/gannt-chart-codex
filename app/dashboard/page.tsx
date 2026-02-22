import { redirect } from "next/navigation";

import { ScheduleDashboard } from "@/components/schedule-dashboard";
import { SignOutButton } from "@/components/sign-out-button";
import { createServerSupabase } from "@/lib/supabase/server";
import type { WorkspaceRole } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await supabase.rpc("bootstrap_workspace", { workspace_name: "Anime Team" });

  const { data: memberships, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces!inner(id, name)")
    .eq("user_id", user.id)
    .limit(1);

  if (error || !memberships?.length) {
    return (
      <main className="app-shell">
        <section className="card" style={{ padding: 20 }}>
          <h1 className="headline" style={{ marginTop: 0 }}>
            Workspace not found
          </h1>
          <p className="muted">ワークスペースを作成できませんでした。Supabaseのマイグレーションを確認してください。</p>
        </section>
      </main>
    );
  }

  const membership = memberships[0] as {
    workspace_id: string;
    role: WorkspaceRole;
    workspaces: { id: string; name: string } | { id: string; name: string }[];
  };
  const workspace = Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces;

  return (
    <>
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 30 }}>
        <SignOutButton />
      </div>
      <ScheduleDashboard
        workspaceId={membership.workspace_id}
        workspaceName={workspace?.name ?? "Anime Team"}
        role={membership.role}
        userEmail={user.email ?? ""}
      />
    </>
  );
}
