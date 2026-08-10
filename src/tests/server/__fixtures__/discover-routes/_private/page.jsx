// Private folder: Next never routes it, so it is not a page of its own.
export default function Private() {
  return <EditableRegion blockPath="private.title" blockType="LongText" defaultValue="x" />;
}
