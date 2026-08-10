// Parallel-route slot: renders into a layout slot, never at its own URL.
export default function Modal() {
  return <EditableRegion blockPath="modal.title" blockType="LongText" defaultValue="x" />;
}
