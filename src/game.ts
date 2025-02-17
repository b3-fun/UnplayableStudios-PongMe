import { gameEnv, gameParams } from "./globals";
import { gameStateType, ballType } from "./types";
import { Server } from "socket.io";
import { basementSendCustomActivity, updateForWinner } from "./basement.util";

// Returns true if min <= num <= max
function between(num: number, min: number, max: number) {
  return num >= min && num <= max;
}

// Checks for collision between the ball and the wall or the player at (playerX, playerY).
// Returns true and changes ball parameters on collision, returns false otherwise.
export const collides = (ball: ballType, playerX: number, playerY: number) => {
  const player = {
    top: playerY,
    bottom: playerY + gameEnv.paddleHeight,
    left: playerX,
    right: playerX + gameEnv.paddleWidth,
  };

  // Calculate ball boundaries
  const ballBounds = {
    left: ball.x - gameEnv.ballRadius,
    right: ball.x + gameEnv.ballRadius,
    top: ball.y - gameEnv.ballRadius,
    bottom: ball.y + gameEnv.ballRadius,
    centerX: ball.x,
    centerY: ball.y,
  };

  // Check paddle collision
  if (
    ballBounds.right >= player.left &&
    ballBounds.left <= player.right &&
    ballBounds.bottom >= player.top &&
    ballBounds.top <= player.bottom
  ) {
    const collidePoint =
      (ballBounds.centerY - (player.top + gameEnv.paddleHeight / 2)) /
      (gameEnv.paddleHeight / 2);
    const angle = (collidePoint * Math.PI) / 4;
    const direction = ball.x < gameEnv.tableCenter.x ? 1 : -1;
    ball.vx = Math.ceil(direction * ball.speed * Math.cos(angle));
    ball.vy = Math.ceil(ball.speed * Math.sin(angle));
    ball.speed += 1;
    return true;
  }
  // Check wall collision and enforce boundaries
  else if (ballBounds.top <= 0 || ballBounds.bottom >= gameEnv.tableHeight) {
    ball.vy = -ball.vy;

    // Enforce boundaries immediately
    if (ballBounds.top <= 0) {
      // Set the ball position so its center is one radius from the boundary
      ball.y = gameEnv.ballRadius;
    }
    if (ballBounds.bottom >= gameEnv.tableHeight) {
      // Set the ball position so its center is one radius from the bottom
      ball.y = gameEnv.tableHeight - gameEnv.ballRadius;
    }
    return true;
  }

  // Additional boundary enforcement
  if (ball.y - gameEnv.ballRadius < 0) {
    ball.y = gameEnv.ballRadius;
  }
  if (ball.y + gameEnv.ballRadius > gameEnv.tableHeight) {
    ball.y = gameEnv.tableHeight - gameEnv.ballRadius;
  }

  return false;
};

// Add AI difficulty levels
type AIDifficulty = "easy" | "hard" | "hardcore";

const DEFAULT_AI_DIFFICULTY: AIDifficulty = "hardcore";

function moveAI(
  ball: ballType,
  aiPaddle: { x: number; y: number },
  difficulty: AIDifficulty = DEFAULT_AI_DIFFICULTY
) {
  switch (difficulty) {
    case "easy":
      moveAIEasy(ball, aiPaddle);
      break;
    case "hard":
      moveAIHard(ball, aiPaddle);
      break;
  }
}

// Easy AI just follows the ball with delay
function moveAIEasy(ball: ballType, aiPaddle: { x: number; y: number }) {
  // Simple AI that follows the ball with some delay
  const paddleCenter = aiPaddle.y + gameEnv.paddleHeight / 2;
  const ballCenter = ball.y + gameEnv.ballRadius;
  const difference = ballCenter - paddleCenter;

  // Add some "reaction time" - only move if ball is moving towards AI
  if (ball.vx > 0) {
    // Move towards the ball with some maximum speed
    const moveSpeed = 5;
    if (Math.abs(difference) > moveSpeed) {
      if (difference > 0) {
        aiPaddle.y += moveSpeed;
      } else {
        aiPaddle.y -= moveSpeed;
      }
    }
  }

  // Keep paddle within bounds
  if (aiPaddle.y < 0) aiPaddle.y = 0;
  if (aiPaddle.y + gameEnv.paddleHeight > gameEnv.tableHeight) {
    aiPaddle.y = gameEnv.tableHeight - gameEnv.paddleHeight;
  }
}

