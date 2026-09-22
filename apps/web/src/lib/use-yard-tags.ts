'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  groupTagsByNearestYard,
  type TagLocation,
  type Yard,
  type YardSighting,
} from '@/lib/yards';

export interface YardTags {
  /** Cars a GPS tag currently places at each yard, keyed by yard id. */
  countByYard: Record<string, number>;
  /** The cars themselves, keyed by yard id — nearest first. What the yard screen lists. */
  sightingsByYard: Record<string, YardSighting[]>;
  /** Total tagged cars sitting at any yard. */
  atYards: number;
  /** Tagged cars that exist but are not at a yard — out with customers. */
  elsewhere: number;
  configured: boolean;
  loading: boolean;
}

/**
 * Which tagged cars are actually sitting in each yard, right now.
 *
 * This is a DIFFERENT number from the yard-drop count the screens showed before, and the difference is
 * the whole point: a drop is a record a person made, so it reads zero until someone uses the Park-a-car
 * flow, while this is where the cars physically are. Both are worth showing — the drop list is the
 * shop's record, this is the reality check against it.
 *
 * It returns the sightings and not just a tally, because a yard screen that says "15 cars here" and
 * then cannot say WHICH fifteen is not much use to someone standing in the yard.
 *
 * Live only. Positions are read through to CityTag and never stored.
 */
export function useYardTags(yards: Yard[]): YardTags {
  const [state, setState] = useState<YardTags>({
    countByYard: {},
    sightingsByYard: {},
    atYards: 0,
    elsewhere: 0,
    configured: false,
    loading: true,
  });

  // Re-run when the yard SET changes, not on every render of a new array instance.
  const key = yards.map((y) => y.id).join(',');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await api.get<{ configured: boolean; devices: TagLocation[] }>(
          '/tracking/fleet',
        );
        if (!alive) return;
        const rows = groupTagsByNearestYard(yards, res.devices);
        const countByYard: Record<string, number> = {};
        const sightingsByYard: Record<string, YardSighting[]> = {};
        let atYards = 0;
        for (const r of rows) {
          countByYard[r.yard.id] = r.sightings.length;
          sightingsByYard[r.yard.id] = r.sightings;
          atYards += r.sightings.length;
        }
        setState({
          countByYard,
          sightingsByYard,
          atYards,
          elsewhere: Math.max(0, res.devices.length - atYards),
          configured: res.configured,
          loading: false,
        });
      } catch {
        // A tracking outage must not take the yards screen down with it — the drop counts still work.
        if (alive) setState((p) => ({ ...p, loading: false }));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
