export function ImportPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-panel p-6">
      <button type="button" onClick={onClose}>
        Zavřít
      </button>
    </div>
  )
}
