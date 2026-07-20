// GFX4 F2 (2b): the themed mouse cursor — a small rounded teal arrow pointer
// with a dark outline (Lumen palette). Applied ONCE at boot via
// this.input.setDefaultCursor("url(" + CURSOR_URI + ") 4 2, auto") in BootScene.
//
// This is a BAKED 22x22 PNG data-URI (hotspot near the tip at 4,2). It was
// generated once at build time by tools/gen_cursor.mjs (a throwaway Playwright
// script that draws the arrow to a <canvas> and dumps toDataURL) and hard-coded
// here so there is ZERO runtime texture work — no Graphics draw, no snapshot,
// no per-boot cost. To re-bake: node tools/gen_cursor.mjs and paste the string.
export const CURSOR_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAADu0lEQVR4AZyUXWwUVRTH/zO7O7NsdzrbhRborIE2lKa6ASufD5aQFNsYEAw+mPTBb19MLNIQjNomitqIVkq7SM1qiG2TIiq2fbDWaAI0JEWtoQ9GbfCjJP2WhN1Cy+4yM5dzZ9vtwpSPcnPPPXfv/u/vnJx754qYa245Uzvk9mnvIitLnVu+v1kKTNDa1cGivXtq3qyWTc/PbjUn//6QyV0pMESs3rylBMW7nsD+2gOFgNTnVHIfTcoWPs6BZ/aOLtcwtX4DGo83ZzlE4ZQrU3tm5q8FORuYMYZrhYUQg0H8eP6c05fla3arWu2CqCS2gX0CQ7kkYvESP/ozvGj9qQtFa9e8IauBk6R3k91TTwczviMgCuATnnmfKOGw7MWeug9Qtmv7bsr8LDJylnLd3SwdbGlHDYYR3cDpazr+Jw+nC225K7DlpRfxfOUr69wu6TcpI7AGd2npYIFrxw0TXdM6LiR0ULlhmCZ5hu9XrIJaVo6aQx9qgov1yoq2g+tvZ+ngpIZo5gxs1hsms+C9gZX4r+ghhDu+9tD17JR9WlVyk320gYlhQQyCm/ME+St7Gdq9fnT1/yLmLF32sazmhgnrILup28CgozMISB3JjGH52SDcjykqaiYTONL+FYo3b3pZVrUfgCVKOtkG5reBUdom47WFVWP6SXCGPMmFMsWD8kwPtmX70af6UX00hJLHSktln3zgjmAOmS0D93mSk6A8CMNOhwHW/g1GGhswGmrA2JEQOj8/hgzFC7r+03cEWxmTwqQIT0LHjuglrJyBd1wXsLygAK1NYbQ0hf8gf4Zb98nO+pihN9C2VLeVgk7OyvBZJHC2rg5Hq99GCQWgOBiYjkHKz8faDetAd/N8LDK0lVt8crgKV8cnUlSa2MAmnVql08AXe/ehq+0Eek+dgX8ygmynyGOi23Tgudf30ZxVyEouvYJEmafbwPydeGv30/j1dM8EVbSYCOfa6kPY6kzejoHpOKS8fDy8cb0gOMSaeZjWkmiNNAiM/d766Wd4PPgIBi/88zcEY9P1yHC/KbCD3d92ICgyeOgdMel+f6cLqHz/HYrJKrBIC9B2W0+BY7peT99Xw9SVqY/iuLIxFhkb5OpEZKSTDnTgy0+aULrIhe2KG1WLvQi9dxACNclhKlx3q6XAmJoYj0eGX4tHh/YjGr2cJmQChLoT4WN4YOgiLre2YNuqB9Hf0zNI2Vckro7+maZNTefAqSX7JBYdaqEz/ffVnU+h+XDjRar2C7HIcEFicuS4XZ1cuQEAAP//9lNHeQAAAAZJREFUAwCI7Ksur1K0kwAAAABJRU5ErkJggg==";

// Hotspot offset passed to setDefaultCursor (tip of the arrow).
export const CURSOR_HOTSPOT = "4 2";
