import { Injectable } from '@nestjs/common';
import {
  DocumentTemplateDef,
  Pack,
  SubjectTypeDef,
  WorkflowDefinition,
  WorkItemTypeDef,
} from './pack-contract';

/**
 * Holds the installed packs and answers "is this type/workflow/document registered?" (card #6.1).
 * Definitions live here in memory (registered at boot from pack config) — cached, never read from the
 * DB per request (a hard constraint of the workflow engine). Version-pinned lookups support in-flight
 * items staying on the workflow version they started on.
 */
@Injectable()
export class PackRegistry {
  private readonly packs = new Map<string, Pack>();
  private readonly workItemTypes = new Map<string, WorkItemTypeDef>();
  private readonly subjectTypes = new Map<string, SubjectTypeDef>();
  private readonly documents = new Map<string, DocumentTemplateDef>();
  // workflow definitions keyed by `${workItemType}@${version}` so old versions remain resolvable.
  private readonly workflows = new Map<string, WorkflowDefinition>();

  register(pack: Pack): void {
    if (this.packs.has(pack.id)) throw new Error(`Pack already registered: ${pack.id}`);
    this.packs.set(pack.id, pack);
    for (const wit of pack.workItemTypes ?? []) {
      if (this.workItemTypes.has(wit.type))
        throw new Error(`Duplicate work-item type: ${wit.type}`);
      this.workItemTypes.set(wit.type, wit);
      this.workflows.set(`${wit.workflow.workItemType}@${wit.workflow.version}`, wit.workflow);
    }
    for (const st of pack.subjectTypes ?? []) {
      if (this.subjectTypes.has(st.type)) throw new Error(`Duplicate subject type: ${st.type}`);
      this.subjectTypes.set(st.type, st);
    }
    for (const doc of pack.documents ?? []) this.documents.set(doc.key, doc);
  }

  reset(): void {
    this.packs.clear();
    this.workItemTypes.clear();
    this.subjectTypes.clear();
    this.documents.clear();
    this.workflows.clear();
  }

  getWorkItemType(type: string): WorkItemTypeDef {
    const wit = this.workItemTypes.get(type);
    if (!wit) throw new Error(`Unknown work-item type: ${type}`);
    return wit;
  }

  getSubjectType(type: string): SubjectTypeDef {
    const st = this.subjectTypes.get(type);
    if (!st) throw new Error(`Unknown subject type: ${type}`);
    return st;
  }

  /**
   * Register an additional workflow VERSION for an existing type (a pack update). Old versions stay
   * resolvable so in-flight items pinned to them are never stranded (card #6.5).
   */
  addWorkflowVersion(def: WorkflowDefinition): void {
    this.workflows.set(`${def.workItemType}@${def.version}`, def);
  }

  /** Resolve a workflow at a specific version (for version-pinned in-flight items). */
  getWorkflow(workItemType: string, version: number): WorkflowDefinition {
    const wf = this.workflows.get(`${workItemType}@${version}`);
    if (!wf) throw new Error(`Unknown workflow: ${workItemType}@${version}`);
    return wf;
  }

  getDocument(key: string): DocumentTemplateDef | undefined {
    return this.documents.get(key);
  }

  hasWorkItemType(type: string): boolean {
    return this.workItemTypes.has(type);
  }
  hasSubjectType(type: string): boolean {
    return this.subjectTypes.has(type);
  }

  /** All installed packs, in registration order (used by the terminology layer). */
  listPacks(): Pack[] {
    return [...this.packs.values()];
  }
}
