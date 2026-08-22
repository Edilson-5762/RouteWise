import type { Coordinates, NavigationState, Route, TravelProfile } from '../../types';
import { findNearestPointIndex, haversineDistanceMeters } from '../../utils/distance';

const ARRIVAL_THRESHOLD_METERS = 30;
const DEVIATION_THRESHOLD_METERS = 50;

export type NavigationAction =
  | { type: 'SET_ORIGIN'; origin: Coordinates }
  | { type: 'SET_DESTINATION'; destination: Coordinates }
  | { type: 'SET_TRAVEL_PROFILE'; profile: TravelProfile }
  | { type: 'ROUTE_PLANNED'; route: Route }
  | { type: 'ROUTE_RECALCULATED'; route: Route }
  | { type: 'ROUTE_DEVIATED' }
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
  routeDeviated: false,
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

    case 'ROUTE_RECALCULATED':
      return { ...state, route: action.route, currentStepIndex: 0, routeDeviated: false };

    case 'ROUTE_DEVIATED':
      return { ...state, routeDeviated: true };

    case 'START_NAVIGATION':
      if (state.status !== 'routePlanned' || !state.route) {
        return state;
      }
      return { ...state, status: 'navigating' };

    case 'POSITION_UPDATED': {
      if (state.status !== 'navigating' || !state.route) {
        return { ...state, origin: action.position };
      }

      if (
        state.destination &&
        haversineDistanceMeters(action.position, state.destination) < ARRIVAL_THRESHOLD_METERS
      ) {
        return { ...state, origin: action.position, status: 'arrived' };
      }

      const nearestIndex = findNearestPointIndex(action.position, state.route.geometry);
      const distanceToRoute = haversineDistanceMeters(
        action.position,
        state.route.geometry[nearestIndex],
      );
      const stepCount = state.route.steps.length;
      const progressRatio = nearestIndex / Math.max(state.route.geometry.length - 1, 1);
      const nextStepIndex = Math.min(Math.floor(progressRatio * stepCount), stepCount - 1);

      return {
        ...state,
        origin: action.position,
        currentStepIndex: Math.max(nextStepIndex, state.currentStepIndex),
        routeDeviated: distanceToRoute > DEVIATION_THRESHOLD_METERS ? true : state.routeDeviated,
      };
    }

    case 'RESET':
      return initialNavigationState;

    default:
      return state;
  }
}
