import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button, Wordmark } from "@streamerr/ui";
import { getOrCreateDeviceId, login } from "@streamerr/client";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () =>
      login({
        username,
        password,
        deviceId: await getOrCreateDeviceId(localStorage),
        deviceName: "Streamerr Web",
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate("/", { replace: true });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="login-page">
      <div className="login-backdrop" aria-hidden="true" />
      <header className="login-top">
        <Wordmark size="lg" />
      </header>
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Sign In</h1>
        <p>Your media. One stream. Use your Jellyfin account.</p>
        {mutation.isError ? <p className="error">{(mutation.error as Error).message}</p> : null}

        <div className={`login-field${username ? " has-value" : ""}`}>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            placeholder=" "
          />
          <label htmlFor="username">Email or username</label>
        </div>

        <div className={`login-field${password ? " has-value" : ""}`}>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder=" "
          />
          <label htmlFor="password">Password</label>
        </div>

        <label className="login-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Remember me</span>
        </label>

        <Button id="login-submit" onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Signing in…" : "Sign In"}
        </Button>
      </form>
    </div>
  );
}
