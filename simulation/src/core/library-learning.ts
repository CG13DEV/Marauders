/**
 * [GAME] A character can choose a book from locally observed cover text.
 * The planner knows neither a remote shelf nor a hidden book -> spell mapping.
 * The authoritative world validates that the book really teaches the spell.
 */
import {spellDefinitions,type SpellId} from './spellcraft.ts';

export type VisibleBook = {id:number;label:string};

export function chooseLocalStudyBook(
  gap:SpellId, visible:readonly VisibleBook[]
):number|null {
  const title=spellDefinitions[gap].incantation.toLocaleLowerCase();
  return [...visible].sort((a,b)=>a.id-b.id)
    .find(book=>book.label.toLocaleLowerCase().includes(title))?.id??null;
}
