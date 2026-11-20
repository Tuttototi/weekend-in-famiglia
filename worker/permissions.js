function slotMatches(a, b) {
  return a && b && ['id', 'start', 'end', 'person', 'type', 'note'].every(key => (a[key] ?? '') === (b[key] ?? ''));
}

export function canUpdateCalendar(current, next, user) {
  if (!user.editor && ['rules', 'swaps', 'events'].some(key => JSON.stringify(current[key]) !== JSON.stringify(next[key]))) return false;

  const before = new Map(current.slots.map(slot => [slot.id, slot]));
  const after = new Map(next.slots.map(slot => [slot.id, slot]));
  const canChange = slot => !slot || (slot.type === 'Extra' ? slot.person === user.name : user.editor);
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(key);
    const updated = after.get(key);
    if (!slotMatches(old, updated) && (!canChange(old) || !canChange(updated))) return false;
  }
  return true;
}
