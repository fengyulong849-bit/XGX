# -*- coding: utf-8 -*-
import sys

filepath = r'c:\Users\admin\Desktop\XQX\P1_首页.html'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Verify key line numbers (1-indexed -> 0-indexed)
func_start_idx = 741  # line 742
func_end_idx = 988    # line 989 (closing brace)

assert 'function buildChar(){' in lines[func_start_idx], f"Line 742 mismatch: {lines[func_start_idx]}"
assert lines[func_end_idx].strip() == '}', f"Line 989 mismatch: {lines[func_end_idx]}"

# New Q-version buildChar function
new_func = '''function buildChar(){
  disposeGroup(charGroup);
  const skin=new THREE.MeshStandardMaterial({color:SKINS[petCfg.skin],roughness:.65});
  const suit=new THREE.MeshStandardMaterial({color:SUITS[petCfg.suit],roughness:.78});
  const dark=new THREE.MeshStandardMaterial({color:0x15131A,roughness:.5});
  const tieM=new THREE.MeshStandardMaterial({color:0xE8A33D,roughness:.4,metalness:.12});
  const shirtM=new THREE.MeshStandardMaterial({color:0xFAF8F4,roughness:.55});
  const blushM=new THREE.MeshBasicMaterial({color:0xF5A0A0,transparent:true,opacity:.55});
  const frameM=new THREE.MeshStandardMaterial({color:0x1A1A1A,roughness:.4,metalness:.15});

  const fs=[[1,1,1],[1.06,1.16,1.04],[.88,1.32,.88]][petCfg.face];
  const bl=[1,1.14,1.3][petCfg.belly];

  // ===== Q版头（超大，占60%高度）=====
  const head=new THREE.Mesh(new THREE.SphereGeometry(1.5,32,32),skin);
  head.scale.set(fs[0]*1.05,fs[1]*1.02,fs[2]);
  head.position.y=2.2;head.castShadow=true;charGroup.add(head);

  // ===== 耳朵（小而圆）=====
  const eg=new THREE.SphereGeometry(.28,16,16);
  const eL=new THREE.Mesh(eg,skin);eL.scale.set(.55,1,.55);eL.position.set(-fs[0]*1.2,2.2,.05);
  const eR=eL.clone();eR.position.x=fs[0]*1.2;charGroup.add(eL,eR);

  // ===== 脖子（短而粗）=====
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.3,.38,.35,16),skin);
  neck.position.y=1.05;charGroup.add(neck);

  // ===== Q版身体（矮胖圆）=====
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.75*bl,.95*bl,1.2,24),suit);
  body.position.y=.65;body.castShadow=true;charGroup.add(body);
  if(petCfg.belly>0){
    const belly=new THREE.Mesh(new THREE.SphereGeometry(.6*bl,20,20),suit);
    belly.position.set(0,.5,.5);belly.scale.set(1,.85,.7);charGroup.add(belly);
  }

  // ===== 衬衫领口 =====
  const scL=new THREE.Mesh(new THREE.BoxGeometry(.32,.18,.08),shirtM);
  scL.position.set(-.14,1.05,.48);scL.rotation.z=.2;charGroup.add(scL);
  const scR=scL.clone();scR.position.x=.14;scR.rotation.z=-.2;charGroup.add(scR);

  // ===== 领带（短而粗的Q版）=====
  const tieKnot=new THREE.Mesh(new THREE.BoxGeometry(.14,.16,.12),tieM);
  tieKnot.position.set(0,1.05,.52);charGroup.add(tieKnot);
  const tieBody=new THREE.Mesh(new THREE.ConeGeometry(.12,.55,4),tieM);
  tieBody.position.set(0,.72,.5);tieBody.rotation.y=Math.PI/4;charGroup.add(tieBody);

  // ===== 手臂（短小胶囊）=====
  const armG=new THREE.CapsuleGeometry(.18,.5,6,10);
  const armX=.78*bl;
  const aL=new THREE.Mesh(armG,suit);aL.position.set(-armX,.72,.05);aL.rotation.z=.35;aL.rotation.x=.1;aL.castShadow=true;
  const aR=aL.clone();aR.position.x=armX;aR.rotation.z=-.35;charGroup.add(aL,aR);

  // ===== 手（大圆手）=====
  const hg=new THREE.SphereGeometry(.24,14,14);
  const hL=new THREE.Mesh(hg,skin);hL.position.set(-armX-.12,.3,.02);charGroup.add(hL);
  const hR=hL.clone();hR.position.x=armX+.12;charGroup.add(hL,hR);

  // ===== 眼睛（Q版大眼）=====
  const eyeY=2.38,eyeZ=fs[2]*.88;
  const eyeG=new THREE.SphereGeometry(.13,14,14);
  const eyL=new THREE.Mesh(eyeG,dark);eyL.position.set(-.38*fs[0],eyeY,eyeZ);
  const eyR=eyL.clone();eyR.position.x=.38*fs[0];charGroup.add(eyL,eyR);
  const hlG=new THREE.SphereGeometry(.045,8,8);
  const hl=new THREE.Mesh(hlG,new THREE.MeshBasicMaterial({color:0xffffff}));
  hl.position.set(-.34*fs[0],eyeY+.05,eyeZ+.08);
  const hl2=hl.clone();hl2.position.x=.42*fs[0];charGroup.add(hl,hl2);
  const wbG=new THREE.SphereGeometry(.1,10,10);
  const wbL=new THREE.Mesh(wbG,new THREE.MeshBasicMaterial({color:0xffffff}));wbL.scale.set(1,.6,.5);
  wbL.position.set(-.38*fs[0],eyeY-.05,eyeZ);
  const wbR=wbL.clone();wbR.position.x=.38*fs[0];charGroup.add(wbL,wbR);

  // ===== 眉毛（按表情）=====
  const browG=new THREE.BoxGeometry(.28,.05,.04);
  const browY=eyeY+.32;
  const bL=new THREE.Mesh(browG,dark),bR=new THREE.Mesh(browG,dark);
  bL.position.set(-.38*fs[0],browY,eyeZ);bR.position.set(.38*fs[0],browY,eyeZ);
  if(petCfg.expr===0){bL.rotation.z=.08;bR.rotation.z=-.08;}
  else if(petCfg.expr===1){bL.rotation.z=-.2;bL.position.y=browY-.04;bR.rotation.z=.2;bR.position.y=browY-.04;}
  else if(petCfg.expr===2){bL.position.y=browY+.1;bR.position.y=browY+.1;bL.rotation.z=.04;bR.rotation.z=-.04;}
  else{bL.rotation.z=-.32;bR.rotation.z=.32;bL.position.y=browY+.02;bR.position.y=browY+.02;}
  charGroup.add(bL,bR);

  // ===== 嘴（Q版小嘴）=====
  const mY=1.98;
  if(petCfg.expr===0){const m=new THREE.Mesh(new THREE.TorusGeometry(.12,.035,8,14,Math.PI),dark);m.position.set(0,mY,eyeZ);m.rotation.z=Math.PI;charGroup.add(m);}
  else if(petCfg.expr===1){const m=new THREE.Mesh(new THREE.BoxGeometry(.24,.05,.04),dark);m.position.set(0,mY,eyeZ);charGroup.add(m);}
  else if(petCfg.expr===2){const m=new THREE.Mesh(new THREE.SphereGeometry(.08,10,10),dark);m.position.set(0,mY-.02,eyeZ);charGroup.add(m);}
  else{const m=new THREE.Mesh(new THREE.TorusGeometry(.1,.035,8,14,Math.PI*1.1),dark);m.position.set(0,mY,eyeZ);m.rotation.z=Math.PI*1.1;charGroup.add(m);}

  // ===== 腮红（Q版必备：大圆腮红）=====
  const blG=new THREE.SphereGeometry(.18,12,12);
  const bl1=new THREE.Mesh(blG,blushM);bl1.position.set(-.52*fs[0],2.1,eyeZ*.75);bl1.scale.set(1,.55,.35);
  const bl2=bl1.clone();bl2.position.x=.52*fs[0];charGroup.add(bl1,bl2);

  // ===== 头发（Q版：全头顶发 + 刘海遮眉上）=====
  if(petCfg.hair===0){
    const h=new THREE.Mesh(new THREE.SphereGeometry(1.55,28,28,0,Math.PI*2,0,Math.PI*0.55),dark);
    h.scale.set(fs[0]*1.08,fs[1]*1.1,fs[2]*1.08);h.position.y=2.35;charGroup.add(h);
    const bang=new THREE.Mesh(new THREE.SphereGeometry(1.4,20,20,Math.PI*.15,Math.PI*.85,0,Math.PI*.35),dark);
    bang.scale.set(fs[0]*1.05,fs[1]*1.05,fs[2]*1.05);bang.position.set(0,2.55,fs[2]*.35);charGroup.add(bang);
  } else if(petCfg.hair===1){
    const h=new THREE.Mesh(new THREE.SphereGeometry(1.56,28,28,0,Math.PI*2,0,Math.PI*0.52),dark);
    h.scale.set(fs[0]*1.08,fs[1]*1.08,fs[2]*1.08);h.position.y=2.32;charGroup.add(h);
    const part=new THREE.Mesh(new THREE.BoxGeometry(.04,1.2,1.1),new THREE.MeshStandardMaterial({color:0x0A0A0A}));
    part.position.y=2.65;part.position.z=fs[2]*.5;charGroup.add(part);
  } else if(petCfg.hair===2){
    const h=new THREE.Mesh(new THREE.SphereGeometry(1.52,24,24,0,Math.PI*2,0,Math.PI*0.4),dark);
    h.scale.set(fs[0]*1.08,fs[1]*1.06,fs[2]*1.08);h.position.y=2.35;charGroup.add(h);
  } else {
    const sideG=new THREE.TorusGeometry(1.48,.14,10,28,Math.PI*1.15);
    const sideRing=new THREE.Mesh(sideG,dark);
    sideRing.position.y=2.62;sideRing.rotation.x=Math.PI/2;
    sideRing.scale.set(fs[0]*1.08,1,fs[2]*1.06);
    sideRing.rotation.z=Math.PI;charGroup.add(sideRing);
    const backH=new THREE.Mesh(new THREE.SphereGeometry(1.35,18,18,Math.PI*0.35,Math.PI*0.75,0,Math.PI*0.42),dark);
    backH.scale.set(fs[0]*1.06,fs[1]*1.1,fs[2]*1.08);backH.position.y=2.5;backH.position.z=-.25;charGroup.add(backH);
  }

  // ===== 眼镜（大Q圆框 + 镜片反光）=====
  if(petCfg.glasses>0){
    if(petCfg.glasses===1){
      const lg=new THREE.TorusGeometry(.38,.05,10,24);
      const l1=new THREE.Mesh(lg,frameM);l1.position.set(-.38*fs[0],eyeY,eyeZ+.03);
      const l2=l1.clone();l2.position.x=.38*fs[0];charGroup.add(l1,l2);
      const lensM=new THREE.MeshStandardMaterial({color:0x99BBDD,transparent:true,opacity:.18,metalness:.15,roughness:.1});
      const lens1=new THREE.Mesh(new THREE.CircleGeometry(.33,24),lensM);lens1.position.set(-.38*fs[0],eyeY,eyeZ+.03);charGroup.add(lens1);
      const lens2=lens1.clone();lens2.position.x=.38*fs[0];charGroup.add(lens2);
      const refM=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.5});
      const ref1=new THREE.Mesh(new THREE.SphereGeometry(.06,8,8),refM);ref1.scale.set(1,.5,.3);ref1.position.set(-.44*fs[0],eyeY+.12,eyeZ+.05);charGroup.add(ref1);
      const ref2=ref1.clone();ref2.position.x=.32*fs[0];charGroup.add(ref2);
    } else {
      const mk=(x)=>{const g=new THREE.Group();const s=.4,t=.055;
        const a=new THREE.Mesh(new THREE.BoxGeometry(s*2,t,t),frameM);a.position.y=s;
        const b=a.clone();b.position.y=-s;
        const c=new THREE.Mesh(new THREE.BoxGeometry(t,s*2,t),frameM);c.position.x=-s;
        const d=c.clone();d.position.x=s;
        g.add(a,b,c,d);g.position.set(x,eyeY,eyeZ+.03);return g};
      charGroup.add(mk(-.38*fs[0]),mk(.38*fs[0]));
      const lensM=new THREE.MeshStandardMaterial({color:0xAACCFF,transparent:true,opacity:.15,metalness:.15,roughness:.1});
      const mkLens=(x)=>{const s=.33;const g=new THREE.Mesh(new THREE.BoxGeometry(s*2,s*2,.01),lensM);g.position.set(x,eyeY,eyeZ+.03);return g;};
      charGroup.add(mkLens(-.38*fs[0]),mkLens(.38*fs[0]));
    }
    const bridge=new THREE.Mesh(new THREE.BoxGeometry(.3*fs[0],.045,.045),frameM);
    bridge.position.set(0,eyeY,eyeZ+.03);charGroup.add(bridge);
  }

  // ===== 胡子（Q版可选）=====
  if(petCfg.beard===1){
    const m1=new THREE.Mesh(new THREE.TorusGeometry(.12,.04,8,12,Math.PI*.5),dark);
    m1.position.set(-.08,mY-.04,eyeZ);m1.rotation.set(0,0,-.8);
    const m2=m1.clone();m2.position.x=.08;m2.rotation.set(0,0,.8);
    charGroup.add(m1,m2);
  } else if(petCfg.beard===2){
    const bg=new THREE.SphereGeometry(.62,20,18,0,Math.PI*2,Math.PI*0.55,Math.PI*0.4);
    const beard=new THREE.Mesh(bg,dark);beard.scale.set(fs[0],fs[1]*.95,fs[2]);beard.position.y=2.1;charGroup.add(beard);
  }

  // Q版整体缩放到全息卡适配
  charGroup.scale.setScalar(0.68);
}
'''

