/** Words, prompts and questions for the lobby games. All written for this project. */

/** Doodle guess: things most people can draw in under a minute. */
export const DOODLE_WORDS = [
  "pig", "pizza", "rainbow", "guitar", "castle", "rocket", "snowman", "bicycle", "banana", "umbrella",
  "giraffe", "lighthouse", "volcano", "robot", "octopus", "cactus", "balloon", "dragon", "campfire", "sandwich",
  "telescope", "penguin", "tractor", "mushroom", "ladder", "spider", "treasure", "windmill", "pirate", "donut",
  "elephant", "skateboard", "igloo", "mermaid", "tornado", "popcorn", "scarecrow", "submarine", "butterfly", "crown",
  "anchor", "pumpkin", "snail", "helicopter", "waterfall", "hammer", "ghost", "kite", "island", "candle",
  "dinosaur", "trumpet", "rollercoaster", "toothbrush", "backpack", "cupcake", "owl", "bridge", "tent", "sunglasses",
];

/** Caption vote: everyone answers the same prompt. */
export const CAPTION_PROMPTS = [
  "The worst thing to say at the start of a job interview",
  "A terrible name for a pet goldfish",
  "The real reason the pig crossed the road",
  "A rejected flavour of ice cream",
  "What the dog is really thinking",
  "The least helpful superpower",
  "A bad slogan for a dentist",
  "The title of a film nobody would watch",
  "Something you should never yell in a library",
  "The worst possible wedding gift",
  "A new rule that would ruin football",
  "What aliens would find strangest about us",
  "An awful name for a rock band",
  "The worst thing to find in your sandwich",
  "A warning label that should exist",
  "The secret ingredient in grandma's soup",
  "A terrible theme for a birthday party",
  "What cats do when nobody is home",
  "The worst excuse for being late",
  "A product that should never be 'extra large'",
];

/** Most likely to: vote for a player. */
export const LIKELY_PROMPTS = [
  "Most likely to survive a week in the woods",
  "Most likely to laugh at the wrong moment",
  "Most likely to win a hot dog eating contest",
  "Most likely to get lost with a map in their hand",
  "Most likely to become famous by accident",
  "Most likely to talk to a stranger's dog first",
  "Most likely to fall asleep at a party",
  "Most likely to own forty houseplants",
  "Most likely to argue with a sat nav",
  "Most likely to know all the words to the song",
  "Most likely to start a conga line",
  "Most likely to forget their own birthday",
  "Most likely to bring snacks for everyone",
  "Most likely to win this trivia game",
  "Most likely to cry at an advert",
  "Most likely to have a secret talent",
  "Most likely to adopt a farm animal",
  "Most likely to send a text to the wrong person",
  "Most likely to dance when the music stops",
  "Most likely to read the instructions last",
];

/** Closest guess: a number everyone can take a stab at. */
export const GUESS_QUESTIONS: { q: string; a: number; unit?: string }[] = [
  { q: "How many bones are in an adult human body?", a: 206 },
  { q: "How many keys does a standard piano have?", a: 88 },
  { q: "How many minutes are in a day?", a: 1440 },
  { q: "How many squares are on a chessboard?", a: 64 },
  { q: "How tall is Mount Everest?", a: 8849, unit: "metres" },
  { q: "How many member states does the United Nations have?", a: 193 },
  { q: "At what temperature does water boil at sea level?", a: 212, unit: "°F" },
  { q: "How many elements are on the periodic table?", a: 118 },
  { q: "How many seconds are in an hour?", a: 3600 },
  { q: "How many dots are on a pair of dice?", a: 42 },
  { q: "How far is the Moon from Earth, on average?", a: 384, unit: "thousand km" },
  { q: "How many bones are in a giraffe's neck?", a: 7 },
  { q: "How long is a marathon, to the nearest kilometre?", a: 42, unit: "km" },
  { q: "How many hearts does an octopus have?", a: 3 },
  { q: "In what year did people first walk on the Moon?", a: 1969 },
  { q: "How many cards are in a standard deck, without jokers?", a: 52 },
  { q: "How fast does sound travel in air?", a: 343, unit: "metres per second" },
  { q: "How many teeth does an adult human normally have?", a: 32 },
  { q: "How many time zones does Russia span?", a: 11 },
  { q: "How many players does a football (soccer) team have on the pitch?", a: 11 },
  { q: "How many hours are in a week?", a: 168 },
  { q: "How many sides does a dodecagon have?", a: 12 },
];

/** Split the room: two sides, no right answer. */
export const SPLIT_QUESTIONS: { q: string; a: string; b: string }[] = [
  { q: "Pineapple on pizza?", a: "Yes", b: "No" },
  { q: "Better pet?", a: "Cats", b: "Dogs" },
  { q: "Would you rather be able to…", a: "Fly", b: "Turn invisible" },
  { q: "Morning person or night owl?", a: "Morning", b: "Night" },
  { q: "The toilet roll goes…", a: "Over", b: "Under" },
  { q: "Better holiday?", a: "Beach", b: "Mountains" },
  { q: "Is a hot dog a sandwich?", a: "Yes", b: "No" },
  { q: "Sweet or salty popcorn?", a: "Sweet", b: "Salty" },
  { q: "Would you rather live without…", a: "Music", b: "Films" },
  { q: "Cereal: which goes in first?", a: "Cereal", b: "Milk" },
  { q: "Better season?", a: "Summer", b: "Winter" },
  { q: "Text or call?", a: "Text", b: "Call" },
  { q: "Would you rather explore…", a: "Space", b: "The deep sea" },
  { q: "Tea or coffee?", a: "Tea", b: "Coffee" },
  { q: "Board games or video games?", a: "Board games", b: "Video games" },
  { q: "Would you rather have…", a: "More time", b: "More money" },
  { q: "Chips: ketchup or mayo?", a: "Ketchup", b: "Mayo" },
  { q: "Window seat or aisle seat?", a: "Window", b: "Aisle" },
  { q: "Would you rather time travel to…", a: "The past", b: "The future" },
  { q: "Crunchy or smooth peanut butter?", a: "Crunchy", b: "Smooth" },
];
