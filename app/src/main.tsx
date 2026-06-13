import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import CustomerView from "./CustomerView";
import OperatorDashboard from "./OperatorDashboard";

// Routes by hash:
//   #customer -> World ID customer surface (the mini app)
//   #ops      -> live operator dashboard (polls the backend, agent activity)
//   default   -> scripted judge mission control
const route = window.location.hash.replace("#", "");
const view = route === "customer" ? <CustomerView /> : route === "ops" ? <OperatorDashboard /> : <App />;

createRoot(document.getElementById("root")!).render(<StrictMode>{view}</StrictMode>);

window.addEventListener("hashchange", () => window.location.reload());
