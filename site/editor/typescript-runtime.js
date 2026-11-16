export function createTypeScriptRuntime() {
  let worker = null;
  let workerPromise = null;
  let generation = 0;
  const pending = new Map();
  let sequence = 0;

  function getWorker() {
    if (worker) return Promise.resolve(worker);
    if (workerPromise) return workerPromise;

    const currentGeneration = generation;
    workerPromise = import('./typescript.worker.js?worker')
      .then(({ default: TypeScriptWorker }) => {
        const activeWorker = new TypeScriptWorker();
        if (currentGeneration !== generation) {
          activeWorker.terminate();
          throw new Error('The TypeScript worker was disposed.');
        }
        worker = activeWorker;
        activeWorker.addEventListener('message', (event) => {
          const message = event.data;
          const task = pending.get(message?.id);
          if (!task) return;
          clearTimeout(task.timer);
          pending.delete(message.id);
          if (message.error) task.reject(new Error(message.error));
          else task.resolve({ code: message.code, diagnostics: message.diagnostics || [] });
        });
        activeWorker.addEventListener('error', (event) => {
          event.preventDefault();
          if (worker === activeWorker) {
            worker = null;
            workerPromise = null;
          }
          for (const task of pending.values()) {
            clearTimeout(task.timer);
            task.reject(new Error(event.message || 'The TypeScript worker stopped unexpectedly.'));
          }
          pending.clear();
        });
        return activeWorker;
      })
      .catch((error) => {
        if (currentGeneration === generation) workerPromise = null;
        throw error;
      });
    return workerPromise;
  }

  return {
    compile(source) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('TypeScript compilation timed out.'));
        }, 20_000);
        pending.set(id, { resolve, reject, timer });
        getWorker().then((activeWorker) => {
          if (!pending.has(id)) return;
          activeWorker.postMessage({ id, source });
        }).catch((error) => {
          if (!pending.has(id)) return;
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        });
      });
    },
    dispose() {
      generation += 1;
      worker?.terminate();
      worker = null;
      workerPromise = null;
      for (const task of pending.values()) {
        clearTimeout(task.timer);
        task.reject(new Error('The TypeScript worker was disposed.'));
      }
      pending.clear();
    }
  };
}
