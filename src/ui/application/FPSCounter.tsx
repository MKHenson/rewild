let beginTime = performance.now();
let prevTime = beginTime;
let frameCount = 0;
let min = Infinity;
let max = 0;
const round = Math.round;

const end = (elm: HTMLElement) => {
  frameCount++;
  let time = performance.now();
  if (time >= prevTime + 1000) {
    const value = (frameCount * 1000) / (time - prevTime);
    min = Math.min(min, value);
    max = Math.max(max, value);
    elm.textContent =
      round(value) + ' ' + name + ' (' + round(min) + '-' + round(max) + ')';

    prevTime = time;
    frameCount = 0;
  }

  return time;
};

export const update = (elm: HTMLElement) => {
  beginTime = end(elm);
};
