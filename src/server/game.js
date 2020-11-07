import { Round } from './round';
import { Turn } from './turn';
import { createLogger } from './logger';

const PHASES = {
  LOBBY: 'LOBBY',
  DRAW: 'DRAW',
  CAPTION: 'CAPTION',
  GUESS: 'GUESS',
  REVEAL: 'REVEAL',
};

function randomChoice(arr) {
  return arr[Math.floor(arr.length * Math.random())];
}

// Return a random prompt
export function getPrompt() {
  const descriptions = ['man-eating', 'hairless', 'cardboard', 'vegan'];
  const nouns = ['bicycle', 'yoghurt', 'cloud', 'Harry Potter'];
  return `${randomChoice(descriptions)} ${randomChoice(nouns)}`;
}

// Return a list of n unique prompts
export function getUniquePrompts(nPrompts) {
  const prompts = [];

  while (prompts.length < nPrompts) {
    const newPrompt = getPrompt();

    if (!prompts.includes(newPrompt)) {
      prompts.push(newPrompt);
    }
  }

  return prompts;
}

// return a plan of the game based on the number
// of rounds and players.
// each round has one object per player. The object contains
// the player id, prompt, and spaces for the image and captions.
export function gameplan(players, nRounds) {
  // Prompts are ensured to be unique over the whole game
  const prompts = getUniquePrompts(Object.keys(players).length * nRounds);
  const rounds = [];

  for (let i = 0; i < nRounds; i += 1) {
    // for each round, create a set of turns equal to the number of players/prompts
    const turns = players.map(
      (player, index) => new Turn(players.length, player, prompts[index])
    );
    const round = new Round(turns);
    rounds.push(round);
  }
  return rounds;
}

export class Game {
  constructor(id) {
    this.id = id;
    this.players = [];
    this.phase = PHASES.LOBBY; // defines which phase of the game we're in
    this.roundNum = 0; // defines which round is currently being played
    this.nRounds = 3;
    this.log = createLogger(this.id);
    this.timer = null;
  }

  addPlayer(player) {
    this.players.push(player);
  }

  removePlayer(player) {
    this.players = this.players.filter((p) => p !== player);
  }

  // output a list of all the players in the specified game
  listPlayers() {
    return this.players.map((player) => player.getName()).join(', ');
  }

  getPhase() {
    return this.phase;
  }

  getCurrentRound() {
    if (!this.gameplan) {
      return null;
    }
    return this.gameplan[this.roundNum];
  }

  getCurrentTurn() {
    this.log('getCurrentTurn');
    return this.getCurrentRound().getCurrentTurn();
  }

  getTimeRemaining() {
    return this.timeRemaining;
  }

  // get the prompt for a specific player for the current round
  getPrompt(player) {
    this.log('getPrompt');
    const round = this.getCurrentRound();
    if (!round) {
      return null;
    }
    const turn = round.getTurnByArtist(player);
    return turn.getPrompt();
  }

  // get the current drawing to be either captioned or guessed for the current turn
  getViewDrawing() {
    this.log('getViewDrawing');
    const round = this.getCurrentRound();
    if (!round) {
      return null;
    }
    return this.getCurrentTurn().getDrawing();
  }

  // get the captions from the current turn
  getCaptions() {
    this.log('getCaptions');
    const round = this.getCurrentRound();
    if (!round) {
      return null;
    }
    return round.getCurrentTurn().getCaptions();
  }

  getRealPrompt() {
    this.log('getRealPrompt');
    const round = this.getCurrentRound();
    if (!round || this.getPhase() !== PHASES.REVEAL) {
      return null;
    }

    return round.getCurrentTurn().getPrompt();
  }

  // returns true if the player has completed their actions for the current game phase
  isPlayerWaiting(player) {
    this.log('isPlayerWaiting');
    const round = this.getCurrentRound();
    if (!round) {
      return false;
    }
    const phase = this.getPhase();
    if (phase === PHASES.DRAW) {
      return round.getTurnByArtist(player).isDrawingSubmitted();
    }
    if (phase === PHASES.CAPTION) {
      return this.getCurrentTurn().hasPlayerSubmittedCaption(player);
    }
    // player should wait if they have selected a caption
    if (phase === PHASES.GUESS) {
      return this.getCurrentTurn().hasPlayerChosenCaption(player);
    }
    // otherwise PHASE.REVEAL
    return false;
  }

  start() {
    this.gameplan = gameplan(this.players, this.nRounds);
    this.log('starting game');
    this.log(this.gameplan);
    this.startDrawingPhase();
  }

  // kicks off a countdown which calls sync every second, until either:
  // 1. the countdown is cancelled
  // 2. the countdown reaches 0. final is then executed
  startCountdown(final) {
    // start a 30 second timer
    this.timeRemaining = 30;
    this.sync();

    // cancel any existing countdown
    this.cancelCountdown();

    // this timer should be cancelled whenever starting a new phase
    this.timer = setInterval(() => {
      this.timeRemaining -= 1;
      this.sync();

      if (this.timeRemaining === 0) {
        final.call(this);
      }
    }, 1000);
  }

  cancelCountdown() {
    clearInterval(this.timer);
  }

  startDrawingPhase() {
    this.phase = PHASES.DRAW;

    this.startCountdown(this.startCaptioningPhase);
  }

  // submit a drawing for a player in the current round
  postDrawing(player, drawing) {
    const round = this.getCurrentRound();
    const turn = round.getTurnByArtist(player);
    turn.submitDrawing(drawing);

    this.log(`wow ${player.getId().substring(1, 6)}, thats beautiful!`);
    if (round.allDrawingsIn()) {
      this.log('all the artwork has been collected');
      this.startCaptioningPhase();
    }
  }

  startCaptioningPhase() {
    this.cancelCountdown();
    this.phase = PHASES.CAPTION;
    this.log('Time to caption these masterpieces!');

    this.startCountdown(this.startGuessingPhase);
  }

  // submit a caption for a player in the current turn
  postCaption(player, caption) {
    const turn = this.getCurrentTurn();
    turn.submitCaption(caption);

    if (turn.allCaptionsIn()) {
      this.log('all captions are in: ', turn.captions);
      this.startGuessingPhase();
    }
  }

  startGuessingPhase() {
    this.cancelCountdown();
    this.phase = PHASES.GUESS;
    this.log('Guess the correct caption!');

    this.startCountdown(this.startRevealPhase);
  }

  chooseCaption(player, captionText) {
    this.log('chooseCaption');
    const turn = this.getCurrentTurn();
    turn.chooseCaptionByText(player, captionText);

    if (turn.allPlayersChosen()) {
      this.startRevealPhase();
    }
  }

  startRevealPhase() {
    this.cancelCountdown();
    this.phase = PHASES.REVEAL;
    this.log('revealing real prompt!');

    this.sync();
  }

  // syncs players state for all players in the game
  sync() {
    this.log('syncing all players, current game plan:');
    this.log(this.gameplan);
    this.players.forEach((player) => {
      player.sync();
    });
  }
}
