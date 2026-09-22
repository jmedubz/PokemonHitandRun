import React from 'react';

export interface ArcadeGameProps {
  onExit: () => void;
  machineName: string;
}

export type ArcadeGameGenre =
  | 'Racing'
  | 'Space Shooter'
  | 'Brawler / Fighting'
  | 'Classic Arcade'
  | 'Maze / Chase'
  | 'Brick Breaker'
  | 'Custom Imported';

export interface ArcadeGameModule {
  id: string;
  title: string;
  subtitle: string;
  genre: ArcadeGameGenre;
  year: string;
  players: string;
  description: string;
  controlsHint: string;
  marqueeColor: string;
  accentColor: string;
  badge?: string;
  component: React.ComponentType<ArcadeGameProps>;
}
