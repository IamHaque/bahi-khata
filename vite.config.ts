import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // S-48 - split stable vendor groups out of the entry chunk, and
        // give each lazily loaded page the name of its route so bundle
        // reports stay readable (Rollup ignores webpackChunkName).
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-router")) return "react-router";
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("@tanstack")) return "react-query";
            if (id.includes("zod")) return "zod";
            return undefined;
          }
          const routeChunks: Array<[string, string]> = [
            ["pages/Login", "login"],
            ["CreateBusinessPage", "onboarding"],
            ["pages/BusinessesPage", "businesses"],
            ["pages/SettingsPage", "business-settings"],
            ["pages/MembersPage", "members"],
            ["pages/CustomersPage", "customers"],
            ["CustomerDetailPage", "customer-detail"],
            ["pages/TransactionsPage", "transactions"],
            ["TransactionDetailPage", "transaction-detail"],
            ["pages/DashboardPage", "dashboard"],
            ["pages/ImportPage", "import"],
            ["pages/StatementPage", "statement"],
            ["LandingResolver", "landing"],
            ["dev/UiGallery", "ui-gallery"],
          ];
          for (const [needle, name] of routeChunks) {
            if (id.includes(needle)) return name;
          }
          return undefined;
        },
      },
    },
  },
});
