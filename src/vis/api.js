/* ===== vis/api.js: the INK_VIS public object, IIFE close. Later PRs add setClient, setTattoos, setView, setStudio. ===== */
window.INK_VIS={
  init(canvas,tier){const ok=init(canvas,tier);if(ok){studioPlaceholder();draw();}return ok;},
  ready(){return !!V.renderer;},
  setTier,resize,
  redraw(){V.dirty=true;draw();},
  fps(){return V.looping?V.fps:null;},
  _state:V
};
})();
</script>
