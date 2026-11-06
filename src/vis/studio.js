/* ===== vis/studio.js: the shop interior. PR 0 is a placeholder (warm lamp, floor, back wall and the chair as simple
   shapes) so the three.js pipeline is proven on every tier; PR 6 replaces it with the real studio stages. ===== */
function studioPlaceholder(){
  const s=V.scene;s.background=new THREE.Color(0x0f0c09);
  s.add(new THREE.HemisphereLight(0xffe2bf,0x20160e,.55));
  const lamp=new THREE.PointLight(0xffc98a,1.1,14);lamp.position.set(.8,2.6,1.4);s.add(lamp);
  const mat=c=>new THREE.MeshLambertMaterial({color:c});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10),mat(0x3a2b20));floor.rotation.x=-Math.PI/2;s.add(floor);
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(10,4),mat(0x6b4f3a));wall.position.set(0,2,-2.2);s.add(wall);
  const flash=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1),mat(0xf3ead8));flash.position.set(-1.4,1.7,-2.18);s.add(flash);
  const leather=mat(0x1d1a17),steel=mat(0x8a8780);
  const chair=new THREE.Group();
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.7,.14,1.0),leather);seat.position.y=.62;chair.add(seat);
  const back=new THREE.Mesh(new THREE.BoxGeometry(.7,.12,.8),leather);back.position.set(0,.95,-.62);back.rotation.x=-1.05;chair.add(back);
  const post=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.5,10),steel);post.position.y=.3;chair.add(post);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.35,.4,.06,16),steel);base.position.y=.03;chair.add(base);
  chair.position.set(.5,0,-.6);chair.rotation.y=-.5;s.add(chair);
  const stool=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.08,16),leather);stool.position.set(-.5,.5,.1);s.add(stool);
  const stoolPost=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.46,8),steel);stoolPost.position.set(-.5,.25,.1);s.add(stoolPost);
  V.camera.position.set(0,1.7,3.4);V.camera.lookAt(0,.8,-.6);V.dirty=true;}
