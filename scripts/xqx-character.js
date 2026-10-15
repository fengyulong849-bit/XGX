import * as THREE from 'three';

const SKINS=[0xF0C8A0,0xE8B98A,0xD4A574,0x9C7B5A];
const SUITS=[0x2E3A4A,0x1A1A1A,0x4A4A4A,0x3D2E1F];
function disposeGroup(g){
  // 释放组内所有几何体和材质的GPU内存，防止内存泄漏
  g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()});
  while(g.children.length)g.remove(g.children[0]);
}

export function buildCharacter(charGroup,cfg){
  disposeGroup(charGroup);

  // -------------------- 1. 材质（按 cfg 索引取色）--------------------
  // MeshStandardMaterial: PBR材质，roughness越小越光滑，metalness越大越金属
  // MeshBasicMaterial: 不受光照影响，纯色显示（适合腮红、眼白这种自发光效果）
  const skin=new THREE.MeshStandardMaterial({color:SKINS[cfg.skin],roughness:.62,emissive:SKINS[cfg.skin],emissiveIntensity:.04});
  const suit=new THREE.MeshStandardMaterial({color:SUITS[cfg.suit],roughness:.72,metalness:.06});
  const dark=new THREE.MeshStandardMaterial({color:0x2A2530,roughness:.55});
  const tieM=new THREE.MeshStandardMaterial({color:0xE8A33D,roughness:.4,metalness:.12,emissive:0xE8A33D,emissiveIntensity:.03});
  const shirtM=new THREE.MeshStandardMaterial({color:0xFAF8F4,roughness:.55});           // 衬衫白色
  const blushM=new THREE.MeshBasicMaterial({color:0xF5A0A0,transparent:true,opacity:.55});// 默认腮红（备用）
  const frameM=new THREE.MeshStandardMaterial({color:0x1A1A1A,roughness:.4,metalness:.15});// 眼镜框

  // -------------------- 2. 缩放系数（脸型/肚子）--------------------
  // fs = [X宽, Y高, Z深]  → 决定头的比例
  //   0圆脸: 正球体
  //   1方脸: 略宽略高
  //   2长脸: 窄而高
  // bl = 肚子胖度系数 1 / 1.14 / 1.3
  const fs=[[1,1,1],[1.06,1.16,1.04],[.88,1.32,.88]][cfg.face];
  const bl=[1,1.14,1.3][cfg.belly];

  // -------------------- 3. 头部几何体 --------------------
  // Q版大头占角色总高60%，半径1.55
  // 调整数值时：增大 radius → 头更大；改 fs 比例 → 不同脸型
  const head=new THREE.Mesh(new THREE.SphereGeometry(1.05,32,32),skin);
  head.scale.set(fs[0]*1.08,fs[1]*1.05,fs[2]);
  head.position.y=2.25;                           // ★ 头Y位置基准，所有脸部元素以此为锚点
  head.castShadow=true;charGroup.add(head);

  // 耳朵：小球压扁成半椭圆，X位置 = fs[0]*1.2（随脸型宽度变）
  const eg=new THREE.SphereGeometry(.28,16,16);
  const eL=new THREE.Mesh(eg,skin);eL.scale.set(.55,1,.55);eL.position.set(-fs[0]*1.2,2.2,.05);
  const eR=eL.clone();eR.position.x=fs[0]*1.2;charGroup.add(eL,eR);

  // 脖子：短粗圆柱（Q版特征）
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.3,.38,.35,16),skin);
  neck.position.y=1.05;charGroup.add(neck);

  // -------------------- 4. 身体+肚子 --------------------
  // 身体：上窄下宽圆柱，半径随 bl 胖度变化
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.7*bl,.9*bl,1.05,24),suit);
  body.position.y=.6;body.castShadow=true;charGroup.add(body);
  if(cfg.belly>0){
    // 肚子：前凸的球体，Z方向压扁（只向前突）
    const belly=new THREE.Mesh(new THREE.SphereGeometry(.55*bl,20,20),suit);
    belly.position.set(0,.45,.48);belly.scale.set(1,.85,.7);charGroup.add(belly);
  }

  // -------------------- 5. 动态衣服配件（4种西装差异化）--------------------
  // 索引映射 cfg.suit → 0深蓝/1黑/2灰/3棕
  const TIE_COLORS   =[0xE8A33D,0xC44536,0x6B9FD4,0x3D2E1F]; // 领带颜色：琥珀/红/蓝/深棕
  const POCKET_COLORS=[0xE8A33D,0xFFFFFF,0x6FB3A8,0xD97A6C]; // 口袋巾：琥珀/白/青绿/珊瑚
  const LAPEL_W      =[1,1.15,.9,1.08];                      // 翻领宽度系数
  const TIE_ANGLES   =[Math.PI/4,Math.PI/4.2,Math.PI/3.8,Math.PI/4]; // 领带旋转角度
  const tieColor   =TIE_COLORS[cfg.suit];
  const pocketColor=POCKET_COLORS[cfg.suit];
  const tieM2   =new THREE.MeshStandardMaterial({color:tieColor,roughness:.35,metalness:.15});
  const pocketM =new THREE.MeshStandardMaterial({color:pocketColor,roughness:.5});

  // 衬衫领口：左右两片小方块，Z轴旋转模拟外翻
  const scL=new THREE.Mesh(new THREE.BoxGeometry(.32,.18,.08),shirtM);
  scL.position.set(-.14,1.05,.48);scL.rotation.z=.2;charGroup.add(scL);
  const scR=scL.clone();scR.position.x=.14;scR.rotation.z=-.2;charGroup.add(scR);

  // 领带：结(Box) + 身体(Cone四棱锥)，颜色和角度随西装变
  const tieKnot=new THREE.Mesh(new THREE.BoxGeometry(.14,.16,.12),tieM2);
  tieKnot.position.set(0,1.05,.52);charGroup.add(tieKnot);
  const tieBody=new THREE.Mesh(new THREE.ConeGeometry(.14,.6,4),tieM2);
  tieBody.position.set(0,.72,.5);tieBody.rotation.y=TIE_ANGLES[cfg.suit];charGroup.add(tieBody);

  // 西装翻领：长方块，左右对称向中间倾斜
  const lw=LAPEL_W[cfg.suit];
  const lpL=new THREE.Mesh(new THREE.BoxGeometry(.22*lw,.55,.07),suit);
  lpL.position.set(-.28,.84,.68);lpL.rotation.set(.05,0,-.28*lw);charGroup.add(lpL);
  const lpR=new THREE.Mesh(new THREE.BoxGeometry(.22*lw,.55,.07),suit);
  lpR.position.set(.28,.84,.68);lpR.rotation.set(.05,0,.28*lw);charGroup.add(lpR);

  // 口袋巾：小方块 + 口袋下横线
  const pk=new THREE.Mesh(new THREE.BoxGeometry(.34,.14,.05),pocketM);
  pk.position.set(.46,1.12,.98);pk.rotation.set(.12,.08,.08);charGroup.add(pk);
  const pktLine=new THREE.Mesh(new THREE.BoxGeometry(.44,.02,.03),dark);
  pktLine.position.set(.46,.95,.98);charGroup.add(pktLine);

  // 西装扣：两个小球，垂直间隔0.35
  for(let i=0;i<2;i++){
    const btn=new THREE.Mesh(new THREE.SphereGeometry(.055,10,10),new THREE.MeshStandardMaterial({color:0x222222,roughness:.4,metalness:.2}));
    btn.position.set(0,.7-i*.35,.98);charGroup.add(btn);
  }

  // -------------------- 6. 手臂+手 --------------------
  // 手臂：胶囊几何体(CapsuleGeometry=两个半球+圆柱)，左右对称向外张35°
  for(const side of [-1,1]){
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(.19,.17,.42,16),suit);
    leg.position.set(side*.3,-.16,0);charGroup.add(leg);
    const shoe=new THREE.Mesh(new THREE.SphereGeometry(.24,16,12),dark);
    shoe.scale.set(1,.55,1.55);shoe.position.set(side*.3,-.43,.13);charGroup.add(shoe);
  }
  const armG=new THREE.CapsuleGeometry(.16,.45,6,10);
  const armX=.72*bl;                                         // X偏移随肚子变大
  const aL=new THREE.Mesh(armG,suit);aL.position.set(-armX,.68,.05);aL.rotation.z=.35;aL.rotation.x=.08;aL.castShadow=true;
  const aR=aL.clone();aR.position.x=armX;aR.rotation.z=-.35;charGroup.add(aL,aR);

  // 手：纯圆球体（Q版不做手指）
  const hg=new THREE.SphereGeometry(.22,14,14);
  const hL=new THREE.Mesh(hg,skin);hL.position.set(-armX-.1,.32,.02);charGroup.add(hL);
  const hR=hL.clone();hR.position.x=armX+.1;charGroup.add(hL,hR);

  // -------------------- 7. 脸部锚点坐标（★重点！所有元素围绕此定位）--------------------
  // headCenterY = 头中心Y = 2.25 （等于 head.position.y）
  // 调整脸部布局只改下面5个基准值即可！
  const headCenterY = 2.25;                            // ★ 头部Y基准（核心锚点）
  const eyeY   = headCenterY + .45,                     // 眼睛Y：中心偏上0.45（脸部上半区）
        eyeZ   = fs[2] * 1.04;                           // 眼睛Z（深度）：脸凸出程度
  const mouthY = headCenterY - .05,                     // 嘴Y：中心微下0.05（脸部中下方）
        mouthZ = fs[2] * 1.08;                                  // 嘴Z与眼同深度
  const nose=new THREE.Mesh(new THREE.SphereGeometry(.13,16,12),skin);
  nose.scale.set(.8,1,1.3);nose.position.set(0,2.45,fs[2]*1.07);charGroup.add(nose);
  const eyeOff  = 0.45 * fs[0];                         // 眼睛左右偏移（眼距 = 2 * eyeOff，Q版眼距更宽）
  const browY   = eyeY + .28;                           // 眉毛在眼睛上方0.28

  // -------------------- 8. 四套表情（cfg.expr = 0/1/2/3）--------------------
  // 每套表情包含：眼睛组 + 眉毛 + 嘴 + 额外细节（高光/咬牙线/怒气纹等）
  if(cfg.expr===0){
    // ===== 表情0：微笑（默认） —— 弯月眼 + 大弧嘴 + 小舌头 =====
    const smileEye=(side)=>{
      const g=new THREE.Group();
      const iris=new THREE.Mesh(new THREE.SphereGeometry(.12,14,14),dark);
      iris.scale.set(1,.6,1);                             // Y轴压扁 = 弯月形
      g.add(iris);
      const lid=new THREE.Mesh(new THREE.SphereGeometry(.14,12,12),new THREE.MeshBasicMaterial({color:0xffffff}));
      lid.scale.set(1,.4,.5);lid.position.y=.08;lid.scale.y*=-1;
      g.add(lid);
      g.position.set(side*eyeOff,eyeY,eyeZ);              // side=-1左眼 side=1右眼
      g.scale.x=side>0?1:-1;                              // 右眼X镜像
      return g;
    };
    charGroup.add(smileEye(-1));charGroup.add(smileEye(1));
    // 眼睛高光：小白球偏右上
    const hl=new THREE.Mesh(new THREE.SphereGeometry(.04,8,8),new THREE.MeshBasicMaterial({color:0xffffff}));
    hl.position.set(-eyeOff*.9,eyeY+.06,eyeZ+.06);charGroup.add(hl);
    const hl2=hl.clone();hl2.position.x=eyeOff*.9;charGroup.add(hl2);
    // 眉毛：温和上扬（Z轴旋转±.1弧度 ≈ 5.7°）
    const browG=new THREE.BoxGeometry(.3,.05,.04);
    const bL=new THREE.Mesh(browG,dark),bR=new THREE.Mesh(browG,dark);
    bL.position.set(-eyeOff,browY,eyeZ);bR.position.set(eyeOff,browY,eyeZ);
    bL.rotation.z=.1;bR.rotation.z=-.1;charGroup.add(bL,bR);
    // 嘴：半圆环（TorusGeometry 取 Math.PI 一半 = 微笑弧），rotation.z=PI翻到向上弯
    const smile=new THREE.Mesh(new THREE.TorusGeometry(.18,.045,8,18,Math.PI),dark);
    smile.position.set(0,mouthY,mouthZ);smile.rotation.z=Math.PI;charGroup.add(smile);
    // 小舌头：微笑弧下露出的小球
    const tongue=new THREE.Mesh(new THREE.SphereGeometry(.06,10,10),new THREE.MeshStandardMaterial({color:0xD97A6C,roughness:.5}));
    tongue.position.set(0,mouthY-.06,mouthZ+.08);tongue.scale.set(1,.5,.6);charGroup.add(tongue);

  } else if(cfg.expr===1){
    // ===== 表情1：皱眉 —— 眯眼下盖 + 咬牙线 =====
    const angryEye=(side)=>{
      const g=new THREE.Group();
      const iris=new THREE.Mesh(new THREE.SphereGeometry(.11,12,12),dark);
      iris.scale.set(1,.7,1);
      g.add(iris);
      const lid=new THREE.Mesh(new THREE.BoxGeometry(.22,.035,.04),dark);
      lid.position.y=.1;                                           // 上眼皮往下压
      g.add(lid);
      g.position.set(side*eyeOff,eyeY,eyeZ);
      g.scale.x=side>0?1:-1;
      return g;
    };
    charGroup.add(angryEye(-1));charGroup.add(angryEye(1));
    // 眉毛：大幅下压（旋转-0.35弧度≈20°，且Y降低了0.14，皱眉感）
    const browG=new THREE.BoxGeometry(.32,.06,.04);
    const bL=new THREE.Mesh(browG,dark),bR=new THREE.Mesh(browG,dark);
    bL.position.set(-eyeOff,eyeY+.14,eyeZ);bR.position.set(eyeOff,eyeY+.14,eyeZ);
    bL.rotation.z=-.35;bR.rotation.z=.35;charGroup.add(bL,bR);
    // 嘴：倒弧形（取Math.PI*0.8，不翻转=向下弯=难过）
    const frown=new THREE.Mesh(new THREE.TorusGeometry(.16,.05,8,16,Math.PI*.8),dark);
    frown.position.set(0,mouthY,mouthZ);charGroup.add(frown);
    // 咬牙横线：扁方块，嘴下方0.06
    const grind=new THREE.Mesh(new THREE.BoxGeometry(.28,.025,.04),dark);
    grind.position.set(0,mouthY-.06,mouthZ);charGroup.add(grind);

  } else if(cfg.expr===2){
    // ===== 表情2：惊讶 —— 大圆眼（白眼球+黑瞳孔）+ O型嘴 =====
    const bigEye=(side)=>{
      const g=new THREE.Group();
      const sclera=new THREE.Mesh(new THREE.SphereGeometry(.14,14,14),new THREE.MeshBasicMaterial({color:0xffffff}));
      g.add(sclera);                                                      // 眼白
      const iris=new THREE.Mesh(new THREE.SphereGeometry(.09,12,12),dark);
      iris.position.z=.02;g.add(iris);                                   // 瞳孔（在眼白前凸一点）
      const hl=new THREE.Mesh(new THREE.SphereGeometry(.025,6,6),new THREE.MeshBasicMaterial({color:0xffffff}));
      hl.position.set(.03,.03,.04);g.add(hl);                            // 瞳孔上的小高光
      g.position.set(side*eyeOff,eyeY,eyeZ);
      g.scale.x=side>0?1:-1;
      return g;
    };
    charGroup.add(bigEye(-1));charGroup.add(bigEye(1));
    // 眉毛：大幅上抬（Y比browY还高0.04）
    const browG=new THREE.BoxGeometry(.3,.055,.04);
    const bL=new THREE.Mesh(browG,dark),bR=new THREE.Mesh(browG,dark);
    bL.position.set(-eyeOff,eyeY+.32,eyeZ);bR.position.set(eyeOff,eyeY+.32,eyeZ);
    bL.rotation.z=.05;bR.rotation.z=-.05;charGroup.add(bL,bR);
    // 嘴：球+内球=O型（外球=嘴唇轮廓，内球=深色口腔）
    const oMouth=new THREE.Mesh(new THREE.SphereGeometry(.12,12,12),dark);
    oMouth.position.set(0,mouthY,mouthZ);charGroup.add(oMouth);
    const oInner=new THREE.Mesh(new THREE.SphereGeometry(.07,10,10),new THREE.MeshStandardMaterial({color:0x3D1A1A,roughness:.5}));
    oInner.position.set(0,mouthY,mouthZ+.02);charGroup.add(oInner);

  } else {
    // ===== 表情3：生气 —— 上下眼睑 + 倒三角嘴 + 怒气纹 =====
    const rageEye=(side)=>{
      const g=new THREE.Group();
      const iris=new THREE.Mesh(new THREE.SphereGeometry(.1,12,12),dark);
      iris.scale.set(1,.65,1);
      g.add(iris);
      const upperLid=new THREE.Mesh(new THREE.BoxGeometry(.24,.04,.04),dark);
      upperLid.position.y=.09;g.add(upperLid);                             // 上眼皮
      const lowerLid=new THREE.Mesh(new THREE.BoxGeometry(.2,.035,.04),dark);
      lowerLid.position.y=-.06;lowerLid.rotation.z=side>0?.2:-.2;g.add(lowerLid); // 下眼皮（左右镜像倾斜）
      g.position.set(side*eyeOff,eyeY,eyeZ);
      g.scale.x=side>0?1:-1;
      return g;
    };
    charGroup.add(rageEye(-1));charGroup.add(rageEye(1));
    // 眉毛：倒八字（内侧高、外侧低）
    const browG=new THREE.BoxGeometry(.32,.06,.04);
    const bL=new THREE.Mesh(browG,dark),bR=new THREE.Mesh(browG,dark);
    bL.position.set(-eyeOff,eyeY+.12,eyeZ);bR.position.set(eyeOff,eyeY+.12,eyeZ);
    bL.rotation.z=-.4;bR.rotation.z=.4;charGroup.add(bL,bR);               // 旋转±0.4弧度≈23°
    // 嘴：圆锥翻转=倒三角形（开口向上，像怒吼）
    const rageMouth=new THREE.Mesh(new THREE.ConeGeometry(.16,.12,4),dark);
    rageMouth.position.set(0,mouthY,mouthZ);rageMouth.rotation.set(Math.PI,0,Math.PI);charGroup.add(rageMouth);
    // 怒气纹：双眼内侧鼻根处的两条短斜线
    const wrL=new THREE.Mesh(new THREE.BoxGeometry(.14,.025,.03),dark);
    wrL.position.set(-eyeOff*.55,eyeY+.08,eyeZ);wrL.rotation.z=-.4;
    const wrR=wrL.clone();wrR.position.x=eyeOff*.55;wrR.rotation.z=.4;
    charGroup.add(wrL,wrR);
  }

  // -------------------- 9. 腮红 --------------------
  // 球压扁成圆盘（scale.y=0.5 scale.z=0.3），位置=嘴外侧偏上
  if(cfg.expr!==3){
    const blushM2=new THREE.MeshBasicMaterial({
      color:cfg.expr===2?0xD97A6C:0xF5A0A0,               // 惊讶时腮红更红=珊瑚色
      transparent:true,
      opacity:cfg.expr===2?.45:.55
    });
    const blG=new THREE.SphereGeometry(.22,14,14);
    const bl1=new THREE.Mesh(blG,blushM2);bl1.position.set(-eyeOff*1.4,mouthY+.18,eyeZ*.82);bl1.scale.set(1,.5,.3);
    const bl2=bl1.clone();bl2.position.x=eyeOff*1.4;charGroup.add(bl1,bl2);
  }

  // -------------------- 10. 头发（4种）--------------------
  // 基本思路：SphereGeometry 截取上半部分（phiLength=0.4~0.56π）= 半个头盖
  // 调整：增加 phiLength → 头发覆盖越多；调 radius → 头发更厚
  if(cfg.hair===0){
    // 发型0：背头（全头顶发 + 刘海 + 呆毛）
    const h=new THREE.Mesh(new THREE.SphereGeometry(1.12,28,28,0,Math.PI*2,0,Math.PI*0.38),dark);
    h.scale.set(fs[0]*1.1,fs[1]*1.12,fs[2]*1.1);h.position.y=2.38;charGroup.add(h);
    const bang=new THREE.Mesh(new THREE.SphereGeometry(1.08,20,20,Math.PI*.12,Math.PI*.88,0,Math.PI*.28),dark);
    bang.scale.set(fs[0]*1.08,fs[1]*1.08,fs[2]*1.08);bang.position.set(0,2.58,fs[2]*.38);charGroup.add(bang);
    const ahoge=new THREE.Mesh(new THREE.SphereGeometry(.12,8,8),dark);
    ahoge.position.set(.15,3.05,-.1);ahoge.scale.set(.6,1.4,.6);ahoge.rotation.z=.3;charGroup.add(ahoge);
  } else if(cfg.hair===1){
    // 发型1：中分（头顶发 + 中线隔板）
    const h=new THREE.Mesh(new THREE.SphereGeometry(1.12,28,28,0,Math.PI*2,0,Math.PI*0.36),dark);
    h.scale.set(fs[0]*1.1,fs[1]*1.1,fs[2]*1.1);h.position.y=2.35;charGroup.add(h);
    const part=new THREE.Mesh(new THREE.BoxGeometry(.04,1.2,1.1),new THREE.MeshStandardMaterial({color:0x0A0A0A}));
    part.position.y=2.68;part.position.z=fs[2]*.5;charGroup.add(part);
  } else if(cfg.hair===2){
    // 发型2：寸头（覆盖范围小 phiLength=0.42）
    const h=new THREE.Mesh(new THREE.SphereGeometry(1.07,24,24,0,Math.PI*2,0,Math.PI*0.34),dark);
    h.scale.set(fs[0]*1.1,fs[1]*1.08,fs[2]*1.1);h.position.y=2.38;charGroup.add(h);
  } else {
    // 发型3：地中海（只有两侧发环 + 后脑勺发块）
    const sideG=new THREE.TorusGeometry(1.08,.12,10,28,Math.PI*1.15);
    const sideRing=new THREE.Mesh(sideG,dark);
    sideRing.position.y=2.65;sideRing.rotation.x=Math.PI/2;
    sideRing.scale.set(fs[0]*1.1,1,fs[2]*1.08);
    sideRing.rotation.z=Math.PI;charGroup.add(sideRing);
    const backH=new THREE.Mesh(new THREE.SphereGeometry(1.08,18,18,Math.PI*0.35,Math.PI*0.75,0,Math.PI*0.44),dark);
    backH.scale.set(fs[0]*1.08,fs[1]*1.12,fs[2]*1.1);backH.position.y=2.52;backH.position.z=-.25;charGroup.add(backH);
  }

  // -------------------- 11. 眼镜（2种 + 无）--------------------
  if(cfg.glasses>0){
    if(cfg.glasses===1){
      // 眼镜1：圆框 —— 圆环(Torus) + 圆镜片(Circle) + 反光块
      const lg=new THREE.TorusGeometry(.32,.04,10,28);
      const l1=new THREE.Mesh(lg,frameM);l1.position.set(-eyeOff*1.1,eyeY,eyeZ+.04);
      const l2=l1.clone();l2.position.x=eyeOff*1.1;charGroup.add(l1,l2);
      const lensM=new THREE.MeshStandardMaterial({color:0x99BBDD,transparent:true,opacity:.15,metalness:.15,roughness:.1});
      const lens1=new THREE.Mesh(new THREE.CircleGeometry(.28,24),lensM);lens1.position.set(-eyeOff*1.1,eyeY,eyeZ+.04);charGroup.add(lens1);
      const lens2=lens1.clone();lens2.position.x=eyeOff*1.1;charGroup.add(lens2);
      const refM=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.6});
      const ref1=new THREE.Mesh(new THREE.SphereGeometry(.08,8,8),refM);ref1.scale.set(1,.5,.3);ref1.position.set(-eyeOff*1.26,eyeY+.14,eyeZ+.06);charGroup.add(ref1);
      const ref2=ref1.clone();ref2.position.x=eyeOff*.95;charGroup.add(ref2);
    } else {
      // 眼镜2：方框 —— 4条边拼成方框
      const mk=(x)=>{const g=new THREE.Group();const s=.32,t=.045;
        const a=new THREE.Mesh(new THREE.BoxGeometry(s*2,t,t),frameM);a.position.y=s;     // 上边
        const b=a.clone();b.position.y=-s;                                               // 下边
        const c=new THREE.Mesh(new THREE.BoxGeometry(t,s*2,t),frameM);c.position.x=-s;   // 左边
        const d=c.clone();d.position.x=s;                                                // 右边
        g.add(a,b,c,d);g.position.set(x,eyeY,eyeZ+.04);return g};
      charGroup.add(mk(-eyeOff*1.1),mk(eyeOff*1.1));
      const lensM=new THREE.MeshStandardMaterial({color:0xAACCFF,transparent:true,opacity:.12,metalness:.15,roughness:.1});
      const mkLens=(x)=>{const s=.28;const g=new THREE.Mesh(new THREE.BoxGeometry(s*2,s*2,.01),lensM);g.position.set(x,eyeY,eyeZ+.04);return g;};
      charGroup.add(mkLens(-eyeOff*1.1),mkLens(eyeOff*1.1));
    }
    // 鼻梁
    const bridge=new THREE.Mesh(new THREE.BoxGeometry(eyeOff*.88,.055,.055),frameM);
    bridge.position.set(0,eyeY,eyeZ+.04);charGroup.add(bridge);
  }

  // -------------------- 12. 胡子（2种 + 无）--------------------
  if(cfg.beard===1){
    // 胡子1：八字胡 —— 左右两个半圆环（Torus取π*0.5=90°弧）
    const m1=new THREE.Mesh(new THREE.TorusGeometry(.12,.04,8,12,Math.PI*.5),dark);
    m1.position.set(-.08,mouthY-.04,eyeZ);m1.rotation.set(0,0,-.8);
    const m2=m1.clone();m2.position.x=.08;m2.rotation.set(0,0,.8);
    charGroup.add(m1,m2);
  } else if(cfg.beard===2){
    // 胡子2：络腮胡 —— 大球截取下半部分（phiStart=0.55π）
    const bg=new THREE.SphereGeometry(.62,20,18,0,Math.PI*2,Math.PI*0.55,Math.PI*0.4);
    const beard=new THREE.Mesh(bg,dark);beard.scale.set(fs[0],fs[1]*.95,fs[2]);beard.position.y=mouthY-.25;charGroup.add(beard);
  }

  // -------------------- 13. 整体缩放 --------------------
  // 改这个值：→ 大 0.95 更饱满 / → 小 0.7 更纤细
  charGroup.scale.setScalar(0.88);

}

