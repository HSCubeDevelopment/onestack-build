import { describe, expect, it } from 'vitest';
import { FleetService, pairRentalHistory } from './fleet.service';

/** Minimal Prisma-ish where matcher: equality, { not }, { in }, range, { contains }, and OR. */
function matchWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(cond as Record<string, unknown>[]).some((c) => matchWhere(row, c))) return false;
      continue;
    }
    const v = row[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ('not' in c) {
        if (v === c.not) return false;
      } else if ('in' in c) {
        if (!(c.in as unknown[]).includes(v)) return false;
      } else if ('contains' in c) {
        if (
          !String(v ?? '')
            .toLowerCase()
            .includes(String(c.contains).toLowerCase())
        )
          return false;
      } else if ('gte' in c || 'lte' in c || 'lt' in c || 'gt' in c) {
        const t = v instanceof Date ? v.getTime() : (v as number);
        const num = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
        if ('gte' in c && !(t >= num(c.gte))) return false;
        if ('lte' in c && !(t <= num(c.lte))) return false;
        if ('lt' in c && !(t < num(c.lt))) return false;
        if ('gt' in c && !(t > num(c.gt))) return false;
      } else {
        return false;
      }
    } else if (v !== cond) {
      return false;
    }
  }
  return true;
}

function makeTable(defaults: Record<string, unknown>) {
  const rows: Record<string, unknown>[] = [];
  let seq = 0;
  const pick = (row: Record<string, unknown>, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : row;
  return {
    rows,
    create: async ({
      data,
      select,
    }: {
      data: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => {
      const row = { id: `id${++seq}`, ...structuredClone(defaults), ...data };
      rows.push(row);
      return pick(row, select);
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((r) => matchWhere(r, where)) ?? null,
    findUnique: async ({
      where,
      select,
    }: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => {
      const compound = where.tenantId_rego as { tenantId: string; rego: string } | undefined;
      const row = compound
        ? rows.find((r) => r.tenantId === compound.tenantId && r.rego === compound.rego)
        : rows.find((r) => matchWhere(r, where));
      return row ? pick(row, select) : null;
    },
    findMany: async ({ where, take }: { where?: Record<string, unknown>; take?: number } = {}) => {
      let out = where ? rows.filter((r) => matchWhere(r, where)) : [...rows];
      if (take) out = out.slice(0, take);
      return out;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const r = rows.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return r;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const hit = rows.filter((r) => matchWhere(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    upsert: async ({
      where,
      create,
      update,
      select,
    }: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => {
      const compound = where.tenantId_rego as { tenantId: string; rego: string };
      const existing = rows.find(
        (r) => r.tenantId === compound.tenantId && r.rego === compound.rego,
      );
      if (existing) {
        Object.assign(existing, update);
        return pick(existing, select);
      }
      const row = { id: `id${++seq}`, ...structuredClone(defaults), ...create };
      rows.push(row);
      return pick(row, select);
    },
    count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      (where ? rows.filter((r) => matchWhere(r, where)) : rows).length,
  };
}

function make() {
  const now = new Date('2026-07-15T02:00:00Z');
  const store = {
    fleetVehicle: makeTable({
      regoRaw: '',
      make: '',
      model: '',
      vehicleType: '',
      status: 'unknown',
      isCompanyCar: false,
      notes: '',
      createdAt: now,
      updatedAt: now,
    }),
    fleetMovement: makeTable({
      contactId: null,
      driverName: '',
      driverPhone: '',
      ownerName: '',
      ownerPhone: '',
      carsInRego: '',
      carsInRegoRaw: '',
      carsOutVehicleId: null,
      carsOutRego: '',
      carsOutRegoRaw: '',
      purpose: '',
      movedAt: null,
      status: 'active',
      needsReview: false,
      reviewReason: '',
      notes: '',
      staffName: '',
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now,
    }),
    fleetReturn: makeTable({
      movementId: null,
      contactId: null,
      returnedVehicleId: null,
      returnedRego: '',
      returnedRegoRaw: '',
      driverName: '',
      mobileNumber: '',
      returnedAt: null,
      bondStatus: '',
      notes: '',
      staffName: '',
      needsReview: false,
      reviewReason: '',
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now,
    }),
    fleetBooking: makeTable({
      vehicleId: null,
      vehicleRego: '',
      contactId: null,
      bookingName: '',
      bookingMobile: '',
      startAt: now,
      expectedReturnAt: null,
      purpose: '',
      status: 'booked',
      notes: '',
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now,
    }),
  };
  const tenants = { runInTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(store) };
  const audit = { recordIn: async () => {} };
  const svc = new FleetService(tenants as never, audit as never);
  return { svc, store };
}

describe('FleetService — movement/return/booking lifecycle', () => {
  it('createMovement records the movement, ensures both cars, and marks the fleet car OUT', async () => {
    const { svc, store } = make();
    const m = await svc.createMovement('t1', 'u1', {
      driverName: ' Jane ',
      driverPhone: '0400 000 000',
      carsInRego: 'cust01',
      carsOutRego: 'fleet01',
      purpose: 'COURTESY',
    });
    expect(m.status).toBe('active');
    expect(m.carsOutRego).toBe('FLEET01');
    expect(m.carsInRego).toBe('CUST01');
    expect(m.driverName).toBe('Jane');
    expect(m.driverPhone).toBe('0400000000');
    const fleet = store.fleetVehicle.rows.find((v) => v.rego === 'FLEET01')!;
    expect(fleet.status).toBe('out');
    expect(fleet.isCompanyCar).toBe(true);
    expect(store.fleetVehicle.rows.some((v) => v.rego === 'CUST01')).toBe(true);
  });

  it('createReturn matches the active movement, closes it, and frees the car', async () => {
    const { svc, store } = make();
    await svc.createMovement('t1', 'u1', { carsOutRego: 'fleet01', driverName: 'Jane' });
    const { ret, matchedMovement } = await svc.createReturn('t1', 'u1', {
      returnedRego: 'fleet01',
      driverName: 'Jane',
    });
    expect(matchedMovement).not.toBeNull();
    expect(ret.returnedRego).toBe('FLEET01');
    const move = store.fleetMovement.rows[0]!;
    expect(move.status).toBe('returned');
    const fleet = store.fleetVehicle.rows.find((v) => v.rego === 'FLEET01')!;
    expect(fleet.status).toBe('available');
  });

  it('a return never overrides an explicit repair hold', async () => {
    const { svc, store } = make();
    store.fleetVehicle.rows.push({
      id: 'v-repair',
      tenantId: 't1',
      rego: 'FLEET02',
      regoRaw: 'FLEET02',
      make: '',
      model: '',
      vehicleType: '',
      status: 'repair',
      isCompanyCar: true,
      notes: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await svc.createReturn('t1', 'u1', { returnedRego: 'fleet02' });
    expect(store.fleetVehicle.rows.find((v) => v.rego === 'FLEET02')!.status).toBe('repair');
  });

  it('cancelBooking releases a car it was the sole hold on', async () => {
    const { svc, store } = make();
    const b = await svc.createBooking('t1', 'u1', {
      vehicleRego: 'book01',
      bookingName: 'Sam',
      startAt: '2026-07-20T09:00:00.000Z',
    });
    expect(store.fleetVehicle.rows.find((v) => v.rego === 'BOOK01')!.status).toBe('booked');
    const cancelled = await svc.cancelBooking('t1', b.id, 'u1');
    expect(cancelled.status).toBe('cancelled');
    expect(store.fleetVehicle.rows.find((v) => v.rego === 'BOOK01')!.status).toBe('available');
  });

  it('universalSearch finds a movement by rego', async () => {
    const { svc } = make();
    await svc.createMovement('t1', 'u1', { carsOutRego: 'fleet01', driverName: 'Jane' });
    const res = await svc.universalSearch('t1', 'fleet01');
    expect(res.movements).toHaveLength(1);
    expect(res.movements[0]!.carsOutRego).toBe('FLEET01');
  });
});

describe('pairRentalHistory (chain of custody)', () => {
  const mv = (o: Partial<Record<string, unknown>>) =>
    ({
      id: 'm1',
      driverName: 'Jane',
      driverPhone: '0400',
      purpose: 'COURTESY',
      movedAt: new Date('2026-01-01'),
      createdAt: new Date('2026-01-01'),
      status: 'returned',
      notes: 'out note',
      movementId: null,
      ...o,
    }) as never;
  const rt = (o: Partial<Record<string, unknown>>) =>
    ({
      id: 'r1',
      driverName: 'Jane',
      mobileNumber: '0400',
      returnedAt: new Date('2026-01-05'),
      createdAt: new Date('2026-01-05'),
      notes: 'back note',
      movementId: null,
      ...o,
    }) as never;

  it('pairs an explicit movement→return link', () => {
    const periods = pairRentalHistory([mv({ id: 'm1' })], [rt({ id: 'r1', movementId: 'm1' })]);
    expect(periods).toHaveLength(1);
    expect(periods[0]!.returnId).toBe('r1');
    expect(periods[0]!.returnNotes).toBe('back note');
    expect(periods[0]!.ongoing).toBe(false);
  });

  it('pairs chronologically when links are missing, earliest out to earliest later return', () => {
    const periods = pairRentalHistory(
      [mv({ id: 'm1', movedAt: new Date('2026-01-01') })],
      [rt({ id: 'r1', returnedAt: new Date('2026-01-03') })],
    );
    expect(periods[0]!.returnId).toBe('r1');
  });

  it('surfaces unpaired returns so nothing is lost', () => {
    const periods = pairRentalHistory([], [rt({ id: 'r9' })]);
    expect(periods).toHaveLength(1);
    expect(periods[0]!.movementId).toBeNull();
    expect(periods[0]!.returnId).toBe('r9');
  });

  it('marks an active movement with no return as ongoing', () => {
    const periods = pairRentalHistory([mv({ id: 'm1', status: 'active' })], []);
    expect(periods[0]!.ongoing).toBe(true);
  });
});
