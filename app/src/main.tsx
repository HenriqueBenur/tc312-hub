import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

async function boot() {
  // Fora do Tauri (navegador comum, só em desenvolvimento): usa um backend simulado.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window && (window as any).__TAURI_INTERNALS__?.invoke)) {
    const { installDevMock } = await import("./devMock");
    installDevMock();
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

boot();
