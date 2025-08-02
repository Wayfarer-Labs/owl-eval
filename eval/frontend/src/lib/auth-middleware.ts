import { stackServerApp } from "@/stack";
import { NextRequest, NextResponse } from "next/server";

export async function requireAuth(request: NextRequest) {
  // Check if Stack Auth is configured
  const isStackAuthConfigured = 
    process.env.NEXT_PUBLIC_STACK_PROJECT_ID && 
    process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY && 
    process.env.STACK_SECRET_SERVER_KEY;

  // Dev mode: Skip authentication if Stack Auth is not configured
  if (!isStackAuthConfigured) {
    console.warn("⚠️  Stack Auth not configured - API running in DEV MODE without authentication");
    return { isAuthenticated: true, user: null, devMode: true };
  }

  try {
    const user = await stackServerApp.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return { isAuthenticated: true, user };
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Authentication error" },
      { status: 500 }
    );
  }
}

export async function requireAdmin(request: NextRequest) {
  // Check if Stack Auth is configured
  const isStackAuthConfigured = 
    process.env.NEXT_PUBLIC_STACK_PROJECT_ID && 
    process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY && 
    process.env.STACK_SECRET_SERVER_KEY;

  // Dev mode: Skip authentication if Stack Auth is not configured
  if (!isStackAuthConfigured) {
    console.warn("⚠️  Stack Auth not configured - API running in DEV MODE without authentication");
    return { isAdmin: true, user: null, devMode: true };
  }

  try {
    const user = await stackServerApp.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const isAdmin = user.serverMetadata?.isAdmin === true;

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    return { isAdmin: true, user };
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Authentication error" },
      { status: 500 }
    );
  }
}