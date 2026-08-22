import type { Coordinates, NavigationState, Route, TravelProfile } from '../../types';
import { findNearestPointIndex } from '../../utils/distance';

export type NavigationAction =
  | { type: 'SET_ORIGIN'; origin: Coordinates }
  | { type: 'SET_DESTINATION'; destination: Coordinates }
  | { type: 'SET_TRAVEL_PROFILE'; profile: TravelProfile }
  | { type: 'ROUTE_PLANNED'; route: Route }
  | { type: 'START_NAVIGATION' }
  | { type: 'POSITION_UPDATED'; position: Coordinates }
  | { type: 'RESET' };

export const initialNavigationState: NavigationState = {
  status: 'idle',
  origin: null,
  destination: null,
  route: null,
  currentStepIndex: 0,
  travelProfile: 'driving',
};

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'SET_ORIGIN':
      return { ...state, origin: action.origin };

    case 'SET_DESTINATION':
      return { ...state, destination: action.destination, status: 'idle', route: null };

    case 'SET_TRAVEL_PROFILE':
      return { ...state, travelProfile: action.profile };

    case 'ROUTE_PLANNED':
      return { ...state, route: action.route, status: 'routePlanned', currentStepIndex: 0 };

    case 'START_NAVIGATION':
      if (state.status !== 'routePlanned' || !state.route) {
        return state;
      }
      return { ...state, status: 'navigating' };

    case 'POSITION_UPDATED': {
      if (state.status !== 'navigating' || !state.route) {
        return { ...state, origin: action.position };
      }
      const nearestIndex = findNearestPointIndex(action.position, state.route.geometry);
      const stepCount = state.route.steps.length;
      const progressRatio = nearestIndex / Math.max(state.route.geometry.length - 1, 1);
      const nextStepIndex = Math.min(Math.floor(progressRatio * stepCount), stepCount - 1);
      return {
        ...state,
        origin: action.position,
        currentStepIndex: Math.max(nextStepIndex, state.currentStepIndex),
      };
    }

    case 'RESET':
      return initialNavigationState;

    default:
      return state;
  }
}
