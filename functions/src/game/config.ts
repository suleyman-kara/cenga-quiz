import { club } from "../../../src/club.config";
import type { GameConfig } from "../core/room";

export const gameConfig: GameConfig = club.game;
/** prefix for generated replacement names ("Oyuncu" → "Oyuncu 3") */
export const namePrefix = club.locale === "en" ? "Player" : "Oyuncu";