# Replace lines 742-989 (0-indexed: 741 to 988) with new function
new_lines = lines[:func_start_idx] + [new_func] + lines[func_end_idx + 1:]

# Now update petCam.position (was at line 703, may have shifted due to insertion)
# Let's find the line again
for i, line in enumerate(new_lines):
    if 'petCam.position.set(0,1.0,8)' in line:
        new_lines[i] = line.replace('petCam.position.set(0,1.0,8)', 'petCam.position.set(0,1.2,7)')
        print(f"Updated petCam.position at new line {i+1}")
        break

# Update petControls.target
for i, line in enumerate(new_lines):
    if 'petControls.target.set(0,0.2,0)' in line:
        new_lines[i] = line.replace('petControls.target.set(0,0.2,0)', 'petControls.target.set(0,1.2,0)')
        print(f"Updated petControls.target at new line {i+1}")
        break

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

# Verify new line numbers
new_func_start = None
new_func_end = None
for i, line in enumerate(new_lines):
    if 'function buildChar(){' in line and new_func_start is None:
        new_func_start = i + 1
    if new_func_start is not None and line.strip() == '}':
        # Check if this is the closing brace of buildChar
        # It should be followed by a blank line or a comment line
        if i + 1 < len(new_lines) and (new_lines[i+1].strip() == '' or new_lines[i+1].strip().startswith('//')):
            new_func_end = i + 1
            break

print(f"\nNew buildChar() function: lines {new_func_start} - {new_func_end}")
print("Done!")