// Hard AI predicts ball trajectory and returns to center
function moveAIHard(ball: ballType, aiPaddle: { x: number; y: number }) {
  if (ball.vx > 0 || ball.x > gameEnv.tableWidth * 0.75) {
    // Predict where ball will intersect with AI paddle's x position
    const timeToIntercept = (aiPaddle.x - ball.x) / ball.vx;
    const interceptY = ball.y + ball.vy * timeToIntercept;

    // Account for bounces
    let targetY = interceptY;
    const tableHeight = gameEnv.tableHeight;

    if (interceptY < 0) {
      // Ball will bounce off top
      targetY = -interceptY;
    } else if (interceptY > tableHeight) {
      // Ball will bounce off bottom
      targetY = tableHeight - (interceptY - tableHeight);
    }

    // Aim for the predicted position
    const paddleCenter = aiPaddle.y + gameEnv.paddleHeight / 2;
    const difference = targetY - paddleCenter;

    // Faster movement speed
    const moveSpeed = 8;

    if (Math.abs(difference) > moveSpeed) {
      if (difference > 0) {
        aiPaddle.y += moveSpeed;
      } else {
        aiPaddle.y -= moveSpeed;
      }
    }
  } else {
    // After hitting the ball, move to a "ready position" around the center
    const centerY = gameEnv.tableHeight / 2 - gameEnv.paddleHeight / 2;
    const offset = Math.sin(Date.now() / 500) * 50;
    const targetY = centerY + offset;

    const paddleCenter = aiPaddle.y + gameEnv.paddleHeight / 2;
    const difference = targetY - paddleCenter;

    const moveSpeed = 4;
    if (Math.abs(difference) > moveSpeed) {
      if (difference > 0) {
        aiPaddle.y += moveSpeed;
      } else {
        aiPaddle.y -= moveSpeed;
      }
    }
  }

  // Add bounds check
  if (aiPaddle.y < 0) aiPaddle.y = 0;
  if (aiPaddle.y + gameEnv.paddleHeight > gameEnv.tableHeight) {
    aiPaddle.y = gameEnv.tableHeight - gameEnv.paddleHeight;
  }
}

