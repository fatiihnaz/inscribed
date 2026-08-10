import Deep from "./Deep";

// No regions here - this file only exists to bridge an import edge from a page
// root to Deep.jsx, exercising DFS through a "pass-through" file.
export default function Wrapper() {
  return <Deep />;
}
