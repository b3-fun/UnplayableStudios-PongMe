import { io } from "socket.io-client";
import { gameEnvType, gameStateType } from "./types";
import { formatAddress, formatUsername } from "./basement.util";

// Update the JWT parsing function to match your format
function decodeB3Token(token: string): {
  id: string;
  address: string;
  username?: string;
  avatar?: string;
} | null {
  try {
    const base64Payload = token.split(".")[1];
    // Use browser's atob for base64 decoding instead of Buffer
    const payload = atob(base64Payload);
    return JSON.parse(payload);
  } catch (e) {
    return null;
  }
}

// Get token from URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token");

const socket = io(window.location.href);
const playerInput = <HTMLInputElement>document.getElementById("user")!;
const scoreElement = document.getElementById("score")!;

const canvas = document.querySelector("canvas")!;
const context = canvas.getContext("2d")!;

// If token exists, decode it and set player name
if (token) {
  const payload = decodeB3Token(token);
  if (payload) {
    playerInput.value = payload.username
      ? formatUsername(payload.username)
      : formatAddress(payload.address);
    playerInput.setAttribute("disabled", "true");
  }
}

class Game {
  env: gameEnvType;
  state: gameStateType;

  constructor(env: gameEnvType, state: gameStateType) {
    this.env = env;
    this.state = state;
  }
}

class Player {
  number: number;
  direction: number;

  constructor(number: number, direction: number) {
    this.number = number;
    this.direction = direction; // 0: idle, 1: up, -1: down
  }
}

let game: Game, player: Player;

// Replace radio button constants with regular button elements
const singlePlayerBtn = document.getElementById("single") as HTMLButtonElement;
const multiPlayerBtn = document.getElementById("multi") as HTMLButtonElement;
const backBtn = document.getElementById("back") as HTMLButtonElement;

function disableInputs() {
  playerInput.setAttribute("disabled", "true");
  singlePlayerBtn.setAttribute("disabled", "true");
  multiPlayerBtn.setAttribute("disabled", "true");
}
const infoElement = document.getElementById("info")!;
const infoText = infoElement.querySelector(".info-text")!;

function showAlert(text: string) {
  // First fade out
  //infoText.classList.add("hidden");
  // Wait for fade out to complete before updating text and fading in
  infoText.textContent = text;
  infoText.classList.remove("hidden");
}

// Replace radio change handlers with click handlers
singlePlayerBtn.onclick = () => {
  showAlert("Starting single player game...");
  backBtn.classList.remove("hidden");
  multiPlayerBtn.classList.add("hidden");
  singlePlayerBtn.classList.add("hidden");

  socket.emit(
    "joinSinglePlayer",
    {
      playerName: playerInput.value,
      token: token,
    },
    (error: string) => {
      if (error) {
        showAlert(error);
      }
    }
  );
  disableInputs();
};

backBtn.onclick = () => {
  window.location.href = getRedirectUrl();
  backBtn.classList.add("hidden");
  multiPlayerBtn.classList.remove("hidden");
  singlePlayerBtn.classList.remove("hidden");
};

multiPlayerBtn.onclick = () => {
  backBtn.classList.remove("hidden");
  multiPlayerBtn.classList.add("hidden");
  singlePlayerBtn.classList.add("hidden");
  showAlert("Waiting for player to join...");

  socket.emit(
    "joinRandomGame",
    {
      playerName: playerInput.value,
      token: token,
    },
    (error: string) => {
      if (error) {
        showAlert(error);
      }
    }
  );
  disableInputs();
};

