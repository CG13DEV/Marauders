/** Pure, browser-independent geometry rules for circular cutaway. */
export function wallFrame(index,segments,radius){
  const angle=(index+.5)*Math.PI*2/segments;
  return {
    angle,
    x:Math.sin(angle)*radius,
    z:Math.cos(angle)*radius,
    normalX:Math.sin(angle),normalZ:Math.cos(angle),
    // THREE local Z rotated about Y -> tangent to the circle
    rotation:angle+Math.PI/2
  };
}
export function onCameraSide(frame,yaw){
  return frame.normalX*Math.sin(yaw)+
    frame.normalZ*Math.cos(yaw)>.08;
}
