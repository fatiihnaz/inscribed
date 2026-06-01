import Deep from "./Deep";

// No CMS markers here - this file only exists to bridge an import edge from a
// withCms root to Deep.jsx, exercising DFS through a "pass-through" file.
export default function Wrapper() {
  return <Deep />;
}
