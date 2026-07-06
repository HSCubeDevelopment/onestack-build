import { Injectable } from '@nestjs/common';
import { createMachine, StateMachine } from '@xstate/fsm';
import { PackRegistry } from './pack-registry';
import { WorkflowDefinition } from './pack-contract';

/** Thrown when a transition is illegal, guarded-off, or the state/definition is invalid. */
export class WorkflowError extends Error {}

interface FsmContext {
  [k: string]: unknown;
}
interface FsmEvent {
  type: string;
  fields: Record<string, unknown>;
}
type FsmTypestate = { value: string; context: FsmContext };
type Machine = StateMachine.Machine<FsmContext, FsmEvent, FsmTypestate>;

/**
 * Data-driven state machine engine (card #6.5). States/guards/actions/transitions ONLY — no scripting.
 * Built on @xstate/fsm (an established FSM library — we don't invent one). Definitions are DATA; guard
 * names in the data resolve to pack-provided functions here. Machines are cached by `type@version`, and
 * an in-flight Work Item is always evaluated against the version it is pinned to (never read per request).
 */
@Injectable()
export class WorkflowEngine {
  private readonly cache = new Map<string, Machine>();

  constructor(private readonly registry: PackRegistry) {}

  initialState(def: WorkflowDefinition): string {
    return def.initial;
  }

  /**
   * Compute the next state for an event. Throws WorkflowError on an illegal transition (event not
   * allowed from the current state), a failed guard, or a terminal state. Returns the side-effect
   * action names to fire as events.
   */
  transition(
    def: WorkflowDefinition,
    currentState: string,
    event: string,
    fields: Record<string, unknown>,
  ): { nextState: string; actions: string[] } {
    const stateDef = def.states[currentState];
    if (!stateDef) throw new WorkflowError(`Unknown state "${currentState}"`);
    if (stateDef.final) throw new WorkflowError(`State "${currentState}" is terminal`);
    const t = stateDef.on?.[event];
    if (!t)
      throw new WorkflowError(`Illegal transition: "${event}" not allowed from "${currentState}"`);

    const machine = this.machineFor(def);
    const next = machine.transition(currentState, { type: event, fields });
    if (next.value !== t.target) {
      throw new WorkflowError(`Guard blocked "${event}" from "${currentState}"`);
    }
    const actions = (next.actions ?? []).map((a) => (typeof a === 'string' ? a : a.type));
    return { nextState: next.value, actions };
  }

  private machineFor(def: WorkflowDefinition): Machine {
    const key = `${def.workItemType}@${def.version}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const guards = this.registry.getWorkItemType(def.workItemType).guards ?? {};
    // Build an @xstate/fsm config from the pure-data definition, resolving guard NAMES to functions.
    const states: Record<string, unknown> = {};
    for (const [name, s] of Object.entries(def.states)) {
      const on: Record<string, unknown> = {};
      for (const [evt, tr] of Object.entries(s.on ?? {})) {
        on[evt] = {
          target: tr.target,
          ...(tr.guard
            ? {
                cond: (_ctx: FsmContext, e: FsmEvent) => {
                  const g = guards[tr.guard as string];
                  if (!g) throw new WorkflowError(`Unknown guard "${tr.guard}"`);
                  return g({ fields: e.fields ?? {} }, { type: e.type });
                },
              }
            : {}),
          ...(tr.actions ? { actions: tr.actions } : {}),
        };
      }
      states[name] = { on };
    }

    const config = {
      id: def.workItemType,
      initial: def.initial,
      context: {} as FsmContext,
      states,
    } as unknown as StateMachine.Config<FsmContext, FsmEvent, FsmTypestate>;

    const machine = createMachine<FsmContext, FsmEvent, FsmTypestate>(config);
    this.cache.set(key, machine);
    return machine;
  }
}
