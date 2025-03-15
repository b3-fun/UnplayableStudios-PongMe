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
const easyBtn = document.getElementById("easy") as HTMLButtonElement;
const hardBtn = document.getElementById("hard") as HTMLButtonElement;
const exitBtn = document.getElementById("exit") as HTMLButtonElement;

function disableInputs() {
  playerInput.setAttribute("disabled", "true");
  singlePlayerBtn.setAttribute("disabled", "true");
  multiPlayerBtn.setAttribute("disabled", "true");
  easyBtn.setAttribute("disabled", "true");
  hardBtn.setAttribute("disabled", "true");
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

function showGameDifficultyMenu() {
  showAlert("Choose game difficulty");
  multiPlayerBtn.classList.add("hidden");
  singlePlayerBtn.classList.add("hidden");
  backBtn.classList.remove("hidden");

  easyBtn.classList.remove("hidden");
  hardBtn.classList.remove("hidden");
}
// Replace radio change handlers with click handlers
singlePlayerBtn.onclick = () => {
  showGameDifficultyMenu();
};

function startSinglePlayerGame(difficulty: string) {
  easyBtn.classList.add("hidden");
  hardBtn.classList.add("hidden");
  backBtn.classList.add("hidden");
  exitBtn.classList.remove("hidden");

  socket.emit(
    "joinSinglePlayer",
    {
      playerName: playerInput.value,
      token: token,
      difficulty: difficulty,
    },
    (error: string) => {
      if (error) {
        showAlert(error);
      }
    }
  );
  disableInputs();
}

easyBtn.onclick = () => {
  startSinglePlayerGame("easy");
};

hardBtn.onclick = () => {
  startSinglePlayerGame("hard");
};

backBtn.onclick = () => {
  window.location.href = getRedirectUrl();
};

exitBtn.onclick = () => {
  window.location.href = getRedirectUrl();
};

// Add touch handler for exit button
exitBtn.addEventListener("touchend", (e) => {
  e.preventDefault(); // Prevent any default touch behavior
  window.location.href = getRedirectUrl();
});

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
    exitBtn.classList.remove("hidden");

    showAlert("Prepare to start!");
    setTimeout(() => {
      showAlert("");
    }, 2000);

    // Add touch controls for mobile
    const touchArea = canvas.parentElement || canvas;

    const handleTouch = (e: TouchEvent) => {
      e.preventDefault(); // Prevent scrolling
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const touchY = touch.clientY - rect.top;
      const middleY = rect.height / 2;

      // Create a dead zone of 30% in the middle
      const deadZoneSize = rect.height * 0.3;
      const upperThreshold = middleY - deadZoneSize / 2;
      const lowerThreshold = middleY + deadZoneSize / 2;

      // Only move if touch is outside the dead zone
      if (touchY < upperThreshold) {
        player.direction = 1; // Up
      } else if (touchY > lowerThreshold) {
        player.direction = -1; // Down
      } else {
        player.direction = 0; // No movement in dead zone
      }

      socket.emit("movePlayer", {
        playerNumber: player.number,
        direction: player.direction,
        roomName: game.state.roomName,
      });
    };

    touchArea.addEventListener("touchstart", handleTouch);
    touchArea.addEventListener("touchmove", handleTouch);

    // Throttle movement updates to reduce network traffic
    let lastEmitTime = 0;
    const EMIT_THROTTLE = 50; // ms between emits

    function throttledEmitMove() {
      const now = Date.now();
      if (now - lastEmitTime > EMIT_THROTTLE) {
        socket.emit("movePlayer", {
          playerNumber: player.number,
          direction: player.direction,
          roomName: game.state.roomName,
        });
        lastEmitTime = now;
      }
    }

    // Replace direct emits with throttled version
    touchArea.addEventListener("touchend", () => {
      player.direction = 0;
      throttledEmitMove();
    });

    // Existing keyboard controls
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
    setTimeout(() => {
      window.location.href = getRedirectUrl();
    }, 3000);
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

  // Set internal game dimensions
  // canvas.width = game.env.tableWidth;
  // canvas.height = game.env.tableHeight;

  // // Calculate scaling based on device width
  // const maxWidth = Math.min(window.innerWidth * 0.95, game.env.tableWidth);
  // console.log("maxWidth :", maxWidth);
  // const maxHeight = Math.min(window.innerHeight * 0.95, game.env.tableHeight);
  // console.log("maxHeight :", maxHeight);
  // const scaleWidth = maxWidth / game.env.tableWidth;
  // const scaleHeight = maxHeight / game.env.tableHeight;

  // // Apply responsive scaling while maintaining aspect ratio
  // canvas.style.width = `${game.env.tableWidth * scaleWidth}px`;
  // canvas.style.height = `${game.env.tableHeight * scaleHeight}px`;

  // // Scale the canvas context to match display size
  // context.scale(1, 1); // Reset any previous scaling

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

function setupResponsiveCanvas() {
  // Detect if we're on mobile
  const isMobile = window.innerHeight < 500;
  console.log("isMobile :", isMobile);

  // Use available width
  const maxWidth = Math.min(window.innerWidth * 0.95, 1200);
  const maxHeight = Math.min(window.innerHeight * 0.95, 600);

  // Calculate height - on mobile, divide by 4 instead of 2
  let targetHeight;
  if (isMobile) {
    targetHeight = maxHeight * (600 / 1200); // This will make it 1/4 of original height ratio
  } else {
    targetHeight = maxHeight * (600 / 1200); // For desktop, use the full maxHeight
  }
  console.log("targetHeight :", targetHeight);

  // Apply dimensions
  canvas.style.width = `${maxWidth}px`;
  canvas.style.height = `${targetHeight}px`;

  // Keep internal canvas dimensions constant
  canvas.width = 1200;
  canvas.height = 600;
}

// Add window resize listener
window.addEventListener("resize", setupResponsiveCanvas);
// Initial setup
setupResponsiveCanvas();
