/** RB-3.3b: one monotonic world time axis, measured in integer seconds.
 * Calendar conversion is a projection; the clock owns no world side effects.
 */
import {MINUTES_PER_TICK,SCHOOL_START_MINUTE} from './school-time.ts';

export class WorldClock {
  private seconds: number;
  constructor(startSeconds=0){
    if(!Number.isSafeInteger(startSeconds)||startSeconds<0)throw Error('Invalid world time');
    this.seconds=startSeconds;
  }
  nowSeconds(){return this.seconds;}
  advanceTo(seconds:number){
    if(!Number.isSafeInteger(seconds)||seconds<this.seconds)throw Error('Invalid world time');
    this.seconds=seconds;
    return this.seconds;
  }
  advanceBy(seconds:number){
    if(!Number.isSafeInteger(seconds)||seconds<0||
      !Number.isSafeInteger(this.seconds+seconds))throw Error('Invalid duration');
    return this.advanceTo(this.seconds+seconds);
  }
  absoluteMinute(){return SCHOOL_START_MINUTE+Math.floor(this.seconds/60);}
  schoolTick(){return Math.floor(this.seconds/(MINUTES_PER_TICK*60));}
  snapshot(){return this.seconds;}
}
