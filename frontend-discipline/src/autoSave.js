// Serialize writes and retain newer edits while an older request is in flight.
export function createAutoSaver({ initial, save, onChange, onState, delay = 650 }) {
  let base = initial;
  let slots = initial.slots;
  let version = 0;
  let savedVersion = 0;
  let flight = null;
  let timer = null;
  let failure = null;
  let disposed = false;
  const dirty = () => version !== savedVersion;
  const view = () => ({ ...base, slots });
  const emit = (state, error = '') => { if (!disposed) onState(state, error); };
  function schedule() {
    clearTimeout(timer);
    if (!disposed && !failure && dirty()) timer = setTimeout(() => { run().catch(() => {}); }, delay);
  }
  function run() {
    if (flight) return flight;
    if (failure) return Promise.reject(failure);
    if (!dirty() || disposed) return Promise.resolve();
    const sentVersion = version;
    const sent = { revision: base.revision, slots };
    emit('saving');
    flight = Promise.resolve().then(() => save(sent)).then(result => {
      base = result;
      savedVersion = sentVersion;
      if (version === sentVersion) slots = result.slots;
      if (!disposed) onChange(view());
      emit(dirty() ? 'pending' : 'saved');
    }).catch(error => {
      failure = error;
      emit('error', error.message);
      throw error;
    }).finally(() => { flight = null; schedule(); });
    return flight;
  }
  return {
    get dirty() { return dirty(); },
    get value() { return view(); },
    enqueue(next) {
      if (disposed) return;
      slots = next; version += 1;
      onChange(view());
      if (!failure) { emit(flight ? 'saving' : 'pending'); schedule(); }
    },
    async flush() {
      clearTimeout(timer);
      while (!disposed && dirty()) { await run(); clearTimeout(timer); }
    },
    async retry() { failure = null; await this.flush(); },
    replace(next) {
      if (dirty() || flight) throw new Error('请等待当前内容保存完成');
      base = next; slots = next.slots; failure = null;
      if (!disposed) onChange(view());
      emit(next.saved ? 'saved' : 'idle');
    },
    dispose() { disposed = true; clearTimeout(timer); },
  };
}
