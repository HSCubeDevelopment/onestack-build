// The boundary that makes shop-wide tow visibility safe. No DB — the tenant wrapper is stubbed so the
// test is about WHICH rows the service will accept, not about Prisma.
import { describe, expect, it, vi } from 'vitest';
import { TowDispatchService } from './tow-dispatch.service';

/**
 * `activity`, `photos` and `photoContent` are readable by any staff member, not just the job's
 * assignee — the office has to be able to see where the driver is. The thing that keeps that from
 * being "staff can read any job" is `assertTowJob`: a job only counts as a tow when its dispatch row
 * carries a pickup address.
 *
 * These tests hold that line. If someone later relaxes the dispatch lookup, the repair-job cases below
 * start returning photos and fail.
 */

/** A tenant wrapper that hands the callback one stubbed table set and records what was asked for. */
function serviceWith(dispatchRow: unknown, attachments: { id: string }[] = []) {
  const seen: { where?: unknown }[] = [];
  const tenants = {
    runInTenant: <T>(_t: string, fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        dispatch: {
          findFirst: (args: { where?: unknown }) => {
            seen.push(args);
            return Promise.resolve(dispatchRow);
          },
        },
      }),
  };
  const attachmentSvc = {
    list: vi.fn().mockResolvedValue(attachments),
    getContent: vi
      .fn()
      .mockResolvedValue({ bytes: Buffer.from('x'), contentType: 'image/jpeg', fileName: 'a.jpg' }),
  };
  const svc = new TowDispatchService(
    tenants as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    attachmentSvc as never,
  );
  return { svc, attachmentSvc, seen };
}

const JOB = '11111111-1111-4111-8111-111111111111';
const PHOTO = '22222222-2222-4222-8222-222222222222';

describe('tow-only visibility', () => {
  it('requires a pickup address, so a repair job is not reachable as a tow', async () => {
    // A job with no dispatch row matching "pickupAddress is set" — i.e. anything that is not a tow.
    const { svc, attachmentSvc, seen } = serviceWith(null);

    await expect(svc.photos('t1', JOB)).rejects.toThrow(/Tow job not found/);
    await expect(svc.photoContent('t1', JOB, PHOTO)).rejects.toThrow(/Tow job not found/);

    // And it refused BEFORE reading anything: no attachment list, no bytes out of storage.
    expect(attachmentSvc.list).not.toHaveBeenCalled();
    expect(attachmentSvc.getContent).not.toHaveBeenCalled();
    // The narrowing is in the query itself, not applied afterwards.
    expect(seen[0]?.where).toMatchObject({ workItemId: JOB, pickupAddress: { not: null } });
  });

  it('serves photos for a real tow', async () => {
    const { svc } = serviceWith({ workItemId: JOB }, [
      {
        id: PHOTO,
        caption: 'Tow pickup',
        fileName: 'p.jpg',
        contentType: 'image/jpeg',
        createdAt: new Date(),
      },
    ]);
    const photos = await svc.photos('t1', JOB);
    expect(photos).toHaveLength(1);
    expect(photos[0]?.leg).toBe('pickup');
  });

  it('refuses a photo id that belongs to a different job', async () => {
    // The tow is real, but the requested photo is not one of its attachments. getContent resolves by
    // attachment id alone, so without the ownership check this would happily stream someone else's.
    const { svc, attachmentSvc } = serviceWith({ workItemId: JOB }, [{ id: 'some-other-photo' }]);
    await expect(svc.photoContent('t1', JOB, PHOTO)).rejects.toThrow(/Photo not found/);
    expect(attachmentSvc.getContent).not.toHaveBeenCalled();
  });

  it('streams a photo that does belong to the tow', async () => {
    const { svc, attachmentSvc } = serviceWith({ workItemId: JOB }, [{ id: PHOTO }]);
    await expect(svc.photoContent('t1', JOB, PHOTO)).resolves.toMatchObject({
      contentType: 'image/jpeg',
    });
    expect(attachmentSvc.getContent).toHaveBeenCalledWith('t1', PHOTO);
  });
});
