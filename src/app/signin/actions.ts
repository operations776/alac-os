"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { signIn, signOut } from "@/lib/server/auth";

export async function signInAction(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const ua = (await headers()).get("user-agent");
  const session = await signIn(email, password, ua);

  // One message for both failure modes. Saying "no such user" turns the form
  // into a way to find out who has an account here.
  if (!session) {
    return { error: "That email and password do not match." };
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  await signOut();
  redirect("/signin");
}
