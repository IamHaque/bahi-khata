import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { readEnv } from "./lib/env";
import { ConfigError } from "./components/app/ConfigError";

// The environment must be valid before anything imports src/lib/supabase,
// which throws at import time when the URL is missing (S-47). Only when it
// is valid do we load the app itself.
const result = readEnv();

const container = document.getElementById("root")!;

if (!result.ok) {
  createRoot(container).render(
    <StrictMode>
      <ConfigError problems={result.problems} />
    </StrictMode>,
  );
} else {
  const { default: App } = await import("./App");
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
