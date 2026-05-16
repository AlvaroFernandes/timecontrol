import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const { email, role } = await request.json() as { email?: string; role?: string };

  if (!email || !["user", "admin"].includes(role ?? "")) {
    return NextResponse.json({ error: "email and role (user|admin) are required" }, { status: 400 });
  }

  // Verify the caller is an authenticated admin
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from("profiles").select("role, admin_id")
    .eq("user_id", user.id).maybeSingle();

  const p = callerProfile as { role: string; admin_id: string | null } | null;
  if (p?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Root admin ID: sub-admins pass their parent's ID so all invited users
  // end up under the same root admin pool.
  const rootAdminId = p.admin_id ?? user.id;

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const admin  = createAdminClient();

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/confirm`,
    data: {
      invited_role: role,
      invited_by:   rootAdminId,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
