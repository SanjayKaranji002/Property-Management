import { createRoot } from "react-dom/client";
import { PmApp } from "./pm/app";
import "./styles.css";

// The property-management frontend (src/client/pm). The original OpenProperty
// app in ./app is kept in the tree for reference but no longer mounted.
createRoot(document.getElementById("app")!).render(<PmApp />);
