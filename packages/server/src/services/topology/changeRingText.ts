/**
 * UC-RING-001 — every text of the change folder check, in ASD-STE100 (Simplified Technical English).
 *
 * Technical nouns (rule 1.5), one term per thing: change folder, part, Process element, Business
 * Event, Business Object, Access, Triggering, Flow, read access, write access, path. A "closed path"
 * stays the term of the conversion factors; the change folder "goes back to its start".
 * Names of elements are shown in quotation marks; changeRingText.test.ts gives them to the guard by name.
 * Every word was checked against ASD-STE100 Issue 9 (scripts/ste100-check.py and by hand for part of
 * speech and meaning). "Go back" is the STE word for "return" (GO, BACK); a relationship does not
 * move, so it "connects" a later Process element to the start.
 */
const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const q = (name: string) => `"${name}"`;
const NO_PATH = 'No path of Triggering relationships or Flow relationships connects these two Process elements.';

export const RING_TEXT = {
  noFolder:
    'The model has no change folder. Connect a Business Object element to each of its parts with a Composition relationship.',
  objectWithoutParts: (object: string, steps: number) =>
    `${q(object)} has no parts. ${counted(steps, 'Process element has', 'Process elements have')} an Access relationship to it. Connect ${q(object)} to its parts with Composition relationships. Then connect each Process element to the part that it uses.`,
  tooFewSteps: (folder: string, steps: number) =>
    `${counted(steps, 'Process element has', 'Process elements have')} an Access relationship to the parts of ${q(folder)}. The check is possible only with a minimum of two.`,
  unknownAccess: (step: string, part: string) =>
    `The Access relationship from ${q(step)} to ${q(part)} does not show read access or write access. Give it the name "read" or "write".`,
  noStart: (folder: string) =>
    `No Business Event starts the Process elements of ${q(folder)}. Connect a Business Event element to the first Process element with a Triggering relationship.`,
  severalStarts: (folder: string) =>
    `More than one Process element of ${q(folder)} has a Triggering relationship or Flow relationship from a Business Event. The check cannot find the first Process element. Connect a Business Event element only to the first Process element.`,
  noOrder: (step: string, folder: string) =>
    `${q(step)} has no Triggering relationship or Flow relationship to the other Process elements of ${q(folder)}. Connect it to the Process element before it or after it.`,
  writeWrite: (first: string, second: string, part: string) =>
    `${q(first)} and ${q(second)} have write access to ${q(part)}. ${NO_PATH}`,
  writeRead: (writer: string, reader: string, part: string) =>
    `${q(writer)} has write access to ${q(part)} and ${q(reader)} has read access to it. ${NO_PATH}`,
  ringOpen: (folder: string, start: string) =>
    `No Triggering relationship or Flow relationship connects a Process element after ${q(start)} to ${q(start)}. The change folder ${q(folder)} does not go back to its start.`,
  unreadWrite: (writer: string, part: string) =>
    `${q(writer)} has write access to ${q(part)}. No Process element after ${q(writer)} has read access to ${q(part)}.`,
};
