/* One solve per worker.
 *
 * Popeye keeps its state in globals, so calling main() twice in the same
 * instance is not safe. The page starts a worker, sends it one problem, takes
 * one answer and terminates it -- which also makes Stop free: terminate the
 * worker and the search is gone.
 *
 * Popeye is loaded from /popeye/py.js rather than bundled, for the reason
 * Stockfish is: the glue finds its wasm by swapping .js for .wasm in its own
 * URL, and a bundler that hashes the two files independently breaks that.
 */
interface PopeyeModule {
  FS: { writeFile(path: string, data: string): void };
  callMain(args: string[]): number | undefined;
}

const out: string[] = [];
const err: string[] = [];

// Emscripten's stub warning for signal(); Popeye registers handlers it will
// never receive in a browser. Not an error, and not worth showing.
const NOISE = /Calling stub instead of signal\(\)/;

const ready: Promise<PopeyeModule | null> = (async () => {
  try {
    /* Served, not bundled. The URL is put together at run time so that the
       bundler has nothing to resolve: handed a literal it rewrites the import
       and serves the file through its own transform, which a 660 KB
       Emscripten glue file does not survive. */
    const url = `${location.origin}/popeye/${'py'}.js`;
    const mod = await import(/* @vite-ignore */ url) as { default: (opts: unknown) => Promise<PopeyeModule> };
    const instance = await mod.default({
      noInitialRun: true,
      print: (text: string) => out.push(text),
      printErr: (text: string) => { if (!NOISE.test(text)) err.push(text); },
    });
    postMessage({ type: 'ready' });
    return instance;
  } catch (e) {
    postMessage({ type: 'fatal', detail: e instanceof Error ? e.message : String(e) });
    return null;
  }
})();

self.onmessage = async (event: MessageEvent) => {
  const { input, maxmemMB } = event.data || {};
  const instance = await ready;
  if (!instance) return; // the init failure has already been reported

  const path = '/problem.inp';
  try {
    instance.FS.writeFile(path, input);
  } catch (e) {
    postMessage({ type: 'fatal', detail: e instanceof Error ? e.message : String(e) });
    return;
  }

  const started = Date.now();
  let thrown: string | null = null;
  try {
    instance.callMain(['-maxmem', `${maxmemMB || 256}M`, '-maxtrace', '0', path]);
  } catch (e) {
    // A stack overflow lands here while callMain would have reported success.
    thrown = e instanceof Error ? e.message : String(e);
  }

  postMessage({ type: 'result', out: out.join('\n'), err: err.join('\n'), thrown, ms: Date.now() - started });
};
