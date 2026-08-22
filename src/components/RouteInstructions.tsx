import type { RouteStep } from '../types';
import { formatDistance } from '../utils/format';

interface RouteInstructionsProps {
  steps: RouteStep[];
  currentStepIndex: number;
}

export function RouteInstructions({ steps, currentStepIndex }: RouteInstructionsProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <ol className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {steps.map((step, index) => (
        <li
          key={`${step.instruction}-${index}`}
          data-testid="route-step"
          aria-current={index === currentStepIndex ? 'step' : undefined}
          className={`px-4 py-3 ${index === currentStepIndex ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'}`}
        >
          <p>{step.instruction}</p>
          <p className="text-sm text-slate-500">{formatDistance(step.distanceMeters)}</p>
        </li>
      ))}
    </ol>
  );
}
