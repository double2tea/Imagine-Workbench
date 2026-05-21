interface FloatingCompareButtonProps {
  selectedCount: number;
  show: boolean;
  onOpen: () => void;
}

export default function FloatingCompareButton({ selectedCount, show, onOpen }: FloatingCompareButtonProps) {
  if (!show) return null;

  return (
    <div className="imagine-floating-compare fixed top-20 right-6 z-30">
      <button
        onClick={onOpen}
        className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 rounded-full text-slate-950 text-xs font-bold border border-amber-600 shadow-xl shadow-amber-500/10 cursor-pointer hover:bg-amber-450 motion-safe:animate-bounce"
      >
        <span>🔄 调谐对比器 ({selectedCount}/2)</span>
      </button>
    </div>
  );
}
