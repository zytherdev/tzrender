import { RubyVM } from '@ruby/wasm-wasi';
import { ConsoleStdout, File as WasiFile, OpenFile, PreopenDirectory, Directory, WASI } from '@bjorn3/browser_wasi_shim';
import rubyWasmUrl from '@ruby/3.4-wasm-wasi/dist/ruby+stdlib.wasm?url';

// Ruby runs in a dedicated worker with only the in-memory project directory
// preopened to WASI. No host filesystem, browser JS bridge or network capability
// is provided to project code.
const MAX_OUTPUT_CHARS = 100_000;
const MAX_STACK_CHARS = 12_000;
const encoder = new TextEncoder();
let modulePromise = null;
let currentRun = 0;

function send(message) { self.postMessage(message); }
function rubyString(value) { return JSON.stringify(String(value)); }

function projectDirectory(files) {
  const root = new Map();
  for (const file of files) {
    const parts = file.name.split('/');
    let children = root;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const leaf = index === parts.length - 1;
      if (leaf) {
        if (children.has(part)) throw new Error(`Ruby project path conflict: ${file.name}.`);
        children.set(part, new WasiFile(encoder.encode(file.content)));
        continue;
      }
      let directory = children.get(part);
      if (directory === undefined) {
        directory = new Map();
        children.set(part, directory);
      }
      if (!(directory instanceof Map)) throw new Error(`Ruby project path conflict: ${file.name}.`);
      children = directory;
    }
  }
  const inodes = (entries) => new Map([...entries].map(([name, entry]) => [
    name,
    entry instanceof Map ? new Directory(inodes(entry)) : entry
  ]));
  return inodes(root);
}

async function getRubyModule(runId) {
  if (!modulePromise) {
    send({ type: 'loading', runId, text: 'Loading CRuby 3.4 WebAssembly…' });
    modulePromise = (async () => {
      const response = await fetch(rubyWasmUrl);
      if (!response.ok) throw new Error(`Unable to load CRuby WebAssembly (${response.status}).`);
      return WebAssembly.compile(await response.arrayBuffer());
    })().catch((error) => { modulePromise = null; throw error; });
  }
  return modulePromise;
}

function makeProgram(name, source, files) {
  const projectPaths = rubyString(JSON.stringify([...new Set([name, ...files.map((file) => file.name)])]));
  return `
require 'json'
require 'stringio'
module TZRenderNoJSBridge
  def require(feature)
    name = feature.to_s
    raise LoadError, 'JavaScript bridge is disabled in this Ruby runtime' if name == 'js' || name.start_with?('js/')
    super
  end
end
Kernel.prepend(TZRenderNoJSBridge) unless Kernel.ancestors.include?(TZRenderNoJSBridge)
project_paths = JSON.parse(${projectPaths})
project_paths.each do |path|
  directory = File.dirname(File.expand_path(path, Dir.pwd))
  $LOAD_PATH.unshift(directory) unless $LOAD_PATH.include?(directory)
end
$LOAD_PATH.unshift(Dir.pwd) unless $LOAD_PATH.include?(Dir.pwd)
$stdout = StringIO.new
$stderr = StringIO.new
begin
  eval(${rubyString(source)}, TOPLEVEL_BINDING, File.expand_path(${rubyString(name)}, Dir.pwd), 1)
  { stdout: $stdout.string, stderr: $stderr.string, error: nil }.to_json
rescue Exception => error
  { stdout: $stdout.string, stderr: $stderr.string, error: error.full_message(highlight: false) }.to_json
end
`;
}

function runOutput(message, stream, text, budget) {
  if (!text || currentRun !== message.runId || budget.remaining <= 0) return;
  const clipped = String(text).slice(0, budget.remaining);
  budget.remaining -= clipped.length;
  if (clipped) send({ type: 'output', runId: message.runId, stream, text: clipped });
}

async function execute(message) {
  const { runId } = message;
  currentRun = runId;
  const budget = { remaining: MAX_OUTPUT_CHARS };
  try {
    const module = await getRubyModule(runId);
    if (currentRun !== runId) return;
    const stdout = new ConsoleStdout((bytes) => runOutput(message, 'stdout', new TextDecoder().decode(bytes), budget));
    const stderr = new ConsoleStdout((bytes) => runOutput(message, 'stderr', new TextDecoder().decode(bytes), budget));
    const preopen = new PreopenDirectory('.', projectDirectory(message.files));
    const stdin = new OpenFile(new WasiFile(encoder.encode(message.input || '')));
    const wasi = new WASI(['ruby.wasm', '-EUTF-8'], [], [stdin, stdout, stderr, preopen]);
    const { vm } = await RubyVM.instantiateModule({ module, wasip1: wasi, args: ['ruby.wasm', '-EUTF-8'] });
    if (currentRun !== runId) return;
    send({ type: 'started', runId });
    const result = vm.eval(makeProgram(message.name, message.source, message.files));
    if (currentRun !== runId) return;
    let output;
    try { output = JSON.parse(result.toString()); }
    catch { throw new Error('Ruby returned an invalid result from the WebAssembly worker.'); }
    runOutput(message, 'stdout', output.stdout || '', budget);
    runOutput(message, 'stderr', output.stderr || '', budget);
    if (output.error) throw new Error(String(output.error).slice(0, MAX_STACK_CHARS));
    send({ type: 'complete', runId });
  } catch (error) {
    if (currentRun === runId) send({ type: 'error', runId, text: String(error?.stack || error?.message || error).slice(0, MAX_STACK_CHARS) });
  }
}

self.addEventListener('message', ({ data: message }) => {
  if (!message) return;
  if (message.type === 'stop') { currentRun = 0; modulePromise = null; return; }
  if (message.type === 'run') void execute(message);
});