// Updates game on every frame
export const playGame = (io: Server, roomName: string, game: gameStateType) => {
  // Moves the ball (called on each frame)
  function moveBall() {
    game.ball.x += game.ball.vx;
    game.ball.y += game.ball.vy;
    io.to(roomName).emit("locationUpdate", {
      playerNumber: 0,
      newLocation: { x: game.ball.x, y: game.ball.y },
    });
  }

  // Checks if ball collides with wall or paddle (called on each frame).
  function collisionCheck() {
    let hit;
    if (game.ball.x < gameEnv.tableCenter.x) {
      hit = collides(game.ball, game.p2.x, game.p2.y);
    } else {
      hit = collides(game.ball, game.p1.x, game.p1.y);
    }
    if (hit) {
      io.to(roomName).emit("collision");
    }
  }

  // Prepares the table for a new round.
  function resetPositions() {
    game.ball.x = gameEnv.tableCenter.x - gameEnv.ballRadius;
    game.ball.y = gameEnv.tableCenter.y - gameEnv.ballRadius;
    game.ball.vx = gameParams.ballVelocity.x;
    game.ball.vy = gameParams.ballVelocity.y;
    game.ball.speed = gameParams.ballVelocity.v;
    game.p1.y = gameEnv.p1Location.y;
    game.p2.y = gameEnv.p2Location.y;
    io.to(roomName).emit("locationUpdate", {
      playerNumber: 0,
      newLocation: { x: game.ball.x, y: game.ball.y },
    });
    io.to(roomName).emit("locationUpdate", {
      playerNumber: 1,
      newLocation: { x: game.p1.x, y: game.p1.y },
    });
    io.to(roomName).emit("locationUpdate", {
      playerNumber: 2,
      newLocation: { x: game.p2.x, y: game.p2.y },
    });
  }

  // Pauses frame updates for "roundBreak" milliseconds
  function pauseBreak() {
    game.p1.paused = true;
    setTimeout(() => {
      game.p1.paused = false;
      resetPositions();
    }, gameParams.roundBreak);
  }

  // Updates the score and emits a scoreUpdate if any player scored (called on each frame).
  function scoreCheck() {
    const p1Scored = game.ball.x < 0;
    const p2Scored = game.ball.x + 2 * gameEnv.ballRadius > gameEnv.tableWidth;
    if (p1Scored) game.p1.score += 1;
    if (p2Scored) game.p2.score += 1;
    if (p1Scored || p2Scored) {
      io.to(roomName).emit("scoreUpdate", {
        s1: game.p1.score,
        s2: game.p2.score,
      });
      pauseBreak();
    }
  }

  // Emits a winnerUpdate when any player reaches winningScore (called on each frame)
  function winnerCheck() {
    if (game.p1.score === gameParams.winningScore) {
      //send to player 1
      try {
        basementSendCustomActivity({
          launcherJwt: game.p1.token,
          label: getWinnerMessage(
            game.p1.name,
            game.p2.name,
            game.p1.score,
            game.p2.score
          ),
          eventId: "match",
        }).then(() => console.log("sent"));
      } catch (error) {
        console.error("Winner activity failed:", error);
      }

      try {
        updateForWinner(game.p1.token).then(() => console.log("sent"));
      } catch (error) {
        console.error("updateForWinner activity failed:", error);
      }

      //send to player 2
      try {
        basementSendCustomActivity({
          launcherJwt: game.p2.token,
          label: getLoserMessage(
            game.p1.name,
            game.p2.name,
            game.p1.score,
            game.p2.score
          ),
          eventId: "match",
        }).then(() => console.log("sent"));
      } catch (error) {
        console.error("Loser activity failed:", error);
      }

      io.to(roomName).emit("winnerUpdate", { winnerNumber: 1 });
      game.p1.paused = true;
    } else if (game.p2.score === gameParams.winningScore) {
      //send to player 2
      try {
        basementSendCustomActivity({
          launcherJwt: game.p2.token,
          label: getWinnerMessage(
            game.p2.name,
            game.p1.name,
            game.p2.score,
            game.p1.score
          ),
          eventId: "match",
        }).then(() => console.log("sent"));
      } catch (error) {
        console.error("Winner activity failed:", error);
      }

      try {
        updateForWinner(game.p2.token).then(() => console.log("sent"));
      } catch (error) {
        console.error("updateForWinner activity failed:", error);
      }

      //send to player 1
      try {
        basementSendCustomActivity({
          launcherJwt: game.p1.token,
          label: getLoserMessage(
            game.p2.name,
            game.p1.name,
            game.p2.score,
            game.p1.score
          ),
          eventId: "match",
        }).then(() => console.log("sent"));
      } catch (error) {
        console.error("Loser activity failed:", error);
      }

      io.to(roomName).emit("winnerUpdate", { winnerNumber: 2 });
      game.p1.paused = true;
    }
  }

  //send to player 1
  try {
    basementSendCustomActivity({
      launcherJwt: game.p1.token,
      label: getStartGameMessage(game.p2.name),
      eventId: "match",
    }).then(() => console.log("sent"));
  } catch (error) {
    console.error("Live activity failed", error);
  }

  //send to player 2
  try {
    basementSendCustomActivity({
      launcherJwt: game.p2.token,
      label: getStartGameMessage(game.p1.name),
      eventId: "match",
    }).then(() => console.log("sent"));
  } catch (error) {
    console.error("Live activity failed", error);
  }

  function getStartGameMessage(player2: string) {
    return `@{username} vs ${player2} - Game On!`;
  }

  function getWinnerMessage(
    winner: string,
    loser: string,
    winnerScore: number,
    loserScore: number
  ) {
    return `@{username} Victory! You defeated ${loser} ${winnerScore}-${loserScore}`;
  }

  function getLoserMessage(
    winner: string,
    loser: string,
    winnerScore: number,
    loserScore: number
  ) {
    return `@{username} Match ended: ${winner} won ${winnerScore}-${loserScore}`;
  }

  // Game loop
  game.mainLoop = setInterval(() => {
    if (game.p1.paused || game.p2.paused) return;

    // Move AI if this is single player mode
    if (game.isSinglePlayer) {
      moveAI(game.ball, game.p1, game.aiDifficulty || DEFAULT_AI_DIFFICULTY);
      // Emit AI paddle position
      io.to(roomName).emit("locationUpdate", {
        playerNumber: 1,
        newLocation: { x: game.p1.x, y: game.p1.y },
      });
    }

    moveBall();
    collisionCheck();
    scoreCheck();
    winnerCheck();
  }, gameEnv.frameRate);
};
