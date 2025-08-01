import { stackServerApp } from "@/stack";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if Stack Auth is configured
  const isStackAuthConfigured = 
    process.env.NEXT_PUBLIC_STACK_PROJECT_ID && 
    process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY && 
    process.env.STACK_SECRET_SERVER_KEY;

  // Dev mode: Skip authentication if Stack Auth is not configured
  if (!isStackAuthConfigured) {
    console.warn("⚠️  Stack Auth not configured - running in DEV MODE without authentication");
    return (
      <>
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4">
          <p className="font-bold">Development Mode</p>
          <p className="text-sm">Authentication is disabled. Configure Stack Auth environment variables for production.</p>
        </div>
        {children}
      </>
    );
  }

  const user = await stackServerApp.getUser();

  if (!user) {
    redirect("/handler/sign-in?redirect=/admin");
  }

  const isAdmin = user.serverMetadata?.isAdmin === true;

  return <>{children}</>;
}
