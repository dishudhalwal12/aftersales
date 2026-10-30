"use client";

import { useActionState, useState } from "react";
import {
  googleSignInAction,
  signInAction,
  signUpAction,
} from "../../app/auth/actions.ts";
import { EMPTY_AUTH_STATE, type AuthState } from "../../app/auth/state.ts";

type Tab = "signin" | "signup";

const initial: AuthState = EMPTY_AUTH_STATE;

export function AuthPanel({ notice = null }: { notice?: string | null }) {
  const [tab, setTab] = useState<Tab>("signin");
  const [signInState, signIn] = useActionState(signInAction, initial);
  const [signUpState, signUp] = useActionState(signUpAction, initial);
  const [googleState, google] = useActionState(googleSignInAction, initial);

  const pending = tab === "signin" ? signInState : signUpState;
  const error = pending.error ?? googleState.error ?? notice;

  return (
    <div className="auth-card">
      <div className="auth-tabs" role="tablist" aria-label="Authentication">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "signin"}
          className="auth-tab"
          onClick={() => setTab("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "signup"}
          className="auth-tab"
          onClick={() => setTab("signup")}
        >
          Create account
        </button>
      </div>

      {error !== null && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {tab === "signin" ? (
        <form action={signIn} className="auth-form" key="signin">
          <label className="auth-field">
            <span>Email</span>
            <input
              className="auth-input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="owner@clinic.in"
              required
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              className="auth-input"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </label>
          <button className="auth-btn auth-btn-primary" type="submit">
            Sign in
          </button>
        </form>
      ) : (
        <form action={signUp} className="auth-form" key="signup">
          <label className="auth-field">
            <span>Business owner name</span>
            <input
              className="auth-input"
              name="name"
              autoComplete="name"
              placeholder="Divyanshu"
            />
          </label>
          <label className="auth-field">
            <span>Email</span>
            <input
              className="auth-input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="owner@shop.in"
              required
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              className="auth-input"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </label>
          <button className="auth-btn auth-btn-primary" type="submit">
            Create account
          </button>
        </form>
      )}

      <div className="auth-divider">or</div>

      <form action={google}>
        <button className="auth-btn auth-btn-google" type="submit">
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5Z"
            />
            <path
              fill="#4285F4"
              d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.1h12.5c-.3 2.1-1.6 5.2-4.6 7.3l7.4 5.7c4.4-4.1 6.8-10.1 6.8-17Z"
            />
            <path
              fill="#FBBC05"
              d="M10.4 28.7a14.4 14.4 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1Z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.7 2.4-8.5 2.4-6.4 0-11.7-3.7-13.6-8.8l-7.8 6.1C6.5 42.6 14.6 48 24 48Z"
            />
          </svg>
          Continue with Google
        </button>
      </form>

      <p className="auth-note">
        Google sign-in goes through Supabase; with no keys configured the button says so instead of
        failing silently. No secret is ever bundled into the client.
      </p>
    </div>
  );
}
