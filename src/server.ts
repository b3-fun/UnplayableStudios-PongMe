import dotenv from "dotenv";
dotenv.config();

import { Server, Socket } from "socket.io";
import { playGame } from "./game";
import { gameStateType } from "./types";
import { gameEnv, gameParams, games, gameState } from "./globals";
import { formatAddress, formatUsername } from "./basement.util";

const clients: { client: Socket; roomName: string }[] = [];

// Add at the top with other interfaces
interface WaitingPlayer {
  socket: Socket;
  playerName: string;
  playerToken: string;
}

// Update the waitingPlayers array type
const waitingPlayers: WaitingPlayer[] = [];

// Update the token verification function to match your format
interface B3TokenPayload {
  id: string;
  address: string;
  username?: string;
  avatar?: string;
}

function verifyToken(token: string): string | null {
  try {
    const base64Payload = token.split(".")[1];
    const payload = Buffer.from(base64Payload, "base64").toString();
    const decoded = JSON.parse(payload) as B3TokenPayload;
    return decoded.username
      ? formatUsername(decoded.username)
      : formatAddress(decoded.address);
  } catch (err) {
    return null;
  }
}

// Handle events emitted by client to socket.io server.
export function handleClient(client: Socket, io: Server) {
  function startGame(roomName: string, game: gameStateType) {
    io.to(roomName).emit("startGame", {});
    setTimeout(() => {
      playGame(io, roomName, game);
    }, gameParams.roundBreak);
  }

  function joinRandomGame(
    data: { playerName: string; token: string },
    callback: (error?: string) => void
  ) {
    // Verify token if provided
    if (data.token) {
      const username = verifyToken(data.token);
      if (!username) {
        callback("Invalid token");
        return;
      }
      data.playerName = username;
    }

    if (!data.playerName.length) {
      callback("Please reconnect");
      return;
    }

    if (waitingPlayers.length > 0) {
      // Match with waiting player
      const opponent = waitingPlayers.shift()!;
      const roomName = Math.random().toString(36).substring(2, 8);

      // Create new game
      const game = JSON.parse(JSON.stringify(gameState));
      // Put the waiting player (first to join) on the right side (p2)
      game.p2.name = opponent.playerName;
      game.p2.token = opponent.playerToken;
      game.p1.name = data.playerName; // Put the new player on the left side (p1)
      game.p1.token = data.token;
      games.set(roomName, game);

      // Join both players to room
      client.join(roomName);
      opponent.socket.join(roomName);
      clients.push({ client, roomName });
      clients.push({ client: opponent.socket, roomName });

      // Send game data to new player (current client)
      io.to(client.id).emit("gameData", {
        playerNumber: 1, // They'll be player 1 (left side)
        gameEnv,
        gameState: game,
        roomName,
      });

      // Send game data to waiting player (opponent)
      io.to(opponent.socket.id).emit("gameData", {
        playerNumber: 2, // They'll be player 2 (right side)
        gameEnv,
        gameState: game,
        roomName,
      });

      startGame(roomName, game);
      callback();
    } else {
      // Add to waiting queue with player name
      waitingPlayers.push({
        socket: client,
        playerName: data.playerName,
        playerToken: data.token,
      });
      callback();
    }
  }

  function joinSinglePlayer(
    data: { playerName: string; token?: string },
    callback: (error?: string) => void
  ) {
    try {
      // Create a new room for single player
      const roomName = `single_${client.id}`;
      client.join(roomName);

      // Initialize game state with AI opponent
      const game: gameStateType = {
        p1: {
          x: gameEnv.p1Location.x,
          y: gameEnv.p1Location.y,
          score: 0,
          name: "AI",
          paused: false,
          token: "",
        },
        p2: {
          x: gameEnv.p2Location.x,
          y: gameEnv.p2Location.y,
          score: 0,
          name: data.playerName,
          paused: false,
          token: data.token || "",
        },
        ball: {
          x: gameEnv.tableCenter.x - gameEnv.ballRadius,
          y: gameEnv.tableCenter.y - gameEnv.ballRadius,
          vx: gameParams.ballVelocity.x,
          vy: gameParams.ballVelocity.y,
          speed: gameParams.ballVelocity.v,
        },
        mainLoop: null,
        isSinglePlayer: true,
        roomName: roomName,
      };

      // Store game state
      games.set(roomName, game);

      // Send initial game data to player
      client.emit("gameData", {
        playerNumber: 2, // Player is always player 2 in single player
        gameEnv: gameEnv,
        gameState: game,
        roomName: roomName,
      });

      // Start the game immediately
      client.emit("startGame");

      // Start game loop
      playGame(io, roomName, game);
    } catch (error: any) {
      callback(error.message);
    }
  }

  function joinRoom(
    data: { playerName: string; roomName: string },
    callback: (error?: string) => void
  ) {
    if (!data.playerName.length || !data.roomName.length) {
      callback("Player name and room name are required.");
    }
    const roomExists = games.get(data.roomName);
    let game;
    if (roomExists) {
      game = games.get(data.roomName);
      if (game.p1.name.length && game.p2.name.length) {
        callback("Room is full.");
      }
      game.p2.name = data.playerName;
    } else {
      game = JSON.parse(JSON.stringify(gameState));
      game.p1.name = data.playerName;
      games.set(data.roomName, game);
    }
    client.join(data.roomName);
    clients.push({ client, roomName: data.roomName });
    io.to(data.roomName).emit("gameData", {
      playerNumber: roomExists ? 2 : 1,
      gameEnv,
      gameState: game,
    });
    if (roomExists) {
      startGame(data.roomName, game);
    }
    callback();
  }

  function movePlayer(data: {
    playerNumber: number;
    roomName: string;
    direction: number;
  }) {
    const game = games.get(data.roomName);
    if (!game) return;
    const player = data.playerNumber === 1 ? game.p1 : game.p2;
    if (data.direction === 1) {
      if (player.y - gameParams.playerSpeed > 0) {
        player.y -= gameParams.playerSpeed;
      } else {
        player.y = 0;
      }
    } else if (data.direction === -1) {
      if (
        player.y + gameEnv.paddleHeight + gameParams.playerSpeed <
        gameEnv.tableHeight
      ) {
        player.y += gameParams.playerSpeed;
      } else {
        player.y = gameEnv.tableHeight - gameEnv.paddleHeight;
      }
    }
    io.to(data.roomName).emit("locationUpdate", {
      playerNumber: data.playerNumber,
      newLocation: { x: player.x, y: player.y },
    });
  }

  function pauseGame(data: { playerNumber: number; roomName: string }) {
    if (games.get(data.roomName) === null) return;
    if (data.playerNumber === 1) {
      games.get(data.roomName).p1.paused = !games.get(data.roomName).p1.paused;
    } else {
      games.get(data.roomName).p2.paused = !games.get(data.roomName).p2.paused;
    }
    io.to(data.roomName).emit("interrupt", { code: data.playerNumber });
  }

  function disconnect() {
    // Remove from waiting players if present
    const waitingIndex = waitingPlayers.findIndex((wp) => wp.socket === client);
    if (waitingIndex !== -1) {
      waitingPlayers.splice(waitingIndex, 1);
    }

    for (let i = 0; i < clients.length; i++) {
      if (clients[i].client === client) {
        const game = games.get(clients[i].roomName);
        if (game) {
          clearInterval(game.mainLoop);
        }
        games.delete(clients[i].roomName);
        io.to(clients[i].roomName).emit("interrupt", { code: 0 });
        clients.splice(i, 1);
        return;
      }
    }
  }

  client.on("joinSinglePlayer", joinSinglePlayer);
  client.on("joinRandomGame", joinRandomGame);
  client.on("joinRoom", joinRoom);
  client.on("movePlayer", movePlayer);
  client.on("pauseGame", pauseGame);
  client.on("disconnect", disconnect);
}
