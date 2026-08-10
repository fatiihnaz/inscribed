// Intercepting route: an alternate render of a path another page already owns.
export default function InterceptedPhoto() {
  return <EditableRegion blockPath="photo.title" blockType="LongText" defaultValue="x" />;
}
