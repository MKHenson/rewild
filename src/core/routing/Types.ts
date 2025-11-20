import { Renderer } from 'rewild-renderer';
import { Player } from './Player';
import { GameManager } from '../GameManager';

export type StateMachineData = {
  renderer: Renderer;
  gameManager: GameManager;
  player: Player;
};
