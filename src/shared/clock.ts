/**
 * Game time: milliseconds that only ever move forward at a steady rate.
 *
 * The wall clock (Date.now) can be stepped by the operating system, for example when a
 * virtual machine and a time server disagree. A step in the middle of a clue would stretch
 * a quarter-second buzzer lockout into minutes and scramble the order of buzzes, so game
 * logic reads this clock instead. It starts at the wall-clock time when the process
 * started and then follows the monotonic timer. Browsers never compare it with their own
 * clock directly; they work out an offset from the `serverNow` sent with every view.
 */
const startedWall = Date.now();
const startedMono = performance.now();

export function gameNow(): number {
  return Math.round(startedWall + (performance.now() - startedMono));
}
