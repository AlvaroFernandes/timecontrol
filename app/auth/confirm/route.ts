import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Handles invitation email links:
// Supabase sends ?token_hash=xxx&type=invite&next=/
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type       = searchParams.get("type") as "invite" | "signup" | "recovery" | "email" | null;
  const rawNext    = searchParams.get("next") ?? "/";
  // Only allow relative paths — reject anything that could redirect off-domain
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("://")
    ? rawNext
    : "/";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
