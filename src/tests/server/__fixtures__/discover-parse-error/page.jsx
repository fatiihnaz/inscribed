import Broken from "./broken";

export default function Page() {
  return (
    <main>
      <EditableRegion blockPath="ok.title" blockType="LongText" defaultValue="ok" />
      <Broken />
    </main>
  );
}
