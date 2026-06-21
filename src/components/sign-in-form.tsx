"use client";

import Image from "next/image";
import Link from "next/link";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { getFirebaseAuth } from "@/src/lib/firebase/client";

const friendlyError = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("invalid-credential")) return "The email address or password is incorrect.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a moment and try again.";
  return "Unable to sign in. Check your connection and try again.";
};
export function SignInForm() {
  const router = useRouter(); const params = useSearchParams();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); setNotice(""); setPending(true); try { await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password); router.replace(params.get("next") || "/dashboard"); } catch (cause) { setError(friendlyError(cause)); } finally { setPending(false); } }
  async function resetPassword() { if (!email.trim()) { setError("Enter your email address first, then select password reset."); return; } setError(""); try { await sendPasswordResetEmail(getFirebaseAuth(), email.trim()); setNotice("Password reset email sent. Check your inbox."); } catch (cause) { setError(friendlyError(cause)); } }
  return <main className="sign-in"><section className="sign-in-card"><Link className="signin-brand" href="/"><Image src="/legacy-assets/ab-logo.png" alt="AB Marketing" width={39} height={39}/><span>AB <b>Marketing</b></span></Link><div className="signin-heading"><span className="signin-icon"><LockKeyhole size={19}/></span><h1>Welcome back</h1><p>Sign in to access Sales Operations.</p></div><form onSubmit={submit}><label>Email address<input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@company.com" required/></label><label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Enter your password" required/></label><button className="forgot" type="button" onClick={resetPassword}>Forgot password?</button>{error&&<p className="form-error">{error}</p>}{notice&&<p className="form-success"><CheckCircle2 size={15}/>{notice}</p>}<button className="signin-submit" disabled={pending}>{pending?"Signing in…":"Sign in"}<ArrowRight size={17}/></button></form><p className="signin-help">Need access? Contact your team administrator.</p></section><aside className="sign-in-aside"><div className="orb one"/><div className="orb two"/><p className="eyebrow">AB SALES OPERATIONS</p><h2>Clear data.<br/><em>Confident</em> decisions.</h2><p>One secure workspace for your roster, field activity, sales performance, and team goals.</p></aside></main>;
}
