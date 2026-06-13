import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import CustomerView from "./CustomerView";

// #customer -> the World Mini App customer surface; default -> judge mission control.
const isCustomer = window.location.hash.replace("#", "") === "customer";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isCustomer ? <CustomerView /> : <App />}</StrictMode>,
);

window.addEventListener("hashchange", () => window.location.reload());
