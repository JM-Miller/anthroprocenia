let narratorLoading = false;

function preloadNarrator() {
  if (narratorLoading) return;
  const script = Modding.getInitialScripts(InitialScriptType.Default).find(entry =>
    /\/anthroprocenia_map_history\/ui\/narration\/anthroprocenia-narrator\.js$/.test(entry.url));
  if (!script) return;
  narratorLoading = true;
  console.warn('[Anthroprocenia narrator] Preloading enabled narrator before loading-screen audio.');
  const result = Controls.loadSource(script.url, script.isModule);
  if (result === false) {
    console.error('[Anthroprocenia narrator] Early narrator loading failed.');
  } else if (result && typeof result.then === 'function') {
    result.catch(error => console.error('[Anthroprocenia narrator] Early narrator loading failed: ' + error));
  }
}

engine.on('InitialScriptAdded', preloadNarrator);
engine.whenReady.then(preloadNarrator).catch(error =>
  console.error('[Anthroprocenia narrator] Early narrator initialization failed: ' + error));
