import { gameEnvType, gameStateType } from "./types";

// Maps a room name to a gameState
export const games = new Map();

// Properties sent to client for visualizing game.
export const gameEnv: gameEnvType = {
  frameRate: 20,
  tableHeight: 600,
  tableWidth: 1200,
  paddleHeight: 150,
  paddleWidth: 20,
  ballRadius: 10,
  margin: 80,
  get tableCenter() {
    return {
      x: this.tableWidth / 2,
      y: this.tableHeight / 2,
    };
  },
  get p1Location() {
    return {
      x: this.tableWidth - this.margin - this.paddleWidth,
      y: (this.tableHeight - this.paddleHeight) / 2,
    };
  },
  get p2Location() {
    return {
      x: this.margin,
      y: (this.tableHeight - this.paddleHeight) / 2,
    };
  },
};

// Parameters for game logic, used only by server.
export const gameParams = {
  roundBreak: 2000,
  playerSpeed: 11,
  winningScore: 5,
  ballVelocity: {
    x: 6,
    y: 6,
    get v() {
      return Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.x, 2));
    },
  },
};

// Represents an ongoing game.
export const gameState: gameStateType = {
  mainLoop: null,
  ball: {
    x: gameEnv.tableCenter.x - gameEnv.ballRadius,
    y: gameEnv.tableCenter.y - gameEnv.ballRadius,
    vx: gameParams.ballVelocity.x,
    vy: gameParams.ballVelocity.y,
    speed: gameParams.ballVelocity.v,
  },
  p1: {
    name: "",
    token: "",
    x: gameEnv.p1Location.x,
    y: gameEnv.p1Location.y,
    score: 0,
    paused: false,
  },
  p2: {
    name: "",
    token: "",
    x: gameEnv.p2Location.x,
    y: gameEnv.p2Location.y,
    score: 0,
    paused: false,
  },
};
