/** Fixed-timestep game loop so behaviour does not change with refresh rate. */
export function startLoop({ update, render, step = 1 / 60, maxStepsPerFrame = 5 }) {
  let previous = performance.now();
  let accumulator = 0;
  let frameId = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    frameId = requestAnimationFrame(frame);

    // A tab that was in the background can hand us a huge delta; clamp it.
    accumulator += Math.min((now - previous) / 1000, 0.25);
    previous = now;

    let steps = 0;
    while (accumulator >= step && steps < maxStepsPerFrame) {
      update(step);
      accumulator -= step;
      steps += 1;
    }
    if (steps === maxStepsPerFrame) accumulator = 0;

    render();
  }

  frameId = requestAnimationFrame(frame);

  return function stop() {
    running = false;
    cancelAnimationFrame(frameId);
  };
}
