// Words for the player's input device: "터치" on an iPad, "클릭" with a mouse on a PC.

export const hasMouse = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
export const tapWord = () => (hasMouse() ? '클릭' : '터치');
export const dragHow = () => (hasMouse() ? '마우스로' : '손가락으로');
