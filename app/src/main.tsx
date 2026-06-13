import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import CustomerView from "./CustomerView";
import OperatorDashboard from "./OperatorDashboard";

// Routes by hash:
//   #customer -> World ID customer surface (the mini app)
//   #demo     -> scripted mission-control (backup narrative, rich Ledger modal)
//   default   -> live operator dashboard (polls the backend, agent activity)
const route = window.location.hash.replace("#", "");
const view = route === "customer" ? <CustomerView /> : route === "demo" ? <App /> : <OperatorDashboard />;

createRoot(document.getElementById("root")!).render(<StrictMode>{view}</StrictMode>);

window.addEventListener("hashchange", () => window.location.reload());
