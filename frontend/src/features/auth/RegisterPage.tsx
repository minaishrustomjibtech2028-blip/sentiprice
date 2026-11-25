import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import type { AxiosError } from "axios";
import { AlertCircle, Eye, EyeOff, Lock, Mail, User } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast";
import { ROLE_META } from "@/lib/roles";
import { registerSchema, type RegisterFormValues } from "@/features/auth/schemas";

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(values: RegisterFormValues) {
    setServerError(null);
    try {
      const user = await registerUser(values);
      toast({
        kind: "success",
        title: "Account created",
        message: `Welcome, ${user.full_name.split(" ")[0]} — you're signed in as ${ROLE_META[user.role].label}.`,
      });
      navigate("/", { replace: true });
    } catch (err) {
      const axiosErr = err as AxiosError<{ detail?: string }>;
      setServerError(
        axiosErr.response?.status === 409
          ? "An account with that email already exists."
          : axiosErr.response?.data?.detail ?? "Registration failed. Please try again."
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-4 py-10">
      <Link to="/login" className="mb-6 flex items-center gap-1">
        <span className="text-2xl font-bold tracking-tight text-amz-navy">sentiprice</span>
        <span className="text-2xl font-bold text-amz-hover">.ai</span>
      </Link>

      <div className="w-full max-w-sm rounded-lg border border-amz-border p-6 shadow-sm">
        <h1 className="text-2xl font-normal">Create account</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
          <div>
            <label className="mb-1 block text-xs font-bold" htmlFor="full_name">Your name</label>
            <div className="relative">
              <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amz-muted" />
              <input id="full_name" autoComplete="name" className="amz-input pl-8" {...register("full_name")} />
            </div>
            {errors.full_name && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amz-red"><AlertCircle size={12} /> {errors.full_name.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold" htmlFor="email">Email</label>
            <div className="relative">
              <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amz-muted" />
              <input id="email" type="email" autoComplete="email" className="amz-input pl-8" {...register("email")} />
            </div>
            {errors.email && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amz-red"><AlertCircle size={12} /> {errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold" htmlFor="password">Password</label>
            <div className="relative">
              <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amz-muted" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
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
            {errors.password ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-amz-red"><AlertCircle size={12} /> {errors.password.message}</p>
            ) : (
              <p className="mt-1 text-[11px] text-amz-muted">At least 8 characters.</p>
            )}
          </div>

          {serverError && (
            <div className="flex items-start gap-2 rounded-md border border-amz-red/30 bg-red-50 px-3 py-2 text-xs text-amz-red">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {serverError}
            </div>
          )}

          <button type="submit" disabled={isSubmitting} className="btn btn-yellow w-full py-2 font-medium">
            {isSubmitting ? "Creating account…" : "Create your SentiPrice AI account"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-2 text-[11px] text-amz-muted">
          <div className="h-px flex-1 bg-amz-border" /> or <div className="h-px flex-1 bg-amz-border" />
        </div>
        <Link to="/login" className="btn btn-light block w-full py-2 text-center font-medium">
          Sign in to an existing account
        </Link>
      </div>
    </div>
  );
}
