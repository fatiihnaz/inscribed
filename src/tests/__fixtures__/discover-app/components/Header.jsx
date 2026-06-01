export default function Header() {
  return (
    <header>
      <EditableRegion
        blockPath="header.logo"
        blockType="Image"
        defaultValue={{ src: "" }}
        scope="global"
      />
    </header>
  );
}
