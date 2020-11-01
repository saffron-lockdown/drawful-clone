import { createLogger } from './logger';

const PHASES = {
  LOBBY: 'LOBBY',
  DRAW: 'DRAW',
  CAPTION: 'CAPTION',
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

function allDrawingsIn(round) {
  return Object.values(round).every((element) => {
    return element.drawing !== '';
  });
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
    const round = [];

    players.forEach((player) => {
      // shape of a subRound
      round.push({
        player,
        prompt: prompts.pop(),
        drawing: '',
        captions: {}, // will be submitting_player: caption
      });
    });
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
    this.captionRoundNum = 0; // defines which drawing is currently being captioned/voted on
    this.nRounds = 3;
    this.log = createLogger(this.id);
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
    return this.gameplan[this.roundNum];
  }

  start() {
    this.gameplan = gameplan(this.players, this.nRounds);
    this.log(this.gameplan);
    this.startDrawingPhase();
  }

  startDrawingPhase() {
    this.phase = PHASES.DRAW;

    // send each player their prompt
    const round = this.gameplan[this.roundNum];
    Object.values(round).forEach(({ player, prompt }) => {
      player.setPrompt(prompt);
    });

    // start a 30 second timer
    let time = 30;
    this.players.forEach((player) => {
      player.setTimeRemaining(time);
    });

    this.timer = setInterval(() => {
      time -= 1;
      this.players.forEach((player) => {
        player.setTimeRemaining(time);
      });

      if (time === 0) {
        clearInterval(this.timer);
        this.startCaptioningPhase();
      }
    }, 1000);
  }

  postDrawing(player, drawing) {
    const round = this.getCurrentRound();
    round.find((r) => r.player === player).drawing = drawing;

    this.log(`wow ${player.id.substring(1, 6)}, thats beautiful!`);

    if (allDrawingsIn(round)) {
      this.log('all the artwork has been collected');
      clearInterval(this.timer);
      this.startCaptioningPhase();
    }
  }

  startCaptioningPhase() {
    this.phase = PHASES.CAPTION;
    this.log('Time to caption these masterpieces!');

    const round = this.getCurrentRound();
    const subRound = round[this.captionRoundNum];

    this.players.forEach((player) => {
      player.setViewDrawing(subRound.drawing);
    });
    this.captionRoundNum += 1;
  }

  postCaption(player, caption) {
    const round = this.getCurrentRound();
    const subRound = round[this.captionRoundNum];

    subRound.captions[player.id] = caption;

    if (this.allCaptionsIn(subRound)) {
      this.log('all captions are in: ', subRound.captions);
    }
  }

  allCaptionsIn(subRound) {
    return Object.values(subRound.captions).length === this.players.length;
  }

  // syncs players state for all players in the game
  sync() {
    this.log('syncing all players');
    this.players.forEach((player) => {
      player.sync();
    });
  }
}
