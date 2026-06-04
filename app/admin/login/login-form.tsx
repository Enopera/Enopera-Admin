// app/admin/login/login-form.tsx
"use client";

import { useActionState } from "react";
import { signInAdmin, type SignInState } from "./actions";
import { ADM } from "@/lib/admin/tokens";

export function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError: string | null;
}) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signInAdmin,
    initialError ? { error: initialError } : {},
  );

  return (
    <form
      action={formAction}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        width: "100%",
      }}
    >
      <input type="hidden" name="next" value={next} />

      <label style={labelStyle}>
        <span style={labelTextStyle}>Username</span>
        <input
          name="username"
          type="text"
          required
          autoComplete="username"
          autoFocus
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={inputStyle}
        />
      </label>

      <label style={labelStyle}>
        <span style={labelTextStyle}>Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          style={inputStyle}
        />
      </label>

      {state.error && (
        <p
          role="alert"
          style={{
            margin: 0,
            color: ADM.carmine,
            fontFamily: ADM.sans,
            fontSize: 13,
          }}
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          marginTop: 4,
          padding: "10px 14px",
          background: ADM.carmine,
          color: "white",
          border: "none",
          borderRadius: 6,
          fontFamily: ADM.sans,
          fontSize: 14,
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Accesso in corso…" : "Accedi"}
      </button>

      <p
        style={{
          margin: "6px 0 0",
          color: ADM.inkMuted,
          fontFamily: ADM.sans,
          fontSize: 11.5,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        Password dimenticata? Contatta un altro amministratore — il recovery
        self-service è disattivato per gli account interni.
      </p>
    </form>
  );
}

const labelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
};

const labelTextStyle = {
  fontFamily: ADM.sans,
  fontSize: 12,
  fontWeight: 600,
  color: ADM.inkSoft,
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
};

const inputStyle = {
  padding: "10px 12px",
  border: `1px solid ${ADM.line}`,
  borderRadius: 6,
  fontFamily: ADM.sans,
  fontSize: 14,
  background: "white",
  color: ADM.ink,
};
