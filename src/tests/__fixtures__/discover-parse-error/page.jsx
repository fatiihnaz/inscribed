import { withCms } from "inscribed";
import Broken from "./broken";

function Page() {
  return (
    <main>
      <EditableRegion blockPath="ok.title" blockType="Text" defaultValue="ok" />
      <Broken />
    </main>
  );
}

export default withCms("/ok", Page);
