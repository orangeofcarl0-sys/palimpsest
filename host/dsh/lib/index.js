// palimpsest-dsh-host — register the Palimpsest product tools into the REAL DSH
// tool registry and (optionally) serve the application surface over HTTP.
//
// This is the contract-zero switch the structural DshPluginContext anticipated:
// Palimpsest's tool definitions already match @deepseek-ai/dsh-tools'
// ToolDefinition shape, so registration is a passthrough. Only `output.schema`
// is relaxed to `{}` because the host validates the returned value against it
// and Palimpsest tools legitimately return arrays as well as objects.
//
// The deployment is built by Palimpsest itself (launchDeployment) from a typed
// deployment profile; this plugin never carries semantic authority.
//
// UX-C §16/§18/SC-7: the MODE is dispatched BEFORE any deployment composition.
// `dsh --profile <p> --branch <file>` composes ONLY the minimal branch environment
// (one strict `palimpsest_branch_result` tool and the frozen brief); it never
// launches the durable project stack, never registers a principal tool, and never
// composes a ReasoningCell service.

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openInDefaultBrowser, shouldOpenDashboard } from './browser.js';
import z from '@deepseek-ai/schemastery';

export const name = 'palimpsest-tools';
export const inject = ['tools', 'agents'];

export const Config = z.object({
  /** Absolute path to Palimpsest's built `dist/src/advanced.js`. */
  palimpsestEntry: z.string().required(),
  /** Absolute path to the deployment profile JSON for THIS principal. */
  deploymentProfile: z.string().required(),
  serve: z.boolean().default(false),
  port: z.number().default(0),
  host: z.string().default('127.0.0.1'),
  /**
   * How the dashboard is guarded. "fence" (the default) needs no credential — the browser-trust
   * fence is the whole gate, so the agent's answer to "where do I watch?" is one sentence.
   * "token" is the opt-in for a machine other people use; it costs the person a handoff, which is
   * why that mode also writes the link into the project.
   */
  auth: z.union(['fence', 'token']).default('fence'),
  /**
   * Open the dashboard in the default browser once it is serving. Default true, and only acted on
   * when this process has a terminal: a person running the profile by hand gets the page without
   * copying a token, while a scripted run or an agent host opens nothing.
   */
  openDashboard: z.boolean().default(true),
  /**
   * Dashboard credential. Empty (the default) ⇒ serve mints a random token for this start and
   * prints it, which is what a profile should do; set it only when something outside this process
   * has to know the token in advance, such as a scripted rig.
   */
  token: z.string().default(''),
  /**
   * Advanced: an explicit path to a DSH bin for branch execution. Absent ⇒ this
   * host derives it from its own invocation (`process.argv[1]`) plus `--profile`.
   */
  dshBin: z.string().default(''),
});

function toRealTool(definition) {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    // The host validates the returned canonical value against output.schema and
    // renders it through render(); Palimpsest's schema is a permissive object.
    output: { schema: {}, render: definition.output.render },
    ...(definition.timeoutMs === undefined ? {} : { timeoutMs: definition.timeoutMs }),
    ...(definition.isConcurrencySafe === undefined ? {} : { isConcurrencySafe: definition.isConcurrencySafe }),
    execute: definition.execute,
  };
}

