"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { ArrowRight, Check, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Home() {
  return (
    <main className="landing-shell">
      <header className="site-header">
        <Link className="wordmark" href="/">
          Open Social Agent <span>v0.1</span>
        </Link>
        <p className="header-proof">
          <ShieldCheck size={15} /> Approval stays human
        </p>
      </header>

      <AuthLoading>
        <LoadingPanel />
      </AuthLoading>
      <Unauthenticated>
        <Landing />
      </Unauthenticated>
      <Authenticated>
        <SignedIn />
      </Authenticated>
    </main>
  );
}

function Landing() {
  return (
    <div className="landing-grid">
      <section className="hero-copy">
        <p className="eyebrow">
          An editorial operations desk for one careful operator
        </p>
        <h1>
          Schedule the preparation.
          <br />
          <em>Approve the publication.</em>
        </h1>
        <p className="hero-lede">
          Configure your evidence rules, writing voice, model budget,
          destination, and isolated browser. Every run stops on the exact post
          before it represents you.
        </p>
        <div className="proof-row" aria-label="Product principles">
          <span>
            <Check size={16} /> Local provider secrets
          </span>
          <span>
            <Check size={16} /> Source-backed drafts
          </span>
          <span>
            <Check size={16} /> Durable receipts
          </span>
        </div>
        <aside className="safety-note">
          <span className="safety-number">01</span>
          <div>
            <strong>No silent posting.</strong>
            <p>
              A schedule can prepare a draft. Only you can approve the exact
              output and destination at post time.
            </p>
          </div>
        </aside>
      </section>
      <AuthCard />
    </div>
  );
}

function AuthCard() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-heading">
      <div className="auth-card-top">
        <LockKeyhole size={20} />
        <span>Self-hosted operator access</span>
      </div>
      <h2 id="auth-heading">
        {flow === "signIn"
          ? "Return to your desk"
          : "Create the operator account"}
      </h2>
      <p>
        {flow === "signIn"
          ? "Your configuration and run history stay scoped to this account."
          : "V1 is designed for one operator per self-hosted deployment."}
      </p>
      <form action={submit} className="auth-form">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="operator@example.com"
        />
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={12}
          autoComplete={flow === "signIn" ? "current-password" : "new-password"}
          required
          placeholder="12 characters minimum"
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button className="primary-action" disabled={busy} type="submit">
          {busy
            ? "Checking…"
            : flow === "signIn"
              ? "Sign in"
              : "Create account"}
          <ArrowRight size={17} />
        </Button>
      </form>
      <button
        className="text-action"
        type="button"
        onClick={() => {
          setFlow(flow === "signIn" ? "signUp" : "signIn");
          setError(null);
        }}
      >
        {flow === "signIn"
          ? "First time here? Create the operator account"
          : "Already configured? Sign in"}
      </button>
    </section>
  );
}

function SignedIn() {
  const { signOut } = useAuthActions();
  return (
    <section className="signed-in-card">
      <p className="eyebrow">Authenticated workspace</p>
      <h1>Your operating desk is ready to configure.</h1>
      <p>
        Start or resume the eight-step setup. Saving is explicit, and incomplete
        setup never enables a schedule or public action.
      </p>
      <div className="signed-in-actions">
        <Button asChild className="primary-action">
          <Link href="/app">
            Open operator desk <ArrowRight size={17} />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/onboarding">Resume onboarding</Link>
        </Button>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
        <Button variant="outline" asChild>
          <Link href="/settings/provider">Provider &amp; runner settings</Link>
        </Button>
      </div>
    </section>
  );
}

function LoadingPanel() {
  return (
    <section className="signed-in-card" aria-live="polite">
      <p className="eyebrow">Checking session</p>
      <h1>Opening the desk…</h1>
    </section>
  );
}
