import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service';
import { PackRegistry } from '../core/pack-registry';
import { SubjectService } from '../subjects/subject.service';
import { WorkItemService } from '../work-items/work-item.service';

export interface BoardCard {
  id: string;
  reference: string;
  stateName: string;
  customerName: string | null;
  vehicleLabel: string | null;
  assignees: string[];
}

export interface BoardColumn {
  state: string;
  isFinal: boolean;
  cards: BoardCard[];
}

export interface BoardView {
  type: string;
  columns: BoardColumn[];
}

/**
 * Job board read-model (card #22): a new VIEW of existing Work Items grouped by workflow state — no new
 * data. Columns come from the pack's workflow (in definition order, empty columns included). Each card is
 * denormalised for at-a-glance display (reference, customer, vehicle, assignees). Dragging a card to the
 * next column is a workflow transition, so it still honours the engine's rules. Reads the shared Contact
 * and Subject records via their owning services — no cross-module table access. Tenant-scoped by them.
 */
@Injectable()
export class BoardService {
  constructor(
    private readonly workItems: WorkItemService,
    private readonly subjects: SubjectService,
    private readonly contacts: ContactsService,
    private readonly registry: PackRegistry,
  ) {}

  async getBoard(tenantId: string, type: string): Promise<BoardView> {
    if (!this.registry.hasWorkItemType(type))
      throw new BadRequestException(`Unknown work-item type: ${type}`);
    const def = this.registry.getWorkItemType(type);
    const stateOrder = Object.keys(def.workflow.states);

    const items = await this.workItems.list(tenantId, type);

    // Resolve customer names once (one list, mapped) rather than per-card.
    const contactList = await this.contacts.list(tenantId);
    const nameById = new Map(contactList.map((c) => [c.id, c.displayName]));

    const cards: BoardCard[] = await Promise.all(
      items.map(async (wi) => {
        const customerId = (wi.fields as { customerId?: string }).customerId;
        const subjectsForItem = await this.subjects.listForWorkItem(tenantId, wi.id);
        return {
          id: wi.id,
          reference: wi.reference,
          stateName: wi.stateName,
          customerName: customerId ? (nameById.get(customerId) ?? null) : null,
          vehicleLabel: subjectsForItem[0]?.label ?? null,
          assignees: wi.assignees,
        };
      }),
    );

    const byState = new Map<string, BoardCard[]>();
    for (const s of stateOrder) byState.set(s, []);
    for (const card of cards) {
      // A card in an unknown state (e.g. after a workflow change) still shows in its own column.
      if (!byState.has(card.stateName)) byState.set(card.stateName, []);
      byState.get(card.stateName)!.push(card);
    }

    const columns: BoardColumn[] = [...byState.entries()].map(([state, stateCards]) => ({
      state,
      isFinal: def.workflow.states[state]?.final ?? false,
      cards: stateCards,
    }));
    return { type, columns };
  }

  /**
   * "Drag to column": move a work item to a target state by firing the event that leads there FROM its
   * current state, in its PINNED workflow version. Rejects a move with no direct transition (you can't
   * skip columns) — so the board can never bypass the workflow's rules/guards.
   */
  async moveToState(tenantId: string, workItemId: string, targetState: string): Promise<BoardCard> {
    const wi = await this.workItems.get(tenantId, workItemId);
    if (wi.stateName === targetState)
      throw new BadRequestException('Job is already in that column');
    const def = this.registry.getWorkflow(wi.type, wi.workflowVersion); // pinned version
    const from = def.states[wi.stateName];
    if (!from) throw new NotFoundException(`State "${wi.stateName}" not in the workflow`);

    const event = Object.entries(from.on ?? {}).find(([, t]) => t.target === targetState)?.[0];
    if (!event)
      throw new BadRequestException(
        `Cannot move from "${wi.stateName}" to "${targetState}" — no such transition`,
      );

    const moved = await this.workItems.transition(tenantId, workItemId, event);
    const subjectsForItem = await this.subjects.listForWorkItem(tenantId, workItemId);
    const customerId = (moved.fields as { customerId?: string }).customerId;
    const customerName = customerId
      ? ((await this.contacts.list(tenantId)).find((c) => c.id === customerId)?.displayName ?? null)
      : null;
    return {
      id: moved.id,
      reference: moved.reference,
      stateName: moved.stateName,
      customerName,
      vehicleLabel: subjectsForItem[0]?.label ?? null,
      assignees: moved.assignees,
    };
  }
}
