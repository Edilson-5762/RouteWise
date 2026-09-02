interface SpeedometerProps {
  speedMetersPerSecond: number | null;
}

export function Speedometer({ speedMetersPerSecond }: SpeedometerProps) {
  const kmh = speedMetersPerSecond != null ? Math.round(speedMetersPerSecond * 3.6) : 0;
  return (
    <div className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-white text-slate-900 shadow-lg">
      <span className="text-lg font-bold leading-none">{kmh}</span>
      <span className="text-[10px] leading-none opacity-70">km/h</span>
    </div>
  );
}
