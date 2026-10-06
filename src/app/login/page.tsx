import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { AuthForm } from "../AuthForm";

export default async function Page() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <div className="mb-8 flex justify-center"><Logo /></div>
      <h1 className="mb-6 text-center text-2xl font-bold">Welcome back</h1>
      <AuthForm mode="login" />
    </div>
  );
}
