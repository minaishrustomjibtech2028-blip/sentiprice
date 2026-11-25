import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "@/lib/auth-context";
import { LiveProvider } from "@/lib/live";
import { ToastProvider } from "@/lib/toast";
import { Layout } from "@/components/Layout";
import { RequireAuth, RequireRole } from "@/routes/guards";

// Route-level code splitting: each feature page (and its charting/forms
// libraries) loads only when the user navigates to it, instead of all
// being bundled into one large initial chunk.
const LoginPage = lazy(() => import("@/features/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/features/auth/RegisterPage"));
const HomePage = lazy(() => import("@/features/dashboard/HomePage"));
const AdminConsolePage = lazy(() => import("@/features/admin/AdminConsolePage"));
const AlertsPage = lazy(() => import("@/features/alerts/AlertsPage"));
const AnalyticsPage = lazy(() => import("@/features/analytics/AnalyticsPage"));
const CopilotPage = lazy(() => import("@/features/copilot/CopilotPage"));
const ProductListPage = lazy(() => import("@/features/products/ProductListPage"));
const ProductDetailPage = lazy(() => import("@/features/products/ProductDetailPage"));
const ProductFormPage = lazy(() => import("@/features/products/ProductFormPage"));
const ProductAnalysisPage = lazy(() => import("@/features/products/ProductAnalysisPage"));

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-amz-border border-t-amz-orange" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Authenticated({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <LiveProvider>
        <Layout>{children}</Layout>
      </LiveProvider>
    </RequireAuth>
  );
}

function RoleGated({ roles, children }: { roles: ("ADMIN" | "ANALYST" | "BUSINESS_USER")[]; children: React.ReactNode }) {
  return (
    <RequireRole roles={roles}>
      <LiveProvider>
        <Layout>{children}</Layout>
      </LiveProvider>
    </RequireRole>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              <Route path="/" element={<Authenticated><HomePage /></Authenticated>} />
              <Route path="/products" element={<Authenticated><ProductListPage /></Authenticated>} />
              <Route path="/products/:productId" element={<Authenticated><ProductDetailPage /></Authenticated>} />
              <Route
                path="/products/:productId/analysis"
                element={<RoleGated roles={["ADMIN", "ANALYST", "BUSINESS_USER"]}><ProductAnalysisPage /></RoleGated>}
              />
              <Route path="/products/new" element={<RoleGated roles={["ADMIN"]}><ProductFormPage /></RoleGated>} />
              <Route path="/products/:productId/edit" element={<RoleGated roles={["ADMIN"]}><ProductFormPage /></RoleGated>} />

              <Route path="/copilot" element={<Authenticated><CopilotPage /></Authenticated>} />
              <Route path="/alerts" element={<Authenticated><AlertsPage /></Authenticated>} />
              <Route path="/analytics" element={<RoleGated roles={["ADMIN", "ANALYST"]}><AnalyticsPage /></RoleGated>} />
              <Route path="/admin" element={<RoleGated roles={["ADMIN"]}><AdminConsolePage /></RoleGated>} />
            </Routes>
            </Suspense>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