// handle socket events
{
  socket.on(
    "gameData",
    (data: {
      playerNumber: number;
      gameEnv: gameEnvType;
      gameState: gameStateType;
      roomName?: string;
    }) => {
      if (player) return;
      game = new Game(data.gameEnv, data.gameState);
      player = new Player(data.playerNumber, 0);

      if (data.roomName) {
        game.state.roomName = data.roomName;
        showAlert("");
      }

      // Show initial player names
      scoreElement.textContent = formatGameScore();

      setInterval(() => {
        draw_canvas();
      }, data.gameEnv.frameRate);
    }
  );

  socket.on("startGame", () => {
    scoreElement.style.visibility = "visible";
    backBtn.classList.add("hidden");
    showAlert("Prepare to start!");
    setTimeout(() => {
      showAlert("");
    }, 2000);

    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        switch (e.key) {
          case "ArrowUp":
            player.direction = 1;
            break;
          case "ArrowDown":
            player.direction = -1;
            break;
        }
        socket.emit("movePlayer", {
          playerNumber: player.number,
          direction: player.direction,
          roomName: game.state.roomName,
        });
      }
    });

    document.addEventListener("keyup", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        player.direction = 0;
        socket.emit("movePlayer", {
          playerNumber: player.number,
          direction: player.direction,
          roomName: game.state.roomName,
        });
      }
    });
  });

  socket.on(
    "locationUpdate",
    (data: { playerNumber: number; newLocation: { x: number; y: number } }) => {
      switch (data.playerNumber) {
        case 0:
          game.state.ball.x = data.newLocation.x;
          game.state.ball.y = data.newLocation.y;
          break;
        case 1:
          game.state.p1.x = data.newLocation.x;
          game.state.p1.y = data.newLocation.y;
          break;
        case 2:
          game.state.p2.x = data.newLocation.x;
          game.state.p2.y = data.newLocation.y;
          break;
      }
    }
  );

  socket.on("scoreUpdate", (data: { s1: number; s2: number }) => {
    game.state.p1.score = data.s1;
    game.state.p2.score = data.s2;
    scoreElement.textContent = formatGameScore();
  });

  socket.on("winnerUpdate", (data: { winnerNumber: number }) => {
    if (player.number === data.winnerNumber) {
      showAlert("You Won!");
    } else {
      showAlert("You Lost!");
    }
    window.location.href = getRedirectUrl();
  });

  socket.on("interrupt", (data: { code: number }) => {
    switch (data.code) {
      case 0:
        showAlert("Other player disconnected");
        setTimeout(() => {
          window.location.href = getRedirectUrl();
        }, 3000);
        break;
      case 1:
        if (player.number === 2) console.log("Other player paused");
        break;
      case 2:
        if (player.number === 1) console.log("Other player paused");
        break;
    }
  });
}

function draw_canvas() {
  if (!game) return;
  canvas.width = game.env.tableWidth;
  canvas.height = game.env.tableHeight;
  canvas.style.width = canvas.width / 2 + "px";
  canvas.style.height = canvas.height / 2 + "px";
  //canvas.style.backgroundColor = "#3f526d";

  if (player.direction) {
    socket.emit("movePlayer", {
      playerNumber: player.number,
      direction: player.direction,
      roomName: game.state.roomName,
    });
  }

  // Clear canvas
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "white";

  // Draw player 1
  context.fillRect(
    game.state.p1.x,
    game.state.p1.y,
    game.env.paddleWidth,
    game.env.paddleHeight
  );

  // Draw player 2
  context.fillRect(
    game.state.p2.x,
    game.state.p2.y,
    game.env.paddleWidth,
    game.env.paddleHeight
  );

  // Draw Ball
  context.beginPath();
  context.arc(
    game.state.ball.x,
    game.state.ball.y,
    game.env.ballRadius,
    0,
    2 * Math.PI
  );
  context.fill();
}

// Update the formatGameScore function to always show first player (p2) on right
function formatGameScore() {
  if (!game) return "Waiting for players...";

  // Always show p2 (first player to join) on the right side
  return `${game.state.p2.name}      ${game.state.p2.score} : ${game.state.p1.score}      ${game.state.p1.name}`;
}

// Add this helper function at the top of the file
function getRedirectUrl() {
  // Get the current token from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  // If there's a token, redirect to root with token preserved
  if (token) {
    return `/?token=${token}`;
  }
  return "/";
}
