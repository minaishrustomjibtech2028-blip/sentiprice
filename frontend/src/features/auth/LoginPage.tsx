import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { AxiosError } from "axios";
import { AlertCircle, Eye, EyeOff, Lock, Mail } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";
import { ROLE_META } from "@/lib/roles";
import { loginSchema, type LoginFormValues } from "@/features/auth/schemas";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const from = (location.state as { from?: string } | null)?.from;

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    try {
      const user = await login(values);
      toast({
        kind: "success",
        title: `Welcome back, ${user.full_name.split(" ")[0]}!`,
        message: `Signed in as ${ROLE_META[user.role].label}.`,
        dedupeKey: "signed-in",
      });
      navigate(from && from !== "/login" ? from : "/", { replace: true });
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>;
      const status = axiosErr.response?.status;
      if (status === 403) {
        setServerError(
          axiosErr.response?.data?.detail ?? "This account has been deactivated. Contact an administrator."
        );
      } else if (status === 401) {
        setServerError("Incorrect email or password.");
      } else {
        setServerError(axiosErr.response?.data?.detail ?? "Login failed. Please try again.");
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-4 py-10">
      <Link to="/login" className="mb-6 flex items-center gap-1">
        <span className="text-2xl font-bold tracking-tight text-amz-navy">sentiprice</span>
        <span className="text-2xl font-bold text-amz-hover">.ai</span>
      </Link>

      <div className="w-full max-w-sm rounded-lg border border-amz-border p-6 shadow-sm">
        <h1 className="text-2xl font-normal">Sign in</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
          <div>
            <label className="mb-1 block text-xs font-bold" htmlFor="email">
              Email
            </label>
            <div className="relative">
              <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amz-muted" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="amz-input pl-8"
                {...register("email")}
              />
            </div>
            {errors.email && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amz-red">
                <AlertCircle size={12} /> {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-bold" htmlFor="password">
                Password
              </label>
            </div>
            <div className="relative">
              <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amz-muted" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="amz-input pl-8 pr-9"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amz-muted hover:text-black"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amz-red">
                <AlertCircle size={12} /> {errors.password.message}
              </p>
            )}
          </div>

          {serverError && (
            <div className="flex items-start gap-2 rounded-md border border-amz-red/30 bg-red-50 px-3 py-2 text-xs text-amz-red">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {serverError}
            </div>
          )}

          <button type="submit" disabled={isSubmitting} className="btn btn-yellow w-full py-2 font-medium">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-[11px] text-amz-muted">
          By continuing, you agree this is an academic demo (final-year B.Tech project), not a real e-commerce
          checkout.
        </p>

        <div className="my-5 flex items-center gap-2 text-[11px] text-amz-muted">
          <div className="h-px flex-1 bg-amz-border" /> New here? <div className="h-px flex-1 bg-amz-border" />
        </div>
        <Link to="/register" className="btn btn-light block w-full py-2 text-center font-medium">
          Create your account
        </Link>
        {import.meta.env.VITE_PRESENTATION_ACCOUNTS === "true" && (
          <section className="mt-5 space-y-1 border-t border-amz-border pt-4 text-sm">
            <h2 className="font-semibold">Presentation accounts</h2>
            <p>Admin: <code>admin@sentiprice.ai</code></p>
            <p>Analyst: <code>analyst@sentiprice.ai</code></p>
            <p className="text-xs text-amz-muted">Demo password for both: <code>Demo@1234</code>. If you already set a private admin password, use that password for Admin.</p>
          </section>
        )}
      </div>

    </div>
  );
}