/** Read one `--flag value` from the raw command line (no semantic effect). */
function flagValue(name) {
  const argv = process.argv;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      const value = argv[index + 1];
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    }
    if (typeof argv[index] === 'string' && argv[index].startsWith(`${name}=`)) {
      const value = argv[index].slice(name.length + 1);
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

/**
 * UX-C §20: the HOST derives the ephemeral branch execution port from its own
 * runtime knowledge — the DSH bin it was launched with and the profile it runs
 * under. A normal user supplies neither the bin path nor a separate branch profile.
 *
 * PLMP-LEAN-1 §C.11 ②: the SAME derivation also yields the per-`workDir` factory a
 * delegation needs, because a delegated branch must read a FROZEN snapshot rather than
 * the live tree. One derivation, two bindings — never a second branch runtime.
 */
function deriveBranchHost(palimpsest, profile) {
  if (profile.reasoning === undefined) return undefined;
  const profileName = flagValue('--profile');
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim() || (typeof process.argv[1] === 'string' && process.argv[1].endsWith('.js') ? process.argv[1] : undefined);
  if (profileName === undefined || bin === undefined) return undefined;
  if (typeof palimpsest.dshSubprocessBranchExecutionPort !== 'function') return undefined;
  const build = (workDir) =>
    palimpsest.dshSubprocessBranchExecutionPort({ dshBin: bin, profile: profileName, workDir });
  return {
    build,
    blocking: () => {
      try {
        return build(process.cwd());
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * WORK WORKER MODE: compose the worker environment and nothing else. The runner reads `host.work` and
 * prints the ONE outcome line.
 *
 * The environment crosses the process boundary as DATA — the canonical task context plus the ONE tool
 * definition the worker answers through — because the host reaches Palimpsest only through its entry
 * module, and the outcome vocabulary must live in exactly one place (Palimpsest generates the enum
 * below from its own constant). The host's part is deliberately trivial: register the tool, keep the
 * FIRST report, print it. Every rule about what an outcome may say is enforced on the way back, in
 * `parseWorkWorkerResult`, so a lenient host cannot widen the vocabulary.
 */
async function applyWork(ctx, palimpsest, workFile) {
  const toolNames = [];
  const context = {
    tools: {
      register(definition) {
        toolNames.push(definition.name);
        return ctx.tools.register(toRealTool(definition));
      },
    },
  };
  let raw;
  try {
    raw = JSON.parse(readFileSync(workFile, 'utf8'));
  } catch (error) {
    ctx.provide('palimpsestHost', {
      work: { error: `the worker environment could not be read: ${error?.message ?? String(error)}` },
      palimpsest,
      toolNames,
    });
    return;
  }
  const definition = raw?.resultTool;
  if (typeof definition?.name !== 'string' || definition.name.length === 0 || typeof definition?.parameters !== 'object' || definition.parameters === null) {
    ctx.provide('palimpsestHost', {
      work: { error: 'the worker environment carries no usable result tool definition' },
      palimpsest,
      toolNames,
    });
    return;
  }

  let reported = null;
  const recorder = {
    get status() {
      return reported === null ? 'pending' : 'reported';
    },
    get outcome() {
      return reported;
    },
    get detail() {
      return reported === null ? 'the worker has not reported an outcome yet' : 'the worker reported its ONE outcome';
    },
    get violations() {
      return Object.freeze([]);
    },
    record(args) {
      // ONE outcome per worker. The rules about WHAT it may say are not enforced here: the reported
      // payload is re-read strictly on the Palimpsest side, where the vocabulary lives.
      if (reported !== null) {
        const violation = 'the worker already reported its ONE outcome';
        throw new Error(`WORKER_RESULT_ALREADY_RECORDED: ${violation}`);
      }
      reported = args;
      return { accepted: true, detail: 'recorded the worker outcome' };
    },
  };
  const tool = {
    name: definition.name,
    description: typeof definition.description === 'string' ? definition.description : '',
    parameters: definition.parameters,
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    mode: 'read-only',
    async execute(args) {
      return recorder.record(args);
    },
  };

  ctx.provide('palimpsestHost', {
    palimpsest,
    work: {
      context: raw.context,
      recorder,
      // Already converted to the host's own definition shape: the runner registers it into the WORKER
      // AGENT's scope (not the plugin scope), which is what keeps it out of reach of the restriction
      // that closes the inherited authority surface.
      tool: toRealTool(tool),
      deniedAuthorityPrefix: typeof raw.deniedAuthorityPrefix === 'string' ? raw.deniedAuthorityPrefix : 'palimpsest_',
      principalTools: [],
    },
    toolNames,
  });
  // A worker holds NO deployment and NO durable identity, so there is no lifecycle effect to register:
  // the process prints its outcome line and exits.
}

/**
 * BRANCH MODE: compose the minimal branch environment and nothing else. The
 * runner reads `host.branch` and prints the ONE result line.
 */
async function applyBranch(ctx, palimpsest, branchFile) {
  const toolNames = [];
  const context = {
    tools: {
      register(definition) {
        toolNames.push(definition.name);
        return ctx.tools.register(toRealTool(definition));
      },
    },
  };
  let raw;
  try {
    raw = JSON.parse(readFileSync(branchFile, 'utf8'));
  } catch (error) {
    ctx.provide('palimpsestHost', {
      branch: { error: `the branch payload could not be read: ${error?.message ?? String(error)}` },
      palimpsest,
      toolNames,
    });
    return;
  }
  const composed = palimpsest.composeBranchHostEnvironment(raw);
  if (composed.ok !== true) {
    ctx.provide('palimpsestHost', { branch: { error: composed.detail }, palimpsest, toolNames });
    return;
  }
  const environment = composed.environment;
  context.tools.register(environment.tool);
  ctx.provide('palimpsestHost', { palimpsest, branch: environment, toolNames });
  // A branch holds NO deployment, NO store and NO durable identity, so there is no
  // lifecycle effect to register: the process simply exits after printing its result.
}

export async function apply(ctx, config) {
  const palimpsest = await import(pathToFileURL(config.palimpsestEntry).href);

  // §18/SC-7: dispatch BEFORE composing anything.
  const branchFile = flagValue('--branch');
  if (branchFile !== undefined) {
    return applyBranch(ctx, palimpsest, branchFile);
  }
  // PLMP-LEAN-1 §D2-c: the WORK WORKER mode. It composes the worker environment and NOTHING else —
  // no deployment, no store, no federation, no principal surface — exactly like branch mode, because a
  // worker is an ephemeral engineering agent inside one prepared execution world.
  const workFile = flagValue('--work');
  if (workFile !== undefined) {
    return applyWork(ctx, palimpsest, workFile);
  }

  const profile = palimpsest.loadDeploymentProfile(config.deploymentProfile);

  const toolNames = [];
  const context = {
    tools: {
      register(definition) {
        toolNames.push(definition.name);
        // Register into the REAL DSH registry; its disposer is honoured on teardown.
        return ctx.tools.register(toRealTool(definition));
      },
    },
  };

  // UX-C §20/§26: the host supplies the agents service (used only when the profile
  // explicitly binds a DSH session) and the host-derived branch execution port. The
  // packaged reasoning policies and store come from the DEPLOYMENT PROFILE, not from
  // any hard-coded host policy: the fabricating SUPPORTED policy is gone (SC-5).
  const agents = ctx.get('agents');
  const branchHost = deriveBranchHost(palimpsest, profile);
  const branchExecution = branchHost?.blocking();

  // The dashboard url exists only AFTER serving (a profile may ask for port 0 and let the OS pick),
  // so the deployment reads it through a getter rather than receiving a value it cannot know yet.
  // This is what lets the agent — the primary surface — tell the person where to watch.
  const deployment = palimpsest.launchDeployment(profile, {
    context,
    host: {
      ...(agents === undefined ? {} : { dshAgents: agents }),
      ...(branchExecution === undefined ? {} : { branchExecution }),
      // PLMP-LEAN-1 §C.11 ②: a delegated branch is bound to a frozen snapshot's workDir, so the
      // delegation needs the factory rather than the one port above.
      ...(branchHost === undefined ? {} : { branchExecutionFor: branchHost.build }),
      facts: {
        dashboardUrl: () => (serve === undefined ? null : serve.url),
        dashboardAuth: () => (serve === undefined ? null : serve.auth),
        dashboardHandoffFile: () => (serve === undefined ? null : serve.handoffFilePath),
      },
    },
  });

  let serve;
  if (config.serve === true) {
    serve = await palimpsest.serveOrchestration(deployment.installed.controller, {
      port: config.port,
      host: config.host,
      // Access mode. "fence" (the default) needs no credential at all — the browser-trust fence is
      // the whole gate, so the agent's answer to "where do I watch?" is one complete sentence.
      // "token" is the opt-in for a machine other people use, and it costs the person a handoff,
      // which is why that mode also writes the link into the project (see handoffFilePath).
      auth: config.auth,
      // Token mode only; absent ⇒ a random token per start. It used to default to a fixed string
      // ('palimpsest-dogfood'), which made the dashboard's only credential a constant published in
      // this repository — and, because the token was then accepted from the query string, one a
      // malicious page could use without a preflight.
      ...(config.token === '' ? {} : { token: config.token }),
      // Token mode only: the handoff link, written where the person's own surfaces already look.
      // First choice is the project's .palimpsest/ (what a dsh web workspace shows); a profile
      // without a repository falls back to the deployment state dir, which a terminal still
      // reaches. Either way the agent reports the PATH, never a token.
      handoffFilePath:
        config.auth === 'token'
          ? profile.repository === undefined
            ? join(dirname(profile.databases.orchestration), 'dashboard-link.txt')
            : join(profile.repository, '.palimpsest', 'dashboard-link.txt')
          : undefined,
      // The cookie secret lives beside this deployment's databases, so a browser that was
      // authorized before a host restart still is afterwards. Derived HERE rather than in the
      // product: the product's public surface is sealed (§4 — an added export fails parity), and
      // this is host-side wiring about where a deployment keeps its files. `palimpsest serve`
      // derives the same name from the same field, so one deployment has one secret.
      secretPath: join(dirname(profile.databases.orchestration), 'dashboard-cookie-secret'),
      application: deployment.installed.application,
    });
    // `url` is the clean address (what the agent reports, and what belongs in a model's context).
    // In fence mode that address IS the whole answer. In token mode `openUrl` carries this start's
    // token, and opening it exchanges the token for a browser cookie and redirects to the clean
    // url; the same link is in the project's .palimpsest/dashboard-link.txt for a person who is
    // not reading this stream.
    process.stdout.write(`PALIMPSEST_DASHBOARD ${JSON.stringify({ url: serve.url, auth: serve.auth, ...(serve.openUrl === null ? {} : { openUrl: serve.openUrl, token: serve.token, handoffFile: serve.handoffFilePath }) })}\n`);
    // Printing it is enough for whoever reads this terminal, and useless for whoever does not —
    // measured: an agent asked "where do I watch?" reports the clean url, cannot obtain the token,
    // and refuses to guess. So when a person IS watching this run, the deployment opens the url,
    // which is what `dsh web` does by default. A script or a server has no terminal and gets no
    // window popped at it.
    if (shouldOpenDashboard(config.openDashboard, process.stdout.isTTY === true) && serve.openUrl !== null) {
      const opened = openInDefaultBrowser(serve.openUrl);
      process.stdout.write(`PALIMPSEST_DASHBOARD_OPEN ${JSON.stringify({ opened, openUrl: serve.openUrl })}\n`);
    }
  }

  ctx.provide('palimpsestHost', {
    deployment,
    profile,
    serve,
    toolNames,
    palimpsest,
  });

  ctx.effect(function* () {
    yield async () => {
      try {
        await serve?.close?.();
      } catch {
        /* the harness may already have closed the socket */
      }
      await deployment.close();
    };
  }, 'palimpsest-host lifecycle');
}

export { toRealTool, flagValue, deriveBranchHost };
