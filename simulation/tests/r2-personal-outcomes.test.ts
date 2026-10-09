import test from 'node:test';
import assert from 'node:assert/strict';
import {latestPersonalOutcome,unresolvedPersonalAbsence} from '../src/core/personal-outcomes.ts';
import {relationshipFromExperience} from '../src/core/relationship-evidence.ts';
import {personallyAvoids,type CommitmentMemory} from '../src/core/social-commitments.ts';
import {livedMischiefMotive} from '../src/core/mischief.ts';

const event=(partner:number,kind:CommitmentMemory['kind'],minute:number):
  CommitmentMemory=>({partner,kind,minute,meetingId:minute,room:1,purpose:'explore'});
test('R2: shared outcome ignores proposals and is directed to one partner',()=>{
  const history=[
    event(7,'waited_alone',560),
    event(8,'met',570),event(7,'offered',580),event(7,'accepted',590)
  ];
  assert.equal(latestPersonalOutcome(history,7)?.kind,'waited_alone');
  assert.equal(latestPersonalOutcome(history,8)?.kind,'met');
  assert.equal(personallyAvoids(history,7),true);
  assert.equal(relationshipFromExperience('trusted',history,7).trust,'neutral');
  assert.equal(livedMischiefMotive(history,600)?.partner,7);
});
test('R2: only a truly kept later meeting resolves that partner',()=>{
  const history=[event(7,'waited_alone',560),event(8,'met',570),
    event(7,'invited',575),event(7,'met',590),event(8,'waited_alone',600)];
  assert.equal(personallyAvoids(history,7),false);
  assert.equal(personallyAvoids(history,8),true);
  assert.equal(relationshipFromExperience('trusted',history,7).trust,'trusted');
  assert.equal(relationshipFromExperience('trusted',history,8).trust,'neutral');
  assert.equal(unresolvedPersonalAbsence(history,610,180)?.partner,8);
});
test('R2: recent motive and long-term social evidence have different lifetimes',()=>{
  const history=[event(7,'waited_alone',560)];
  assert.equal(unresolvedPersonalAbsence(history,741,180),null);
  assert.equal(livedMischiefMotive(history,741),null);
  assert.equal(personallyAvoids(history,7),true);
  assert.equal(relationshipFromExperience('trusted',history,7).trust,'neutral');
});
test('R2: independent observers and multiple distinct setbacks stay consistent',()=>{
  const history=[event(7,'waited_alone',560),event(8,'waited_alone',580),
    event(7,'met',600),event(8,'offered',610)];
  assert.equal(unresolvedPersonalAbsence(history,620,180)?.partner,8);
  assert.equal(latestPersonalOutcome(history,7)?.kind,'met');
  assert.equal(latestPersonalOutcome(history,8)?.kind,'waited_alone');
});
