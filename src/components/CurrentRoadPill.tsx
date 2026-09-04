interface CurrentRoadPillProps {
  name: string;
}

export function CurrentRoadPill({ name }: CurrentRoadPillProps) {
  if (name === '') {
    return null;
  }
  return (
    <div className="max-w-[80vw] truncate rounded-full bg-white px-4 py-1.5 text-sm font-medium text-slate-900 shadow-lg">
      {name}
    </div>
  );
}
