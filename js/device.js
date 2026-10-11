// The player's device: words for its input ("터치" on an iPad, "클릭" with a mouse on a PC)
// and how much a phone shrinks the screens.

export const hasMouse = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
export const tapWord = () => (hasMouse() ? '클릭' : '터치');
export const dragHow = () => (hasMouse() ? '마우스로' : '손가락으로');

// Phones held sideways: the menus and the battle buttons are laid out on a page UI_H tall and
// shrunk to fit, so a phone shows what an iPad does (an iPad is taller and stays at 1).
const UI_H = 600;
export let uiScale = 1;
export function fitUi() {
  const w = window.innerWidth, h = window.innerHeight;
  uiScale = Math.min(1, h / UI_H);
  const r = document.documentElement;
  r.classList.toggle('scaled', uiScale < 1);
  r.style.setProperty('--ui-s', uiScale);
  r.style.setProperty('--W', `${w / uiScale}px`);
  r.style.setProperty('--H', `${h / uiScale}px`);
}
