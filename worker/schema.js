import { z } from 'zod';
import { people, rotation, dow } from '../src/model.js';

const day = z.iso.date();
const friday = day.refine(value => dow(value) === 5);
const id = z.string().min(1).max(150);
const person = z.enum(people);
const assignment = z.enum(rotation);
const dateOrder = ({ start, end }) => start <= end;
const slot = z.object({
  id, start: day, end: day, person,
  type: z.enum(['Extra', 'Sostituzione']),
  note: z.string().max(200).default('')
}).refine(dateOrder);
const rule = z.object({
  id, from: friday, to: z.union([friday, z.literal('')]),
  sequence: z.array(assignment).min(1)
}).refine(({ from, to }) => !to || (from <= to));
const event = z.object({
  id, from: day, to: day, type: z.enum(['Ferie', 'Festività', 'Ponte', 'Chiusura']),
  label: z.string().min(1).max(120)
}).refine(({ from, to }) => from <= to);
const unique = (list, field) => new Set(list.map(x => x[field])).size === list.length;
export const updateSchema = z.object({
  revision: z.number().int().nonnegative(),
  action: z.string().min(1).max(100),
  details: z.string().max(1200),
  state: z.object({
    rules: z.array(rule).refine(items => unique(items, 'id') && unique(items, 'from') && items.some(x => x.id === 'base' && !x.to)),
    swaps: z.array(z.object({ date: friday, person: assignment })).refine(items => unique(items, 'date')),
    slots: z.array(slot).refine(items => {
      const sorted = items.toSorted((a, b) => a.start.localeCompare(b.start));
      return unique(items, 'id') && sorted.every((x, i) => !i || sorted[i - 1].end < x.start);
    }),
    events: z.array(event).refine(items => unique(items, 'id'))
  })
});
