/**
 * StartScreen.tsx
 * Orchestrates the AAA Game Experience:
 * 1. TitleScreen: High-impact cinematic intro screen with title, specs, and ignition launch button.
 * 2. MainMenuDashboard: Full-screen race operations hub replacing previous modal window,
 *    housing Grand Prix (5 Cars), Free Practice (Time Trial), 1v1 Multiplayer Paddock,
 *    3D Model Garage, Camera Setup, and Controls.
 */

import React, { useState, useEffect } from 'react';
import { TitleScreen } from './TitleScreen';
import { MainMenuDashboard } from './MainMenuDashboard';
import { CameraDistanceMode, CameraViewMode } from '../game/RacingGameEngine';
import { MultiplayerRoomState } from '../game/multiplayer/MultiplayerClient';
import { RaceDifficulty, RaceLapOption } from '../game/career/CareerTypes';
import { TireCompoundType } from '../game/physics/TireCompound';
import { CircuitId } from '../game/circuits/ICircuit';

export interface StartScreenProps {
  onStartSolo: (
    cameraDistance: CameraDistanceMode,
    cameraMode: CameraViewMode,
    laps: RaceLapOption,
    difficulty: RaceDifficulty,
    startingCompound: TireCompoundType,
    circuitId?: CircuitId
  ) => void;
  onStartFreePractice?: (
    cameraDistance: CameraDistanceMode,
    cameraMode: CameraViewMode,
    startingCompound: TireCompoundType,
    circuitId?: CircuitId
  ) => void;
  selectedCircuit?: CircuitId;
  onSelectCircuit?: (circuitId: CircuitId) => void;
  onCreateRoom: (options: {
    playerName: string;
    laps: number;
    car1Name: string;
    car2Name: string;
    crewName: string;
    cameraDistance: CameraDistanceMode;
    cameraMode: CameraViewMode;
    car1Data?: string;
    car2Data?: string;
    crewData?: string;
  }) => Promise<void>;
  onJoinRoom: (code: string, playerName: string, cameraDistance: CameraDistanceMode, cameraMode: CameraViewMode) => Promise<void>;
  onStartMultiplayerRace: () => void;
  onSetReady: (isReady: boolean) => void;
  onLeaveRoom: () => void;
  roomState: MultiplayerRoomState | null;
  playerId: 'p1' | 'p2' | null;
  isConnecting: boolean;
  errorMessage: string | null;
  onOpenModelUpload: (target: 'car1' | 'car2' | 'crew') => void;
  car1Name: string;
  car2Name: string;
  crewName: string;
}

export const StartScreen: React.FC<StartScreenProps> = (props) => {
  // If player is already inside a multiplayer room or connecting, default directly to dashboard
  const [screenPhase, setScreenPhase] = useState<'title' | 'dashboard'>(() => {
    return props.roomState ? 'dashboard' : 'title';
  });

  // Switch to dashboard if roomState changes dynamically
  useEffect(() => {
    if (props.roomState && screenPhase === 'title') {
      setScreenPhase('dashboard');
    }
  }, [props.roomState, screenPhase]);

  if (screenPhase === 'title') {
    return (
      <TitleScreen
        onEnter={() => setScreenPhase('dashboard')}
      />
    );
  }

  return (
    <MainMenuDashboard
      {...props}
      onBackToTitle={() => setScreenPhase('title')}
    />
  );
};
